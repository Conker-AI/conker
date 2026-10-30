"""conker import on an installed stack: scripts/assistant_imports.py, with Pi reached in its container.

The launcher runs this on the host for both deployment layouts. As for conker tool draft
(scripts/tool_draft_cli.py), the call is one `docker compose exec` into the pi container, where a
short relay posts the export's conversations.json to Pi on its own port with the key Pi was
started with: the key never leaves the container. Only the two import routes can be called.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

import assistant_imports
from config_cli import compose, reason

ROUTES = re.compile(r"/imports/(?:chatgpt|claude)/(?:preview|[0-9a-f]{64})")
# Runs inside the pi container: the export arrives on stdin and goes to Pi as the request body.
# Prints the HTTP status on the first line and the body after it. An import of a large export
# can take minutes, so the relay waits up to ten.
RELAY = """
import os, sys, urllib.error, urllib.request
class Stay(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args):
        return None
method, path = sys.argv[1:3]
request = urllib.request.Request(
    "http://127.0.0.1:8050" + path,
    data=sys.stdin.buffer.read(),
    method=method,
    headers={"Content-Type": "application/json", "X-Pi-Key": os.environ["PI_ADMIN_KEY"]},
)
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), Stay())
try:
    with opener.open(request, timeout=600) as response:
        status, body = response.status, response.read()
except urllib.error.HTTPError as error:
    status, body = error.code, error.read()
sys.stdout.buffer.write(str(status).encode() + b"\\n" + body)
"""


class Refused(Exception):
    """Pi refused the export; its own words, when it gave any."""


def caller(command: list[str]):
    def call(method: str, path: str, raw: bytes):
        if method != "POST" or not ROUTES.fullmatch(path):
            raise ValueError(f"{method} {path} is not an import call.")
        try:
            result = subprocess.run(
                [*command, "exec", "-T", "pi", "python", "-c", RELAY, method, path],
                input=raw,
                capture_output=True,
                timeout=660,
                check=False,
            )
        except subprocess.TimeoutExpired:
            raise OSError(
                "Pi did not answer in time. Importing the same file again adds nothing twice."
            ) from None
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
    assistant_imports.register(parser.add_subparsers(dest="command", required=True))
    args = parser.parse_args(["import", *rest])
    try:
        return assistant_imports.run(
            caller(compose(installed.root, installed.layout)),
            args,
            emit=assistant_imports.emit,
        )
    except (OSError, Refused) as error:
        print(str(error), file=sys.stderr)
        return 1
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
