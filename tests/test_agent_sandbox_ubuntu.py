"""The agent sandbox on the source-built Ubuntu layout: absent while deferred, exact when active."""

from __future__ import annotations

import json
import os
import stat
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
PREPARE = ROOT / "deploy" / "ubuntu" / "prepare.py"
SANDBOX_IMAGE = "ghcr.io/conker-ai/toolgate-sandbox@sha256:" + "a" * 64
TOOLGATE_BUILD = {"context": "./sources/toolgate", "dockerfile": "toolgate/Dockerfile"}
LOGGING = {"driver": "json-file", "options": {"max-size": "10m", "max-file": "3"}}
# A host test cannot create a folder owned by UID 65533; the validator has its own tests below.
ACCEPT_FOLDER = """
import runpy, sys
sys.path.insert(0, sys.argv[1])
import scripts.agent_workspaces as workspaces
workspaces.validate_workspaces = lambda folder, **_: folder.resolve()
sys.argv = sys.argv[2:]
runpy.run_path(sys.argv[0], run_name="__main__")
"""

sys.path.insert(0, str(ROOT / "scripts"))
from agent_workspaces import AgentWorkspacesError, validate_workspaces
from recovery_layout import UBUNTU_PROFILE
from recovery_snapshot import valid_service_inventory


def versions(active: bool) -> str:
    text = (ROOT / "versions.env").read_text(encoding="utf-8")
    if active:
        text = text.replace(
            "AGENT_SANDBOX_STATE=deferred",
            f"AGENT_SANDBOX_STATE=active\nAGENT_SANDBOX_IMAGE={SANDBOX_IMAGE}",
        )
        text = "\n".join(
            "TOOLGATE_VERSION=0.6.0" if line.startswith("TOOLGATE_VERSION=") else line
            for line in text.splitlines()
        ) + "\n"
    return text


def prepare(tmp_path: Path, *, active: bool, workspaces: Path | None = None,
            accept_folder: bool = False) -> subprocess.CompletedProcess:
    dashboard = tmp_path / "sources" / "companion" / "dashboard" / "dist"
    dashboard.mkdir(parents=True)
    (dashboard / "index.html").write_text("<!doctype html>", encoding="utf-8")
    (tmp_path / "sources" / "companion" / "versions.env").write_text(
        versions(active), encoding="utf-8"
    )
    environment = os.environ.copy()
    environment.pop("CONKER_WORKSPACES_DIR", None)
    environment["CONKER_DOCKER_GID"] = "998"
    if workspaces is not None:
        environment["CONKER_WORKSPACES_DIR"] = str(workspaces)
    command = [sys.executable, str(PREPARE), "https://conker.test:8443"]
    if accept_folder:
        command = [sys.executable, "-c", ACCEPT_FOLDER, str(ROOT), *command[1:]]
    return subprocess.run(
        command, cwd=tmp_path, check=False, capture_output=True, text=True, env=environment
    )


def generated(tmp_path: Path) -> tuple[dict, dict[str, str]]:
    manifest = json.loads((tmp_path / "compose.json").read_text(encoding="utf-8"))
    toolgate_env = dict(
        line.split("=", 1)
        for line in (tmp_path / "state" / "toolgate.env").read_text(encoding="utf-8").splitlines()
    )
    return manifest, toolgate_env


def test_ubuntu_generator_keeps_sandbox_absent_while_deferred(tmp_path):
    result = prepare(tmp_path, active=False, workspaces=tmp_path / "ignored")

    assert result.returncode == 0, result.stderr
    manifest, toolgate_env = generated(tmp_path)
    assert not {"sandbox-runner", "package-proxy"} & manifest["services"].keys()
    assert "volumes" not in manifest
    assert "sandbox_egress" not in manifest["networks"]
    assert "TOOLGATE_SANDBOX_SOCKET" not in toolgate_env
    toolgate = manifest["services"]["toolgate"]
    assert toolgate["volumes"] == ["./state/toolgate:/data"]
    assert "depends_on" not in toolgate
    assert "docker.sock" not in json.dumps(manifest)


def test_ubuntu_generator_requires_workspaces_folder_for_active_sandbox(tmp_path):
    result = prepare(tmp_path, active=True)

    assert result.returncode != 0
    assert "requires CONKER_WORKSPACES_DIR" in result.stderr
    assert not (tmp_path / "compose.json").exists()


def test_ubuntu_generator_refuses_a_folder_the_sandbox_user_does_not_own(tmp_path):
    folder = tmp_path.parent / f"{tmp_path.name}-workspaces"
    folder.mkdir()

    result = prepare(tmp_path, active=True, workspaces=folder)

    assert result.returncode != 0
    assert "Agent workspaces folder rejected" in result.stderr
    assert "sudo chown 65533:1000" in result.stderr
    assert not (tmp_path / "compose.json").exists()


