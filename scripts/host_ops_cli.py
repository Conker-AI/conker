"""`conker ops`: server actions and their receipts, from the host's own terminal (ADR-0014).

It reads and writes the helper's journal directly, so it works whether the helper runs or not.
`run` performs one allowlisted operation here, under the same lock and with the same receipt as
the UI's request through the helper.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from pathlib import Path

from scripts.host_ops import OPERATIONS, HostOps, HostOpsError
from scripts.host_ops_journal import OP_ID


def line(row: dict) -> str:
    arguments = " ".join(f"{key}={value}" for key, value in row["arguments"].items())
    text = f"{row['startedAt']}  {row['outcome']:<8} {row['operation']} {arguments}"
    text = text.rstrip() + f"  ({row['source']}, {row['id']})"
    return text + (f"\n    {row['reason']}" if row["reason"] else "")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="conker ops", description="Server actions and their receipts."
    )
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--layout", required=True, choices=("ubuntu", "repository"))
    commands = parser.add_subparsers(dest="command")
    commands.add_parser("list", help="recent server actions, newest first")
    show = commands.add_parser("show", help="one receipt as JSON")
    show.add_argument("id")
    run = commands.add_parser(
        "run", help="run one allowlisted operation, with a receipt"
    )
    run.add_argument("operation", choices=sorted(OPERATIONS))
    run.add_argument("arguments", nargs="*", metavar="NAME=VALUE")
    args = parser.parse_args(argv)
    os.umask(0o077)
    try:
        host = HostOps(args.root, args.source, args.layout)
        if args.command == "show":
            receipt = host.receipt(args.id) if OP_ID.fullmatch(args.id) else None
            if receipt is None:
                print("No server action has that id.", file=sys.stderr)
                return 1
            print(json.dumps(receipt, indent=2))
            return 0
        if args.command == "run":
            pairs = [item.partition("=") for item in args.arguments]
            names = [name for name, _, _ in pairs]
            if any(not sep for _, sep, _ in pairs) or len(set(names)) != len(names):
                parser.error("arguments are NAME=VALUE, each name once")
            body = {
                "operation": args.operation,
                "arguments": {name: value for name, _, value in pairs},
            }
            if OPERATIONS[args.operation].read:
                print(json.dumps(host.read(body), indent=2))
                return 0
            receipt = host.start(
                {"id": f"cli-{uuid.uuid4().hex}", **body}, source="cli", wait=True
            )
            print(json.dumps(receipt, indent=2))
            return 0 if receipt["outcome"] == "done" else 1
        value = host.receipts()
        for row in value["operations"]:
            print(line(row))
        if not value["operations"]:
            print("No server actions yet.")
        if value["damagedRecords"]:
            print(
                f"{value['damagedRecords']} journal lines could not be read and were skipped."
            )
        return 0
    except HostOpsError as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
