from __future__ import annotations

import json
from typing import cast

import pytest

from scripts.release.release_checks import (
    SETUP_STEP_IDS,
    AcceptanceError,
    CommandRunner,
    Completed,
    Evidence,
    assert_complete_setup,
    assert_compose_matrix,
    build_image_plan,
)
from scripts.release_acceptance import AcceptanceGate


def manifest() -> dict:
    return {
        "manifest_version": 2,
        "conker_dashboard_revision": "a" * 40,
        "gates": {
            "pi": "1.2.3",
            "toolgate": "2.3.4",
            "memorygate": "3.4.5",
            "systemgate": "4.5.6",
            "embeddings": "5.6.7",
        },
        "third_party_images": {
            name: f"example/{name}@sha256:{index:064x}"
            for index, name in enumerate(
                ("postgres", "qdrant", "ollama", "searxng", "node_build"), 1
            )
        },
        "capabilities": {
            "owner-terminal": {
                "state": "deferred",
                "image": None,
                "acceptance_sha256": None,
            },
            "agent-sandbox": {
                "state": "deferred",
                "image": None,
            },
        },
    }


def test_planner_uses_every_normalized_version_and_maps_pi_to_both_services():
    plan = build_image_plan(manifest())

    assert len(plan["runtime_references"]) == 9
    assert len(plan["pull_references"]) == 10
    assert plan["build_only_references"] == ["example/node_build@sha256:" + "5".zfill(64)]
    assert plan["services"]["gateway"] == "ghcr.io/conker-ai/pi:1.2.3"
    assert plan["services"]["pi"] == plan["services"]["gateway"]
    assert plan["components"]["postgres"].endswith("@sha256:" + "1".zfill(64))
    assert all("latest" not in reference for reference in plan["pull_references"])


def test_planner_rejects_an_incomplete_normalized_contract():
    value = manifest()
    del value["gates"]["toolgate"]

    with pytest.raises(AcceptanceError, match="matrix is incomplete"):
        build_image_plan(value)


def test_active_terminal_is_an_exact_runtime_service_in_the_image_plan():
    value = manifest()
    value["capabilities"]["owner-terminal"] = {
        "state": "active",
        "image": "ghcr.io/conker-ai/pi-owner-terminal@sha256:" + "f" * 64,
        "acceptance_sha256": "e" * 64,
    }

    plan = build_image_plan(value)

    assert plan["services"]["owner-terminal"].endswith("@sha256:" + "f" * 64)
    assert plan["services"]["owner-terminal"] in plan["runtime_references"]


class CapturingRunner:
    def __init__(self):
        self.env = {}
        self.commands = []

    def run(self, args, **kwargs):
        self.commands.append((list(args), kwargs))
        return Completed(list(args), 0, "", "")


class ActiveManifestRunner(CapturingRunner):
    def run(self, args, **kwargs):
        completed = super().run(args, **kwargs)
        if kwargs.get("phase") == "normalize-manifest":
            value = manifest()
            value["capabilities"]["owner-terminal"] = {
                "state": "active",
                "image": "ghcr.io/conker-ai/pi-owner-terminal@sha256:" + "f" * 64,
                "acceptance_sha256": "e" * 64,
            }
            completed.stdout = json.dumps(value)
        return completed


def test_active_terminal_release_plan_requires_an_explicit_workspace(tmp_path):
    evidence = Evidence(tmp_path / "evidence")
    runner = ActiveManifestRunner()
    gate = AcceptanceGate(
        tmp_path,
        evidence,
        require_conversation=True,
        runner_factory=lambda *_args: cast(CommandRunner, runner),
    )

    with pytest.raises(AcceptanceError, match="requires --terminal-workspace"):
        gate.load_plan()


def test_active_terminal_release_plan_forwards_the_workspace_to_install(tmp_path):
    evidence = Evidence(tmp_path / "evidence")
    runner = ActiveManifestRunner()
    workspace = tmp_path / "workspace"
    gate = AcceptanceGate(
        tmp_path,
        evidence,
        require_conversation=True,
        terminal_workspace=workspace,
        runner_factory=lambda *_args: cast(CommandRunner, runner),
    )

    gate.load_plan()

    assert runner.env["CONKER_TERMINAL_WORKSPACE"] == str(workspace.resolve())
    assert runner.env["CONKER_TERMINAL_WORKSPACE_LABEL"] == "Release acceptance workspace"


