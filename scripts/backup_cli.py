"""`conker backup schedule on|off|status` and `conker backup drill [SNAPSHOT] | --last`.

`scheduled backup|drill` is what the systemd timers run (scripts/backup_schedule.py); people use
`conker setup run protection` and `conker backup drill` for the same work by hand.
"""

from __future__ import annotations

import argparse
import os
import signal
import sys
import threading
import time
from contextlib import contextmanager
from pathlib import Path

from scripts import backup_drill
from scripts.backup_schedule import (
    NO_DESTINATION,
    Schedule,
    ScheduleError,
    journal,
    last_record,
    scheduled_backup,
    state_directory,
)
from scripts.host_ops import HostOps, HostOpsError
from scripts.host_ops_journal import OperationLock
from scripts.host_ops_reads import SNAPSHOT, backups


def pick_snapshot(host: HostOps, name: str | None) -> Path | str:
    """A path or name the owner gave, or the newest backup in the saved folder.
    Returns the reason as text when there is nothing to drill."""
    if name and not SNAPSHOT.fullmatch(name):
        return Path(name).resolve()
    policy = host.policy()
    if policy is None:
        return NO_DESTINATION
    listing = backups(host.root, policy)
    if not listing["ready"]:
        return "The backup folder is not there. Check that the backup disk is mounted."
    if name:
        return Path(listing["destination"]) / name
    if not listing["snapshots"]:
        return "There is no backup in the backup folder yet."
    return Path(listing["destination"]) / listing["snapshots"][0]["name"]


STOPPED = "Stopped before it finished (signal or shutdown)."
RUNNING = "Started. If no drill is running now, this one was killed before it could clean up."
INTERRUPTED = 130


@contextmanager
def stop_with_cleanup():
    """SIGTERM and SIGHUP raise KeyboardInterrupt, as SIGINT does, so `finally` blocks run.
    Python's default for them kills the process at once. Only the first one interrupts: a second
    signal while the clean-up runs is ignored. The old handlers come back afterwards."""
    if threading.current_thread() is not threading.main_thread():
        yield
        return
    numbers = [getattr(signal, name) for name in ("SIGTERM", "SIGHUP") if hasattr(signal, name)]
    stopped = []

    def stop(signum, frame):
        if not stopped:
            stopped.append(signum)
            raise KeyboardInterrupt

    previous = {number: signal.signal(number, stop) for number in numbers}
    try:
        yield
    finally:
        for number, handler in previous.items():
            signal.signal(number, handler)


def run_drill(host: HostOps, root: Path, layout: str, name: str | None, source: str) -> int:
    log = journal(root, layout)
    try:
        snapshot = pick_snapshot(host, name)
    except HostOpsError as error:
        snapshot = str(error)
    if isinstance(snapshot, str):
        skipped = snapshot == NO_DESTINATION
        receipt = backup_drill.finished(
            backup_drill.new_receipt(Path(name).name if name else None, source),
            "skipped" if skipped else "refused",
            snapshot,
        )
    else:
        print(f"Restoring {snapshot.name} into a throwaway copy. This can take a while.")
        started: list[dict] = []
        clock = time.monotonic()

        def announce(receipt: dict) -> None:
            started.append(receipt)
            log.append({**receipt, "outcome": "running", "reason": RUNNING})

        try:
            receipt = backup_drill.drill(
                root,
                snapshot,
                state_directory(root, layout),
                OperationLock(host.lock_path),
                backup_drill.Docker(),
                source=source,
                checkouts=(host.source,),
                announce=announce,
            )
        except KeyboardInterrupt:
            if not started:
                raise
            receipt = {
                **backup_drill.finished(started[0], "failed", STOPPED),
                "durationSeconds": round(time.monotonic() - clock),
            }
            log.append(receipt)
            print(describe_drill(receipt))
            return INTERRUPTED
    log.append(receipt)
    print(describe_drill(receipt))
    if receipt["outcome"] == "passed":
        return 0
    return 0 if receipt["outcome"] == "skipped" and source == "schedule" else 1


