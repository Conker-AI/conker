from __future__ import annotations

import json
from pathlib import Path
from typing import cast

import pytest

from scripts.release.release_checks import AcceptanceError, CommandRunner, Evidence
from scripts.release_acceptance import AcceptanceGate


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
    runner = SetupRunner()
    gate.runner = cast(CommandRunner, runner)
    gate.evidence = Evidence(tmp_path / "evidence")
    gate.snapshot_store = tmp_path / "off-machine" / "snapshots"
    gate.snapshot_store.mkdir(parents=True)
    gate.work = tmp_path / "work"
    gate.work.mkdir()
    gate.require_conversation = True
    return gate, runner


def test_headless_setup_uses_server_candidates_and_exact_boundary_digest(tmp_path: Path):
    gate, runner = setup_gate(tmp_path)

    gate.configure_first_run()

    commands = [command for command, _ in runner.calls]
    assert ["bash", "./conker", "setup", "run", "model", "local-answer"] in commands
    assert [
        "bash",
        "./conker",
        "setup",
        "run",
        "boundaries",
        "--confirm-digest",
        "a" * 64,
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
        "bash",
        "./conker",
        "setup",
        "run",
        "rehearsal",
        "--finish-approval",
        "setup-approval-123",
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
    assert gate.snapshot_store is not None
    runner = ProtectionRunner(gate.snapshot_store)
    gate.runner = cast(CommandRunner, runner)
    gate.recovery = tmp_path / "recovery"
    gate.recovery_started = False

    gate.backup_and_restore()

    commands = [command for command, _ in runner.calls]
    assert ["bash", "./conker", "setup", "run", "protection"] in commands
    assert not any(command[2:3] == ["backup"] for command in commands)
    evidence = json.loads((gate.evidence.root / "recovery-evidence.json").read_text())
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

    gate.runner = cast(CommandRunner, FailingAbort())

    with pytest.raises(AcceptanceError, match="retained for repair"):
        gate.teardown()

    assert gate.env_file.is_file()
    assert (gate.recovery / ".conker-recovery.json").is_file()
    assert (gate.snapshot_store / "snapshot-test").is_dir()
