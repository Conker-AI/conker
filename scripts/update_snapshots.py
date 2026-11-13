"""Prune the snapshots updates made, with the nightly backup's keep rule (scripts/setup.py
enforce_retention): the newest KEEP by name plus the one just made stay; so does the newest snapshot
in the folder that verifies, whatever made it.

Only snapshots an update's receipt names (state/update/receipts/*.json, `protection.snapshot`) are
ever removed, so a snapshot made by hand or by the nightly timer stays the owner's to delete.
Only real folders directly in the snapshot folder whose name is a `conker backup` name. A prune that
cannot finish says so and never fails the update: the snapshot it just made is safe either way.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import sys
from collections.abc import Callable, Mapping
from pathlib import Path

# A snapshot `conker backup` made (scripts/recovery_backup.py).
SNAPSHOT_NAME = re.compile(r"snapshot-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}")
KEEP_VARIABLE = "CONKER_UPDATE_SNAPSHOTS_KEEP"
# Fewer than the nightly timer's 7: these sit on the server's own disk, about 10 GB each.
DEFAULT_KEEP = 3
KEEP_LIMITS = (2, 64)  # the same bounds as a backup policy's retentionCopies


class PruneError(Exception):
    """Why nothing more was removed; the update goes on."""


def keep_count(environ: Mapping[str, str]) -> int:
    raw = environ.get(KEEP_VARIABLE, "").strip()
    if not raw:
        return DEFAULT_KEEP
    low, high = KEEP_LIMITS
    if not raw.isdigit() or not low <= int(raw) <= high:
        raise PruneError(f"{KEEP_VARIABLE} must be a whole number from {low} to {high}")
    return int(raw)


def update_made(receipts: Path) -> set[str]:
    """The snapshot names update receipts record; an unreadable receipt stops the prune."""
    names: set[str] = set()
    if not receipts.is_dir():
        return names
    for path in receipts.glob("*.json"):
        try:
            receipt = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as error:
            raise PruneError(f"update receipt {path.name} cannot be read: {error}") from error
        protection = receipt.get("protection") if isinstance(receipt, dict) else None
        name = protection.get("snapshot") if isinstance(protection, dict) else None
        if isinstance(name, str) and SNAPSHOT_NAME.fullmatch(name):
            names.add(name)
    return names


def snapshots(folder: Path) -> list[Path]:
    """Snapshot folders directly in `folder`, newest first (names sort by time)."""
    found = [
        path
        for path in folder.iterdir()
        if SNAPSHOT_NAME.fullmatch(path.name) and path.is_dir() and not path.is_symlink()
    ]
    return sorted(found, key=lambda path: path.name, reverse=True)


def newest_verified(
    found: list[Path], current: Path, verify: Callable[[Path], object]
) -> Path | None:
    """The newest that verifies; `current` was verified when `conker backup` made it."""
    for path in found:
        if path == current:
            return path
        try:
            verify(path)
        except Exception:  # an unverifiable snapshot is no way back; keep looking
            continue
        return path
    return None


def prune(
    folder: Path,
    current: Path,
    made: set[str],
    keep: int,
    verify: Callable[[Path], object],
) -> list[str]:
    """Remove update-made snapshots past the keep rule; returns the names removed."""
    found = snapshots(folder)
    retained = set(found[:keep]) | {current}
    removable = [path for path in found if path not in retained and path.name in made]
    if not removable:
        return []
    anchor = newest_verified(found, current, verify)
    removed = []
    for path in removable:
        if path == anchor:
            continue
        if path.resolve().parent != folder.resolve():
            raise PruneError(f"{path.name} is not directly in {folder}")
        shutil.rmtree(path)
        removed.append(path.name)
    return removed


def after_update_snapshot(
    folder: Path,
    current: str,
    receipts: Path,
    verify: Callable[[Path], object],
    *,
    environ: Mapping[str, str] = os.environ,
) -> list[str]:
    """Prune once the update's own snapshot exists; a failure is a note on stderr, never an error.

    `verify` raises for a snapshot that does not verify (`conker verify-backup`); it runs only
    when something would be removed and the snapshot just made is not the newest.
    """
    try:
        keep = keep_count(environ)
        made = update_made(receipts)
        removed = prune(folder, folder / current, made, keep, verify)
    except (OSError, PruneError) as error:
        print(f"Older update snapshots were not pruned: {error}", file=sys.stderr)
        return []
    if removed:
        print(f"Removed older update snapshots: {', '.join(removed)}", file=sys.stderr)
    return removed
