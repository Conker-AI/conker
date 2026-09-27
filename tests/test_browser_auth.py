"""Deployment authority and recovery boundaries, without a running Docker daemon."""

import hashlib
import json
import os
import re
import shutil
import sqlite3
import subprocess
from pathlib import Path

import pytest
from test_recovery import (
    installed as installed,  # noqa: PLC0414 - register the shared pytest fixture
)
from test_recovery import recovery, recovery_data

ROOT = Path(__file__).resolve().parents[1]


def compose_config(tmp_path):
    if not shutil.which("docker"):
        pytest.skip("Docker Compose CLI is required (the daemon is not)")
    names = set(re.findall(r"\$\{([A-Z0-9_]+)", (ROOT / "docker-compose.yml").read_text()))
    versions = dict(
        line.split("=", 1)
        for line in (ROOT / "versions.env").read_text().splitlines()
        if line and not line.startswith("#")
    )
    values = {
        name: name.lower() + "-fixture-" + "x" * 32 for name in names - versions.keys()
    }
    values.update(
        CONKER_PORT="8050",
        CONKER_BACKUP_DIR=tmp_path.as_posix(),
        GATEWAY_ORIGIN="https://localhost:8050",
        CONKER_EMBEDDING_DIMENSION="1024",
        PI_GATEWAY_KEY_SHA256=hashlib.sha256(
            values["PI_GATEWAY_KEY"].encode()
        ).hexdigest(),
        PI_OWNER_KEY_SHA256=hashlib.sha256(
            values["GATEWAY_PI_OWNER_KEY"].encode()
        ).hexdigest(),
        TOOLGATE_OWNER_KEY_SHA256=hashlib.sha256(
            values["GATEWAY_TOOLGATE_OWNER_KEY"].encode()
        ).hexdigest(),
    )
    fixture = tmp_path / "fixture.env"
    fixture.write_text("\n".join(f"{key}={value}" for key, value in values.items()))
    result = subprocess.run(
        [
            "docker",
            "compose",
            "--env-file",
            str(ROOT / "versions.env"),
            "--env-file",
            str(fixture),
            "-f",
            str(ROOT / "docker-compose.yml"),
            "config",
            "--format",
            "json",
        ],
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
        env={key: value for key, value in os.environ.items() if key not in names},
    )
    if result.returncode != 0:
        # A missing Docker is not this test failing. Every other Docker-dependent
        # test here skips, and one that fails instead reports an environment
        # problem as a security regression - which is the most expensive kind of
        # false alarm, because the property it guards is the one worth trusting.
        unavailable = ("docker" in result.stderr.lower()
                       or "docker" in result.stdout.lower()
                       or not shutil.which("docker"))
        if unavailable:
            pytest.skip(f"needs a running Docker to resolve the compose file: "
                        f"{(result.stderr or result.stdout).strip().splitlines()[-1][:120]}")
        raise AssertionError(result.stderr)
    return json.loads(result.stdout)