def test_active_terminal_compose_uses_the_reviewed_overlay(tmp_path):
    evidence = Evidence(tmp_path / "evidence")
    runner = CapturingRunner()
    gate = AcceptanceGate(
        tmp_path,
        evidence,
        require_conversation=True,
        terminal_workspace=tmp_path / "workspace",
        runner_factory=lambda *_args: cast(CommandRunner, runner),
    )
    value = manifest()
    value["capabilities"]["owner-terminal"] = {
        "state": "active",
        "image": "ghcr.io/conker-ai/pi-owner-terminal@sha256:" + "f" * 64,
        "acceptance_sha256": "e" * 64,
    }
    gate.plan = build_image_plan(value)

    gate.compose("config", "--images", phase="compose-images")

    command = runner.commands[-1][0]
    assert command.count("-f") == 2
    assert str(tmp_path / "docker-compose.yml") in command
    assert str(tmp_path / "docker-compose.terminal.yml") in command


def test_deferred_terminal_compose_omits_the_overlay(tmp_path):
    evidence = Evidence(tmp_path / "evidence")
    runner = CapturingRunner()
    gate = AcceptanceGate(
        tmp_path,
        evidence,
        require_conversation=True,
        runner_factory=lambda *_args: cast(CommandRunner, runner),
    )
    gate.plan = build_image_plan(manifest())

    gate.compose("config", "--images", phase="compose-images")

    command = runner.commands[-1][0]
    assert command.count("-f") == 1
    assert str(tmp_path / "docker-compose.terminal.yml") not in command
    assert str(tmp_path / "docker-compose.sandbox.yml") not in command


def test_active_sandbox_compose_uses_the_sandbox_overlay(tmp_path):
    evidence = Evidence(tmp_path / "evidence")
    runner = CapturingRunner()
    gate = AcceptanceGate(
        tmp_path,
        evidence,
        require_conversation=True,
        runner_factory=lambda *_args: cast(CommandRunner, runner),
    )
    value = manifest()
    value["capabilities"]["agent-sandbox"] = {
        "state": "active",
        "image": "ghcr.io/conker-ai/toolgate-sandbox@sha256:" + "c" * 64,
    }
    gate.plan = build_image_plan(value)

    gate.compose("config", "--images", phase="compose-images")

    command = runner.commands[-1][0]
    assert command.count("-f") == 2
    assert str(tmp_path / "docker-compose.yml") in command
    assert str(tmp_path / "docker-compose.sandbox.yml") in command


def test_compose_matrix_requires_exact_set_without_substitutes():
    plan = build_image_plan(manifest())
    assert_compose_matrix(plan, plan["runtime_references"])

    changed = list(plan["runtime_references"])
    changed[0] = "ghcr.io/conker-ai/pi:latest"
    with pytest.raises(AcceptanceError, match=r"missing=.*unexpected="):
        assert_compose_matrix(plan, changed)


def complete_setup_status() -> dict:
    return {
        "schemaVersion": 1,
        "state": "complete",
        "currentStep": None,
        "recommendedNextOperation": None,
        "steps": [{"id": identity, "state": "complete"} for identity in sorted(SETUP_STEP_IDS)],
    }


def test_final_setup_requires_every_exact_step_complete():
    assert_complete_setup(complete_setup_status())

    incomplete = complete_setup_status()
    incomplete["state"] = "in_progress"
    incomplete["currentStep"] = "protection"
    incomplete["steps"][5]["state"] = "skipped"
    with pytest.raises(AcceptanceError, match="did not finish every release step"):
        assert_complete_setup(incomplete)

    unknown = complete_setup_status()
    unknown["steps"].append({"id": "future-step", "state": "complete"})
    with pytest.raises(AcceptanceError, match="inventory differs"):
        assert_complete_setup(unknown)


def test_build_only_images_are_pulled_but_excluded_from_compose_matrix():
    plan = build_image_plan(manifest())
    node = plan["components"]["node_build"]

    assert node in plan["pull_references"]
    assert node in plan["build_only_references"]
    assert node not in plan["runtime_references"]
    assert_compose_matrix(plan, plan["runtime_references"])
    with pytest.raises(AcceptanceError, match=r"unexpected=.*node_build"):
        assert_compose_matrix(plan, plan["pull_references"])
