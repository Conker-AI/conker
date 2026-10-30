"""The Claude plan runtime on the repository install: its release pin, its overlay, and the one
rule (scripts/compose_overlays.py) by which update, backup and the spending switch run it."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pytest
import yaml

from scripts.compose_overlays import overlay_files
from scripts.provider_paid_policy import PaidPolicy
from scripts.release_manifest import ManifestError, parse_env, validate_manifest
from scripts.update import HostTransport
from tests.recovery_fakes import Engine
from tests.ubuntu_generator import prepare

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import recovery
import recovery_layout
import recovery_snapshot

MANIFEST = ROOT / "versions.env"
OVERLAY = ROOT / "docker-compose.subscriptions.yml"
PINNED = "ghcr.io/conker-ai/subscriptions@sha256:" + "a" * 64
TRIVY = "aquasec/trivy:0.75.0@sha256:af6acf9a6b85dfe389a1941505c0ce9efef52a4719635e1a962f022a3d855daa"


def files(command: list[str]) -> list[str]:
    return [command[index + 1] for index, part in enumerate(command) if part == "-f"]


def mounts(service: dict) -> set[str]:
    return {volume.split(":")[1] for volume in service["volumes"]}


def release(root: Path, state: str, choice: str | None) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    (root / "versions.env").write_text(
        f"AGENT_SANDBOX_STATE=active\nSUBSCRIPTIONS_STATE={state}\n", encoding="utf-8"
    )
    (root / ".env").write_text(
        "" if choice is None else f"CONKER_CLAUDE_PLAN={choice}\n", encoding="utf-8"
    )
    return root


# --- the release pin ----------------------------------------------------------------------------


def test_the_repository_release_keeps_the_runtime_deferred_until_its_image_is_pinned():
    values = parse_env(MANIFEST)
    assert values["SUBSCRIPTIONS_STATE"] == "deferred"
    assert "SUBSCRIPTIONS_IMAGE" not in values
    assert validate_manifest(values)["capabilities"]["subscriptions"] == {
        "state": "deferred",
        "image": None,
    }


@pytest.mark.parametrize(
    ("state", "image", "message"),
    [
        ("deferred", PINNED, "deferred Claude plan runtime must not name an image"),
        ("active", None, "active Claude plan runtime requires SUBSCRIPTIONS_IMAGE"),
        ("active", "ghcr.io/conker-ai/subscriptions:0.1.0", "tags are mutable"),
        (
            "active",
            "ghcr.io/other/subscriptions@sha256:" + "a" * 64,
            "ghcr.io/conker-ai/subscriptions@",
        ),
        ("sometimes", None, "SUBSCRIPTIONS_STATE must be deferred or active"),
    ],
)
def test_the_pin_must_be_our_image_by_digest(state, image, message):
    values = parse_env(MANIFEST)
    values["SUBSCRIPTIONS_STATE"] = state
    values.pop("SUBSCRIPTIONS_IMAGE", None)
    if image:
        values["SUBSCRIPTIONS_IMAGE"] = image

    with pytest.raises(ManifestError, match=re.escape(message)):
        validate_manifest(values)


def test_an_active_pin_names_the_image_and_a_release_without_the_state_is_incomplete():
    values = parse_env(MANIFEST)
    values.update(SUBSCRIPTIONS_STATE="active", SUBSCRIPTIONS_IMAGE=PINNED)
    assert validate_manifest(values)["capabilities"]["subscriptions"] == {
        "state": "active",
        "image": PINNED,
    }

    values.pop("SUBSCRIPTIONS_STATE")
    with pytest.raises(ManifestError, match="SUBSCRIPTIONS_STATE"):
        validate_manifest(values)


# --- the overlay --------------------------------------------------------------------------------


def test_the_runtime_is_boxed_in_and_pi_gets_only_the_inference_key():
    overlay = yaml.safe_load(OVERLAY.read_text(encoding="utf-8"))
    assert set(overlay["services"]) == {"pi", "subscriptions"}
    assert set(overlay) == {"services"}, "no volume or network of its own"

    runtime = overlay["services"]["subscriptions"]
    assert runtime["image"].startswith("${SUBSCRIPTIONS_IMAGE:?")
    # Pi talks to a subscription runtime only at 127.0.0.1, so the runtime joins Pi's namespace.
    assert runtime["network_mode"] == "service:pi"
    assert "ports" not in runtime and "networks" not in runtime
    assert runtime["read_only"] is True
    assert runtime["cap_drop"] == ["ALL"] and "cap_add" not in runtime
    assert runtime["security_opt"] == ["no-new-privileges:true"]
    assert runtime["user"] == "${CONKER_UID:-1000}:${CONKER_GID:-1000}"
    assert runtime["volumes"] == [
        "./.conker/subscriptions:/state",
        "./.conker/chatgpt-inference:/run/conker-chatgpt:ro",
    ]
    assert set(runtime["environment"]) == {
        "SUBSCRIPTIONS_CONTROL_KEY",
        "SUBSCRIPTIONS_INFERENCE_KEY",
        "SUBSCRIPTIONS_CHATGPT_SOCKET",
    }

    assert overlay["services"]["pi"] == {
        "environment": {
            "PI_SUBSCRIPTION_URL": "http://127.0.0.1:8070",
            "PI_SUBSCRIPTION_KEY": "${SUBSCRIPTIONS_INFERENCE_KEY:?run ./install.sh --claude-plan}",
        }
    }
    base = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    assert "SUBSCRIPTIONS_" not in base and ".conker/subscriptions" not in base


def test_the_overlay_hardening_matches_the_ubuntu_build(tmp_path):
    prepare(tmp_path)
    ubuntu = json.loads((tmp_path / "compose.json").read_text())["services"][
        "subscriptions"
    ]
    runtime = yaml.safe_load(OVERLAY.read_text(encoding="utf-8"))["services"][
        "subscriptions"
    ]
    for setting in (
        "network_mode",
        "read_only",
        "cap_drop",
        "security_opt",
        "pids_limit",
        "mem_limit",
        "tmpfs",
    ):
        assert runtime[setting] == ubuntu[setting], setting
    assert mounts(runtime) == mounts(ubuntu)


# --- one rule for every tool --------------------------------------------------------------------


@pytest.mark.parametrize(
    ("state", "choice", "runs"),
    [
        ("deferred", "on", False),
        ("active", None, False),
        ("active", "off", False),
        ("active", "on", True),
    ],
)
def test_the_runtime_runs_only_when_released_and_chosen(tmp_path, state, choice, runs):
    root = release(tmp_path / "install", state, choice)

    chosen = overlay_files(root)

    assert chosen[0] == root / "docker-compose.sandbox.yml"
    assert (root / "docker-compose.subscriptions.yml" in chosen) is runs


def test_a_missing_env_or_manifest_chooses_no_overlay(tmp_path):
    assert overlay_files(tmp_path) == []


def test_update_runs_the_candidate_releases_overlays_with_the_owners_choice(tmp_path):
    current = release(tmp_path / "current", "deferred", "on")
    candidate = release(tmp_path / "candidate", "active", None)
    transport = object.__new__(HostTransport)
    transport.root, transport.env_file = current, current / ".env"

    assert files(transport._compose_command("config")) == [
        str(current / "docker-compose.yml"),
        str(current / "docker-compose.sandbox.yml"),
    ]
    # The candidate release has the runtime; this installation's .env chose it.
    override = tmp_path / "resolved-images.json"
    assert files(
        transport._compose_command("up", root=candidate, override=override)
    ) == [
        str(candidate / "docker-compose.yml"),
        str(candidate / "docker-compose.sandbox.yml"),
        str(candidate / "docker-compose.subscriptions.yml"),
        str(override),
    ]
    (current / ".env").write_text("CONKER_CLAUDE_PLAN=off\n", encoding="utf-8")
    assert str(candidate / "docker-compose.subscriptions.yml") not in files(
        transport._compose_command("config", root=candidate)
    )


def test_the_spending_switch_recreates_pi_with_the_runtimes_address(tmp_path):
    root = release(tmp_path / "install", "active", "on")
    seen = []

    def runner(command, **_):
        seen.append(command)

        class Result:
            returncode, stdout = 0, b""

        return Result()

    PaidPolicy(root, "repository", runner=runner)._compose("config", "--services")

    assert files(seen[0])[-1] == str(
        root.resolve() / "docker-compose.subscriptions.yml"
    )


# --- backups ------------------------------------------------------------------------------------


def test_the_runtime_is_an_optional_writer_whose_mounts_are_never_archived():
    profile = recovery_layout.REPOSITORY_PROFILE
    assert "subscriptions" in profile.optional_services
    assert profile.writers.index("pi") < profile.writers.index("subscriptions")
    assert profile.excluded_mounts["subscriptions"] == frozenset(
        {"/state", "/run/conker-chatgpt"}
    )
    overlay = yaml.safe_load(OVERLAY.read_text(encoding="utf-8"))["services"][
        "subscriptions"
    ]
    assert mounts(overlay) == profile.excluded_mounts["subscriptions"]


def test_backup_inventories_the_overlay_only_when_it_runs(tmp_path):
    root = release(tmp_path / "install", "active", "on")
    profile = recovery_layout.REPOSITORY_PROFILE
    assert str(
        root / "docker-compose.subscriptions.yml"
    ) in recovery_layout.compose_command(root, profile)
    (root / ".env").write_text("CONKER_CLAUDE_PLAN=off\n", encoding="utf-8")
    assert str(
        root / "docker-compose.subscriptions.yml"
    ) not in recovery_layout.compose_command(root, profile)


def test_backup_stops_the_runtime_and_leaves_its_sign_in_out(tmp_path):
    root = tmp_path / "install"
    root.mkdir()
    for name in (".env", "versions.env", "docker-compose.yml"):
        (root / name).write_text("test configuration\n")
    engine = Engine(tmp_path)
    sign_in, sockets = tmp_path / "subscriptions", tmp_path / "chatgpt-inference"
    (sign_in / "claude-auth").mkdir(parents=True)
    (sign_in / "claude-auth/.credentials.json").write_text("synthetic-sign-in")
    sockets.mkdir()
    engine.services.add("subscriptions")
    engine.containers["source-subscriptions"] = {
        "Id": "source-subscriptions",
        "Image": engine.image,
        "State": {"Running": True, "ExitCode": 0},
        "Mounts": [
            {"Type": "bind", "Source": str(sign_in), "Destination": "/state"},
            {
                "Type": "bind",
                "Source": str(sockets),
                "Destination": "/run/conker-chatgpt",
            },
        ],
        "Config": {"Image": PINNED, "Env": []},
    }

    snapshot = recovery.backup(root, None, engine)
    manifest = recovery_snapshot.verify_snapshot(snapshot)

    assert "subscriptions" in manifest["images"]
    assert "subscriptions" not in manifest["stores"]
    archived = b"".join(
        path.read_bytes() for path in snapshot.rglob("*") if path.is_file()
    )
    assert b"synthetic-sign-in" not in archived
    assert any(
        call[0] == "stop" and "source-subscriptions" in call for call in engine.calls
    )


# --- the publish workflow -----------------------------------------------------------------------


def test_the_image_is_published_only_for_its_own_tags_after_its_checks():
    workflow = (ROOT / ".github/workflows/publish-subscriptions.yml").read_text(
        encoding="utf-8"
    )
    parsed = yaml.safe_load(workflow)
    triggers = (
        parsed[True] if True in parsed else parsed["on"]
    )  # YAML reads `on` as true

    assert triggers["push"] == {"tags": ["subscriptions-v*.*.*"]}
    assert parsed["permissions"] == {"contents": "read"}
    assert parsed["env"]["IMAGE"] == "ghcr.io/conker-ai/subscriptions"
    assert parsed["env"]["TRIVY"] == TRIVY
    # One exact version tag, never a moving one.
    assert ":latest" not in workflow and "type=semver" not in workflow
    assert "tags: type=raw,value=${{ steps.version.outputs.version }}" in workflow
    steps = parsed["jobs"]["publish"]["steps"]
    names = [step.get("name", step.get("uses", "")) for step in steps]
    order = [
        names.index(name)
        for name in (
            "A published version never moves",
            "Build",
            "Claude Code runs read-only, without a network",
            "Scan the image",
            "Nothing secret is baked in",
            "Push",
        )
    ]
    assert order == sorted(order)
    for step in steps:
        if step.get("name") in {
            "Push",
            "A published version never moves",
        } or "attest" in step.get("uses", ""):
            assert "github.event_name == 'push'" in step["if"]
    build = next(step for step in steps if step.get("name") == "Build")
    assert build["with"]["file"] == "services/subscriptions/Dockerfile"
    assert build["with"]["load"] is True and "push" not in build["with"]
    assert "services/subscriptions/CHANGELOG.md" in workflow
    assert "## Unreleased" in (ROOT / "services/subscriptions/CHANGELOG.md").read_text(
        encoding="utf-8"
    )


def test_ci_and_the_weekly_check_scan_the_image_like_the_others():
    ci = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")
    runtime_job = ci.split("  subscription-runtime:", 1)[1].split("\n  cross-gate:", 1)[
        0
    ]
    assert TRIVY in runtime_job and "conker-subscriptions:ci" in runtime_job
    weekly = (ROOT / ".github/workflows/security.yml").read_text(encoding="utf-8")
    assert "pin SUBSCRIPTIONS_IMAGE" in weekly
    dockerfile = (ROOT / "services/subscriptions/Dockerfile").read_text(
        encoding="utf-8"
    )
    assert "fetch_claude.py" in dockerfile
