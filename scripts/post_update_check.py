"""conker post-update-check: after an update, the go-live runbook's checks as one command.

Read-only: it runs the launcher's own read commands (`status --strict`, `doctor`), reads Pi's
routes with GET only through the relay in Pi's container (scripts/config_cli.py), reads the
latest release from GitHub without a key, and reads the backup schedule journal. It writes
nothing: no offer file, no receipt, no Inbox item. One line per check, "ok", "FAIL" or "skip";
the exit code is 1 when any check failed. What needs a chat or the dashboard (a new chat answers,
the Trash round trip, Home's Jump back in) is named at the end, not checked.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import config_cli
from update_check import CheckError, check, installed_version, latest_release

MORNING_CHECK_IN = "job_beca06ba345a8b3170a4d8e2473fe00f"  # pi/schedule/agent_jobs.py BUILT_IN
# Run in Pi's container: the newest migration the running Pi knows (pi/conversation/upgrades.py).
LAST_MIGRATION = "from pi.conversation.upgrades import MIGRATIONS; print(MIGRATIONS[-1].id)"
# Pi's reads this command may make, GET only.
ROUTES = {
    "/health",
    "/inference/spending",
    "/memory/objects",
    "/inbox",
    f"/jobs/{MORNING_CHECK_IN}",
}
RETIRED_KINDS = {"memory"}  # memory proposals left the Inbox (pi docs/inbox-kinds.md, merge 2)
NOT_CHECKED = (
    "Not checked here (they need a chat or the dashboard): a new chat answers; a chat moved to "
    "Trash leaves search and Restore brings it back; Home shows Jump back in."
)


@dataclass(frozen=True)
class Result:
    name: str
    outcome: str  # "ok", "fail" or "skip"
    detail: str


@dataclass(frozen=True)
class Probe:
    """Everything the checks read; tests pass fakes."""

    run: Callable[[list[str]], int]  # a launcher command's exit code
    pi: Callable[..., Any]  # GET a Pi route: pi(path, query=None)
    in_pi: Callable[[str], str]  # a Python line's output inside Pi's container
    latest: Callable[[], dict | None]  # the newest published release
    source: Path
    state: Path  # the layout's state folder (state/ or .conker/)


def ok(name: str, detail: str) -> Result:
    return Result(name, "ok", detail)


def fail(name: str, detail: str) -> Result:
    return Result(name, "fail", detail)


def command_check(name: str, argv: list[str]) -> Callable[[Probe], Result]:
    def run(probe: Probe) -> Result:
        code = probe.run(argv)
        shown = "conker " + " ".join(argv)
        return ok(name, shown) if code == 0 else fail(name, f"{shown} exited {code}")

    return run


def update_path(probe: Probe) -> Result:
    result = check(probe.source, fetch=probe.latest)
    running = result["running"]
    if running is None:
        return fail("update path", "this build names no release (CONKER_VERSION is empty)")
    if result["newer"]:
        newest = result["latest"]["version"]
        return fail("update path", f"{running} is installed but {newest} is out")
    return ok("update path", f"{running} is installed and nothing is newer")


def release_page(probe: Probe) -> Result:
    running = installed_version(probe.source)
    latest = probe.latest()
    if running is None or latest is None:
        return fail("release page", "no published release to compare with")
    if latest["version"] != running:
        return Result("release page", "skip", f"the newest release is {latest['version']}")
    return ok("release page", f"v{running} is published")


def migrations(probe: Probe) -> Result:
    health = probe.pi("/health")
    applied = health.get("schema_migration") if isinstance(health, dict) else None
    if not applied:
        return fail("Pi migrations", "Pi's /health names no applied migration")
    known = probe.in_pi(LAST_MIGRATION).strip()
    if applied != known:
        return fail("Pi migrations", f"last applied {applied}, but this Pi's newest is {known}")
    return ok("Pi migrations", f"up to {applied}")


def spending(probe: Probe) -> Result:
    meter = probe.pi("/inference/spending")
    cap, used = meter["cap"], meter["used"]
    limits = f"${cap['cents'] / 100:.2f} and {cap['tokens']:,} tokens a day"
    today = f"today ${used['costUsd']:.2f} and {used['tokens']:,} tokens"
    state = "on" if cap["enabled"] else "OFF"
    reached = " (reached)" if meter["reached"] else ""
    return ok("spending cap", f"{state}: {limits}; {today}{reached}")


def memory_search(probe: Probe) -> Result:
    probe.pi("/memory/objects", query={"search": "test", "limit": 1})
    return ok("memory search", "Pi answers a memory search")


def inbox(probe: Probe) -> tuple[Result, Result]:
    needs = probe.pi("/inbox").get("needsYou", [])
    retired = [item for item in needs if item.get("kind") in RETIRED_KINDS]
    broken = [str(item.get("title", "?")) for item in needs if item.get("kind") == "health"]
    listed = (
        fail("Inbox", f"{len(retired)} memory-proposal card(s) still listed")
        if retired
        else ok("Inbox", f"{len(needs)} item(s) need you; no memory-proposal cards")
    )
    health = (
        fail("self-check", "; ".join(broken)) if broken else ok("self-check", "no health items")
    )
    return listed, health


def morning_check_in(probe: Probe) -> Result:
    definition = probe.pi(f"/jobs/{MORNING_CHECK_IN}")["definition"]
    if definition["enabled"]:
        return ok("Morning check-in", f"{definition['name']}, on")
    return ok("Morning check-in", f"{definition['name']}, turned off by the owner")


def backups(probe: Probe) -> Result:
    path = probe.state / "backup-schedule" / "journal.jsonl"
    try:
        lines = path.read_bytes().splitlines()
    except FileNotFoundError:
        lines = []
    for line in reversed(lines):
        try:
            record = json.loads(line)
        except (UnicodeError, ValueError):
            continue
        if isinstance(record, dict) and record.get("v") == 1 and record.get("kind") == "drill":
            if record.get("outcome") == "passed":
                return ok("backup drill", f"the last drill passed ({record.get('snapshot')})")
            why = record.get("reason") or "no reason given"
            return fail("backup drill", f"the last drill {record.get('outcome')}: {why}")
    return Result(
        "backup drill", "skip", "no drill yet: run conker backup drill once a backup exists"
    )


# Each check and the lines it prints, so a check that cannot read what it needs still fails by name.
CHECKS: tuple[tuple[tuple[str, ...], Callable[[Probe], Result | tuple[Result, ...]]], ...] = (
    (("health",), command_check("health", ["status", "--strict"])),
    (("doctor",), command_check("doctor", ["doctor"])),
    (("update path",), update_path),
    (("Pi migrations",), migrations),
    (("spending cap",), spending),
    (("memory search",), memory_search),
    (("Inbox", "self-check"), inbox),
    (("Morning check-in",), morning_check_in),
    (("backup drill",), backups),
    (("release page",), release_page),
)
UNREADABLE = (config_cli.NotConfirmed, CheckError, OSError, subprocess.SubprocessError, ValueError)
UNEXPECTED = (KeyError, TypeError, AttributeError, IndexError)


def run_checks(probe: Probe) -> list[Result]:
    """Every check, in the runbook's order; a check that cannot read what it needs fails."""
    results: list[Result] = []
    for names, each in CHECKS:
        try:
            found = each(probe)
        except UNREADABLE as error:
            found = tuple(fail(name, str(error) or type(error).__name__) for name in names)
        except UNEXPECTED as error:
            why = f"unexpected answer ({type(error).__name__}: {error})"
            found = tuple(fail(name, why) for name in names)
        results.extend(found if isinstance(found, tuple) else (found,))
    return results


