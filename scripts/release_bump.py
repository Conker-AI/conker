"""Prepare a Conker release in one step: python scripts/release_bump.py X.Y.Z [--pi-sha SHA] [--dry-run].

Does only the mechanical edits that every release PR repeats, then runs the checks that gate them:
  * versions.env: CONKER_VERSION and CONKER_DASHBOARD_REVISION (the dashboard tree must be committed);
  * CHANGELOG.md: the Unreleased entries move under `## X.Y.Z` with a "Pinned in this release" table
    read from versions.env (module versions are NOT changed here: a module is released in its own
    repository first, and its version is put in versions.env by hand or by the pin PR);
  * scripts/workspace-sources.json: the Pi commit, only when --pi-sha is given;
  * docs/status.md is regenerated, then release_manifest.py --check and status_page.py --check run.

It never tags, pushes or publishes. After the PR is merged: git tag vX.Y.Z <merge commit> && git push origin vX.Y.Z.
A Pi (or other gate) release is needed only when that gate's code changed since its last tag.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = re.compile(r"[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}")
MODULES = (
    ("Pi", "PI"),
    ("ToolGate", "TOOLGATE"),
    ("MemoryGate", "MEMORYGATE"),
    ("SystemGate", "SYSTEMGATE"),
    ("Embeddings", "EMBEDDINGS"),
)


class BumpError(RuntimeError):
    """The release cannot be prepared; nothing was written."""


def env_values(text: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in text.splitlines():
        name, sep, value = line.partition("=")
        if sep and not name.startswith("#"):
            values[name.strip()] = value.strip()
    return values


def set_env(text: str, name: str, value: str) -> str:
    updated, count = re.subn(rf"^{name}=.*$", f"{name}={value}", text, flags=re.M)
    if count != 1:
        raise BumpError(f"{name} must appear exactly once in versions.env")
    return updated


def bump_changelog(text: str, version: str, pins: dict[str, str]) -> str:
    if re.search(rf"^## {re.escape(version)}\s*$", text, flags=re.M):
        raise BumpError(f"CHANGELOG.md already has a section for {version}")
    match = re.search(r"^## Unreleased\s*\n(.*?)(?=^## )", text, flags=re.M | re.S)
    if not match or not match.group(1).strip():
        raise BumpError("CHANGELOG.md has nothing under ## Unreleased")
    table = ["### Pinned in this release", "", "| Module | Version |", "|---|---|"]
    table += [f"| {label} | v{pins[key + '_VERSION']} |" for label, key in MODULES]
    body = match.group(1).strip("\n")
    section = f"## Unreleased\n\n## {version}\n\n{body}\n\n" + "\n".join(table) + "\n\n"
    return text[: match.start()] + section + text[match.end() :]


def run(*command: str) -> str:
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
    if result.returncode != 0:
        raise BumpError(f"{' '.join(command)} failed:\n{result.stdout}{result.stderr}")
    return result.stdout.strip()


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("version")
    parser.add_argument("--pi-sha", help="Pi commit to pin in scripts/workspace-sources.json")
    parser.add_argument(
        "--dry-run", action="store_true", help="print what would change, write nothing"
    )
    args = parser.parse_args(argv)
    try:
        if not VERSION.fullmatch(args.version):
            raise BumpError("version must look like 0.6.0")
        if run("git", "status", "--porcelain", "--", "dashboard"):
            raise BumpError("dashboard/ has uncommitted changes; commit them first")
        env_path, log_path = ROOT / "versions.env", ROOT / "CHANGELOG.md"
        env = env_path.read_text(encoding="utf-8")
        pins = env_values(env)
        env = set_env(env, "CONKER_VERSION", args.version)
        env = set_env(env, "CONKER_DASHBOARD_REVISION", run("git", "rev-parse", "HEAD:dashboard"))
        log = bump_changelog(log_path.read_text(encoding="utf-8"), args.version, pins)
        sources = None
        if args.pi_sha:
            if not re.fullmatch(r"[0-9a-f]{40}", args.pi_sha):
                raise BumpError("--pi-sha must be a full 40-character commit")
            path = ROOT / "scripts" / "workspace-sources.json"
            data = json.loads(path.read_text(encoding="utf-8"))
            data["pi"] = args.pi_sha
            sources = (path, json.dumps(data, indent=2) + "\n")
        if args.dry_run:
            print(
                f"Would prepare {args.version}; pins: "
                + ", ".join(
                    f"{k}={v}"
                    for k, v in pins.items()
                    if k.endswith("_VERSION") and k != "CONKER_VERSION"
                )
            )
            return 0
        env_path.write_text(env, encoding="utf-8", newline="\n")
        log_path.write_text(log, encoding="utf-8", newline="\n")
        if sources:
            sources[0].write_text(sources[1], encoding="utf-8", newline="\n")
        run(sys.executable, "scripts/status_page.py")
        run(sys.executable, "scripts/release_manifest.py", "--check")
        run(sys.executable, "scripts/status_page.py", "--check")
    except BumpError as error:
        print(error, file=sys.stderr)
        return 1
    print(
        f"Prepared {args.version}. Commit, open the PR, merge on green, then tag v{args.version} on the merge commit."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
