from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.release_acceptance import (
    EVIDENCE_SCHEMA,
    SETUP_STEP_IDS,
    AcceptanceError,
    AcceptanceGate,
    Completed,
    Evidence,
    assert_complete_setup,
    assert_compose_matrix,
    build_image_plan,
)


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
                "state": "deferred", "image": None, "acceptance_sha256": None,
            }
        },
    }


def test_planner_uses_every_normalized_version_and_maps_pi_to_both_services():
    plan = build_image_plan(manifest())

    assert len(plan["runtime_references"]) == 9
    assert len(plan["pull_references"]) == 10
    assert plan["build_only_references"] == [
        "example/node_build@sha256:" + "5".zfill(64)
    ]
    assert plan["services"]["gateway"] == "ghcr.io/alexeybe1kin/pi:1.2.3"
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
        runner_factory=lambda *_args: runner,
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
        runner_factory=lambda *_args: runner,
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
        runner_factory=lambda *_args: runner,
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
        runner_factory=lambda *_args: runner,
    )
    gate.plan = build_image_plan(manifest())

    gate.compose("config", "--images", phase="compose-images")

    command = runner.commands[-1][0]
    assert command.count("-f") == 1
    assert str(tmp_path / "docker-compose.terminal.yml") not in command


def test_compose_matrix_requires_exact_set_without_substitutes():
    plan = build_image_plan(manifest())
    assert_compose_matrix(plan, plan["runtime_references"])

    changed = list(plan["runtime_references"])
    changed[0] = "ghcr.io/alexeybe1kin/pi:latest"
    with pytest.raises(AcceptanceError, match="missing=.*unexpected="):
        assert_compose_matrix(plan, changed)


