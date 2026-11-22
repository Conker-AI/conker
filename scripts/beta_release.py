"""Cut a beta build from the current main commit: `python scripts/beta_release.py [--dry-run] [--push]`.

A beta is a plain vX.Y.Z tag (the next patch after the newest tag) on a detached commit that changes only
versions.env (CONKER_VERSION, dashboard tree) and CHANGELOG.md (a section built from the merged pull request
titles since the last tag), published as a GitHub pre-release. Servers on the stable channel never see it;
a server set to the beta channel (`update_check.py --set-channel beta`) is offered it like any release and
updates through the same Inbox card, snapshot and rollback. Run by .github/workflows/beta.yml after CI is
green on main. Nothing is pushed to a branch, and nothing happens when no PR merged since the last tag.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TAG = re.compile(r"v([0-9]{1,4})\.([0-9]{1,4})\.([0-9]{1,4})")
MERGE = re.compile(r"Merge pull request #([0-9]+) from \S+")
FIELD, RECORD = "\x1f", "\x1e"


class BetaError(RuntimeError):
    """A beta cannot be cut; nothing was changed."""


def git(*args: str) -> str:
    result = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)
    if result.returncode != 0:
        raise BetaError(f"git {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout.strip()


def newest_tag() -> tuple[str, tuple[int, int, int]]:
    best: tuple[tuple[int, int, int], str] | None = None
    for tag in git("tag", "--list", "v*").split():
        match = TAG.fullmatch(tag)
        if match:
            key = (int(match[1]), int(match[2]), int(match[3]))
            if best is None or key > best[0]:
                best = (key, tag)
    if best is None:
        raise BetaError("no vX.Y.Z tag exists yet")
    return best[1], best[0]


def merged_titles(since_tag: str) -> list[str]:
    """`- title (#N)` for each pull request merged into main since the tag, oldest first."""
    pretty = f"--pretty=%s{FIELD}%b{RECORD}"
    log = git("log", f"{since_tag}..HEAD", "--first-parent", "--merges", "--reverse", pretty)
    lines = []
    for record in filter(None, (r.strip() for r in log.split(RECORD))):
        subject, _, body = record.partition(FIELD)
        match = MERGE.match(subject)
        title = next((line.strip() for line in body.splitlines() if line.strip()), "")
        if match and title:
            lines.append(f"- {title} (#{match[1]})")
    return lines


def with_version(text: str, name: str, value: str) -> str:
    updated, count = re.subn(rf"^{name}=.*$", f"{name}={value}", text, flags=re.M)
    if count != 1:
        raise BetaError(f"{name} must appear exactly once in versions.env")
    return updated


def changelog_with(text: str, version: str, titles: list[str]) -> str:
    marker = "## Unreleased\n"
    if marker not in text:
        raise BetaError("CHANGELOG.md has no ## Unreleased heading")
    section = f"## {version}\n\nBeta build from main. Changes since the last tag:\n\n" + "\n".join(titles) + "\n\n"
    head, tail = text.split(marker, 1)
    return head + marker + "\n" + section + tail.lstrip("\n")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="say what would be cut, change nothing")
    parser.add_argument("--push", action="store_true", help="push the tag and publish the pre-release")
    args = parser.parse_args(argv)
    try:
        tag, (major, minor, patch) = newest_tag()
        if git("rev-list", "-n", "1", tag) == git("rev-parse", "HEAD"):
            print(f"HEAD is already {tag}; nothing to cut.")
            return 0
        titles = merged_titles(tag)
        if not titles:
            print(f"No pull request merged since {tag}; nothing to cut.")
            return 0
        version = f"{major}.{minor}.{patch + 1}"
        if args.dry_run:
            print(f"Would cut v{version} from {len(titles)} merged pull requests:\n" + "\n".join(titles))
            return 0
        env_path, log_path = ROOT / "versions.env", ROOT / "CHANGELOG.md"
        env = with_version(env_path.read_text(encoding="utf-8"), "CONKER_VERSION", version)
        env = with_version(env, "CONKER_DASHBOARD_REVISION", git("rev-parse", "HEAD:dashboard"))
        env_path.write_text(env, encoding="utf-8", newline="\n")
        changelog = changelog_with(log_path.read_text(encoding="utf-8"), version, titles)
        log_path.write_text(changelog, encoding="utf-8", newline="\n")
        notes = subprocess.run(
            [sys.executable, "scripts/release_notes.py", f"v{version}"], cwd=ROOT, capture_output=True, text=True
        )
        if notes.returncode != 0:
            raise BetaError("the release notes check failed: " + notes.stderr.strip())
        identity = ["-c", "user.name=conker-beta", "-c", "user.email=beta@users.noreply.github.com"]
        git(*identity, "commit", "-q", "-a", "-m", f"Beta {version}")
        git("tag", f"v{version}")
        if args.push:
            git("push", "origin", f"v{version}")
            subprocess.run(
                [
                    "gh", "release", "create", f"v{version}", "--verify-tag", "--prerelease",
                    "--title", f"Conker {version} (beta)", "--notes", notes.stdout,
                ],
                cwd=ROOT,
                check=True,
            )
        print(f"Cut v{version} ({'published' if args.push else 'local only'}).")
    except (BetaError, subprocess.CalledProcessError) as error:
        print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
