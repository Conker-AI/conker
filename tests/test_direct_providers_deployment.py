"""Gemini, xAI, Mistral, DeepSeek and Groq keys: offered, mounted and backed up only by the rule
in scripts/provider_records.py, so a release that pins an older Pi keeps today's three rows."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pytest
import yaml

from scripts.compose_overlays import overlay_files
from scripts.provider_records import FIRST_PROVIDERS, PROVIDERS
from tests.ubuntu_generator import prepare

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from recovery_layout import (
    PROVIDER_IDS,
    REPOSITORY_PROFILE,
    UBUNTU_PROFILE,
)

DIRECT = tuple(name for name in PROVIDERS if name not in FIRST_PROVIDERS)
OVERLAY = "docker-compose.direct-providers.yml"


def versions(state: str, pi: str | None = None) -> str:
    text = (ROOT / "versions.env").read_text(encoding="utf-8")
    text = re.sub(r"(?m)^DIRECT_PROVIDERS_STATE=.*$", f"DIRECT_PROVIDERS_STATE={state}", text)
    if pi is not None:
        text = re.sub(r"(?m)^PI_VERSION=.*$", f"PI_VERSION={pi}", text)
    return text


def test_the_direct_providers_are_the_five_new_labs():
    assert DIRECT == ("gemini", "xai", "mistral", "deepseek", "groq")
    assert tuple(PROVIDERS)[:3] == FIRST_PROVIDERS


def test_this_release_keeps_them_deferred_until_pi_reads_their_keys():
    assert "DIRECT_PROVIDERS_STATE=deferred" in (ROOT / "versions.env").read_text(encoding="utf-8")


@pytest.mark.parametrize("state,runs", [("deferred", False), ("active", True)])
def test_the_overlay_runs_only_when_released(tmp_path, state, runs):
    (tmp_path / "versions.env").write_text(f"DIRECT_PROVIDERS_STATE={state}\n", encoding="utf-8")
    assert (tmp_path / OVERLAY in overlay_files(tmp_path)) is runs


def test_the_shell_entry_points_add_the_overlay_by_the_same_line():
    for script in ("conker", "install.sh"):
        text = (ROOT / script).read_text(encoding="utf-8")
        assert "grep -qx 'DIRECT_PROVIDERS_STATE=active' \"$ROOT/versions.env\"" in text
        assert f'files+=(-f "$ROOT/{OVERLAY}")' in text


def test_the_overlay_gives_pi_each_key_as_a_read_only_file_and_never_a_value():
    pi = yaml.safe_load((ROOT / OVERLAY).read_text(encoding="utf-8"))["services"]["pi"]
    assert pi["environment"] == {
        f"PI_{name.upper()}_KEY_FILE": f"/run/secrets/provider-{name}" for name in DIRECT
    }
    assert pi["volumes"] == [
        f"./.conker/provider-secrets/{name}.key:/run/secrets/provider-{name}:ro" for name in DIRECT
    ]


def pi_service(tmp_path, state, pi=None):
    """Pi's Compose service and the environment file prepare.py writes for it."""
    prepare(tmp_path, versions(state, pi))
    service = json.loads((tmp_path / "compose.json").read_text(encoding="utf-8"))["services"]["pi"]
    lines = (tmp_path / "state" / "pi.env").read_text(encoding="utf-8").splitlines()
    return service, dict(line.split("=", 1) for line in lines if line)


def test_the_ubuntu_build_leaves_them_out_while_deferred(tmp_path):
    service, environment = pi_service(tmp_path, "deferred")
    assert not any(f"PI_{name.upper()}_" in key for key in environment for name in DIRECT)
    assert not any(f"provider-{name}" in volume for volume in service["volumes"] for name in DIRECT)
    # The key files exist anyway, so a later release can mount them.
    for name in PROVIDERS:
        assert (tmp_path / "state" / "provider-secrets" / f"{name}.key").is_file()


def test_the_ubuntu_build_mounts_them_when_active(tmp_path):
    service, environment = pi_service(tmp_path, "active", pi="0.16.1")
    for name in DIRECT:
        assert environment[f"PI_{name.upper()}_KEY_FILE"] == f"/run/secrets/provider-{name}"
        assert f"PI_{name.upper()}_KEY" not in environment
        mount = f"./state/provider-secrets/{name}.key:/run/secrets/provider-{name}:ro"
        assert mount in service["volumes"]


def test_the_ubuntu_build_refuses_them_with_a_pi_that_cannot_read_them(tmp_path):
    result = prepare(tmp_path, versions("active", pi="0.16.0"), check=False)
    assert result.returncode != 0
    assert "direct providers require PI_VERSION" in result.stdout + result.stderr
    assert not (tmp_path / "compose.json").exists()


@pytest.mark.parametrize("profile", [REPOSITORY_PROFILE, UBUNTU_PROFILE])
def test_backups_never_hold_any_provider_key(profile):
    assert PROVIDER_IDS == set(PROVIDERS)
    for name in PROVIDERS:
        assert f"/run/secrets/provider-{name}" in profile.excluded_mounts["pi"]
