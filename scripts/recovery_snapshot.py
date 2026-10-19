"""Recovery snapshots and locks: fingerprints, inventories, verification and the operation locks."""

from __future__ import annotations

import json
import os
import re
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from recovery_data import RecoveryError, validate_archive
from recovery_layout import (
    COMMON_REQUIRED,
    FORMAT,
    HOLD_FILE,
    PROFILES,
    RECEIPTS_DIR,
    RECOVERY_FORMAT,
    REPOSITORY_CONFIG_REQUIRED,
    REPOSITORY_PROFILE,
    UBUNTU_CONFIG_REQUIRED,
    LayoutProfile,
    canonical_sha256,
    read_json_file,
    sha256,
)


def recovery_fingerprint(state: dict[str, Any]) -> str:
    fields = {
        key: state.get(key)
        for key in (
            "format",
            "recovery_id",
            "project",
            "snapshot",
            "snapshot_manifest_sha256",
            "review_nonce",
            "outbound",
            "applications_started",
            "volumes",
            "containers",
            "invalidated_requests",
            "unfinished_turns",
            "held_memory_jobs",
            "invalidated_browser_sessions",
            "vault_values_verified",
            "memory_provider_key_verified",
        )
    }
    for key in ("source_layout", "database"):
        if key in state:
            fields[key] = state[key]
    return canonical_sha256(fields)


def load_recovery(directory: Path, *, require_complete: bool = True) -> tuple[Path, dict[str, Any]]:
    directory = directory.resolve()
    state_path = directory / HOLD_FILE
    state = read_json_file(state_path, "Recovery hold")
    if state.get("format") != RECOVERY_FORMAT:
        raise RecoveryError("Recovery hold uses an unsupported or legacy workflow format.")
    if require_complete:
        expected = state.get("restore_fingerprint")
        if not isinstance(expected, str) or expected != recovery_fingerprint(state):
            raise RecoveryError("Recovery hold facts are incomplete or changed; keep the hold and investigate.")
    return state_path, state


def receipts_directory(directory: Path) -> Path:
    receipts = directory / RECEIPTS_DIR
    if receipts.exists() and (receipts.is_symlink() or not receipts.is_dir()):
        raise RecoveryError("Recovery receipts path must be a private regular directory.")
    receipts.mkdir(mode=0o700, exist_ok=True)
    return receipts


@contextmanager
def recovery_lock(directory: Path):
    lock = directory / ".conker-recovery.lock"
    try:
        descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError as exc:
        raise RecoveryError(
            "Recovery workflow lock exists; confirm no recovery command is running before removing it."
        ) from exc
    try:
        with os.fdopen(descriptor, "w", encoding="ascii") as stream:
            stream.write(str(os.getpid()))
        yield
    finally:
        lock.unlink(missing_ok=True)


def inventory(directory: Path) -> dict:
    records = {}
    for path in sorted(directory.rglob("*")):
        if path.is_symlink() or not (path.is_file() or path.is_dir()):
            raise RecoveryError(
                "Snapshot contains special files; retain the original and investigate."
            )
        if path.is_file() and path != directory / "manifest.json":
            records[path.relative_to(directory).as_posix()] = {
                "size": path.stat().st_size,
                "sha256": sha256(path),
            }
    return records


def snapshot_profile(manifest: dict[str, Any]) -> LayoutProfile:
    layout = manifest.get("layout", "repository")
    if not isinstance(layout, str) or layout not in PROFILES:
        raise RecoveryError("Snapshot layout is unsupported; use an intact version manifest.")
    return PROFILES[layout]


def snapshot_database(
    manifest: dict[str, Any], profile: LayoutProfile
) -> dict[str, str]:
    database = manifest.get("database")
    if database is None and "layout" not in manifest:
        return {
            "service": "postgres",
            "user": REPOSITORY_PROFILE.database_user,
            "name": REPOSITORY_PROFILE.database_name,
        }
    expected = {
        "service": "postgres",
        "user": profile.database_user,
        "name": profile.database_name,
    }
    if database != expected:
        raise RecoveryError(
            "Snapshot database identity disagrees with its layout; use an intact snapshot."
        )
    return expected


def required_snapshot_files(profile: LayoutProfile, stores: set[str]) -> set[str]:
    config = (
        REPOSITORY_CONFIG_REQUIRED
        if profile.name == "repository"
        else UBUNTU_CONFIG_REQUIRED
    )
    return COMMON_REQUIRED | config | {name + ".tar" for name in stores}


def valid_service_inventory(services: set[str], profile: LayoutProfile) -> bool:
    required_shape = services - set(profile.optional_services)
    return required_shape in (
        set(profile.services),
        set(profile.services) - {"gateway"},
    ) and services <= set(profile.services) | set(profile.optional_services)


