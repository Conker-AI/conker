"""Fetch the pinned Claude Code native binary for the subscription runtime image, checked first.

The npm registry publishes Claude Code's native binary as one package per platform. The SHA-512 of
each pinned tarball is written here (the registry's own `dist.integrity`), so a changed or
substituted download fails the image build instead of reaching the owner's sign-in.

Usage: python fetch_claude.py ARCH DESTINATION   (ARCH is Docker's TARGETARCH: amd64 or arm64)
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import io
import sys
import tarfile
import urllib.request
from pathlib import Path

VERSION = "2.1.310"
PACKAGES = {
    "amd64": (
        "linux-x64",
        "sha512-CuzpJrMBbqaR3+1SiLrBtPV3w/cFvcqBfhe9kNskzZ2Fm6KXa7v0l7tM+Ln6l5QLb79WoU0CcacXnYtsygbe6A==",
    ),
    "arm64": (
        "linux-arm64",
        "sha512-iAukGiGmsInasuW34o4ExD8Gqh3b/CPUp6kjxsWIBT8tFBrVFxtWGfI7wfRy3owWrbuRekBCaHQFMiI2ddWUpA==",
    ),
}
MEMBER = "package/claude"
MAX_DOWNLOAD = 600_000_000


def url(platform: str) -> str:
    name = f"claude-code-{platform}"
    return f"https://registry.npmjs.org/@anthropic-ai/{name}/-/{name}-{VERSION}.tgz"


def verify(data: bytes, integrity: str) -> None:
    algorithm, _, expected = integrity.partition("-")
    if algorithm != "sha512":
        raise ValueError("Only a SHA-512 integrity pin is accepted.")
    actual = base64.b64encode(hashlib.sha512(data).digest()).decode()
    if not hmac.compare_digest(actual, expected):
        raise ValueError("The Claude Code download does not match its pinned SHA-512.")


def extract(data: bytes, destination: Path) -> None:
    """Keep only the binary, as a plain executable file; anything else in the package is ignored."""
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
        member = archive.getmember(MEMBER)
        if not member.isfile():
            raise ValueError("The Claude Code package has no plain binary.")
        source = archive.extractfile(member)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(source.read())
    destination.chmod(0o755)


def main(argv: list[str]) -> int:
    if len(argv) != 2 or argv[0] not in PACKAGES:
        print(f"Use fetch_claude.py {'|'.join(PACKAGES)} DESTINATION", file=sys.stderr)
        return 2
    platform, integrity = PACKAGES[argv[0]]
    with urllib.request.urlopen(url(platform), timeout=300) as response:
        data = response.read(MAX_DOWNLOAD + 1)
    if len(data) > MAX_DOWNLOAD:
        raise ValueError("The Claude Code download is larger than expected.")
    verify(data, integrity)
    extract(data, Path(argv[1]))
    print(f"Claude Code {VERSION} ({platform}) verified")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
