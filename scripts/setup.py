#!/usr/bin/env python3
"""Prepare evidence-backed first-run setup receipts without handling owner credentials."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path, PurePosixPath

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

MACHINE_ID = re.compile(r"[A-Za-z][A-Za-z0-9_.:/-]{0,127}")
POLICY_FIELDS = {
    "schemaVersion",
    "revision",
    "requestId",
    "destinationKind",
    "destination",
    "retentionCopies",
    "policyDigest",
    "recordedAt",
}


class SetupError(ValueError):
    pass


def _datetime(value: object, field: str) -> datetime:
    if not isinstance(value, str):
        raise SetupError(f"{field} must be a timezone-aware timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise SetupError(f"{field} must be a timezone-aware timestamp") from exc
    if parsed.tzinfo is None:
        raise SetupError(f"{field} must be a timezone-aware timestamp")
    return parsed.astimezone(UTC)


def _receipt(
    *, step: str, source: str, subject: str, digest: str, completed: datetime, days: int
) -> dict[str, object]:
    if step != "protection":
        raise SetupError("unsupported setup receipt step")
    if not MACHINE_ID.fullmatch(source) or not MACHINE_ID.fullmatch(subject):
        raise SetupError("receipt source and subject must be machine identities")
    return {
        "receiptId": f"{step}-{digest}",
        "source": source,
        "subject": subject,
        "evidenceDigest": digest,
        "completedAt": completed.isoformat().replace("+00:00", "Z"),
        "expiresAt": (completed + timedelta(days=days))
        .isoformat()
        .replace("+00:00", "Z"),
    }


def _policy_digest(destination: str, retention_copies: int) -> str:
    payload = json.dumps(
        {
            "destination": destination,
            "destinationKind": "mounted_off_machine",
            "retentionCopies": retention_copies,
            "schemaVersion": 1,
        },
        separators=(",", ":"),
        sort_keys=True,
    ).encode()
    return hashlib.sha256(payload).hexdigest()


def load_protection_policy(path: Path) -> dict[str, object]:
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 16_384:
        raise SetupError("protection policy must be a bounded regular file")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise SetupError("protection policy is invalid JSON") from exc
    if not isinstance(value, dict) or set(value) != POLICY_FIELDS:
        raise SetupError("protection policy has an unsupported shape")
    destination = value["destination"]
    retention = value["retentionCopies"]
    revision = value["revision"]
    digest = value["policyDigest"]
    if (
        value["schemaVersion"] != 1
        or value["destinationKind"] != "mounted_off_machine"
        or not isinstance(destination, str)
        or not PurePosixPath(destination).is_absolute()
        or PurePosixPath(destination) == PurePosixPath("/")
        or str(PurePosixPath(destination)) != destination
        or ".." in PurePosixPath(destination).parts
        or not isinstance(retention, int)
        or isinstance(retention, bool)
        or not 2 <= retention <= 64
        or not isinstance(revision, int)
        or isinstance(revision, bool)
        or revision < 1
        or not isinstance(digest, str)
        or digest != _policy_digest(destination, retention)
    ):
        raise SetupError("protection policy has invalid or mismatched values")
    return value


def _protection_subject(policy: dict[str, object]) -> str:
    return (
        f"installation.repository.protection.{policy['revision']}."
        f"{str(policy['policyDigest'])[:16]}"
    )


def require_off_machine_destination(root: Path, destination: Path) -> None:
    if not destination.is_dir():
        raise SetupError(
            "backup destination must already be a mounted off-machine directory"
        )
    if os.stat(root.resolve()).st_dev == os.stat(destination.resolve()).st_dev:
        raise SetupError(
            "backup destination is on the installation device; mount separate storage first"
        )


def enforce_retention(
    destination: Path,
    current: Path,
    keep: int,
    verify: Callable,
) -> None:
    snapshots = sorted(
        (
            path
            for path in destination.iterdir()
            if path.is_dir() and not path.is_symlink() and path.name.startswith("snapshot-")
        ),
        key=lambda path: path.name,
        reverse=True,
    )
    retained = set(snapshots[:keep]) | {current}
    for candidate in snapshots:
        if candidate in retained:
            continue
        verify(candidate)
        if candidate.resolve().parent != destination.resolve():
            raise SetupError("refusing to prune a snapshot outside the backup destination")
        shutil.rmtree(candidate)


def prepare_protection(
    root: Path,
    policy: dict[str, object],
    *,
    now: datetime | None = None,
    backup: Callable | None = None,
    verify: Callable | None = None,
    docker_factory: Callable | None = None,
    off_machine_check: Callable[[Path, Path], None] | None = None,
    prune: Callable[[Path, Path, int, Callable], None] | None = None,
) -> tuple[dict[str, object], Path]:
    if backup is None or verify is None or docker_factory is None:
        from scripts import recovery

        backup = backup or recovery.backup
        verify = verify or recovery.verify_snapshot
        docker_factory = docker_factory or recovery.Docker
    destination = Path(str(policy["destination"]))
    (off_machine_check or require_off_machine_destination)(root, destination)
    try:
        snapshot = backup(root.resolve(), destination, docker_factory())
        manifest = verify(snapshot)
    except Exception as exc:
        if type(exc).__name__ == "RecoveryError":
            raise SetupError(str(exc)) from exc
        raise
    manifest_path = snapshot / "manifest.json"
    raw = manifest_path.read_bytes()
    completed = _datetime(manifest.get("created_at"), "snapshot created_at")
    observed = (now or datetime.now(UTC)).astimezone(UTC)
    if completed > observed or completed + timedelta(days=90) <= observed:
        raise SetupError(
            "verified snapshot completion time is invalid or already stale"
        )
    (prune or enforce_retention)(
        destination, snapshot, int(policy["retentionCopies"]), verify
    )
    digest = hashlib.sha256(raw).hexdigest()
    return (
        _receipt(
            step="protection",
            source="conker.coordinated-backup",
            subject=_protection_subject(policy),
            digest=digest,
            completed=completed,
            days=90,
        ),
        snapshot,
    )


def write_receipt(path: Path, receipt: dict[str, object]) -> None:
    if path.is_symlink() or not path.is_file():
        raise SetupError("receipt output must be a pre-created regular file")
    payload = json.dumps(receipt, separators=(",", ":"), sort_keys=True).encode()
    if len(payload) > 16_384:
        raise SetupError("receipt output exceeds 16 KiB")
    path.write_bytes(payload)
    try:
        path.chmod(0o600)
    except OSError:
        pass


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    protection = commands.add_parser("protection")
    protection.add_argument("--root", required=True, type=Path)
    protection.add_argument("--policy", required=True, type=Path)
    protection.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    try:
        receipt, snapshot = prepare_protection(
            args.root, load_protection_policy(args.policy)
        )
        write_receipt(args.output, receipt)
        print(f"Verified coordinated backup: {snapshot}", file=sys.stderr)
        return 0
    except Exception as exc:  # noqa: BLE001 - sanitize the host CLI boundary
        message = str(exc) if isinstance(exc, SetupError) else type(exc).__name__
        print(f"Setup evidence failed: {message}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
