"""Recovery contracts exercised against real SQLite, archives and encryption.

Engine below supplies Docker's transport boundary where no daemon is available.
The opt-in Docker drill additionally exercises that boundary on Linux.
"""

from __future__ import annotations

import io
import json
import os
import sqlite3
import subprocess
import sys
import tarfile
from pathlib import Path

import pytest

from tests.recovery_fakes import Engine, toolgate_store

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import recovery  # noqa: E402
import recovery_data  # noqa: E402
import recovery_layout  # noqa: E402
import recovery_restore  # noqa: E402
import recovery_snapshot  # noqa: E402


@pytest.fixture
def installed(tmp_path):
    root = tmp_path / "install"
    root.mkdir()
    for name in (".env", "versions.env", "docker-compose.yml"):
        (root / name).write_text("test configuration\n")
    return root, Engine(tmp_path)


def test_new_manifest_database_identity_cannot_drift(installed):
    root, engine = installed
    snapshot = recovery.backup(root, None, engine)
    manifest_path = snapshot / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["database"]["name"] = "another_database"
    manifest_path.write_text(json.dumps(manifest))

    with pytest.raises(recovery.RecoveryError, match="database identity"):
        recovery_snapshot.verify_snapshot(snapshot)


def test_pre_layout_repository_manifest_remains_verifiable(installed):
    root, engine = installed
    snapshot = recovery.backup(root, None, engine)
    manifest_path = snapshot / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest.pop("layout")
    manifest.pop("database")
    manifest_path.write_text(json.dumps(manifest))

    assert recovery_snapshot.verify_snapshot(snapshot)["format"] == recovery_layout.FORMAT


def test_model_cache_links_are_flattened_without_archive_links(tmp_path):
    source, restored = tmp_path / "source", tmp_path / "restored"
    source.mkdir()
    restored.mkdir()
    (source / "blob").write_bytes(b"model data")
    try:
        (source / "model").symlink_to("blob")
    except OSError:
        pytest.skip("Creating symlinks is unavailable")
    archive = io.BytesIO()
    recovery_data.snapshot_tree(source, archive)
    archive.seek(0)
    with tarfile.open(fileobj=archive) as contents:
        assert all(member.isfile() for member in contents)
    archive.seek(0)
    recovery_data.restore_tree(archive, restored)
    assert (restored / "model").read_bytes() == b"model data"
    assert not (restored / "model").is_symlink()


@pytest.mark.parametrize("target", ["../outside", "missing", "."])
def test_backup_rejects_external_dangling_and_directory_links(tmp_path, target):
    source = tmp_path / "source"
    source.mkdir()
    (tmp_path / "outside").write_bytes(b"private data")
    try:
        (source / "model").symlink_to(target, target_is_directory=target == ".")
    except OSError:
        pytest.skip("Creating symlinks is unavailable")
    with pytest.raises(recovery_data.RecoveryError, match="link"):
        recovery_data.snapshot_tree(source, io.BytesIO())


def test_snapshot_restores_vault_models_and_holds_actions(installed, tmp_path):
    root, engine = installed
    snapshot = recovery.backup(root, None, engine)
    state = recovery_restore.restore(snapshot, tmp_path / "recovered", engine)
    assert state["status"] == "held"
    assert state["vault_values_verified"] == 1
    assert state["memory_provider_key_verified"] is True
    assert state["invalidated_requests"] == ["approval"]
    assert state["invalidated_browser_sessions"] == 1
    provider_state = json.loads((snapshot / "config/provider-state.json").read_text())
    assert provider_state == {"schemaVersion": 1, "providers": {}}
    assert not any("provider-secrets" in str(path) for path in snapshot.rglob("*"))
    gateway = engine.volumes[state["volumes"]["gateway"]]
    assert (snapshot / "gateway.tar").is_file()
    assert (gateway / "tls.key").read_text() == "local-tls-private-key"
    with sqlite3.connect(gateway / "auth.db") as db:
        assert db.execute("SELECT count(*) FROM sessions").fetchone()[0] == 0
        assert db.execute("SELECT verifier,generation FROM owner").fetchone() == (
            "password-verifier",
            2,
        )
    with sqlite3.connect(engine.volumes["original-gateway"] / "auth.db") as db:
        assert db.execute("SELECT count(*) FROM sessions").fetchone()[0] == 1
    assert {turn["recovery_disposition"] for turn in state["unfinished_turns"]} == {
        "held_no_replay"
    }
    restored_vault = engine.volumes[state["volumes"]["toolgate"]]
    assert recovery_data.verify_vault(restored_vault, {}) == 1
    assert (
        engine.volumes[state["volumes"]["ollama"]] / "custom-model"
    ).read_bytes() == b"not-redownloadable"
    with sqlite3.connect(restored_vault / "toolgate.db") as db:
        request = json.loads(
            db.execute("SELECT body FROM v2_objects WHERE id='approval'").fetchone()[0]
        )
        settings = json.loads(
            db.execute("SELECT body FROM v2_objects WHERE kind='settings'").fetchone()[0]
        )
    assert request["status"] == "cancelled"
    assert settings["lockdown"] is True
    # Recovery must not modify the source approval or the source's availability.
    with sqlite3.connect(engine.volumes["original-toolgate"] / "toolgate.db") as db:
        assert (
            json.loads(db.execute("SELECT body FROM v2_objects").fetchone()[0])["status"]
            == "approved"
        )


