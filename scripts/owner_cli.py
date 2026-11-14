"""conker memory search, beliefs and upkeep, agent create, team create, inbox and spending on an
installed stack: the development CLI's own modules (conker_agents, conker_inbox, conker_spending),
with Pi reached in its container.

As for conker config (scripts/config_cli.py), each call is one `docker compose exec` into the pi
container, where a short relay calls Pi on its own port with the key Pi was started with: the key
never leaves the container. Only the routes these commands use can be reached, each with its own
method, so nothing else in Pi is open from here.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import config_cli
from conker_agents import operation as agents_operation
from conker_agents import register as register_agents
from conker_context import pi_call
from conker_inbox import operation as inbox_operation
from conker_inbox import register as register_inbox
from conker_spending import add_parser as register_spending
from conker_spending import spending_operation

COMMANDS = ("memory", "agent", "team", "inbox", "spending")
# What these commands may ask of Pi: (method, path). A body makes it a POST.
ROUTES = {
    ("GET", "/memory/objects"),
    ("GET", "/memory/beliefs"),
    ("GET", "/memory/upkeep"),
    ("GET", "/agents"),
    ("POST", "/agents"),
    ("POST", "/collaboration/teams"),
    ("GET", "/inbox"),
    ("GET", "/inference/spending"),
    ("GET", "/owner/preferences"),
    ("POST", "/owner/preferences"),
}


def caller(command: list[str]):
    """The modules' request: only ROUTES, through the relay."""

    def call(_config, service: str, path: str, body=None, *, query=None, **_options):
        method = "GET" if body is None else "POST"
        if service != "pi" or (method, path) not in ROUTES:
            raise ValueError(f"{method} {path} cannot be reached from this command.")
        return config_cli.request(command, service, path, body, query=query)

    return call


def parser() -> argparse.ArgumentParser:
    parsed = argparse.ArgumentParser(prog="conker")
    commands = parsed.add_subparsers(dest="command", required=True)
    register_agents(commands)
    register_inbox(commands)
    register_spending(commands)
    return parsed


def run(args, request) -> int:
    if args.command == "inbox":
        return inbox_operation(args, None, request)  # prints the Inbox itself
    if args.command == "spending":
        value = spending_operation(args, None, request, pi_call)
    else:
        value = agents_operation(args, None, request)
        if value is None:  # memory beliefs/upkeep printed it itself
            return 0
    print(json.dumps(value, indent=2, ensure_ascii=False))
    return 0


def main(argv: list[str] | None = None) -> int:
    host = argparse.ArgumentParser(add_help=False, allow_abbrev=False)
    host.add_argument("--root", type=Path, required=True)
    host.add_argument("--layout", choices=("ubuntu", "repository"), required=True)
    installed, rest = host.parse_known_args(argv)
    args = parser().parse_args(rest)
    try:
        return run(args, caller(config_cli.compose(installed.root, installed.layout)))
    except config_cli.NotConfirmed as error:
        print(str(error), file=sys.stderr)
        return 1
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