def verify_snapshot(directory: Path) -> dict:
    if directory.is_symlink():
        raise RecoveryError(
            "Snapshot directory must not be a symlink; use its original location."
        )
    manifest_path = directory / "manifest.json"
    if not manifest_path.is_file() or manifest_path.is_symlink():
        raise RecoveryError(
            "Incomplete or legacy backup: manifest.json is missing. Create a new verified backup."
        )
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("format") != FORMAT or manifest.get("status") != "complete":
        raise RecoveryError(
            "Unsupported or incomplete snapshot; use a complete conker-snapshot-1 backup."
        )
    profile = snapshot_profile(manifest)
    snapshot_database(manifest, profile)
    files = manifest.get("files", {})
    has_gateway = "gateway" in manifest.get("images", {})
    expected_stores = set(profile.stores)
    if not has_gateway:
        expected_stores.discard("gateway")
    if profile.name == "repository":
        expected_stores.add("memorygate-backups")
        if "layout" in manifest:
            expected_stores.add("memorygate")
    required_files = required_snapshot_files(profile, expected_stores)
    if not required_files <= files.keys() or files != inventory(directory):
        raise RecoveryError(
            "Snapshot files are missing, unexpected, or changed; obtain an intact backup."
        )
    images = manifest.get("images", {})
    if not valid_service_inventory(set(images), profile) or any(
        not isinstance(image, dict)
        or not re.fullmatch(r"sha256:[0-9a-f]{64}", image.get("id", ""))
        for image in images.values()
    ):
        raise RecoveryError(
            "Snapshot image identities are invalid; use an intact version manifest."
        )
    stores = manifest.get("stores", {})
    allowed_stores = set(profile.stores)
    if profile.name == "repository":
        allowed_stores.update({"memorygate", "memorygate-backups"})
    captured_config = json.loads((directory / "config/compose.json").read_text(encoding="utf-8"))
    if captured_config.get("services", {}).keys() != images.keys():
        raise RecoveryError("Captured services and image inventory disagree; obtain an intact snapshot.")
    if not expected_stores <= stores.keys() or any(
        name not in allowed_stores
        and not re.fullmatch(r"extra-[a-z]+-[0-9]+", name)
        for name in stores
    ):
        raise RecoveryError(
            "Invalid storage inventory; use an intact snapshot manifest."
        )
    expected_metadata = {
        name: {"service": name, "destination": destination}
        for name, destination in profile.stores.items()
        if name in expected_stores
    }
    if profile.name == "repository":
        if "memorygate" in stores:
            expected_metadata["memorygate"] = {
                "service": "memorygate",
                "destination": "/data",
            }
        expected_metadata["memorygate-backups"] = {
            "service": "memorygate",
            "destination": "/data/backups",
        }
    if any(stores.get(name) != metadata for name, metadata in expected_metadata.items()):
        raise RecoveryError(
            "Storage service or destination disagrees with the snapshot layout."
        )
    for name, metadata in stores.items():
        if name in expected_metadata:
            continue
        match = re.fullmatch(r"extra-([a-z]+)-[0-9]+", name)
        if (
            not match
            or not isinstance(metadata, dict)
            or set(metadata) != {"service", "destination"}
            or metadata["service"] != match.group(1)
            or metadata["service"] not in images
            or not isinstance(metadata["destination"], str)
            or not metadata["destination"].startswith("/")
        ):
            raise RecoveryError("Additional storage metadata is invalid.")
    if {name + ".tar" for name in stores} != {
        name for name in files if name.endswith(".tar")
    }:
        raise RecoveryError(
            "Storage inventory and archives disagree; obtain an intact snapshot."
        )
    with (directory / "memorygate.dump").open("rb") as dump:
        if dump.read(5) != b"PGDMP":
            raise RecoveryError(
                "PostgreSQL dump is empty or invalid; create a new backup."
            )
    for name in files:
        if name.endswith(".tar"):
            required = {"pi.tar": "pi.db", "toolgate.tar": "toolgate.db", "gateway.tar": "auth.db"}.get(name)
            validate_archive(directory / name, required)
    return manifest


@contextmanager
def operation_lock(root: Path):
    lock = root / ".conker-backup.lock"
    try:
        descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError as exc:
        raise RecoveryError(
            "Backup lock exists. Check that no backup is running before removing .conker-backup.lock."
        ) from exc
    try:
        with os.fdopen(descriptor, "w") as stream:
            stream.write(str(os.getpid()))
        yield
    finally:
        lock.unlink()
