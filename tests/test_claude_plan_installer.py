"""install.sh and the Claude plan runtime: its two keys always, its overlay only when the release
pins the image and the owner chose it. Uses test_installer.py's fixtures, which run the real
`docker compose config` and nothing that pulls or starts the runtime."""

from __future__ import annotations

import json
import os
import subprocess

import pytest

from scripts.release_manifest import parse_env
from tests.test_installer import (  # noqa: F401
    ROOT,
    env_values,
    install,
    needs_docker,
    pytestmark,
)

PINNED = "ghcr.io/conker-ai/subscriptions@sha256:" + "a" * 64


def activate(install):  # noqa: F811 - fixture
    """This copy's release, with the image pinned (by a digest compose never pulls here)."""
    versions = install.dir / "versions.env"
    versions.write_text(
        versions.read_text().replace(
            "SUBSCRIPTIONS_STATE=deferred",
            f"SUBSCRIPTIONS_STATE=active\nSUBSCRIPTIONS_IMAGE={PINNED}",
        )
    )


def resolved(install, *overlays: str) -> dict:  # noqa: F811 - fixture
    command = [
        "docker",
        "compose",
        "--env-file",
        str(install.dir / "versions.env"),
        "--env-file",
        str(install.env_file),
        "-f",
        str(install.dir / "docker-compose.yml"),
    ]
    for overlay in overlays:
        command += ["-f", str(install.dir / overlay)]
    result = subprocess.run(
        [*command, "config", "--format", "json"],
        capture_output=True,
        text=True,
        cwd=str(install.dir),
        check=True,
    )
    return json.loads(result.stdout)


def test_help_names_the_choice(install):  # noqa: F811 - fixture
    result = install("--help")
    assert "--claude-plan" in result.stdout and "--no-claude-plan" in result.stdout


@needs_docker
def test_keys_are_made_while_the_release_keeps_it_off(install):  # noqa: F811 - fixture
    result = install("--yes", "--dry-run", "--claude-plan")
    values = env_values(install.env_file)

    control, inference = (
        values["SUBSCRIPTIONS_CONTROL_KEY"],
        values["SUBSCRIPTIONS_INFERENCE_KEY"],
    )
    assert min(len(control), len(inference)) >= 32 and control != inference
    assert values["CONKER_CLAUDE_PLAN"] == ""
    assert "does not include the Claude plan runtime yet" in result.stdout
    assert not (install.dir / ".conker/subscriptions").exists()

    install("--yes", "--dry-run")
    again = env_values(install.env_file)
    assert (
        again["SUBSCRIPTIONS_CONTROL_KEY"],
        again["SUBSCRIPTIONS_INFERENCE_KEY"],
    ) == (
        control,
        inference,
    )


@needs_docker
def test_the_owner_turns_it_on_and_compose_wires_its_keys(install):  # noqa: F811 - fixture
    activate(install)
    install("--yes", "--dry-run")
    # Unattended, the answer is the default: no.
    assert env_values(install.env_file)["CONKER_CLAUDE_PLAN"] == "off"

    install("--yes", "--dry-run", "--claude-plan")
    values = env_values(install.env_file)
    assert values["CONKER_CLAUDE_PLAN"] == "on"
    folder = install.dir / ".conker/subscriptions"
    assert folder.is_dir() and not folder.is_symlink()
    assert folder.stat().st_mode & 0o777 == 0o700

    config = resolved(
        install, "docker-compose.sandbox.yml", "docker-compose.subscriptions.yml"
    )
    runtime = config["services"]["subscriptions"]
    assert runtime["image"] == PINNED
    assert (
        runtime["environment"]["SUBSCRIPTIONS_CONTROL_KEY"]
        == values["SUBSCRIPTIONS_CONTROL_KEY"]
    )
    pi = config["services"]["pi"]
    assert pi["environment"]["PI_SUBSCRIPTION_URL"] == "http://127.0.0.1:8070"
    assert (
        pi["environment"]["PI_SUBSCRIPTION_KEY"]
        == values["SUBSCRIPTIONS_INFERENCE_KEY"]
    )
    assert values["SUBSCRIPTIONS_CONTROL_KEY"] not in json.dumps(pi)

    # A re-run keeps the choice and the keys; the other flag turns it off.
    install("--yes", "--dry-run")
    again = env_values(install.env_file)
    assert again["CONKER_CLAUDE_PLAN"] == "on"
    for name in (
        "SUBSCRIPTIONS_CONTROL_KEY",
        "SUBSCRIPTIONS_INFERENCE_KEY",
        "CONKER_ADMIN_KEY",
    ):
        assert again[name] == values[name], name
    install("--yes", "--dry-run", "--no-claude-plan")
    assert env_values(install.env_file)["CONKER_CLAUDE_PLAN"] == "off"


@needs_docker
@pytest.mark.skipif(
    os.environ.get("CONKER_OFFLINE_TESTS") == "1",
    reason="asks the registry; set CONKER_OFFLINE_TESTS=1 to skip",
)
def test_an_active_pin_exists_in_the_registry():
    values = parse_env(ROOT / "versions.env")
    if values["SUBSCRIPTIONS_STATE"] != "active":
        pytest.skip("the Claude plan runtime is deferred; no image is pinned yet")
    result = subprocess.run(
        ["docker", "manifest", "inspect", values["SUBSCRIPTIONS_IMAGE"]],
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, (
        "the pinned Claude plan runtime image is not in the registry"
    )
