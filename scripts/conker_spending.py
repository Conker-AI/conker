"""`conker spending`: today's paid model calls against the daily cap, and setting the cap.

Pi owns the cap (`spendingCap` in owner preferences, docs/spending-cap.md in Pi) and the meter
(`GET /inference/spending`). Changing the cap reads the preferences with their revision and saves
them back with only the cap changed, so a save made meanwhile is refused, never overwritten.
"""

from __future__ import annotations

import math

MAX_CENTS = 100_000
MAX_TOKENS = 100_000_000


def _cap_changes(args) -> dict:
    changes = {}
    if args.on and args.off:
        raise ValueError("Use --on or --off, not both.")
    if args.on or args.off:
        changes["enabled"] = bool(args.on)
    if args.dollars is not None:
        if (
            not math.isfinite(args.dollars)
            or not 0 <= round(args.dollars * 100) <= MAX_CENTS
        ):
            raise ValueError("Use --dollars from 0 to 1000.")
        changes["cents"] = round(args.dollars * 100)
    if args.tokens is not None:
        if not 0 <= args.tokens <= MAX_TOKENS:
            raise ValueError("Use --tokens from 0 to 100000000.")
        changes["tokens"] = args.tokens
    if not changes:
        raise ValueError("Say what to change: --dollars, --tokens, --on or --off.")
    return changes


def spending_operation(args, config, request, pi_call) -> dict:
    """`conker spending` shows the meter; `conker spending cap ...` changes the cap."""
    if args.operation != "cap":
        return pi_call(request, config, "/inference/spending")
    changes = _cap_changes(args)
    current = pi_call(request, config, "/owner/preferences")
    preferences = dict(current["preferences"])
    preferences["spendingCap"] = {**preferences["spendingCap"], **changes}
    saved = pi_call(
        request,
        config,
        "/owner/preferences",
        {"expected_revision": current["revision"], "preferences": preferences},
    )
    return {
        "revision": saved["revision"],
        "spendingCap": saved["preferences"]["spendingCap"],
    }


def add_parser(commands) -> None:
    spending = commands.add_parser(
        "spending",
        help="Today's paid model calls against the daily cap; `spending cap` changes the cap",
    )
    spending.add_argument("operation", nargs="?", choices=["cap"])
    spending.add_argument(
        "--dollars", type=float, help="Money for the day, in US dollars"
    )
    spending.add_argument(
        "--tokens", type=int, help="Tokens for the day, over every paid call"
    )
    spending.add_argument(
        "--on", action="store_true", help="Stop paid calls at the cap"
    )
    spending.add_argument(
        "--off", action="store_true", help="Count paid calls, never stop"
    )
