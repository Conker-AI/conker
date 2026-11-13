"""Swapping the Ubuntu layout's sources/ for a staged release, and back, so that a power cut at any
instant leaves a sources/ folder the host helper can start from (it runs from sources/).

Linux's renameat2(RENAME_EXCHANGE) trades two folders in one step. The sources from before an
update are known by their (device, inode), recorded in the update's candidate before the swap
(a rename keeps both), so a rollback finds them wherever a cut left them: in recovery/, in the
staging folder (cut between the exchange and the move), or already back in sources/ (cut during
a rollback), and never mistakes the failed release for them. Where the kernel or file system
cannot exchange, the swap falls back to two renames and says so: a cut between those two leaves
sources/ missing, the gap the exchange closes.
"""

from __future__ import annotations

import ctypes
import errno
import os
import sys
from pathlib import Path

RENAME_EXCHANGE = 2  # linux/fs.h
AT_FDCWD = -100
UNSUPPORTED = {errno.EINVAL, errno.ENOSYS, errno.EOPNOTSUPP}


def identity(path: Path) -> list[int]:
    """What stays the same when a folder is renamed on one file system: [device, inode]."""
    info = os.stat(path, follow_symlinks=False)
    return [info.st_dev, info.st_ino]


def _renameat2():
    if not sys.platform.startswith("linux"):
        return None
    try:
        call = ctypes.CDLL(None, use_errno=True).renameat2  # glibc 2.28 and later
    except (OSError, AttributeError):
        return None
    call.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    call.restype = ctypes.c_int
    return call


def exchange(first: Path, second: Path) -> bool:
    """Trade the two folders in one step. False when this system cannot, and then nothing moved."""
    call = _renameat2()
    if call is None:
        return False
    if call(AT_FDCWD, os.fsencode(first), AT_FDCWD, os.fsencode(second), RENAME_EXCHANGE) == 0:
        return True
    code = ctypes.get_errno()
    if code in UNSUPPORTED:
        return False
    raise OSError(code, os.strerror(code), str(first), None, str(second))


def _warn() -> None:
    print(
        "This system cannot swap folders in one step; the sources move in two renames.",
        file=sys.stderr,
    )


def swap_in(staging: Path, sources: Path, kept: Path) -> None:
    """The staged release takes sources/'s place and the sources from before go to `kept`."""
    if exchange(staging, sources):
        os.replace(staging, kept)  # the staging path now holds the sources from before
        return
    _warn()
    os.replace(sources, kept)
    os.replace(staging, sources)


def put_back(before: list[int], places: list[Path], sources: Path, failed: Path) -> bool:
    """The sources from before (`before` is their identity) back in sources/, the release they
    replace moved to `failed`. False when they are nowhere to be found."""
    if _is(sources, before):
        for place in places:  # a cut after a rollback's exchange left the failed release here
            if place.is_dir() and not place.is_symlink() and not _is(place, before):
                os.replace(place, failed)
                break
        return True
    old = next((place for place in places if _is(place, before)), None)
    if old is None:
        return False
    if not sources.exists():
        os.replace(old, sources)
    elif exchange(old, sources):
        os.replace(old, failed)  # the old path now holds the failed release
    else:
        _warn()
        os.replace(sources, failed)
        os.replace(old, sources)
    return True


def _is(path: Path, before: list[int]) -> bool:
    try:
        return path.is_dir() and not path.is_symlink() and identity(path) == list(before)
    except OSError:
        return False
