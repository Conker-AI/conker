"""conker tool draft on an installed stack: scripts/tool_drafts.py, with Pi reached in its container.

The launcher runs this on the host for both deployment layouts. As for conker config
(scripts/config_cli.py), each call is one `docker compose exec` into the pi container, where a
short relay calls Pi on its own port with the key Pi was started with: the key never leaves the
container. Only the two tool-request routes can be called.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

import tool_drafts
from config_cli import RELAY, compose, reason

ROUTES = re.compile(r"/tool-drafts|/change-requests/creq_[a-f0-9]{32}")


class Refused(Exception):
    """Pi refused the request; its own words, when it gave any."""


def caller(command: list[str]):
    def call(method: str, path: str, body):
        if not ROUTES.fullmatch(path) or (method == "POST") != (body is not None):
            raise ValueError(f"{method} {path} is not a tool-request call.")
        try:
            result = subprocess.run(
                [*command, "exec", "-T", "pi", "python", "-c", RELAY, method, path],
                input=b""
                if body is None
                else json.dumps(body, ensure_ascii=False).encode(),
                capture_output=True,
                timeout=120,
                check=False,
            )
        except subprocess.TimeoutExpired:
            raise OSError("Pi did not answer in its container.") from None
        status, _, content = result.stdout.partition(b"\n")
        if result.returncode or not status.isdigit():
            raise OSError(
                "Pi did not answer in its container. Check it with: conker status"
            )
        code = int(status)
        if 400 <= code < 500:
            raise Refused(f"Pi refused it (HTTP {code}){reason(content)}.")
        if code != 200:
            raise OSError(f"Pi did not confirm it (HTTP {code}).")
        try:
            return json.loads(content)
        except ValueError:
            raise OSError("Pi answered with something other than JSON.") from None

    return call


def main(argv: list[str] | None = None) -> int:
    host = argparse.ArgumentParser(add_help=False, allow_abbrev=False)
    host.add_argument("--root", type=Path, required=True)
    host.add_argument("--layout", choices=("ubuntu", "repository"), required=True)
    installed, rest = host.parse_known_args(argv)
    parser = argparse.ArgumentParser(prog="conker")
    tool_drafts.register(parser.add_subparsers(dest="command", required=True))
    args = parser.parse_args(["tool", *rest])
    try:
        return tool_drafts.run(
            caller(compose(installed.root, installed.layout)),
            args,
            emit=tool_drafts.emit,
        )
    except (OSError, Refused) as error:
        print(str(error), file=sys.stderr)
        return 1
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
