import hashlib
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from scripts import setup

NOW = datetime(2026, 9, 26, 18, 0, tzinfo=UTC)


def write(path: Path, value) -> bytes:
    raw = json.dumps(value, separators=(",", ":"), sort_keys=True).encode()
    path.write_bytes(raw)
    return raw


def policy(destination: Path, *, revision=3, retention=7):
    host_destination = destination.as_posix()
    if not host_destination.startswith("/"):
        host_destination = "/" + host_destination
    value = {
        "schemaVersion": 1,
        "revision": revision,
        "requestId": "setup-protection-policy",
        "destinationKind": "mounted_off_machine",
        "destination": host_destination,
        "retentionCopies": retention,
        "recordedAt": NOW.isoformat(),
    }
    value["policyDigest"] = setup._policy_digest(value["destination"], retention)
    return value


def test_protection_creates_then_reverifies_snapshot_before_building_receipt(tmp_path):
    destination = tmp_path / "backups"
    destination.mkdir()
    snapshot = destination / "snapshot-20260926T175800Z-current"
    snapshot.mkdir()
    manifest = {
        "format": "conker-snapshot-1",
        "status": "complete",
        "created_at": (NOW - timedelta(minutes=2)).isoformat(),
    }
    raw = write(snapshot / "manifest.json", manifest)
    calls = []
    docker = object()

    def backup(root, destination, engine):
        calls.append(("backup", root, destination, engine))
        return snapshot

    def verify(path):
        calls.append(("verify", path))
        return manifest

    receipt, saved = setup.prepare_protection(
        tmp_path,
        policy(destination),
        now=NOW,
        backup=backup,
        verify=verify,
        docker_factory=lambda: docker,
        off_machine_check=lambda _root, _destination: None,
        prune=lambda *_args: None,
    )

    assert [call[0] for call in calls] == ["backup", "verify"]
    assert calls[0][3] is docker
    assert saved == snapshot
    assert receipt["receiptId"] == "protection-" + hashlib.sha256(raw).hexdigest()
    assert receipt["subject"].startswith("installation.repository.protection.3.")
    assert receipt["expiresAt"] == "2026-12-25T17:58:00Z"


def test_protection_never_builds_a_receipt_when_verification_fails(tmp_path):
    destination = tmp_path / "backups"
    destination.mkdir()

    def backup(root, destination, engine):
        return tmp_path / "snapshot"

    def verify(path):
        raise ValueError("bad snapshot")

    with pytest.raises(ValueError, match="bad snapshot"):
        setup.prepare_protection(
            tmp_path,
            policy(destination),
            now=NOW,
            backup=backup,
            verify=verify,
            docker_factory=object,
            off_machine_check=lambda _root, _destination: None,
        )


def test_policy_is_digest_bound_and_retention_prunes_only_verified_snapshots(tmp_path):
    destination = tmp_path / "backups"
    destination.mkdir()
    policy_file = tmp_path / "policy.json"
    value = policy(destination, retention=2)
    write(policy_file, value)
    assert setup.load_protection_policy(policy_file) == value
    changed = dict(value, retentionCopies=3)
    write(policy_file, changed)
    with pytest.raises(setup.SetupError, match="mismatched"):
        setup.load_protection_policy(policy_file)

    snapshots = []
    for name in (
        "snapshot-20260926T100000Z-old",
        "snapshot-20260926T110000Z-middle",
        "snapshot-20260926T120000Z-current",
    ):
        candidate = destination / name
        candidate.mkdir()
        snapshots.append(candidate)
    verified = []
    setup.enforce_retention(
        destination,
        snapshots[-1],
        2,
        lambda path: verified.append(path),
    )
    assert verified == [snapshots[0]]
    assert not snapshots[0].exists()
    assert snapshots[1].exists() and snapshots[2].exists()


def test_receipt_output_must_be_precreated_regular_file(tmp_path):
    receipt = {"receiptId": "protection-" + "a" * 64}
    output = tmp_path / "receipt.json"
    with pytest.raises(setup.SetupError, match="pre-created"):
        setup.write_receipt(output, receipt)
    output.touch()
    setup.write_receipt(output, receipt)
    assert json.loads(output.read_text()) == receipt
