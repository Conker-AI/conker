"""`conker spending`: today's paid model calls against the daily cap, and setting the cap.

Pi owns the cap (`spendingCap` in owner preferences, docs/spending-cap.md in Pi) and the meter
(`GET /inference/spending`). Changing the cap asks for the owner's password, as Settings does
(R-M6, ADR-0010): it is typed here with echo off and sent once, on stdin, to the gateway's
`spending-cap` host command, which checks it, reads the preferences with their revision and
saves them back with only the cap changed, so a save made meanwhile is refused, never overwritten.
Pi refuses a cap change on the recovery key the other commands use. The password never goes in
argv, the environment, a log or an error.
"""

from __future__ import annotations

import getpass
import json
import math
import os
import subprocess
import sys

MAX_CENTS = 100_000
MAX_TOKENS = 100_000_000
COMMAND = ("-m", "gateway", "spending-cap")
PROMPT = "Your Conker password (changing the spending cap asks for it): "
# Service settings the dev gateway command must not inherit from this shell (scripts/local_stack.py).
SERVICE_PREFIXES = ("PI_", "GATEWAY_", "TOOLGATE_", "MEMORYGATE_", "DECISION_", "OLLAMA_")


class CapNotSaved(OSError):
    """The gateway refused the change or did not answer: the owner reads why."""


def _cap_changes(args) -> dict:
    changes = {}
    if args.on and args.off:
        raise ValueError("Use --on or --off, not both.")
    if args.on or args.off:
        changes["enabled"] = bool(args.on)
    if args.dollars is not None:
        if not math.isfinite(args.dollars) or not 0 <= round(args.dollars * 100) <= MAX_CENTS:
            raise ValueError("Use --dollars from 0 to 1000.")
        changes["cents"] = round(args.dollars * 100)
    if args.tokens is not None:
        if not 0 <= args.tokens <= MAX_TOKENS:
            raise ValueError("Use --tokens from 0 to 100000000.")
        changes["tokens"] = args.tokens
    if not changes:
        raise ValueError("Say what to change: --dollars, --tokens, --on or --off.")
    return changes


def run_gateway(argv: list[str], password: str, changes: dict, **options) -> dict:
    """Run the gateway's `spending-cap` command with the password and the change on stdin."""
    try:
        result = subprocess.run(
            argv,
            input=json.dumps({"password": password, "changes": changes}).encode(),
            capture_output=True,
            timeout=150,
            check=False,
            **options,
        )
    except (OSError, subprocess.TimeoutExpired):
        raise CapNotSaved(
            "The gateway did not answer. The cap may already be changed; check it with "
            "conker spending before trying again."
        ) from None
    if result.returncode:
        # The gateway's own words (it never repeats the password or the request), one line.
        said = result.stderr.decode("utf-8", "replace").strip().splitlines()
        line = "".join(c for c in (said[-1] if said else "") if c.isprintable())[:300]
        raise CapNotSaved(line or "The gateway refused the change. Nothing was saved.")
    try:
        saved = json.loads(result.stdout)
        return {"revision": saved["revision"], "spendingCap": saved["spendingCap"]}
    except (ValueError, KeyError, TypeError):
        raise CapNotSaved(
            "The gateway answered with something unreadable. Check the cap with conker spending."
        ) from None


def installed_change_cap(command: list[str]):
    """On an installed stack: the command runs in the gateway container."""

    def change(password: str, changes: dict) -> dict:
        return run_gateway(
            [*command, "exec", "-T", "gateway", "python", *COMMAND], password, changes
        )

    return change


def dev_change_cap(config: dict):
    """On the development stack: the same command from Pi's checkout, with the gateway's settings."""

    def change(password: str, changes: dict) -> dict:
        environment = {
            key: value for key, value in os.environ.items() if not key.startswith(SERVICE_PREFIXES)
        }
        environment.update(config["environments"]["gateway"])
        environment["PYTHONPATH"] = config["repositories"]["pi"]
        return run_gateway(
            [config.get("python", sys.executable), *COMMAND], password, changes, env=environment
        )

    return change


def ask_password() -> str:
    password = getpass.getpass(PROMPT)
    if not password:
        raise ValueError("Changing the spending cap needs your password. Nothing was changed.")
    return password


def spending_operation(args, config, request, pi_call, change_cap) -> dict:
    """`conker spending` shows the meter; `conker spending cap ...` changes the cap.

    `change_cap(password, changes)` is the gateway's `spending-cap` command for this stack.
    """
    if args.operation != "cap":
        return pi_call(request, config, "/inference/spending")
    changes = _cap_changes(args)
    return change_cap(ask_password(), changes)


def add_parser(commands) -> None:
    spending = commands.add_parser(
        "spending",
        help="Today's paid model calls against the daily cap; `spending cap` changes the cap "
        "(asks for your password)",
    )
    spending.add_argument("operation", nargs="?", choices=["cap"])
    spending.add_argument("--dollars", type=float, help="Money for the day, in US dollars")
    spending.add_argument("--tokens", type=int, help="Tokens for the day, over every paid call")
    spending.add_argument("--on", action="store_true", help="Stop paid calls at the cap")
    spending.add_argument("--off", action="store_true", help="Count paid calls, never stop")