def render(results: list[Result]) -> str:
    mark = {"ok": "ok  ", "fail": "FAIL", "skip": "skip"}
    return "\n".join(f"{mark[item.outcome]}  {item.name}: {item.detail}" for item in results)


def live_probe(root: Path, layout: str, source: Path, launcher: Path) -> Probe:
    command = config_cli.compose(root, layout)

    def run(argv: list[str]) -> int:
        done = subprocess.run([str(launcher), *argv], capture_output=True, timeout=300, check=False)
        return done.returncode

    def pi(path: str, query=None):
        if path not in ROUTES:
            raise ValueError(f"GET {path} cannot be reached from this command.")
        return config_cli.request(command, "pi", path, query=query)

    def in_pi(line: str) -> str:
        done = subprocess.run(
            [*command, "exec", "-T", "pi", "python", "-c", line],
            capture_output=True,
            timeout=120,
            check=False,
        )
        if done.returncode:
            raise config_cli.NotConfirmed("Pi's container did not answer")
        return done.stdout.decode("utf-8", "replace")

    state = root / ("state" if layout == "ubuntu" else ".conker")
    return Probe(run, pi, in_pi, latest_release, source, state)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="conker post-update-check", description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--layout", choices=("ubuntu", "repository"), required=True)
    parser.add_argument("--launcher", type=Path, required=True)
    args = parser.parse_args(argv)
    results = run_checks(live_probe(args.root, args.layout, args.source, args.launcher))
    print(render(results))
    print(NOT_CHECKED)
    return 1 if any(item.outcome == "fail" for item in results) else 0


if __name__ == "__main__":
    sys.exit(main())