def test_ubuntu_generator_emits_exact_active_sandbox_boundary(tmp_path):
    folder = tmp_path.parent / f"{tmp_path.name}-workspaces"
    folder.mkdir()

    result = prepare(tmp_path, active=True, workspaces=folder, accept_folder=True)

    assert result.returncode == 0, result.stderr
    manifest, toolgate_env = generated(tmp_path)
    services = manifest["services"]
    assert toolgate_env["TOOLGATE_SANDBOX_SOCKET"] == "/run/conker-sandbox/runner.sock"
    assert services["toolgate"]["volumes"] == [
        "./state/toolgate:/data",
        "sandbox_control:/run/conker-sandbox",
    ]
    assert services["toolgate"]["depends_on"] == {
        "sandbox-runner": {"condition": "service_healthy"}
    }
    assert services["toolgate"]["build"] == TOOLGATE_BUILD
    assert services["sandbox-runner"] == {
        "build": TOOLGATE_BUILD,
        "restart": "unless-stopped",
        "command": ["python", "-m", "toolgate.sandbox.runner", "serve"],
        "user": "65533:65533",
        "group_add": ["998"],
        "network_mode": "none",
        "read_only": True,
        "init": True,
        "cap_drop": ["ALL"],
        "security_opt": ["no-new-privileges:true"],
        "pids_limit": 64,
        "mem_limit": "128m",
        "stop_grace_period": "20s",
        "environment": {
            "SANDBOX_IMAGE": SANDBOX_IMAGE,
            "SANDBOX_CLIENT_UIDS": "1000",
            "SANDBOX_WORKSPACES_VOLUME": "conker_agent_workspaces",
            "SANDBOX_PROXY_VOLUME": "conker_sandbox_proxy",
        },
        "volumes": [
            "/var/run/docker.sock:/var/run/docker.sock",
            "sandbox_control:/run/conker-sandbox",
            "agent_workspaces:/workspaces:nocopy",
        ],
        "healthcheck": {
            "test": ["CMD", "python", "-m", "toolgate.sandbox.runner", "health"],
            "interval": "10s", "timeout": "5s", "retries": 6, "start_period": "120s",
        },
        "logging": LOGGING,
    }
    assert services["package-proxy"] == {
        "build": TOOLGATE_BUILD,
        "restart": "unless-stopped",
        "command": ["python", "-m", "toolgate.sandbox.proxy", "serve"],
        "user": "65532:65532",
        "networks": ["sandbox_egress"],
        "read_only": True,
        "init": True,
        "cap_drop": ["ALL"],
        "security_opt": ["no-new-privileges:true"],
        "pids_limit": 64,
        "mem_limit": "256m",
        "environment": {"PROXY_CLIENT_UIDS": "65533"},
        "volumes": ["sandbox_proxy:/run/conker-proxy"],
        "healthcheck": {
            "test": ["CMD", "python", "-m", "toolgate.sandbox.proxy", "health"],
            "interval": "10s", "timeout": "5s", "retries": 6,
        },
        "logging": LOGGING,
    }
    assert manifest["volumes"] == {
        "sandbox_control": {},
        "sandbox_proxy": {"name": "conker_sandbox_proxy"},
        "agent_workspaces": {
            "name": "conker_agent_workspaces",
            "driver": "local",
            "driver_opts": {"type": "none", "o": "bind", "device": str(folder.resolve())},
        },
    }
    assert manifest["networks"]["sandbox_egress"] == {}
    # Nothing else holds the socket, the control volume, the workspaces or the way out.
    for name, service in services.items():
        mounts = json.dumps(service.get("volumes", []))
        if name != "sandbox-runner":
            assert "docker.sock" not in mounts and "agent_workspaces" not in mounts, name
        if name not in {"sandbox-runner", "toolgate"}:
            assert "sandbox_control" not in mounts, name
        if name != "package-proxy":
            assert "sandbox_egress" not in service.get("networks", []), name


def test_ubuntu_sandbox_services_keep_the_repository_overlay_settings(tmp_path):
    folder = tmp_path.parent / f"{tmp_path.name}-workspaces"
    folder.mkdir()
    assert prepare(tmp_path, active=True, workspaces=folder, accept_folder=True).returncode == 0
    services = generated(tmp_path)[0]["services"]
    overlay = yaml.safe_load(
        (ROOT / "docker-compose.sandbox.yml").read_text(encoding="utf-8")
    )["services"]

    for name in ("sandbox-runner", "package-proxy"):
        ubuntu, repository = services[name], overlay[name]
        for key in (
            "command", "user", "network_mode", "networks", "read_only", "init", "cap_drop",
            "security_opt", "pids_limit", "mem_limit", "stop_grace_period", "healthcheck",
        ):
            assert ubuntu.get(key) == repository.get(key), (name, key)
        assert ubuntu["environment"].keys() == repository["environment"].keys()
        # nocopy is pinned by each layout's own exact test.
        assert [mount.removesuffix(":nocopy") for mount in ubuntu["volumes"]] == [
            mount.removesuffix(":nocopy") for mount in repository["volumes"]
        ]
    # Only the image and ToolGate's UID differ: 1000 here, 0 in the repository layout.
    differing = {
        key for key, value in services["sandbox-runner"]["environment"].items()
        if value != overlay["sandbox-runner"]["environment"][key]
    }
    assert differing == {"SANDBOX_IMAGE", "SANDBOX_CLIENT_UIDS"}


