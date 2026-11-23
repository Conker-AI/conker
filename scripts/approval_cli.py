"""conker apply approvals FILE: one decision on a ToolGate request, from the server's shell.

The gateway's `apply approvals` asks for exactly what the Inbox asks for (Pi's
`gateway/approval_levels.py`): a yes to a serious request (level 3: delete, pay) or to one whose
level it cannot read needs the owner's password; any other yes, a no and a dismissal do not. The
file goes to the gateway as it is. When the gateway answers that this yes needs the password
(exit 3: nothing was decided), it is asked here with echo off and the same decision is sent once
more with it, on stdin. The password never comes from the file and never goes in argv, the
environment, a log or an error.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from config_cli import compose
from owner_password import ask

COMMAND = ("python", "-m", "gateway", "apply", "approvals")
PASSWORD_REQUIRED = 3  # the gateway's exit when a yes needs the password (gateway/mutation.py)
PROMPT = "Your Conker password (this yes asks for it, as the Inbox does): "


def send(argv: list[str], content: bytes) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(argv, input=content, capture_output=True, check=False)
    except OSError:
        raise OSError(
            "Could not start the gateway command. Nothing was decided. Check it with: conker status"
        ) from None


def decide(argv: list[str], content: bytes) -> int:
    try:
        decision = json.loads(content)
    except (UnicodeDecodeError, ValueError):
        decision = None  # the gateway says what is wrong with it
    if isinstance(decision, dict) and "password" in decision:
        print(
            "Leave the password out of the file; conker asks for it. Nothing was sent.",
            file=sys.stderr,
        )
        return 2
    result = send(argv, content)
    if result.returncode == PASSWORD_REQUIRED and isinstance(decision, dict):
        # Nothing was decided: ask once, send the same decision once more, with the password.
        password = ask(PROMPT, "This yes needs your password. Nothing was decided.")
        result = send(argv, json.dumps({**decision, "password": password}).encode())
    sys.stdout.buffer.write(result.stdout)
    sys.stderr.buffer.write(result.stderr)
    return result.returncode


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="conker apply approvals")
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--layout", choices=("ubuntu", "repository"), required=True)
    parser.add_argument("file", type=Path)
    args = parser.parse_args(argv)
    try:
        content = args.file.read_bytes()
        return decide(
            [*compose(args.root, args.layout), "exec", "-T", "gateway", *COMMAND], content
        )
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
