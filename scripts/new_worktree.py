"""Make a ready-to-build worktree from the latest origin/main: `python scripts/new_worktree.py NAME`.

Creates ../wt/NAME on branch NAME (or --branch) from a fresh origin/main, then installs the dashboard
dependencies with `npm ci --prefer-offline` (npm's cache makes that seconds, not minutes) so lint,
build and checks run at once. Prints the path. Remove it later with `git worktree remove --force PATH`
(never delete a worktree whose node_modules is a junction; this script never makes one).
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NPM = "npm.cmd" if sys.platform == "win32" else "npm"


def git(*args: str, cwd: Path = ROOT) -> str:
    result = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0:
        raise SystemExit(f"git {' '.join(args)} failed:\n{result.stderr.strip()}")
    return result.stdout.strip()


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("name", help="folder name under wt/, for example feat-x")
    parser.add_argument("--branch", help="branch name (default: NAME)")
    parser.add_argument("--no-install", action="store_true", help="skip npm ci")
    args = parser.parse_args(argv)
    if not re.fullmatch(r"[A-Za-z0-9._-]+", args.name):
        raise SystemExit("name may only use letters, digits, dot, dash and underscore")
    # wt/ sits beside the main checkout, even when this runs from inside another worktree.
    common = Path(git("rev-parse", "--path-format=absolute", "--git-common-dir"))
    target = (common.parent.parent / "wt" / args.name).resolve()
    if target.exists():
        raise SystemExit(f"{target} already exists")
    git("fetch", "-q", "origin")
    git("worktree", "add", "-q", str(target), "-b", args.branch or args.name, "origin/main")
    if not args.no_install:
        subprocess.run(
            [NPM, "ci", "--prefer-offline", "--no-audit", "--no-fund"],
            cwd=target / "dashboard",
            check=True,
        )
    print(target)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
