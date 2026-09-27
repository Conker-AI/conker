"""The repository and source-built Ubuntu layouts assemble one minimum product."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import recovery
from release_manifest import parse_env


def ubuntu_deployment(tmp_path: Path) -> tuple[dict, dict[str, dict[str, str]]]:
    dashboard = tmp_path / "sources" / "companion" / "dashboard" / "dist"
    dashboard.mkdir(parents=True)
    (dashboard / "index.html").write_text("<!doctype html>")
    (tmp_path / "sources" / "companion" / "versions.env").write_text(
        (ROOT / "versions.env").read_text(encoding="utf-8"), encoding="utf-8"
    )
    subprocess.run(
        [sys.executable, str(ROOT / "deploy" / "ubuntu" / "prepare.py"),
         "https://conker.test:8443"],
        cwd=tmp_path,
        check=True,
        capture_output=True,
        text=True,
    )
    manifest = json.loads((tmp_path / "compose.json").read_text())
    environments = {}
    for path in (tmp_path / "state").glob("*.env"):
        environments[path.stem] = dict(
            line.split("=", 1) for line in path.read_text().splitlines()
        )
    return manifest, environments


def root_contract() -> str:
    return (ROOT / "docker-compose.yml").read_text()


def test_both_layouts_serve_compiled_dashboard_assets(tmp_path):
    manifest, env = ubuntu_deployment(tmp_path)
    root = root_contract()

    assert "GATEWAY_DASHBOARD_DIR: /dashboard" in root
    assert "./dashboard/dist:/dashboard:ro" in root
    assert env["gateway"]["GATEWAY_DASHBOARD_DIR"] == "/dashboard"
    assert "./sources/companion/dashboard/dist:/dashboard:ro" in manifest["services"]["gateway"]["volumes"]
    installer = (ROOT / "install.sh").read_text()
    assert "NODE_BUILD_IMAGE" in installer
    assert 'type=volume,dst=/workspace/node_modules' in installer
    assert "npm ci --no-audit --no-fund && npm run build" in installer


def test_both_layouts_wire_memory_and_separate_tool_authorities(tmp_path):
    _, ubuntu = ubuntu_deployment(tmp_path)
    root = root_contract()

    for key in ("PI_MEMORYGATE_URL", "PI_MEMORYGATE_INGEST_KEY",
                "PI_MEMORYGATE_READ_KEY", "PI_MEMORYGATE_AGENT_ID"):
        assert f"{key}:" in root
        assert key in ubuntu["pi"]
    assert "MEMORYGATE_CONVERSATION_KEY:" in root
    assert ubuntu["pi"]["PI_MEMORYGATE_INGEST_KEY"] == ubuntu["memorygate"]["MEMORYGATE_CONVERSATION_KEY"]
    assert ubuntu["pi"]["PI_MEMORYGATE_READ_KEY"] == ubuntu["memorygate"]["MEMORYGATE_BOOTSTRAP_READ_KEY"]

    assert "GATEWAY_TOOLGATE_EXECUTION_KEY:" in root
    assert "TOOLGATE_OWNER_KEY_SHA256:" in root
    assert ubuntu["gateway"]["GATEWAY_TOOLGATE_EXECUTION_KEY"] == ubuntu["pi"]["PI_TOOLGATE_KEY"]
    assert ubuntu["toolgate"]["TOOLGATE_OWNER_KEY_SHA256"] == hashlib.sha256(
        ubuntu["gateway"]["GATEWAY_TOOLGATE_OWNER_KEY"].encode()
    ).hexdigest()
    assert ubuntu["gateway"]["GATEWAY_TOOLGATE_OWNER_KEY"] != ubuntu["gateway"]["GATEWAY_TOOLGATE_EXECUTION_KEY"]


def test_both_layouts_enable_workers_but_decision_packaging_is_explicit(tmp_path):
    manifest, ubuntu = ubuntu_deployment(tmp_path)
    root = root_contract()

    assert 'PI_PROPOSALS_ENABLED: "true"' in root
    assert 'PI_SCHEDULER_ENABLED: "true"' in root
    assert ubuntu["pi"]["PI_PROPOSALS_ENABLED"] == "true"
    assert ubuntu["pi"]["PI_SCHEDULER_ENABLED"] == "true"
    assert "decisions" in manifest["services"]
    assert "PI_DECISION_URL: ${PI_DECISION_URL:-}" in root
    assert "PI_DECISION_KEY: ${PI_DECISION_KEY:-}" in root


def test_both_layouts_mount_speech_credentials_without_exposing_them(tmp_path):
    manifest, ubuntu = ubuntu_deployment(tmp_path)
    root = root_contract()

    assert "PI_SPEECH_KEY_FILE: /run/secrets/speech" in root
    assert "./.conker/speech/speech.key:/run/secrets/speech:ro" in root
    assert ubuntu["pi"]["PI_SPEECH_KEY_FILE"] == "/run/secrets/speech"
    assert ubuntu["pi"]["PI_SPEECH_CHARACTER_VOICE"] == "unsupported"
    assert ubuntu["pi"]["PI_SPEECH_TIMEOUT_S"] == "30"
    assert "PI_SPEECH_KEY" not in ubuntu["pi"]
    assert "./state/speech/speech.key:/run/secrets/speech:ro" in manifest["services"]["pi"]["volumes"]
    assert (tmp_path / "state/speech/speech.key").read_bytes() == b""
    assert "/run/secrets/speech" in recovery.UBUNTU_PROFILE.excluded_mounts["pi"]


def test_ubuntu_recovery_profile_matches_generated_deployment(tmp_path):
    manifest, environment = ubuntu_deployment(tmp_path)
    services = manifest["services"]

    assert set(services) == recovery.UBUNTU_SERVICES
    for service, destination in recovery.UBUNTU_STORES.items():
        declared = {
            volume.split(":", 2)[1]
            for volume in services[service].get("volumes", [])
        }
        assert destination in declared
    assert environment["memorygate"]["RUNTIME_SECRET_PATH"] == "/data/runtime.key"
    assert environment["postgres"]["POSTGRES_USER"] == "conker"
    assert environment["postgres"]["POSTGRES_DB"] == "conker"


def test_ubuntu_uses_authoritative_digest_pinned_images(tmp_path):
    manifest, _ = ubuntu_deployment(tmp_path)
    values = parse_env(ROOT / "versions.env")

    assert manifest["services"]["postgres"]["image"] == values["POSTGRES_IMAGE"]
    assert manifest["services"]["qdrant"]["image"] == values["QDRANT_IMAGE"]
    assert manifest["services"]["ollama"]["image"] == values["OLLAMA_IMAGE"]
    assert all(
        ":latest" not in manifest["services"][service]["image"]
        for service in ("postgres", "qdrant", "ollama")
    )


def test_ubuntu_prepare_refuses_a_missing_dashboard(tmp_path):
    result = subprocess.run(
        [sys.executable, str(ROOT / "deploy" / "ubuntu" / "prepare.py"),
         "https://conker.test:8443"],
        cwd=tmp_path,
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0
    assert "Missing verified dashboard build" in result.stderr


def test_ubuntu_prepare_refuses_a_mutable_release_image(tmp_path):
    dashboard = tmp_path / "sources" / "companion" / "dashboard" / "dist"
    dashboard.mkdir(parents=True)
    (dashboard / "index.html").write_text("<!doctype html>")
    versions = (ROOT / "versions.env").read_text(encoding="utf-8").replace(
        next(
            line
            for line in (ROOT / "versions.env").read_text(encoding="utf-8").splitlines()
            if line.startswith("POSTGRES_IMAGE=")
        ),
        "POSTGRES_IMAGE=postgres:16",
    )
    (tmp_path / "sources" / "companion" / "versions.env").write_text(
        versions, encoding="utf-8"
    )

    result = subprocess.run(
        [
            sys.executable,
            str(ROOT / "deploy" / "ubuntu" / "prepare.py"),
            "https://conker.test:8443",
        ],
        cwd=tmp_path,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert "Invalid reviewed release manifest" in result.stderr
    assert "tags are mutable" in result.stderr
    assert not (tmp_path / "compose.json").exists()
