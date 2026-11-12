"""The body of a Conker release page: the CHANGELOG section for the tag being published.

The release workflow (.github/workflows/release.yml) runs this for a pushed tag vX.Y.Z and refuses
to publish unless the tag, CONKER_VERSION in versions.env and a `## X.Y.Z` CHANGELOG section all
name the same version. `conker update --check` shows this text to the owner (scripts/update_check.py).
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TAG = re.compile(r"v(\d{1,4}\.\d{1,4}\.\d{1,4})")
HEADING = re.compile(r"^## (\S+)\s*$")


class ReleaseError(ValueError):
    """The tag, versions.env and CHANGELOG do not agree."""


def pinned_version(versions_env: str) -> str | None:
    for line in versions_env.splitlines():
        name, separator, value = line.partition("=")
        if separator and name.strip() == "CONKER_VERSION":
            return value.strip()
    return None


def section(changelog: str, version: str) -> str:
    """The text under `## version`, up to the next `## ` heading."""
    lines, found, kept = changelog.splitlines(), False, []
    for line in lines:
        heading = HEADING.match(line)
        if heading:
            if found:
                break
            found = heading.group(1) == version
            continue
        if found:
            kept.append(line)
    body = "\n".join(kept).strip()
    if not found:
        raise ReleaseError(f"CHANGELOG.md has no '## {version}' section.")
    if not body:
        raise ReleaseError(f"The '## {version}' section of CHANGELOG.md is empty.")
    return body


def notes(tag: str, root: Path = ROOT) -> str:
    match = TAG.fullmatch(tag)
    if not match:
        raise ReleaseError(f"A release tag is vX.Y.Z, not {tag!r}.")
    version = match.group(1)
    pinned = pinned_version((root / "versions.env").read_text(encoding="utf-8"))
    if pinned != version:
        raise ReleaseError(
            f"versions.env says CONKER_VERSION={pinned or '(unset)'}, the tag says {version}."
        )
    return section((root / "CHANGELOG.md").read_text(encoding="utf-8"), version)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tag", help="the tag being published, e.g. v0.1.0")
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args(argv)
    try:
        print(notes(args.tag, args.root))
    except (ReleaseError, OSError) as error:
        print(f"Not publishing {args.tag}: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