def describe_drill(receipt: dict | None) -> str:
    if receipt is None:
        return "No restore drill has run yet. Run one: conker backup drill"
    lines = [
        f"Restore drill {receipt['outcome']}: {receipt.get('snapshot') or 'no backup'}",
        f"  {receipt['startedAt']}, {receipt['durationSeconds']} s, {receipt['source']}",
    ]
    if receipt["checks"]:
        lines.append("  Passed: " + ", ".join(receipt["checks"]))
    if receipt.get("reason"):
        lines.append("  " + receipt["reason"])
    if receipt.get("leftovers"):
        lines.append(f"  Left behind: {receipt['leftovers']}. Remove them with docker rm/volume rm.")
    return "\n".join(lines)


def describe_status(schedule: Schedule, host: HostOps, root: Path, layout: str) -> str:
    timers = schedule.timers()
    supported = schedule.supported()

    def timer(kind: str, words: str) -> str:
        row = timers[kind]
        if not supported:
            return "off (needs Linux with a systemd user session)"
        if not row["on"]:
            return "off"
        return f"on, {words}" + (f", next {row['next']}" if row["next"] else "")

    try:
        policy = host.policy()
        folder = (
            "no backup destination"
            if policy is None
            else f"{policy['destination']} (keeps {policy['retentionCopies']})"
        )
    except HostOpsError as error:
        folder = f"could not be read: {error}"
    log = journal(root, layout)
    last = last_record(log, "backup")
    lines = [
        "Backups on a schedule",
        f"  Nightly backup:  {timer('backup', 'about 03:30 local time')}",
        f"  Weekly drill:    {timer('drill', 'Sundays about 05:00')}",
        f"  Backup folder:   {folder}",
        "  Last scheduled:  "
        + (f"{last['at']} {last['outcome']}" if last else "none yet")
        + (f" - {last['reason']}" if last and last.get("reason") else ""),
    ]
    drill = last_record(log, "drill")
    lines.append(
        "  Last drill:      "
        + (f"{drill['startedAt']} {drill['outcome']}" if drill else "none yet")
    )
    if supported and schedule.lingering() is False:
        lines.append(
            "  Timers run only while you are signed in. To run them always: "
            "sudo loginctl enable-linger $USER"
        )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="conker backup", description=__doc__)
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--layout", required=True, choices=("ubuntu", "repository"))
    commands = parser.add_subparsers(dest="command", required=True)
    schedule = commands.add_parser("schedule", help="nightly backups and a weekly drill")
    schedule.add_argument("action", choices=("on", "off", "status"))
    schedule.add_argument("--drill", choices=("weekly", "off"))
    drill = commands.add_parser("drill", help="restore a backup into a throwaway copy")
    drill.add_argument("snapshot", nargs="?")
    drill.add_argument("--last", action="store_true", help="show the last drill's receipt")
    scheduled = commands.add_parser("scheduled", help=argparse.SUPPRESS)
    scheduled.add_argument("kind", choices=("backup", "drill"))
    args = parser.parse_args(argv)
    if args.command == "schedule" and args.drill and args.action != "on":
        parser.error("--drill goes with schedule on")
    if args.command == "drill" and args.last and args.snapshot:
        parser.error("use either a snapshot or --last")
    os.umask(0o077)
    root = args.root.resolve()
    try:
        with stop_with_cleanup():
            return dispatch(args, root)
    except KeyboardInterrupt:
        print(STOPPED, file=sys.stderr)
        return INTERRUPTED


def dispatch(args: argparse.Namespace, root: Path) -> int:
    try:
        host = HostOps(root, args.source, args.layout)
        if args.command == "schedule":
            plan = Schedule(root, args.source, args.layout)
            if args.action == "on":
                plan.on(args.drill)
            elif args.action == "off":
                plan.off()
            print(describe_status(plan, host, root, args.layout))
            return 0
        if args.command == "drill" and args.last:
            last = last_record(journal(root, args.layout), "drill")
            print(describe_drill(last))
            return 0 if last else 1
        if args.command == "drill":
            return run_drill(host, root, args.layout, args.snapshot, "cli")
        if args.kind == "backup":
            return scheduled_backup(host, journal(root, args.layout))
        return run_drill(host, root, args.layout, None, "schedule")
    except (ScheduleError, HostOpsError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
