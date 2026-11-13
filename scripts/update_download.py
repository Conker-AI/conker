"""One GitHub release archive into a folder, bounded: a hostile archive can neither be larger than
expected nor unpack to more than one release may hold, and its links stay inside the folder
(scripts/update_ubuntu.py stages every repository of a release this way)."""

from __future__ import annotations

import tarfile
import tempfile
from pathlib import Path
from urllib.request import Request, build_opener

try:  # imported as the scripts package, or run as a script with scripts/ on the path
    from scripts.update_check import _Stay
    from scripts.update_core import UpdateError
except ModuleNotFoundError:
    from update_check import _Stay
    from update_core import UpdateError

MAX_ARCHIVE = 300 * 1024 * 1024
# What one unpacked release may hold: a hostile archive cannot fill the disk before the update starts.
MAX_UNPACKED = 3 * 1024 * 1024 * 1024
MAX_MEMBERS = 200_000


def download(url: str, target: Path) -> None:
    """One GitHub tag archive into `target`, without its top folder. Links stay inside it."""
    with tempfile.TemporaryFile() as buffer:
        request = Request(url, headers={"User-Agent": "conker-update"})
        with build_opener(_Stay()).open(request, timeout=120) as response:
            size = 0
            while chunk := response.read(1 << 20):
                size += len(chunk)
                if size > MAX_ARCHIVE:
                    raise UpdateError("a release archive was larger than expected")
                buffer.write(chunk)
        buffer.seek(0)
        with tarfile.open(fileobj=buffer, mode="r:gz") as bundle:
            members, unpacked = [], 0
            for count, member in enumerate(bundle, start=1):
                unpacked += max(member.size, 0)
                if count > MAX_MEMBERS or unpacked > MAX_UNPACKED:
                    raise UpdateError("a release archive unpacks to more than expected")
                _, _, inner = member.name.partition("/")
                if not inner:
                    continue
                member.name = inner
                if member.islnk():
                    member.linkname = member.linkname.partition("/")[2]
                members.append(member)
            target.mkdir(parents=True)
            bundle.extractall(target, members=members, filter="data")