# ToolGate moved requests and verifications to toolgate.core.approvals; released images predate it.
APPROVALS = """
from toolgate.core import control_plane as cp
try:
    from toolgate.core import approvals
except ImportError:
    approvals = cp
"""


def test_current_toolgate_rejects_restored_approval(tmp_path):
    gate = Path(os.environ.get("CONKER_TEST_TOOLGATE", ROOT.parent / "gates/toolgate"))
    if not (gate / "toolgate/core/control_plane.py").exists():
        pytest.skip("set CONKER_TEST_TOOLGATE to run compatibility against the actual gate")
    env = {
        **os.environ,
        "PYTHONPATH": str(gate),
        "PYTHONDONTWRITEBYTECODE": "1",
        "TOOLGATE_DATA_DIR": str(tmp_path),
    }
    create = (
        APPROVALS
        + """
r = approvals.create_verification_request('Run echo','test','agent','tool','echo',{},1,900,'agent-id')
approvals.decide_request(r['id'],'approved','owner')
print(r['id'])
"""
    )
    result = subprocess.run(
        [sys.executable, "-c", create],
        env=env,
        capture_output=True,
        text=True,
        check=True,
    )
    request = result.stdout.strip()
    recovery_data.invalidate_approvals(tmp_path / "toolgate.db")
    consume = (
        APPROVALS
        + """
import sys
allowed, reason = approvals.consume_verification(sys.argv[1],'tool','echo',{},1,'agent','agent-id')
assert not allowed, 'restored approval executed'
assert cp.settings()['lockdown'] is True
"""
    )
    subprocess.run(
        [sys.executable, "-c", consume, request],
        env=env,
        capture_output=True,
        text=True,
        check=True,
    )


@pytest.mark.parametrize("command", ["start", "restart", "update", "model"])
def test_shell_commands_cannot_bypass_recovery_hold(tmp_path, command):
    import shutil

    if os.name == "nt":
        pytest.skip("Requires a POSIX Bash path namespace")
    bash = shutil.which("bash")
    if not bash:
        pytest.skip("Bash is required for the CLI guard test")
    (tmp_path / recovery_layout.HOLD_FILE).write_text("{}")
    result = subprocess.run(
        [bash, str(ROOT / "conker"), command],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode != 0
    assert "Recovery is held" in result.stderr


def test_restored_vault_opens_with_actual_toolgate(tmp_path):
    gate = Path(os.environ.get("CONKER_TEST_TOOLGATE", ROOT.parent / "gates/toolgate"))
    if not (gate / "toolgate/core/vault.py").exists():
        pytest.skip("set CONKER_TEST_TOOLGATE for actual vault compatibility")
    source, restored = tmp_path / "source", tmp_path / "restored"
    source.mkdir()
    restored.mkdir()
    toolgate_store(source)
    archive = io.BytesIO()
    recovery_data.snapshot_tree(source, archive)
    archive.seek(0)
    recovery_data.restore_tree(archive, restored)
    env = {
        **os.environ,
        "PYTHONPATH": str(gate),
        "PYTHONDONTWRITEBYTECODE": "1",
        "TOOLGATE_DATA_DIR": str(restored),
        "TOOLGATE_ENV_PATH": str(restored / ".env"),
        "TOOLGATE_VAULT_KEY_FILE": str(restored / "vault.key"),
        "TOOLGATE_VAULT_SECRET": "",
    }
    code = "from toolgate.core import vault; assert vault.get_key('PROVIDER_KEY') == 'credential-must-survive'"
    subprocess.run(
        [sys.executable, "-c", code],
        env=env,
        capture_output=True,
        text=True,
        check=True,
    )


def test_installer_does_not_override_recovery_hold(tmp_path):
    import shutil

    if os.name == "nt":
        pytest.skip("Requires a POSIX Bash path namespace")
    bash = shutil.which("bash")
    if not bash:
        pytest.skip("Bash is required for the installer guard test")
    (tmp_path / recovery_layout.HOLD_FILE).write_text("{}")
    result = subprocess.run(
        [bash, str(ROOT / "install.sh"), "--yes"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode != 0
    assert "Recovery is held" in result.stderr
