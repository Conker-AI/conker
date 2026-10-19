"""Recovery review and readiness: operator review, readiness proof, interruption and abort."""

import hashlib
import json
from datetime import datetime, timedelta, timezone

import pytest
import recovery
import recovery_layout
import recovery_restore
from test_recovery import (
    installed as installed,  # noqa: PLC0414 - register the shared pytest fixture
)


def operator_review(state, path, **changes):
    now = datetime.now(timezone.utc)
    review = {
        "format": recovery_layout.REVIEW_FORMAT,
        "recovery_id": state["recovery_id"],
        "review_nonce": state["review_nonce"],
        "snapshot_manifest_sha256": state["snapshot_manifest_sha256"],
        "operator": "owner@example.invalid",
        "reviewed_at": now.isoformat(),
        "expires_at": (now + timedelta(days=1)).isoformat(),
        "attestations": {
            name: {"status": status, "evidence_sha256": hashlib.sha256(name.encode()).hexdigest()}
            for name, status in recovery_layout.REVIEW_CHECKS.items()
        },
    }
    review.update(changes)
    path.write_text(json.dumps(review), encoding="utf-8")
    return review


def reviewed_restore(installed, tmp_path):
    root, engine = installed
    snapshot = recovery.backup(root, None, engine)
    destination = tmp_path / "reviewed-recovery"
    state = recovery_restore.restore(snapshot, destination, engine)
    review_path = tmp_path / "operator-review.json"
    operator_review(state, review_path)
    recovery_restore.review_recovery(destination, review_path)
    return destination, engine


def test_reviewed_restore_becomes_service_ready_without_touching_live_install(installed, tmp_path):
    destination, engine = reviewed_restore(installed, tmp_path)

    state = recovery_restore.prove_service_ready(destination, engine)

    assert state["status"] == "service_ready"
    assert state["applications_started"] is False
    assert (destination / recovery_layout.HOLD_FILE).is_file()
    receipt = json.loads(
        (destination / recovery_layout.RECEIPTS_DIR / "service-ready.json").read_text()
    )
    assert receipt["live_install_modified"] is False
    assert receipt["review_receipt_sha256"] == state["review_receipt_sha256"]
    assert all(
        container["State"]["Running"]
        for name, container in engine.containers.items()
        if name.startswith("source-")
    )


def test_review_refuses_missing_or_negative_prerequisites(installed, tmp_path):
    root, engine = installed
    snapshot = recovery.backup(root, None, engine)
    destination = tmp_path / "recovery"
    state = recovery_restore.restore(snapshot, destination, engine)
    review_path = tmp_path / "review.json"
    review = operator_review(state, review_path)
    del review["attestations"]["external_effects"]
    review_path.write_text(json.dumps(review), encoding="utf-8")

    with pytest.raises(recovery.RecoveryError, match="every required attestation"):
        recovery_restore.review_recovery(destination, review_path)

    held = json.loads((destination / recovery_layout.HOLD_FILE).read_text())
    assert held["status"] == "held"
    assert not (destination / recovery_layout.RECEIPTS_DIR).exists()


def test_readiness_interruption_is_resumable_and_success_is_idempotent(
    installed, tmp_path, monkeypatch
):
    destination, engine = reviewed_restore(installed, tmp_path)
    real_helper = recovery_restore.helper
    interrupted = False

    def interrupt_once(*args, **kwargs):
        nonlocal interrupted
        if not interrupted and args[2] == "verify-vault":
            interrupted = True
            raise KeyboardInterrupt("simulated interruption")
        return real_helper(*args, **kwargs)

    monkeypatch.setattr(recovery_restore, "helper", interrupt_once)
    with pytest.raises(KeyboardInterrupt):
        recovery_restore.prove_service_ready(destination, engine)
    state = json.loads((destination / recovery_layout.HOLD_FILE).read_text())
    assert state["status"] == "readiness_interrupted"
    assert (destination / recovery_layout.HOLD_FILE).is_file()

    first = recovery_restore.prove_service_ready(destination, engine)
    calls = len(engine.calls)
    second = recovery_restore.prove_service_ready(destination, engine)
    assert first["service_ready_receipt_sha256"] == second["service_ready_receipt_sha256"]
    assert len(engine.calls) == calls


def test_stale_and_tampered_review_evidence_are_refused(installed, tmp_path):
    root, engine = installed
    snapshot = recovery.backup(root, None, engine)
    destination = tmp_path / "recovery"
    state = recovery_restore.restore(snapshot, destination, engine)
    review_path = tmp_path / "review.json"
    operator_review(state, review_path, review_nonce="another-restore")
    with pytest.raises(recovery.RecoveryError, match="stale"):
        recovery_restore.review_recovery(destination, review_path)

    operator_review(state, review_path)
    recovery_restore.review_recovery(destination, review_path)
    stored = destination / recovery_layout.RECEIPTS_DIR / "operator-review.json"
    review = json.loads(stored.read_text())
    review["operator"] = "changed@example.invalid"
    stored.write_text(json.dumps(review), encoding="utf-8")
    with pytest.raises(recovery.RecoveryError, match="changed"):
        recovery_restore.prove_service_ready(destination, engine)
    assert json.loads((destination / recovery_layout.HOLD_FILE).read_text())["status"] == "reviewed"


def test_readiness_failure_preserves_hold(installed, tmp_path):
    destination, engine = reviewed_restore(installed, tmp_path)
    state = json.loads((destination / recovery_layout.HOLD_FILE).read_text())
    engine.volume_labels[state["volumes"]["pi"]] = {"conker.recovery": "wrong"}

    with pytest.raises(recovery.RecoveryError, match="ownership label"):
        recovery_restore.prove_service_ready(destination, engine)

    failed = json.loads((destination / recovery_layout.HOLD_FILE).read_text())
    assert failed["status"] == "reviewed"
    assert failed["last_failure"]
    assert (destination / recovery_layout.HOLD_FILE).is_file()
    assert not (destination / recovery_layout.RECEIPTS_DIR / "service-ready.json").exists()


def test_abort_removes_only_labeled_recovery_resources_and_is_idempotent(installed, tmp_path):
    destination, engine = reviewed_restore(installed, tmp_path)
    before = json.loads((destination / recovery_layout.HOLD_FILE).read_text())

    first = recovery_restore.abort_recovery(destination, "operator abandoned candidate", engine)
    calls = len(engine.calls)
    second = recovery_restore.abort_recovery(destination, "operator abandoned candidate", engine)

    assert first["status"] == second["status"] == "aborted"
    assert first["resources_removed"] is True
    assert len(engine.calls) == calls
    assert not any(name in engine.volumes for name in before["volumes"].values())
    assert not any(name in engine.containers for name in before["containers"])
    assert all(name.startswith("source-") for name in engine.containers)
    assert (destination / recovery_layout.HOLD_FILE).is_file()