def test_compose_cannot_give_worker_owner_credentials_or_auth_storage(tmp_path):
    config = compose_config(tmp_path)
    services = config["services"]
    gateway, pi = services["gateway"], services["pi"]
    owner_key = gateway["environment"]["GATEWAY_TOOLGATE_OWNER_KEY"]
    pi_owner_key = gateway["environment"]["GATEWAY_PI_OWNER_KEY"]
    runtime_key = gateway["environment"]["PI_GATEWAY_KEY"]
    assert len({owner_key, pi_owner_key, runtime_key}) == 3
    assert (
        pi["environment"]["PI_GATEWAY_KEY_SHA256"]
        == hashlib.sha256(runtime_key.encode()).hexdigest()
    )
    assert (
        pi["environment"]["PI_OWNER_KEY_SHA256"]
        == hashlib.sha256(pi_owner_key.encode()).hexdigest()
    )
    assert owner_key not in json.dumps(pi) and pi_owner_key not in json.dumps(pi)
    assert runtime_key not in json.dumps(pi)
    assert not pi.get("ports")
    assert gateway["ports"][0]["host_ip"] == "127.0.0.1"
    assert "gateway" in gateway["command"]
    auth_volume = next(
        mount["source"] for mount in gateway["volumes"] if mount["target"] == "/auth"
    )
    assert not any(mount["source"] == auth_volume for mount in pi["volumes"])
    assert not any("ADMIN_KEY" in key for key in gateway["environment"])
    assert set(gateway["cap_drop"]) == {"ALL"} and set(pi["cap_drop"]) == {"ALL"}
    assert "owner_control" not in pi["networks"]
    assert "owner_control" in gateway["networks"]
    assert config["networks"]["owner_control"]["internal"] is True
    assert (
        gateway["environment"]["GATEWAY_TOOLGATE_URL"] == "http://toolgate-owner:8010"
    )
    assert (
        "toolgate-owner" in services["toolgate"]["networks"]["owner_control"]["aliases"]
    )
    assert (
        gateway["environment"]["GATEWAY_TOOLGATE_EXECUTION_KEY"]
        == pi["environment"]["PI_TOOLGATE_KEY"]
    )
    assert (
        services["toolgate"]["environment"]["TOOLGATE_OWNER_KEY_SHA256"]
        == hashlib.sha256(owner_key.encode()).hexdigest()
    )
    assert gateway["environment"]["GATEWAY_DASHBOARD_DIR"] == "/dashboard"
    assert any(mount["target"] == "/dashboard" and mount["read_only"]
               for mount in gateway["volumes"])
    assert (
        pi["environment"]["PI_MEMORYGATE_INGEST_KEY"]
        == services["memorygate"]["environment"]["MEMORYGATE_CONVERSATION_KEY"]
    )
    assert (
        pi["environment"]["PI_MEMORYGATE_READ_KEY"]
        == services["memorygate"]["environment"]["MEMORYGATE_BOOTSTRAP_READ_KEY"]
    )


def test_missing_gateway_database_cannot_produce_success(installed):
    root, engine = installed
    (engine.volumes["original-gateway"] / "auth.db").unlink()
    with pytest.raises(recovery.RecoveryError, match="SQLite store"):
        recovery.backup(root, None, engine)


def test_manifest_cannot_hide_gateway_by_removing_image_and_archive(installed):
    root, engine = installed
    snapshot = recovery.backup(root, None, engine)
    manifest = json.loads((snapshot / "manifest.json").read_text())
    del manifest["images"]["gateway"]
    del manifest["stores"]["gateway"]
    (snapshot / "gateway.tar").unlink()
    manifest["files"] = recovery.inventory(snapshot)
    recovery.write_json(snapshot / "manifest.json", manifest)
    with pytest.raises(recovery.RecoveryError, match="services and image"):
        recovery.verify_snapshot(snapshot)


def test_pre_gateway_snapshot_still_restores_under_hold(
    installed, tmp_path, monkeypatch
):
    root, engine = installed
    original_json = engine.json

    def legacy_json(*args):
        value = original_json(*args)
        if args[0] == "compose" and "config" in args:
            del value["services"]["gateway"]
        return value

    monkeypatch.setattr(engine, "json", legacy_json)
    snapshot = recovery.backup(root, None, engine)
    assert "gateway" not in recovery.verify_snapshot(snapshot)["stores"]
    state = recovery.restore(snapshot, tmp_path / "legacy-restored", engine)
    assert state["status"] == "held" and state["applications_started"] is False


def test_unknown_gateway_schema_fails_before_any_application_can_start(tmp_path):
    database = tmp_path / "auth.db"
    with sqlite3.connect(database) as db:
        db.execute("CREATE TABLE unexpected(x)")
    with pytest.raises(sqlite3.DatabaseError):
        recovery_data.invalidate_browser_sessions(database)


def test_qdrant_network_is_shared_only_with_memorygate(tmp_path):
    config = compose_config(tmp_path)
    services = config["services"]
    assert set(services["qdrant"]["networks"]) == {"memory_index"}
    assert not services["qdrant"].get("ports")
    peers = {name for name, service in services.items() if "memory_index" in service.get("networks", {})}
    assert peers == {"memorygate", "qdrant"}
    assert config["networks"]["memory_index"]["internal"] is True
    assert services["memorygate"]["environment"]["QDRANT_URL"] == "http://qdrant:6333"
    assert "conker_net" in services["memorygate"]["networks"]
    assert "conker_net" in services["pi"]["networks"]
    assert "conker_net" in services["ollama"]["networks"]