def complete_setup_status() -> dict:
    return {
        "schemaVersion": 1,
        "state": "complete",
        "currentStep": None,
        "recommendedNextOperation": None,
        "steps": [
            {"id": identity, "state": "complete"}
            for identity in sorted(SETUP_STEP_IDS)
        ],
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
    with pytest.raises(AcceptanceError, match="unexpected=.*node_build"):
        assert_compose_matrix(plan, plan["pull_references"])


def test_evidence_is_machine_readable_and_redacts_sensitive_fields(tmp_path: Path):
    evidence = Evidence(tmp_path / "evidence")
    evidence.artifact("auth.json", {"authenticated": True, "csrf_token": "secret"})
    evidence.event("auth", "passed", cookie="secret")
    evidence.finalize(passed=True)

    assert json.loads((evidence.root / "auth.json").read_text())["csrf_token"] == "[redacted]"
    summary = json.loads((evidence.root / "summary.json").read_text())
    assert summary["schema"] == EVIDENCE_SCHEMA
    assert summary["passed"] is True
    assert summary["steps"][0]["cookie"] == "[redacted]"


class FailingGate(AcceptanceGate):
    def __init__(self, root: Path, evidence: Evidence):
        self.root = root
        self.evidence = evidence
        self.teardown_called = False

    def preflight(self) -> None:
        pass

    def load_plan(self) -> None:
        raise AcceptanceError("declared image unavailable")

    def teardown(self) -> None:
        self.teardown_called = True
        self.evidence.event("teardown", "passed")


def test_failure_is_retained_and_teardown_still_runs(tmp_path: Path):
    evidence = Evidence(tmp_path / "evidence")
    gate = FailingGate(tmp_path, evidence)

    with pytest.raises(AcceptanceError, match="declared image unavailable"):
        gate.run()

    assert gate.teardown_called
    summary = json.loads((evidence.root / "summary.json").read_text())
    assert summary["passed"] is False
    assert "declared image unavailable" in summary["error"]
    assert summary["steps"][-1]["phase"] == "teardown"


class BrokenTeardownGate(FailingGate):
    def load_plan(self) -> None:
        pass

    def pull_and_resolve_images(self) -> None:
        pass

    def install(self) -> None:
        pass

    def verify_running_identity(self) -> None:
        pass

    def verify_health(self) -> None:
        pass

    def setup_password_and_authenticate(self) -> None:
        pass

    def verify_setup_status(self) -> None:
        pass

    def configure_first_run(self) -> None:
        pass

    def rehearse_conversation(self) -> None:
        pass

    def complete_rehearsal(self) -> None:
        pass

    def backup_and_restore(self) -> None:
        pass

    def teardown(self) -> None:
        raise AcceptanceError("volume cleanup failed")


def test_teardown_failure_fails_otherwise_successful_gate(tmp_path: Path):
    evidence = Evidence(tmp_path / "evidence")
    gate = BrokenTeardownGate(tmp_path, evidence)

    with pytest.raises(AcceptanceError, match="volume cleanup failed"):
        gate.run()

    assert json.loads((evidence.root / "summary.json").read_text())["passed"] is False


class OrderedGate(AcceptanceGate):
    def __init__(self, evidence: Evidence):
        self.evidence = evidence
        self.calls: list[str] = []

    def _record(self, name: str) -> None:
        self.calls.append(name)

    def preflight(self):
        self._record("preflight")

    def load_plan(self):
        self._record("load_plan")

    def pull_and_resolve_images(self):
        self._record("pull_images")

    def install(self):
        self._record("install")

    def verify_running_identity(self):
        self._record("identity")

    def setup_password_and_authenticate(self):
        self._record("auth")

    def verify_health(self):
        self._record("health")

    def configure_first_run(self):
        self._record("configure_setup")

    def rehearse_conversation(self):
        self._record("conversation")

    def complete_rehearsal(self):
        self._record("rehearsal")

    def backup_and_restore(self):
        self._record("protection_restore")

    def verify_setup_status(self):
        self._record("final_setup_status")

    def teardown(self):
        self._record("teardown")


def test_gate_completes_setup_before_claiming_final_status(tmp_path: Path):
    evidence = Evidence(tmp_path / "evidence")
    gate = OrderedGate(evidence)

    gate.run()

    assert gate.calls == [
        "preflight",
        "load_plan",
        "pull_images",
        "install",
        "identity",
        "auth",
        "health",
        "configure_setup",
        "conversation",
        "rehearsal",
        "protection_restore",
        "final_setup_status",
        "teardown",
    ]
    assert json.loads((evidence.root / "summary.json").read_text())["passed"] is True


class SetupRunner:
    def __init__(self):
        self.env = {"CONKER_LOCAL_MODEL": "qwen2.5:0.5b"}
        self.calls: list[tuple[list[str], str]] = []

    def run(self, args, *, phase="command", **kwargs):
        command = list(args)
        self.calls.append((command, phase))
        if phase == "setup-model-options":
            body = {
                "candidates": [
                    {
                        "id": "local-answer",
                        "route": "qwen2.5:0.5b",
                        "execution": "local",
                        "status": "ready",
                    }
                ]
            }
        elif phase == "setup-boundaries-inspect":
            body = {"digest": "a" * 64, "tools": []}
        elif phase == "setup-rehearsal-approval-start":
            body = {"approvalRequestId": "setup-approval-123"}
        elif phase == "setup-rehearsal-finalize":
            body = {
                "receiptId": "setup-rehearsal-receipt",
                "source": "conker.first-run-rehearsal",
                "subject": "owner.daily-workflow",
                "evidenceDigest": "b" * 64,
            }
        else:
            body = {"status": "ok"}
        return type(
            "Result",
            (),
            {"stdout": json.dumps(body), "stderr": "", "returncode": 0},
        )()


def setup_gate(tmp_path: Path) -> tuple[AcceptanceGate, SetupRunner]:
    gate = AcceptanceGate.__new__(AcceptanceGate)
    gate.runner = SetupRunner()
    gate.evidence = Evidence(tmp_path / "evidence")
    gate.snapshot_store = tmp_path / "off-machine" / "snapshots"
    gate.snapshot_store.mkdir(parents=True)
    gate.work = tmp_path / "work"
    gate.work.mkdir()
    gate.require_conversation = True
    return gate, gate.runner


def test_headless_setup_uses_server_candidates_and_exact_boundary_digest(tmp_path: Path):
    gate, runner = setup_gate(tmp_path)

    gate.configure_first_run()

    commands = [command for command, _ in runner.calls]
    assert ["bash", "./conker", "setup", "run", "model", "local-answer"] in commands
    assert [
        "bash", "./conker", "setup", "run", "boundaries", "--confirm-digest", "a" * 64
    ] in commands
    protection = next(command for command in commands if "--destination" in command)
    assert protection[protection.index("--destination") + 1] == str(gate.snapshot_store)
    assert protection[-2:] == ["--retention", "2"]


def test_rehearsal_approves_only_the_server_issued_request(tmp_path: Path):
    gate, runner = setup_gate(tmp_path)

    gate.complete_rehearsal()

    approval = json.loads((gate.work / "rehearsal-approval.json").read_text())
    assert approval == {
        "operation": "decide",
        "id": "setup-approval-123",
        "status": "approved",
        "note": "Release acceptance: fixed local setup rehearsal.",
    }
    commands = [command for command, _ in runner.calls]
    assert [
        "bash", "./conker", "setup", "run", "rehearsal",
        "--finish-approval", "setup-approval-123",
    ] in commands


class ProtectionRunner(SetupRunner):
    def __init__(self, snapshot_store: Path):
        super().__init__()
        self.snapshot_store = snapshot_store

    def run(self, args, *, phase="command", **kwargs):
        if phase == "policy-bound-protection":
            snapshot = self.snapshot_store / "snapshot-20260927T120000Z-test"
            snapshot.mkdir()
            (snapshot / "manifest.json").write_text(
                json.dumps({"layout": "repository"}), encoding="utf-8"
            )
        if phase == "recovery-status":
            self.calls.append((list(args), phase))
            body = {
                "status": "held",
                "recovery_id": "recovery-test",
                "source_layout": "repository",
                "database": {
                    "service": "postgres",
                    "user": "memorygate",
                    "name": "memorygate",
                },
                "blockers": ["operator review required"],
            }
            return type(
                "Result",
                (),
                {"stdout": json.dumps(body), "stderr": "", "returncode": 3},
            )()
        return super().run(args, phase=phase, **kwargs)


def test_release_backup_uses_policy_bound_protection_and_held_restore(tmp_path: Path):
    gate, _ = setup_gate(tmp_path)
    gate.runner = ProtectionRunner(gate.snapshot_store)
    gate.recovery = tmp_path / "recovery"
    gate.recovery_started = False

    gate.backup_and_restore()

    commands = [command for command, _ in gate.runner.calls]
    assert ["bash", "./conker", "setup", "run", "protection"] in commands
    assert not any(command[2:3] == ["backup"] for command in commands)
    evidence = json.loads(
        (gate.evidence.root / "recovery-evidence.json").read_text()
    )
    assert evidence["status"] == "held"
    assert evidence["source_layout"] == "repository"


def test_cleanup_failure_retains_repair_state_and_snapshot(tmp_path: Path):
    gate = AcceptanceGate.__new__(AcceptanceGate)
    gate.recovery = tmp_path / "work" / "recovery"
    gate.recovery.mkdir(parents=True)
    (gate.recovery / ".conker-recovery.json").write_text("{}")
    gate.work = tmp_path / "work"
    gate.snapshot_store = tmp_path / "off-machine" / "acceptance"
    gate.snapshot_store.mkdir(parents=True)
    (gate.snapshot_store / "snapshot-test").mkdir()
    gate.env_file = tmp_path / ".env"
    gate.env_file.write_text("PRIVATE=test\n")
    gate.recovery_started = True
    gate.mutated = False
    gate.owns_env = True
    gate.owns_work = True
    gate.owns_snapshot_store = True
    gate.evidence = Evidence(tmp_path / "evidence")

    class FailingAbort:
        def run(self, *args, **kwargs):
            raise AcceptanceError("injected abort failure")

    gate.runner = FailingAbort()

    with pytest.raises(AcceptanceError, match="retained for repair"):
        gate.teardown()

    assert gate.env_file.is_file()
    assert (gate.recovery / ".conker-recovery.json").is_file()
    assert (gate.snapshot_store / "snapshot-test").is_dir()
