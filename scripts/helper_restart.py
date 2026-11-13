"""The host helper restarts itself once an update has changed its code and it is idle.

The helper (scripts/provider_control.py) imports its code once, at start. An update swaps the
sources under it (`conker update --to`, or a repository's fast-forward), so without a restart it
would go on running the old code, and restarting it from inside the update would kill the update.
So the helper watches its own code: a fingerprint of its scripts and launcher, taken at start and
again every minute. When it changes, the helper waits until nothing runs (no server action holds
the action lock, no ChatGPT answer is streaming), keeps the lock so no new action starts, stops
serving and exits with RESTART_EXIT. Its systemd unit has Restart=on-failure, so it comes back on
the new code. A source folder that is missing or half there (an update mid-swap) never counts as a
change.
"""

from __future__ import annotations

import hashlib
import time
from collections.abc import Callable
from pathlib import Path

try:  # imported as the scripts package, or run as a script with scripts/ on the path
    from scripts.host_ops_journal import OperationLock
except ModuleNotFoundError:
    from host_ops_journal import OperationLock

RESTART_EXIT = 75  # EX_TEMPFAIL: a failure to systemd, so Restart=on-failure starts the new code
EVERY = 60.0


def fingerprint(source: Path) -> str | None:
    """A digest of the helper's code (scripts/**/*.py and the launcher); None when it is not there."""
    scripts, launcher = source / "scripts", source / "conker"
    try:
        files = sorted(path for path in scripts.rglob("*.py") if "__pycache__" not in path.parts)
        if not files or not launcher.is_file():
            return None
        digest = hashlib.sha256()
        for path in [*files, launcher]:
            digest.update(path.relative_to(source).as_posix().encode() + b"\0")
            digest.update(path.read_bytes() + b"\0")
    except OSError:
        return None
    return digest.hexdigest()


def claim_idle(lock_path: Path | None, streaming: Callable[[], int]) -> OperationLock | bool:
    """When no action runs and nothing streams: the action lock, held until the process exits
    (True on a helper without server actions). False while busy."""
    lock = OperationLock(lock_path) if lock_path is not None else None
    if lock is not None and not lock.acquire():
        return False
    if streaming():
        if lock is not None:
            lock.release()
        return False
    return lock if lock is not None else True


def watch_own_code(
    source: Path,
    idle: Callable[[], object],
    stop: Callable[[], None],
    *,
    every: float = EVERY,
    sleep: Callable[[float], None] = time.sleep,
) -> None:
    """Call `stop` once the code differs from the code at start and `idle` claims quiet."""
    started = fingerprint(source)
    while True:
        sleep(every)
        now = fingerprint(source)
        if started is None:
            started = now  # the helper started mid-swap: the first whole tree counts as its own
            continue
        if now is not None and now != started and idle():
            stop()
            return
