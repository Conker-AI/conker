"""What an Ubuntu-layout update that stopped before its swap leaves behind, and how it is cleared.

An update that fails or is cut off before its sources move changes nothing running, but it may
leave two things. Its staged release (`staging-STAMP`, the sources of every repository plus the
built dashboard) is removed: only the folder that update recorded, only directly in the deployment
root, never through a link. And an update cut off during its own snapshot (phase `protecting`)
leaves what `conker backup` undoes only when it ends: the writers it stopped (a stopped container
stays down after a reboot) and `.conker-backup.lock`. `conker update --recover` starts the stack
again the way the update's own start step does and removes that lock, but only once the lock's
holder is gone (written before this boot, or its process no longer runs). A backup that may still
run is never touched, and neither is a held recovery.
"""

from __future__ import annotations

import contextlib
import re
import shutil
import sys
from collections.abc import Callable
from pathlib import Path

try:  # imported as the scripts package, or run as a script with scripts/ on the path
    from scripts.update_core import UpdateError, _booted_at, _stale
except ModuleNotFoundError:
    from update_core import UpdateError, _booted_at, _stale

BACKUP_LOCK = ".conker-backup.lock"  # scripts/recovery_snapshot.py operation_lock
RECOVERY_HOLD = ".conker-recovery.json"
STAGING = re.compile(r"staging-[0-9]{8}-[0-9]{6}")  # update_ubuntu.UbuntuTransport.staging


def discard_staging(root: Path, staging: object) -> bool:
    """Remove the staged release an update recorded; True when it was removed. A failure is a note,
    never an error: the update's own result is what counts."""
    if not isinstance(staging, str):
        return False
    path = Path(staging)
    if path.is_symlink() or not path.is_dir() or not STAGING.fullmatch(path.name):
        return False
    if path.parent != root or path.resolve().parent != root.resolve():
        return False
    try:
        shutil.rmtree(path)
    except OSError as error:
        print(f"The staged release {path.name} was not removed: {error}", file=sys.stderr)
        return False
    return True


def backup_lock_stale(root: Path) -> bool | None:
    """None: no backup lock. True: its holder is gone. False: a backup may still run."""
    lock = root / BACKUP_LOCK
    try:
        return _stale(lock)  # a pid-only lock: stale if written before this boot or its pid is gone
    except FileNotFoundError:
        return None
    except (ValueError, OSError):
        # Torn or empty (the backup died before writing its pid): stale only from an earlier boot.
        booted = _booted_at()
        try:
            return booted is not None and lock.stat().st_mtime < booted
        except FileNotFoundError:
            return None


def after_cut_snapshot(root: Path, start: Callable[[], None]) -> None:
    """An update cut off during its own snapshot: start the stack again (`start`, which leaves
    running services alone) and remove the backup lock its snapshot left. Refused beside a backup
    that may still run or a held recovery; nothing is changed then."""
    if (root / RECOVERY_HOLD).exists():
        raise UpdateError("a recovery is held, so nothing was changed")
    stale = backup_lock_stale(root)
    if stale is False:
        raise UpdateError("a backup is running, so nothing was changed")
    lock = root / BACKUP_LOCK
    left = lock.read_bytes() if stale else None
    start()
    # No backup can take the lock while it exists (O_EXCL), so it is still the one found stale.
    with contextlib.suppress(FileNotFoundError):  # removed meanwhile by hand: nothing to clear
        if left is not None and lock.read_bytes() == left:
            lock.unlink()