def test_ubuntu_recovery_admits_sandbox_services_and_never_archives_their_mounts():
    base = set(UBUNTU_PROFILE.services)

    assert valid_service_inventory(base, UBUNTU_PROFILE)
    assert valid_service_inventory(base | {"sandbox-runner", "package-proxy"}, UBUNTU_PROFILE)
    assert not valid_service_inventory(base | {"sandbox-shell"}, UBUNTU_PROFILE)
    assert {"sandbox-runner", "package-proxy"} <= set(UBUNTU_PROFILE.writers)
    assert UBUNTU_PROFILE.excluded_mounts["toolgate"] == frozenset({"/run/conker-sandbox"})
    assert UBUNTU_PROFILE.excluded_mounts["sandbox-runner"] == frozenset(
        {"/var/run/docker.sock", "/run/conker-sandbox", "/workspaces"}
    )
    assert UBUNTU_PROFILE.excluded_mounts["package-proxy"] == frozenset({"/run/conker-proxy"})


# --- the workspaces folder ---------------------------------------------------------------------


def folder_for(tmp_path: Path) -> tuple[Path, dict]:
    folder = tmp_path / "workspaces"
    folder.mkdir()
    details = folder.stat()
    return folder, {
        "installation": tmp_path / "deploy",
        "home": tmp_path / "home" / "owner",
        "owner_gid": details.st_gid,
        "runner_uid": details.st_uid,
    }


@pytest.mark.skipif(os.name != "posix", reason="needs POSIX ownership and the setgid bit")
def test_workspaces_folder_with_runner_owner_owner_group_and_2770_is_accepted(tmp_path):
    folder, rules = folder_for(tmp_path)
    folder.chmod(0o2770)

    assert validate_workspaces(folder, **rules) == folder.resolve()


@pytest.mark.skipif(os.name != "posix", reason="needs POSIX ownership and the setgid bit")
def test_workspaces_folder_without_setgid_or_open_to_others_is_refused(tmp_path):
    folder, rules = folder_for(tmp_path)

    for mode in (0o770, 0o2775, 0o2777):
        folder.chmod(mode)
        assert stat.S_IMODE(folder.stat().st_mode) == mode
        with pytest.raises(AgentWorkspacesError, match="mode 2770"):
            validate_workspaces(folder, **rules)


def test_workspaces_folder_owned_by_someone_else_is_refused(tmp_path):
    folder, rules = folder_for(tmp_path)
    rules["runner_uid"] += 1

    with pytest.raises(AgentWorkspacesError, match="sudo chown"):
        validate_workspaces(folder, **rules)


def test_workspaces_folder_must_be_an_existing_absolute_path(tmp_path):
    _, rules = folder_for(tmp_path)

    with pytest.raises(AgentWorkspacesError, match="absolute"):
        validate_workspaces(Path("workspaces"), **rules)
    with pytest.raises(AgentWorkspacesError, match="absolute"):
        validate_workspaces(tmp_path / "workspaces" / ".." / "workspaces", **rules)
    with pytest.raises(AgentWorkspacesError, match="existing directory"):
        validate_workspaces(tmp_path / "missing", **rules)


def test_workspaces_folder_must_stay_outside_the_deployment_and_above_home(tmp_path):
    _, rules = folder_for(tmp_path)
    inside = tmp_path / "deploy" / "agents"
    inside.mkdir(parents=True)

    with pytest.raises(AgentWorkspacesError, match="deployment"):
        validate_workspaces(inside, **rules)
    with pytest.raises(AgentWorkspacesError, match="deployment"):
        validate_workspaces(tmp_path, **{**rules, "home": tmp_path / "elsewhere" / "home"})
    (tmp_path / "home" / "owner").mkdir(parents=True)
    with pytest.raises(AgentWorkspacesError, match="home"):
        validate_workspaces(tmp_path / "home", **rules)


@pytest.mark.skipif(os.name != "posix", reason="symlinks need POSIX permissions")
def test_workspaces_folder_through_a_symlink_is_refused(tmp_path):
    folder, rules = folder_for(tmp_path)
    link = tmp_path / "link"
    link.symlink_to(folder, target_is_directory=True)

    with pytest.raises(AgentWorkspacesError, match="symlink"):
        validate_workspaces(link, **rules)
