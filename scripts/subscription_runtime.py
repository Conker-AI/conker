"""The Claude plan runtime of the source-built server layout: official Claude Code, in its own box.

`serve` is the container's command (services/subscriptions/Dockerfile). It runs the private bridge
of scripts/workspace_providers.py at 127.0.0.1:8070 inside Pi's network namespace: Pi asks it for
Claude plan answers with the inference key, and ChatGPT answers go on to the host's ChatGPT worker
(scripts/chatgpt_relay.py). The sign-in lives in /state, this service's own folder.

`login`, `status` and `logout` are what `conker providers claude ...` runs in the container. Login
is the CLI's own sign-in in the owner's terminal: Claude Code prints a link, the owner opens it on
any device, signs in, and pastes the code the page shows back into the terminal. No token is
copied into or out of Conker.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

PORT = 8070
SOCKET = "/run/conker-chatgpt/inference.sock"


def paths(environ=os.environ) -> tuple[Path, Path]:
    """This runtime's state folder and the Claude Code executable."""
    return (
        Path(environ.get("SUBSCRIPTIONS_STATE", "/state")),
        Path(environ.get("SUBSCRIPTIONS_CLAUDE", "/opt/claude/bin/claude")),
    )


def configuration(environ=os.environ) -> dict:
    """The bridge's settings, as the Windows workspace keeps them in its configuration file."""
    state, claude = paths(environ)
    return {
        "native_providers": {
            "control_key": environ.get("SUBSCRIPTIONS_CONTROL_KEY", ""),
            "inference_key": environ.get("SUBSCRIPTIONS_INFERENCE_KEY", ""),
            "state": str(state),
            "claude": str(claude),
            "codex": "",
        }
    }


def prepare(environ=os.environ) -> Path:
    """The sign-in folder (CLAUDE_CONFIG_DIR) and HOME, private to this runtime."""
    state, _ = paths(environ)
    home = state / "claude-auth"
    for folder in (home, Path(environ.get("HOME", str(state / "home")))):
        folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    return home


def serve():
    import uvicorn
    from chatgpt_relay import ChatGPTRelay
    from workspace_providers import create_app

    prepare()
    app = create_app(
        configuration(),
        chatgpt_relay=ChatGPTRelay(
            os.environ.get("SUBSCRIPTIONS_CHATGPT_SOCKET", SOCKET)
        ),
    )
    uvicorn.run(app, host="127.0.0.1", port=PORT, proxy_headers=False, access_log=False)


def login():
    from native_claude import environment

    home = prepare()
    _, claude = paths()
    # The same environment the runtime gives Claude Code for answers, plus the terminal it draws in.
    variables = {**environment(home), "TERM": os.environ.get("TERM", "xterm")}
    os.chdir(home)
    os.execve(str(claude), [str(claude), "auth", "login", "--claudeai"], variables)


def account(operation: str) -> dict:
    """status or logout, through the same Claude Code wrapper the bridge uses."""
    from native_claude import Claude

    home = prepare()
    _, claude = paths()
    runtime = Claude(claude, home)
    value = (
        runtime.apply({"operation": "logout"})
        if operation == "logout"
        else runtime.status()
    )
    shown = ("available", "connected", "runtime", "models", "credentialsIncluded")
    return {key: value[key] for key in shown}


def main(argv: list[str]) -> int:
    if len(argv) != 1 or argv[0] not in {"serve", "login", "status", "logout"}:
        print("Use subscription_runtime.py serve|login|status|logout", file=sys.stderr)
        return 2
    if argv[0] == "serve":
        serve()
    elif argv[0] == "login":
        login()
    else:
        print(json.dumps(account(argv[0]), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
