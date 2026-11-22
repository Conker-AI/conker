from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.release.release_checks import EVIDENCE_SCHEMA, AcceptanceError, Evidence
from scripts.release_acceptance import AcceptanceGate


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
