"""A failed local build must not destroy the dashboard available for recovery."""

import importlib.util
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
import workspace_build as build


@pytest.fixture
def project(tmp_path, monkeypatch):
    root = tmp_path / "workspace"
    dashboard = root / "dashboard"
    (dashboard / "node_modules").mkdir(parents=True)
    (dashboard / "dist/assets").mkdir(parents=True)
    (dashboard / "dist/index.html").write_text("last verified index")
    (dashboard / "dist/assets/previous.js").write_text("last verified script")
    monkeypatch.setattr(build.shutil, "which", lambda name: name)
    return root, dashboard, root / ".local-run"


def runner(fail=None):
    calls = []

    def run(*args, **kwargs):
        values = [str(value) for value in args]
        calls.append((values, kwargs))
        phase = "design" if "design:check" in values else "types" if "-b" in values else "vite" if "--outDir" in values else "bundle"
        if phase == "vite":
            output = Path(values[values.index("--outDir") + 1])
            (output / "assets").mkdir(parents=True)
            (output / "index.html").write_text("new verified index")
            (output / "assets/gateway-entry-test.js").write_text("new verified script")
        if phase == fail:
            raise subprocess.CalledProcessError(1, values)

    return run, calls


@pytest.mark.parametrize("phase", ["design", "types", "vite", "bundle"])
def test_failed_checks_preserve_every_previous_asset(project, phase):
    root, dashboard, state = project
    before = build.manifest(dashboard / "dist")
    run, _ = runner(phase)
    with pytest.raises(subprocess.CalledProcessError):
        build.build_dashboard(root, state, run, lambda: None)
    assert build.manifest(dashboard / "dist") == before


def test_build_verifies_isolated_assets_and_retains_previous_files(project, monkeypatch):
    root, dashboard, state = project
    before = build.manifest(dashboard / "dist")
    run, calls = runner()
    guarded = []
    original_rename = Path.rename

    def rename(path, target):
        assert path.name != "staged", "A Windows stage-directory handle must not prevent publication"
        return original_rename(path, target)

    monkeypatch.setattr(Path, "rename", rename)
    build.build_dashboard(root, state, run, lambda: guarded.append(True))
    checkpoint, = list((state / "builds").iterdir())
    assert build.manifest(checkpoint / "previous") == before
    assert build.manifest(dashboard / "dist") == build.manifest(checkpoint / "staged")
    assert not (dashboard / "dist/assets/previous.js").exists()
    assert len(guarded) == 2
    assert calls[-1][0][-1] == str(checkpoint / "staged/assets")
    assert calls[-1][0][-2] == str(dashboard / "scripts/check-production-bundle.cjs")


def test_gateway_started_during_compilation_preserves_served_assets(project):
    root, dashboard, state = project
    before = build.manifest(dashboard / "dist")
    run, _ = runner()
    checks = []

    def stopped():
        checks.append(True)
        if len(checks) == 2:
            raise SystemExit("Gateway started")

    with pytest.raises(SystemExit, match="Gateway started"):
        build.build_dashboard(root, state, run, stopped)
    assert build.manifest(dashboard / "dist") == before


@pytest.mark.parametrize("failure", ["copy", "mismatch"])
def test_failed_publication_restores_previous_build(project, monkeypatch, failure):
    root, dashboard, state = project
    before = build.manifest(dashboard / "dist")
    run, _ = runner()
    original_copy = build.shutil.copytree

    def copy(stage, destination, *args, **kwargs):
        original_copy(stage, destination, *args, **kwargs)
        if Path(destination).name != "ready":
            return
        if failure == "copy":
            raise PermissionError("synthetic Windows file lock")
        (destination / "index.html").write_text("incomplete copy")

    monkeypatch.setattr(build.shutil, "copytree", copy)
    with pytest.raises((PermissionError, RuntimeError)):
        build.build_dashboard(root, state, run, lambda: None)
    assert build.manifest(dashboard / "dist") == before
    checkpoint, = list((state / "builds").iterdir())
    assert (checkpoint / "ready/index.html").exists()
    assert not (checkpoint / "previous").exists(), "A copy failure must not move the working assets"


