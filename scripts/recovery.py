"""Conker snapshots and explicit, held return-to-service recovery.

Recovery never replaces a live installation. A restored data set remains held
while an operator reviews deletion, effect, credential, and acceptance evidence;
the final receipt proves that exact isolated restore is ready for a separately
authorized promotion.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from recovery_backup import backup
from recovery_data import RecoveryError
from recovery_docker import Docker
from recovery_layout import (
    HOLD_FILE,
    RECEIPTS_DIR,
    RECOVERY_FORMAT,
    read_json_file,
)
from recovery_restore import (
    abort_recovery,
    prove_service_ready,
    restore,
    review_recovery,
)
from recovery_snapshot import (
    load_recovery,
    verify_snapshot,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root", type=Path, default=Path(__file__).resolve().parents[1]
    )
    commands = parser.add_subparsers(dest="command", required=True)
    backup_parser = commands.add_parser("backup")
    backup_parser.add_argument("--destination", type=Path)
    restore_parser = commands.add_parser("restore")
    restore_parser.add_argument("snapshot", type=Path)
    restore_parser.add_argument("--into", required=True, type=Path)
    verify_parser = commands.add_parser("verify-backup")
    verify_parser.add_argument("snapshot", type=Path)
    status_parser = commands.add_parser("recovery-status")
    status_parser.add_argument("directory", type=Path)
    status_actions = status_parser.add_mutually_exclusive_group()
    status_actions.add_argument("--review", type=Path, metavar="REVIEW_JSON")
    status_actions.add_argument("--prove-ready", action="store_true")
    status_actions.add_argument("--abort", metavar="REASON")
    args = parser.parse_args()
    os.umask(0o077)
    try:
        if args.command == "backup":
            path = backup(args.root.resolve(), args.destination, Docker())
            print(
                f"Verified snapshot: {path}\nContains credentials and decryption keys. Copy it to an encrypted, separate destination."
            )
        elif args.command == "verify-backup":
            verify_snapshot(args.snapshot.resolve())
            print(
                "Snapshot files verified. This is an integrity check, not a successful restore drill."
            )
        elif args.command == "restore":
            state = restore(args.snapshot.resolve(), args.into.resolve(), Docker())
            print(
                f"Data restored into isolation; recovery is HELD. No applications started.\nReport: {args.into / HOLD_FILE}"
            )
            for reason in state["blockers"]:
                print(reason)
            return 3
        else:
            if args.review:
                state = review_recovery(args.directory, args.review)
                print("Operator review recorded; recovery remains HELD pending readiness proof.")
                return 3
            if args.prove_ready:
                state = prove_service_ready(args.directory, Docker())
                print(
                    "Recovery is SERVICE-READY. The live installation was not modified; "
                    f"receipt: {args.directory / RECEIPTS_DIR / 'service-ready.json'}"
                )
                return 0
            if args.abort:
                state = abort_recovery(args.directory, args.abort, Docker())
                print("Recovery aborted; isolated resources were removed and the hold report was retained.")
                return 3
            state = read_json_file(args.directory / HOLD_FILE, "Recovery hold")
            if state.get("format") == RECOVERY_FORMAT:
                _, state = load_recovery(args.directory, require_complete=False)
            print(json.dumps(state, indent=2))
            return 0 if state.get("status") == "service_ready" else 3
        return 0
    except Exception as exc:  # noqa: BLE001 - sanitize every failure at the CLI boundary
        message = str(exc) if isinstance(exc, RecoveryError) else type(exc).__name__
        print(
            f"Recovery failed: {message}\nNo recovery was promoted. Retain partial files and inspect the hold report before retrying.",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    sys.exit(main())
