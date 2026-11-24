"""The Ubuntu layout's release facts: archive addresses, the quiet markers, limits, the dashboard
build script, and reading versions.env and the offered module pins.

Split from update_ubuntu.py (a move)."""

from __future__ import annotations

import os
from pathlib import Path

try:  # imported as the scripts package, or run as a script with scripts/ on the path
    from scripts.update_check import COMMIT, MODULES, VERSION
    from scripts.update_core import UpdateError
except ModuleNotFoundError:
    from update_check import COMMIT, MODULES, VERSION
    from update_core import UpdateError

ARCHIVE = "https://codeload.github.com/Conker-AI/{repository}/tar.gz/refs/tags/v{version}"
COMMIT_ARCHIVE = "https://codeload.github.com/Conker-AI/{repository}/tar.gz/{commit}"
# Markers in the deployment that no update or rollback may run beside.
QUIET = {
    ".conker-recovery.json": "a recovery is held",
    ".conker-backup.lock": "a backup is running",
}
MIN_FREE = 20 * 1024**3  # a snapshot (about 10 GB today) plus the build
BUILD_SECONDS = 3600
START_SECONDS = 900
# Runs in the pinned Node image; the built files belong to the owner, not to root.
BUILD_SCRIPT = (
    "npm ci --no-audit --no-fund >/dev/null && npm run build >/dev/null"
    ' && chown -R "$HOST_UID:$HOST_GID" dist'
)


def _owner() -> tuple[int, int]:
    """This user's ids, for the files the dashboard build writes (POSIX; 1000 elsewhere)."""
    getuid, getgid = getattr(os, "getuid", None), getattr(os, "getgid", None)
    return (getuid(), getgid()) if getuid and getgid else (1000, 1000)


def versions(path: Path) -> dict[str, str]:
    values = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        name, separator, value = line.partition("=")
        if separator and not name.lstrip().startswith("#"):
            values[name.strip()] = value.strip()
    return values


def module_commits(text: str) -> dict[str, tuple[str, str]]:
    """`pi=X.Y.Z@SHA,toolgate=...` (every module once) as folder -> (version, commit)."""
    found: dict[str, tuple[str, str]] = {}
    for part in text.split(","):
        folder, _, pin = part.partition("=")
        version, _, commit = pin.partition("@")
        if folder not in MODULES or folder in found:
            raise UpdateError(f"name each module once: {', '.join(MODULES)}")
        if not VERSION.fullmatch(version) or not COMMIT.fullmatch(commit):
            raise UpdateError(f"name {folder} as {folder}=X.Y.Z@<40 hex digits>")
        found[folder] = (version, commit)
    if set(found) != set(MODULES):
        raise UpdateError(f"name each module once: {', '.join(MODULES)}")
    return found
