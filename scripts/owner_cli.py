"""conker memory search, beliefs and upkeep, agent create, team create, inbox, spending, loops and
prompt enhance on an installed stack: the development CLI's own modules (conker_agents,
conker_inbox, conker_spending, conker_loops, conker_prompt), with Pi reached in its container.

As for conker config (scripts/config_cli.py), each call is one `docker compose exec` into the pi
container, where a short relay calls Pi on its own port with the key Pi was started with: the key
never leaves the container. Only the routes these commands use can be reached, each with its own
method, so nothing else in Pi is open from here. None of them writes the owner preferences: changing
the spending cap asks for the owner's password and goes to the gateway's `spending-cap` host
command instead (scripts/cli/conker_spending.py); Pi refuses a cap change on the recovery key.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import config_cli

from scripts.cli.conker_agents import operation as agents_operation
from scripts.cli.conker_agents import register as register_agents
from scripts.cli.conker_context import MEMORY_USES, pi_call
from scripts.cli.conker_inbox import operation as inbox_operation
from scripts.cli.conker_inbox import register as register_inbox
from scripts.cli.conker_loops import operation as loops_operation
from scripts.cli.conker_loops import register as register_loops
from scripts.cli.conker_prompt import operation as prompt_operation
from scripts.cli.conker_prompt import register as register_prompt
from scripts.cli.conker_spending import CapNotSaved, installed_change_cap, spending_operation
from scripts.cli.conker_spending import add_parser as register_spending

COMMANDS = ("memory", "agent", "team", "inbox", "spending", "loops", "prompt")
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
    ("GET", "/open-loops"),
    ("POST", "/open-loops"),
    ("POST", "/prompts/enhance"),
    ("GET", "/prompts/templates"),
    ("POST", "/prompts/templates"),
}
# Routes with an id in the path: (method, whole-path pattern).
ROUTE_PATTERNS = (
    ("POST", re.compile(r"/open-loops/loop_[0-9a-f]{32}/state")),
    (
        "GET",
        re.compile(r"/prompts/templates/(?:tpl_[0-9a-f]{32}|starter-[a-z0-9]+(?:-[a-z0-9]+)*)"),
    ),
    (
        "POST",
        re.compile(
            r"/prompts/templates/(?:tpl_[0-9a-f]{32}|starter-[a-z0-9]+(?:-[a-z0-9]+)*)/delete"
        ),
    ),
    ("GET", MEMORY_USES),
    ("GET", re.compile(r"/collaboration/teams/team_[0-9a-f]{32}")),
    ("POST", re.compile(r"/team-runs/from-team/team_[0-9a-f]{32}")),
    ("GET", re.compile(r"/team-runs/teamrun_[0-9a-f]{32}")),
    ("POST", re.compile(r"/team-runs/teamrun_[0-9a-f]{32}/(?:steps|finish|reconcile)")),
)


def caller(command: list[str]):
    """The modules' request: only ROUTES, through the relay."""

    def call(_config, service: str, path: str, body=None, *, query=None, timeout=30, **_options):
        method = "GET" if body is None else "POST"
        known = (method, path) in ROUTES or any(
            method == verb and pattern.fullmatch(path) for verb, pattern in ROUTE_PATTERNS
        )
        if service != "pi" or not known:
            raise ValueError(f"{method} {path} cannot be reached from this command.")
        return config_cli.request(command, service, path, body, query=query, timeout=timeout)

    return call


def parser() -> argparse.ArgumentParser:
    parsed = argparse.ArgumentParser(prog="conker")
    commands = parsed.add_subparsers(dest="command", required=True)
    register_agents(commands)
    register_inbox(commands)
    register_spending(commands)
    register_loops(commands)
    register_prompt(commands)
    return parsed


def run(args, request, change_cap) -> int:
    if args.command == "inbox":
        return inbox_operation(args, None, request)  # prints the Inbox itself
    if args.command == "spending":
        value = spending_operation(args, None, request, pi_call, change_cap)
    elif args.command == "loops":
        value = loops_operation(args, None, request)
        if value is None:  # the list printed itself
            return 0
    elif args.command == "prompt":
        value = prompt_operation(args, None, request)
        if value is None:  # the rewrite printed itself
            return 0
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
    command = config_cli.compose(installed.root, installed.layout)
    try:
        return run(args, caller(command), installed_change_cap(command))
    except (config_cli.NotConfirmed, CapNotSaved) as error:
        print(str(error), file=sys.stderr)
        return 1
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
