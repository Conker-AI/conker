from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

from scripts.release_manifest import ManifestError, parse_env, validate_manifest

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "versions.env"


def current_dashboard_tree() -> str:
    return subprocess.run(
        ["git", "rev-parse", "HEAD:dashboard"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()


def test_repository_release_manifest_is_complete_and_matches_dashboard():
    normalized = validate_manifest(
        parse_env(MANIFEST), actual_dashboard_revision=current_dashboard_tree()
    )

    assert normalized["manifest_version"] == 2
    assert set(normalized["gates"]) == {
        "pi", "toolgate", "memorygate", "systemgate", "embeddings"
    }
    assert set(normalized["third_party_images"]) == {
        "postgres", "qdrant", "ollama", "searxng", "node_build"
    }
    assert normalized["capabilities"]["owner-terminal"] == {
        "state": "deferred", "image": None, "acceptance_sha256": None,
    }


@pytest.mark.parametrize("value", ["postgres:16", "postgres:latest", "postgres@sha256:nope"])
def test_mutable_or_malformed_third_party_images_are_rejected(value):
    values = parse_env(MANIFEST)
    values["POSTGRES_IMAGE"] = value

    with pytest.raises(ManifestError, match="tags are mutable"):
        validate_manifest(values)


def test_future_third_party_images_are_also_required_to_use_digests():
    values = parse_env(MANIFEST)
    values["REDIS_IMAGE"] = "redis:7"

    with pytest.raises(ManifestError, match="REDIS_IMAGE.*tags are mutable"):
        validate_manifest(values)


def test_latest_gate_release_is_rejected():
    values = parse_env(MANIFEST)
    values["PI_VERSION"] = "latest"

    with pytest.raises(ManifestError, match="immutable semantic version"):
        validate_manifest(values)


def test_deferred_terminal_cannot_smuggle_an_image_into_the_release():
    values = parse_env(MANIFEST)
    values["OWNER_TERMINAL_IMAGE"] = "example/terminal@sha256:" + "a" * 64

    with pytest.raises(ManifestError, match="deferred owner terminal"):
        validate_manifest(values)


def test_active_terminal_requires_exact_image_and_linux_acceptance_identity():
    values = parse_env(MANIFEST)
    values["OWNER_TERMINAL_STATE"] = "active"
    with pytest.raises(ManifestError, match="OWNER_TERMINAL_IMAGE"):
        validate_manifest(values)

    values["OWNER_TERMINAL_IMAGE"] = "example/terminal@sha256:" + "a" * 64
    with pytest.raises(ManifestError, match="OWNER_TERMINAL_ACCEPTANCE_SHA256"):
        validate_manifest(values)

    values["OWNER_TERMINAL_ACCEPTANCE_SHA256"] = "b" * 64
    normalized = validate_manifest(values)
    assert normalized["capabilities"]["owner-terminal"]["state"] == "active"


def test_stale_dashboard_revision_is_rejected():
    values = parse_env(MANIFEST)

    with pytest.raises(ManifestError, match="does not match HEAD:dashboard"):
        validate_manifest(values, actual_dashboard_revision="0" * 40)


def test_cli_emits_a_normalized_machine_readable_contract():
    result = subprocess.run(
        [sys.executable, "scripts/release_manifest.py", "--json"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )

    payload = json.loads(result.stdout)
    assert payload["conker_dashboard_revision"] == current_dashboard_tree()
    assert payload["gates"]["toolgate"] == parse_env(MANIFEST)["TOOLGATE_VERSION"]
