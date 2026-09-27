"""SystemGate receives telemetry inputs, never host-control authority."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FORBIDDEN = ("/var/run/docker.sock", "/host/root", "source: /")


def systemgate_section(compose: str) -> str:
    start = compose.index("  systemgate:\n")
    end = compose.index("\nvolumes:\n", start)
    return compose[start:end]


def test_root_compose_grants_only_narrow_read_only_telemetry_mounts():
    section = systemgate_section((ROOT / "docker-compose.yml").read_text())

    assert "SYSTEMGATE_PROCFS_PATH: /host/proc" in section
    assert "SYSTEMGATE_DISK_PATH: /" in section
    assert "- /proc:/host/proc:ro" in section
    assert "- ${CONKER_BACKUP_DIR}:/backups:ro" in section
    assert not any(value in section for value in FORBIDDEN)


def test_ubuntu_generator_grants_the_same_narrow_capabilities(tmp_path):
    script = ROOT / "deploy" / "ubuntu" / "prepare.py"
    dashboard = tmp_path / "sources" / "companion" / "dashboard" / "dist"
    dashboard.mkdir(parents=True)
    (dashboard / "index.html").write_text("<!doctype html>")
    (tmp_path / "sources" / "companion" / "versions.env").write_text(
        (ROOT / "versions.env").read_text(encoding="utf-8"), encoding="utf-8"
    )
    subprocess.run(
        [sys.executable, str(script), "https://conker.test:8443"],
        cwd=tmp_path,
        check=True,
        capture_output=True,
        text=True,
    )
    manifest = json.loads((tmp_path / "compose.json").read_text())
    systemgate = manifest["services"]["systemgate"]
    environment = dict(
        line.split("=", 1)
        for line in (tmp_path / "state" / "systemgate.env").read_text().splitlines()
    )

    assert systemgate["uts"] == "host"
    assert set(systemgate["volumes"]) == {
        "./state/systemgate:/data",
        "/proc:/host/proc:ro",
        "./recovery:/backups:ro",
    }
    assert environment["SYSTEMGATE_PROCFS_PATH"] == "/host/proc"
    assert environment["SYSTEMGATE_DISK_PATH"] == "/"
    serialized = json.dumps(systemgate)
    assert not any(value in serialized for value in FORBIDDEN)


def test_every_checked_in_compose_rejects_systemgate_host_authority():
    tracked = subprocess.run(
        ["git", "ls-files", "*compose*.yml", "*compose*.yaml"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.splitlines()
    manifests = [ROOT / path for path in tracked]
    assert manifests
    for manifest in manifests:
        body = manifest.read_text()
        if "systemgate:" not in body:
            continue
        section = systemgate_section(body)
        assert "/var/run/docker.sock" not in section, manifest
        assert "/host/root" not in section, manifest
        assert "- /:/" not in section, manifest
