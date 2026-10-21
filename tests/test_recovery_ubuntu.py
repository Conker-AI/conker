"""Recovery on the Ubuntu layout: bind mounts, held restores and the optional owner terminal."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

# Recovery runs as scripts/recovery.py, so its modules import each other flat.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import recovery
import recovery_layout
import recovery_restore
import recovery_snapshot

from tests.recovery_fakes import Engine


@pytest.fixture
def ubuntu_installed(tmp_path):
    root = tmp_path / "ubuntu-install"
    state = root / "state"
    source = root / "sources" / "companion"
    provider = state / "provider-secrets"
    provider.mkdir(parents=True)
    source.mkdir(parents=True)
    (root / "compose.json").write_text('{"name":"conker","services":{}}\n')
    (source / "versions.env").write_text("CONKER_RELEASE=test\n")
    (state / "credentials.json").write_text('{"fixture":"secret"}\n')
    (provider / "state.json").write_text(
        '{"schemaVersion":1,"providers":{}}\n'
    )
    for name in recovery_layout.UBUNTU_ENV_FILES:
        (state / name).write_text("FIXTURE_VALUE=test\n")
    engine = Engine(tmp_path, recovery_layout.UBUNTU_PROFILE, bind_stores=True)
    engine.containers["source-gateway"]["Mounts"].append(
        {"Type": "bind", "Source": str(source), "Destination": "/dashboard"}
    )
    for provider_name in ("openrouter", "openai", "anthropic"):
        engine.containers["source-pi"]["Mounts"].append(
            {
                "Type": "bind",
                "Source": str(provider / f"{provider_name}.key"),
                "Destination": f"/run/secrets/provider-{provider_name}",
            }
        )
    engine.containers["source-systemgate"]["Mounts"].extend(
        [
            {"Type": "bind", "Source": str(root / "recovery"), "Destination": "/backups"},
            {"Type": "bind", "Source": "/proc", "Destination": "/host/proc"},
        ]
    )
    (engine.volumes["original-decisions"] / "model.bin").write_bytes(
        b"owner-selected-decision-model"
    )
    return root, engine


def test_ubuntu_snapshot_verifies_and_restores_held(ubuntu_installed, tmp_path):
    root, engine = ubuntu_installed
    destination = tmp_path / "off-machine"

    snapshot = recovery.backup(root, destination, engine)
    manifest = recovery_snapshot.verify_snapshot(snapshot)
    state = recovery_restore.restore(snapshot, tmp_path / "ubuntu-recovered", engine)

    assert manifest["layout"] == "ubuntu"
    assert manifest["database"] == {
        "service": "postgres",
        "user": "conker",
        "name": "conker",
    }
    assert set(manifest["images"]) == recovery_layout.UBUNTU_SERVICES
    assert set(manifest["stores"]) == set(recovery_layout.UBUNTU_STORES)
    assert "memorygate-backups" not in manifest["stores"]
    assert (snapshot / "config/credentials.json").is_file()
    assert {path.name for path in (snapshot / "config/env").iterdir()} == (
        recovery_layout.UBUNTU_ENV_FILES
    )
    assert state["status"] == "held"
    assert state["source_layout"] == "ubuntu"
    restored_decisions = engine.volumes[state["volumes"]["decisions"]]
    assert (restored_decisions / "model.bin").read_bytes() == (
        b"owner-selected-decision-model"
    )
    assert "POSTGRES_USER=conker" in (
        tmp_path / "ubuntu-recovered" / "postgres.env"
    ).read_text()
    assert any(
        call[0] == "exec" and "pg_dump" in call and "conker" in call
        for call in engine.calls
    )


def test_ubuntu_unknown_bind_fails_before_stopping_writers(ubuntu_installed, tmp_path):
    root, engine = ubuntu_installed
    engine.containers["source-decisions"]["Mounts"].append(
        {"Type": "bind", "Source": str(tmp_path), "Destination": "/unmapped"}
    )

    with pytest.raises(recovery.RecoveryError, match="Unmapped decisions bind mount"):
        recovery.backup(root, tmp_path / "off-machine", engine)

    assert not any(call[0] == "stop" for call in engine.calls)


def test_optional_owner_terminal_has_no_recovery_store_or_archive(
    ubuntu_installed, tmp_path
):
    root, engine = ubuntu_installed
    workspace = tmp_path / "owner-workspace"
    control = tmp_path / "terminal-control"
    workspace.mkdir()
    control.mkdir()
    engine.services.add("owner-terminal")
    engine.containers["source-owner-terminal"] = {
        "Id": "source-owner-terminal",
        "Image": engine.image,
        "State": {"Running": True, "ExitCode": 0},
        "Mounts": [
            {"Type": "bind", "Source": str(control), "Destination": "/run/conker-terminal"},
            {"Type": "bind", "Source": str(workspace), "Destination": "/workspace"},
        ],
        "Config": {
            "Image": "example/owner-terminal:1",
            "Env": ["CONKER_TERMINAL_ISOLATED=1"],
        },
    }
    engine.containers["source-gateway"]["Mounts"].append(
        {"Type": "bind", "Source": str(control), "Destination": "/run/conker-terminal"}
    )

    snapshot = recovery.backup(root, tmp_path / "off-machine", engine)
    manifest = recovery_snapshot.verify_snapshot(snapshot)
    restored = recovery_restore.restore(snapshot, tmp_path / "held-restore", engine)

    assert "owner-terminal" in manifest["images"]
    assert "owner-terminal" not in manifest["stores"]
    assert not any("terminal" in name for name in manifest["files"] if name.endswith(".tar"))
    assert "owner-terminal" not in restored["volumes"]
    assert any(
        call[0] == "stop" and "source-owner-terminal" in call for call in engine.calls
    )


def test_ubuntu_missing_runtime_contract_fails_before_stopping_writers(
    ubuntu_installed, tmp_path
):
    root, engine = ubuntu_installed
    engine.containers["source-memorygate"]["Config"]["Env"] = [
        value
        for value in engine.containers["source-memorygate"]["Config"]["Env"]
        if not value.startswith("RUNTIME_SECRET_PATH=")
    ]

    with pytest.raises(recovery.RecoveryError, match="RUNTIME_SECRET_PATH"):
        recovery.backup(root, tmp_path / "off-machine", engine)

    assert not any(call[0] == "stop" for call in engine.calls)


def test_ubuntu_manifest_store_destination_cannot_drift(ubuntu_installed, tmp_path):
    root, engine = ubuntu_installed
    snapshot = recovery.backup(root, tmp_path / "off-machine", engine)
    manifest_path = snapshot / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["stores"]["decisions"]["destination"] = "/another-model-store"
    manifest_path.write_text(json.dumps(manifest))

    with pytest.raises(recovery.RecoveryError, match="Storage service or destination"):
        recovery_snapshot.verify_snapshot(snapshot)
