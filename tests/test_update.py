"""Transaction tests for the fail-closed repository updater."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

from scripts.update import HostTransport, UpdateCoordinator, UpdateError, UpdateStore

REV_A = "a" * 40
REV_B = "b" * 40


class FakeTransport:
    def __init__(
        self, *, candidate_revision: str = REV_B, fail: str | set[str] | None = None
    ):
        self.candidate_revision = candidate_revision
        self.fail = fail
        self.calls: list[str] = []
        self.prior = {
            "revision": REV_A,
            "branch": "main",
            "manifest": {"manifest_version": 1},
            "services": {
                "gateway": {"exists": True, "running": True, "image_id": "sha256:old"}
            },
        }

    def _call(self, name: str) -> None:
        self.calls.append(name)
        failures = {self.fail} if isinstance(self.fail, str) else self.fail or set()
        if name in failures:
            raise RuntimeError(name)

    def preflight(self) -> None:
        self._call("preflight")

    def snapshot(self):
        self._call("snapshot")
        return self.prior

    def prepare_candidate(self, prior):
        self._call("prepare_candidate")
        return {
            "revision": self.candidate_revision,
            "manifest": {"manifest_version": 1},
            "service_images": {"gateway": "ghcr.io/conker/gateway:1.0.0"},
        }

    def pull_exact_images(self, candidate):
        self._call("pull_exact_images")
        return {"gateway": "ghcr.io/conker/gateway@sha256:" + "c" * 64}

    def apply_code(self, candidate):
        self._call("apply_code")

    def apply_services(self, candidate):
        self._call("apply_services")

    def verify_candidate(self, candidate):
        self._call("verify_candidate")

    def rollback(self, prior, candidate):
        self._call("rollback")

    def verify_rollback(self, prior):
        self._call("verify_rollback")


def store(tmp_path: Path) -> UpdateStore:
    return UpdateStore(tmp_path / "update-state")


def receipt_payload(result: dict[str, str]) -> dict[str, object]:
    return json.loads(Path(result["receipt"]).read_text(encoding="utf-8"))


def test_success_records_resolved_apply_and_receipt(tmp_path):
    transport = FakeTransport()
    updater = UpdateCoordinator(transport, store(tmp_path))

    result = updater.run()

    assert result["status"] == "applied"
    receipt = receipt_payload(result)
    assert receipt["status"] == "applied"
    assert receipt["prior"]["revision"] == REV_A
    assert receipt["prior"]["services"]["gateway"]["image_id"] == "sha256:old"
    assert receipt["candidate"]["resolved_images"]["gateway"].startswith(
        "ghcr.io/conker/gateway@sha256:"
    )
    assert transport.calls == [
        "preflight",
        "snapshot",
        "prepare_candidate",
        "pull_exact_images",
        "apply_code",
        "apply_services",
        "verify_candidate",
    ]
    assert not updater.store.active_path.exists()


def test_preflight_failure_never_records_or_applies(tmp_path):
    transport = FakeTransport(fail="preflight")
    updater = UpdateCoordinator(transport, store(tmp_path))

    with pytest.raises(RuntimeError, match="preflight"):
        updater.run()

    assert transport.calls == ["preflight"]
    assert not updater.store.active_path.exists()


@pytest.mark.parametrize("failure", ["apply_code", "apply_services", "verify_candidate"])
def test_apply_or_acceptance_failure_rolls_back_exact_prior_state(tmp_path, failure):
    transport = FakeTransport(fail=failure)
    updater = UpdateCoordinator(transport, store(tmp_path))

    with pytest.raises(UpdateError, match="prior release was restored"):
        updater.run()

    assert transport.calls[-2:] == ["rollback", "verify_rollback"]
    receipts = list((updater.store.directory / "receipts").glob("*.json"))
    assert json.loads(receipts[0].read_text(encoding="utf-8"))["status"] == "rolled_back"
    assert not updater.store.active_path.exists()


def test_rollback_failure_leaves_durable_redacted_hold(tmp_path):
    transport = FakeTransport(fail={"apply_services", "rollback"})
    updater = UpdateCoordinator(transport, store(tmp_path))

    with pytest.raises(UpdateError, match="Update held"):
        updater.run()

    hold = json.loads(updater.store.hold_path.read_text(encoding="utf-8"))
    assert hold["status"] == "rollback_unproven"
    assert hold["prior_revision"] == REV_A
    assert "service_images" not in hold
    assert updater.store.active_path.exists()


def test_interrupted_apply_is_rolled_back_before_a_new_attempt(tmp_path):
    update_store = store(tmp_path)
    update_store.save_active(
        {
            "schema": 1,
            "transaction_id": "interrupted",
            "started_at": 1,
            "phase": "applying",
            "prior": FakeTransport().prior,
            "candidate": {"revision": REV_B},
        }
    )
    transport = FakeTransport(candidate_revision=REV_A)

    result = UpdateCoordinator(transport, update_store).run()

    assert transport.calls[:2] == ["rollback", "verify_rollback"]
    assert result["status"] == "no_change"
    old_receipt = json.loads(
        (update_store.directory / "receipts/interrupted.json").read_text(encoding="utf-8")
    )
    assert old_receipt["status"] == "rolled_back"


def test_idempotent_rerun_does_not_pull_or_restart(tmp_path):
    transport = FakeTransport(candidate_revision=REV_A)
    updater = UpdateCoordinator(transport, store(tmp_path))

    first = updater.run()
    second = updater.run()

    assert first["status"] == second["status"] == "no_change"
    assert "pull_exact_images" not in transport.calls
    assert "apply_code" not in transport.calls
    assert "apply_services" not in transport.calls


def test_candidate_validation_failure_writes_receipt_without_rollback(tmp_path):
    transport = FakeTransport(fail="prepare_candidate")
    updater = UpdateCoordinator(transport, store(tmp_path))

    with pytest.raises(UpdateError, match="stopped before apply"):
        updater.run()

    assert "rollback" not in transport.calls
    receipts = list((updater.store.directory / "receipts").glob("*.json"))
    payload = json.loads(receipts[0].read_text(encoding="utf-8"))
    assert payload["status"] == "failed_before_apply"
    assert "RuntimeError" in payload["reason"]


@pytest.mark.parametrize(
    ("blocker", "message"),
    [
        (".conker-recovery.json", "recovery hold"),
        (".conker-backup.lock", "backup lock"),
    ],
)
def test_host_preflight_refuses_recovery_and_backup_state(tmp_path, blocker, message):
    transport = object.__new__(HostTransport)
    transport.root = tmp_path
    transport.env_file = tmp_path / ".env"
    transport.env_file.write_text("not-loaded=secret\n", encoding="utf-8")
    (tmp_path / blocker).write_text("{}", encoding="utf-8")
    transport._git = lambda *args: ""

    with pytest.raises(UpdateError, match=message):
        transport.preflight()


def test_host_preflight_refuses_dirty_repository(tmp_path):
    transport = object.__new__(HostTransport)
    transport.root = tmp_path
    transport.env_file = tmp_path / ".env"
    transport.env_file.write_text("not-loaded=secret\n", encoding="utf-8")
    transport._git = lambda *args: " M versions.env"

    with pytest.raises(UpdateError, match="repository is dirty"):
        transport.preflight()


def test_host_git_rollback_restores_recorded_revision_without_reset_or_checkout(tmp_path):
    def git(*args: str) -> str:
        result = subprocess.run(
            ["git", *args], cwd=tmp_path, capture_output=True, text=True, check=True
        )
        return result.stdout.strip()

    git("init", "-b", "main")
    git("config", "user.email", "update-test@example.invalid")
    git("config", "user.name", "Update Test")
    tracked = tmp_path / "release.txt"
    tracked.write_text("prior\n", encoding="utf-8")
    git("add", "release.txt")
    git("commit", "-m", "prior")
    prior_revision = git("rev-parse", "HEAD")
    tracked.write_text("candidate\n", encoding="utf-8")
    git("commit", "-am", "candidate")
    candidate_revision = git("rev-parse", "HEAD")

    transport = object.__new__(HostTransport)
    transport.root = tmp_path
    transport._restore_code(
        {"revision": prior_revision, "branch": "main"},
        {"revision": candidate_revision},
    )

    assert git("rev-parse", "HEAD") == prior_revision
    assert git("status", "--porcelain") == ""
    assert tracked.read_text(encoding="utf-8") == "prior\n"