def test_blocked_final_directory_move_restores_the_previous_complete_tree(project, monkeypatch):
    root, dashboard, state = project
    before = build.manifest(dashboard / "dist")
    run, _ = runner()
    original_rename = Path.rename

    def rename(path, target):
        if path.name == "ready":
            raise PermissionError("synthetic final-directory lock")
        return original_rename(path, target)

    monkeypatch.setattr(Path, "rename", rename)
    with pytest.raises(PermissionError):
        build.build_dashboard(root, state, run, lambda: None)
    assert build.manifest(dashboard / "dist") == before


def test_failed_restoration_never_leaves_a_partial_tree_at_the_serving_path(project, monkeypatch):
    root, dashboard, state = project
    before = build.manifest(dashboard / "dist")
    run, _ = runner()
    original_rename = Path.rename

    def rename(path, target):
        if path.name in ("ready", "previous"):
            raise PermissionError("synthetic locked restore")
        return original_rename(path, target)

    monkeypatch.setattr(Path, "rename", rename)
    with pytest.raises(PermissionError):
        build.build_dashboard(root, state, run, lambda: None)
    assert not (dashboard / "dist").exists()
    checkpoint, = list((state / "builds").iterdir())
    assert build.manifest(checkpoint / "previous") == before


def test_real_bundle_guard_keeps_limits_for_an_isolated_stage(tmp_path):
    node = shutil.which("node")
    if not node:
        pytest.skip("Node.js is unavailable")
    assets = tmp_path / "isolated/assets"
    assets.mkdir(parents=True)
    entry = assets / "gateway-entry-test.js"
    entry.write_bytes(b"x")
    command = [node, str(SCRIPTS.parent / "dashboard/scripts/check-production-bundle.cjs"), str(assets)]
    assert subprocess.run(command, capture_output=True, check=False).returncode == 0
    entry.write_bytes(b"x" * 700001)
    assert subprocess.run(command, capture_output=True, check=False).returncode != 0
    entry.write_bytes(b"x")
    (assets / "fixture-test.js").write_bytes(b"x")
    assert subprocess.run(command, capture_output=True, check=False).returncode != 0


def test_initial_build_needs_no_previous_assets(tmp_path, monkeypatch):
    root = tmp_path / "workspace"
    (root / "dashboard/node_modules").mkdir(parents=True)
    monkeypatch.setattr(build.shutil, "which", lambda name: name)
    run, _ = runner()
    build.build_dashboard(root, root / ".local-run", run, lambda: None)
    assert (root / "dashboard/dist/index.html").read_text() == "new verified index"


def test_publish_refuses_missing_index_or_outside_destination(project, tmp_path):
    root, dashboard, state = project
    checkpoint = state / "builds/test"
    stage = checkpoint / "staged"
    stage.mkdir(parents=True)
    before = build.manifest(dashboard / "dist")
    with pytest.raises(RuntimeError, match="index.html"):
        build.publish(root, stage, dashboard / "dist", checkpoint)
    (stage / "index.html").write_text("new")
    with pytest.raises(ValueError, match="inside this workspace"):
        build.publish(root, stage, tmp_path / "outside", checkpoint)
    assert build.manifest(dashboard / "dist") == before


def test_build_command_refuses_running_gateway_before_installing_or_compiling(project, monkeypatch):
    root, dashboard, state = project
    spec = importlib.util.spec_from_file_location("workspace_build_launcher", SCRIPTS / "workspace.py")
    workspace = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(workspace)
    state.mkdir(parents=True)
    configuration = state / "configuration.json"
    configuration.write_text('{"workspace_schema":1}')
    monkeypatch.setattr(workspace, "ROOT", root)
    monkeypatch.setattr(workspace, "STATE", state)
    monkeypatch.setattr(workspace, "CONFIG", configuration)
    monkeypatch.setattr(workspace, "owned_process", lambda config, service: service == "gateway")
    monkeypatch.setattr(workspace, "run", lambda *args, **kwargs: pytest.fail("Gateway owns the build"))
    before = build.manifest(dashboard / "dist")
    with pytest.raises(SystemExit, match="Stop Gateway"):
        workspace.build()
    assert build.manifest(dashboard / "dist") == before
