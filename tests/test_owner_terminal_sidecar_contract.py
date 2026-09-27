"""The owner terminal stays deferred until its isolated sidecar is accepted."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_DOC = ROOT / "docs" / "reference" / "owner-terminal-sidecar.md"
BEGIN = "<!-- BEGIN OWNER_TERMINAL_CONTRACT -->"
END = "<!-- END OWNER_TERMINAL_CONTRACT -->"
FORBIDDEN_GATEWAY_SETTINGS = {
    "GATEWAY_TERMINAL_SHELL",
    "GATEWAY_TERMINAL_DIRECTORY",
    "GATEWAY_TERMINAL_SOCKET",
    "GATEWAY_TERMINAL_WORKSPACE_LABEL",
}


def load_contract() -> dict:
    document = CONTRACT_DOC.read_text(encoding="utf-8")
    body = document.split(BEGIN, 1)[1].split(END, 1)[0]
    match = re.fullmatch(r"\s*```json\s*(\{.*\})\s*```\s*", body, re.DOTALL)
    assert match, "owner-terminal contract must remain one JSON code block"
    return json.loads(match.group(1))


def ubuntu_manifest(tmp_path: Path) -> tuple[dict, dict[str, str]]:
    dashboard = tmp_path / "sources" / "companion" / "dashboard" / "dist"
    dashboard.mkdir(parents=True)
    (dashboard / "index.html").write_text("<!doctype html>", encoding="utf-8")
    (tmp_path / "sources" / "companion" / "versions.env").write_text(
        (ROOT / "versions.env").read_text(encoding="utf-8"), encoding="utf-8"
    )
    subprocess.run(
        [
            sys.executable,
            str(ROOT / "deploy" / "ubuntu" / "prepare.py"),
            "https://conker.test:8443",
        ],
        cwd=tmp_path,
        check=True,
        capture_output=True,
        text=True,
    )
    manifest = json.loads((tmp_path / "compose.json").read_text(encoding="utf-8"))
    gateway_env = dict(
        line.split("=", 1)
        for line in (tmp_path / "state" / "gateway.env")
        .read_text(encoding="utf-8")
        .splitlines()
    )
    return manifest, gateway_env


def test_normative_contract_is_non_root_networkless_and_credentialless():
    contract = load_contract()

    assert contract["schemaVersion"] == 4
    assert contract["capability"] == "owner-terminal"
    assert contract["state"] == "deferred"
    assert contract["service"] == "owner-terminal"
    assert contract["identity"] == {
        "explicitNumericUidGid": True,
        "requireNonRoot": True,
        "uidDistinctFromGateway": True,
        "controlGidSharedWithGateway": True,
    }
    assert contract["transport"] == {
        "kind": "unix-socket",
        "path": "/run/conker-terminal/control.sock",
        "networkMode": "none",
        "credential": "none",
        "peerAuthentication": "SO_PEERCRED-exact-gateway-uid",
        "singleLongLivedConnection": True,
        "unlinkSocketAfterAccept": True,
        "reconnectRequiresSidecarRecreation": True,
        "ptyCreationBeforeConnection": False,
    }
    assert [(mount["purpose"], mount["target"]) for mount in contract["mounts"]] == [
        ("control-socket", "/run/conker-terminal"),
        ("workspace", "/workspace"),
    ]
    assert all(mount["mode"] == "rw" for mount in contract["mounts"])
    assert all(mount["backedUp"] is False for mount in contract["mounts"])
    assert contract["lifecycle"] == {
        "maximumActiveLeases": 1,
        "terminalUidDedicatedToSidecar": True,
        "closeProcessGroupFirst": True,
        "sweepSameUidProcessesAfterClose": True,
        "sameUidSweepExcludes": ["pid-1", "supervisor"],
        "cleanupFailure": "unready-recreate-sidecar",
    }
    assert contract["readiness"] == {
        "localSupervisorProbe": True,
        "kind": "fresh-ephemeral-heartbeat",
        "path": "/run/conker-terminal/health.json",
        "spawnsShell": False,
        "readsWorkspace": False,
    }
    assert contract["workspacePreflight"] == {
        "validator": "scripts/terminal_workspace.py",
        "sidecarUid": 65532,
        "requiresValidatedGroupRwx": True,
        "recordsDeviceAndInode": True,
        "rejectsSymlinkComponents": True,
        "rejectsFilesystemRoot": True,
        "rejectsHomeDirectory": True,
        "rejectsProtectedPathOverlap": True,
    }
    assert contract["recovery"] == {
        "serviceOptionalForLegacySnapshots": True,
        "stopBeforeCapture": True,
        "recordImageIdentity": True,
        "archiveControlVolume": False,
        "archiveWorkspace": False,
        "restoreTerminalVolume": False,
        "restoreLeases": False,
    }
    assert {
        "env_file",
        "compose-secrets",
        "gateway-auth-volume",
        "provider-secret-files",
        "pi-or-toolgate-credentials",
        "docker-socket",
        "owner-network",
        "runtime-network",
        "host-namespaces",
        "devices",
        "privileged",
    } == set(contract["forbidden"])
    assert contract["linuxAcceptance"] == "required-not-complete"


def test_release_compose_keeps_legacy_gateway_terminal_disabled():
    body = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    gateway = body.split("  gateway:\n", 1)[1].split("\n  # ---", 1)[0]

    assert "  owner-terminal:" not in body
    assert "terminal_control:" not in body
    assert not any(setting in gateway for setting in FORBIDDEN_GATEWAY_SETTINGS)
    assert "/workspace" not in gateway


def test_repository_terminal_overlay_matches_the_isolated_boundary():
    body = (ROOT / "docker-compose.terminal.yml").read_text(encoding="utf-8")
    gateway, terminal = body.split("  owner-terminal:\n", 1)

    assert "GATEWAY_TERMINAL_SOCKET: /run/conker-terminal/control.sock" in gateway
    assert "terminal_control:/run/conker-terminal" in gateway
    assert "group_add: [\"65532\"]" in gateway
    assert "/workspace" not in gateway
    assert "image: ${OWNER_TERMINAL_IMAGE:?" in terminal
    assert 'user: "65532:65532"' in terminal
    assert 'network_mode: none' in terminal
    assert 'read_only: true' in terminal
    assert 'cap_drop: [ALL]' in terminal
    assert 'security_opt: [no-new-privileges:true]' in terminal
    assert "--gateway-uid\n      - \"0\"" in terminal
    assert terminal.count("type: volume") == 1
    assert terminal.count("type: bind") == 1
    assert "env_file:" not in terminal
    assert "secrets:" not in terminal
    assert "networks:" not in terminal

    installer = (ROOT / "install.sh").read_text(encoding="utf-8")
    launcher = (ROOT / "conker").read_text(encoding="utf-8")
    for source in (installer, launcher):
        assert "OWNER_TERMINAL_STATE=active" in source
        assert 'docker-compose.terminal.yml' in source
    assert "scripts/terminal_workspace.py" in installer


def test_ubuntu_generator_keeps_terminal_absent_until_linux_acceptance(tmp_path):
    manifest, gateway_env = ubuntu_manifest(tmp_path)

    assert "owner-terminal" not in manifest["services"]
    assert "terminal_control" not in manifest.get("volumes", {})
    assert not (FORBIDDEN_GATEWAY_SETTINGS & gateway_env.keys())
    gateway = manifest["services"]["gateway"]
    assert all("/workspace" not in mount for mount in gateway.get("volumes", []))


def active_terminal_versions() -> str:
    return (ROOT / "versions.env").read_text(encoding="utf-8").replace(
        "OWNER_TERMINAL_STATE=deferred",
        "OWNER_TERMINAL_STATE=active\n"
        "OWNER_TERMINAL_IMAGE=ghcr.io/conker-ai/pi-owner-terminal@sha256:" + "a" * 64 + "\n"
        "OWNER_TERMINAL_ACCEPTANCE_SHA256=" + "b" * 64,
    )


def prepare_active_terminal(tmp_path: Path, workspace: Path | None):
    dashboard = tmp_path / "sources" / "companion" / "dashboard" / "dist"
    dashboard.mkdir(parents=True)
    (dashboard / "index.html").write_text("<!doctype html>", encoding="utf-8")
    (tmp_path / "sources" / "companion" / "versions.env").write_text(
        active_terminal_versions(), encoding="utf-8"
    )
    environment = os.environ.copy()
    if workspace is not None:
        environment["CONKER_TERMINAL_WORKSPACE"] = str(workspace)
        environment["CONKER_TERMINAL_WORKSPACE_LABEL"] = "Owner project"
    return subprocess.run(
        [
            sys.executable,
            str(ROOT / "deploy" / "ubuntu" / "prepare.py"),
            "https://conker.test:8443",
        ],
        cwd=tmp_path,
        check=False,
        capture_output=True,
        text=True,
        env=environment,
    )


def test_ubuntu_generator_requires_preflighted_workspace_for_active_terminal(tmp_path):
    result = prepare_active_terminal(tmp_path, None)

    assert result.returncode != 0
    assert "requires CONKER_TERMINAL_WORKSPACE" in result.stderr
    assert not (tmp_path / "compose.json").exists()


def test_ubuntu_generator_emits_exact_active_terminal_boundary(tmp_path):
    workspace = tmp_path.parent / f"{tmp_path.name}-owner-workspace"
    workspace.mkdir(mode=0o770)
    result = prepare_active_terminal(tmp_path, workspace)

    if result.returncode != 0 and "read, write and traverse" in result.stderr:
        pytest.skip("host cannot represent the production UID/GID workspace contract")
    assert result.returncode == 0, result.stderr
    manifest = json.loads((tmp_path / "compose.json").read_text(encoding="utf-8"))
    gateway = manifest["services"]["gateway"]
    terminal = manifest["services"]["owner-terminal"]
    gateway_env = dict(
        line.split("=", 1)
        for line in (tmp_path / "state" / "gateway.env")
        .read_text(encoding="utf-8")
        .splitlines()
    )

    assert gateway_env["GATEWAY_TERMINAL_SOCKET"] == "/run/conker-terminal/control.sock"
    assert gateway_env["GATEWAY_TERMINAL_WORKSPACE_LABEL"] == "Owner project"
    assert gateway["group_add"] == ["65532"]
    assert gateway["depends_on"] == {
        "pi": {"condition": "service_started"},
        "owner-terminal": {"condition": "service_healthy"},
    }
    assert gateway["volumes"][-1] == "terminal_control:/run/conker-terminal"
    assert all("/workspace" not in mount for mount in gateway["volumes"])
    assert terminal == {
        "image": "ghcr.io/conker-ai/pi-owner-terminal@sha256:" + "a" * 64,
        "restart": "unless-stopped",
        "command": [
            "serve", "--socket", "/run/conker-terminal/control.sock",
            "--health", "/run/conker-terminal/health.json",
            "--shell", "/bin/bash", "--workspace", "/workspace",
            "--gateway-uid", "1000",
        ],
        "user": "65532:65532",
        "network_mode": "none",
        "read_only": True,
        "init": True,
        "cap_drop": ["ALL"],
        "security_opt": ["no-new-privileges:true"],
        "pids_limit": 64,
        "mem_limit": "256m",
        "cpus": 1.0,
        "stop_grace_period": "10s",
        "environment": {"CONKER_TERMINAL_ISOLATED": "1"},
        "volumes": [
            {"type": "volume", "source": "terminal_control", "target": "/run/conker-terminal"},
            {"type": "bind", "source": str(workspace.resolve()), "target": "/workspace", "read_only": False},
        ],
        "tmpfs": ["/tmp:rw,noexec,nosuid,nodev,size=32m"],
        "healthcheck": {
            "test": ["CMD", "conker-terminal", "health", "--health", "/run/conker-terminal/health.json"],
            "interval": "10s", "timeout": "2s", "retries": 3,
        },
        "logging": {"driver": "json-file", "options": {"max-size": "10m", "max-file": "3"}},
    }
    assert manifest["volumes"] == {"terminal_control": {}}
    record = json.loads(
        (tmp_path / "state" / "terminal-workspace.json").read_text(encoding="utf-8")
    )
    assert record["path"] == str(workspace.resolve())
