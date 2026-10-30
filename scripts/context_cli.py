"""conker context budget on an installed stack: conker_context's budget, with Pi reached in its
container.

A chat has no context settings until its budget is set; this starts them (or changes the budget),
and then conker config can change the rest. As for conker config (scripts/config_cli.py), each
call is one `docker compose exec` into the pi container, where a short relay calls Pi on its own
port with the key Pi was started with: the key never leaves the container. Only one chat's
context settings can be read or written.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import config_cli
import conker_context

CONTEXT = re.compile(r"/context/[A-Za-z0-9_-]{1,128}")


def caller(command: list[str]):
    """conker_context's request: one chat's context settings, through the relay."""

    def call(_config, service: str, path: str, body=None, **_options):
        if service != "pi" or not CONTEXT.fullmatch(path):
            raise ValueError("Use a valid chat id: letters, digits, - and _.")
        return config_cli.request(command, service, path, body)

    return call


def main(argv: list[str] | None = None) -> int:
    host = argparse.ArgumentParser(add_help=False, allow_abbrev=False)
    host.add_argument("--root", type=Path, required=True)
    host.add_argument("--layout", choices=("ubuntu", "repository"), required=True)
    installed, rest = host.parse_known_args(argv)
    parser = argparse.ArgumentParser(prog="conker context")
    conker_context.add_budget(parser.add_subparsers(dest="operation", required=True))
    args = parser.parse_args(rest)
    try:
        value = conker_context.operation(
            args, None, caller(config_cli.compose(installed.root, installed.layout))
        )
    except config_cli.NotConfirmed as error:
        print(str(error), file=sys.stderr)
        return 1
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 2
    print(json.dumps(value, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
