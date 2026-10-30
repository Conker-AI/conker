"""MemoryGate's listener for imported chats, which Pi offers the owner's imported words through.

Pi (docs/imports.md there) offers the messages the owner wrote in ChatGPT or Claude to memory as
outside content, through one MemoryGate listener reached with that listener's own key
(`PI_MEMORYGATE_IMPORT_SOURCE`, `PI_MEMORYGATE_IMPORT_KEY`). MemoryGate has no start-up setting
that creates a listener: one exists only once its admin API (`POST /evidence/sources`) makes it.
So each installer makes the key with its other keys and gives it to Pi, then creates the listener
once MemoryGate answers: install.sh after its health check, `conker setup import-listener` on an
installed stack (the source-built layout runs it after starting), and `workspace.py up`.

MemoryGate keeps a listener's key with the listener and compares it as given; it stores no hash of
it, so MemoryGate and Pi hold the same plaintext. The key travels on standard input, never on a
command line, and on a server the admin key never leaves MemoryGate's container. A listener that
already exists keeps the owner's choices (on or off, its name and description); only its key and
Pi's agent are set again, so the key Pi holds is always the one MemoryGate checks.
"""

from __future__ import annotations

import argparse
import os
import re
import secrets
import subprocess
import sys
from pathlib import Path

SOURCE = "assistant-imports"
AGENT_ID = "conker_companion"
SOURCE_KEY = re.compile(r"[a-z0-9][a-z0-9_-]{1,63}")
AGENT = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}")
MINIMUM = 32

# Runs where MEMORYGATE_ADMIN_KEY is MemoryGate's admin key: inside MemoryGate's container on a
# server, beside it on the workspace. argv: MemoryGate's address, the source key, Pi's agent id;
# the listener key arrives on stdin. Prints one word (created, updated, refused <HTTP status>,
# invalid or unreachable), never a key.
PROGRAM = """
import json, os, sys, urllib.error, urllib.request
url, source, agent = sys.argv[1:4]
key = sys.stdin.read().strip()
if len(key) < 32:
    print("invalid")
    sys.exit(1)
class Stay(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args):
        return None
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), Stay())
headers = {"Content-Type": "application/json",
           "X-MemoryGate-Key": os.environ.get("MEMORYGATE_ADMIN_KEY", "")}
def call(body=None):
    request = urllib.request.Request(
        url.rstrip("/") + "/evidence/sources",
        data=None if body is None else json.dumps(body).encode(),
        method="GET" if body is None else "POST",
        headers=headers,
    )
    with opener.open(request, timeout=30) as response:
        return json.loads(response.read(1048576))
try:
    found = [row for row in call()["results"] if row.get("source_key") == source]
    row = found[0] if found else {
        "source_type": "imported_chat",
        "label": "Imported chats",
        "description": "Messages the owner wrote in ChatGPT or Claude, offered by Pi from an "
            "imported export. Outside content: not said to Conker, not approved as memories.",
        "enabled": True,
        "config": {},
    }
    call({
        "source_key": source,
        "source_type": row["source_type"],
        "label": row["label"],
        "description": row["description"],
        "enabled": row["enabled"],
        "config": {**row["config"], "agent_id": agent},
        "secrets": {"ingest_key": key},
    })
except urllib.error.HTTPError as error:
    print("refused", error.code)
    sys.exit(1)
except OSError:
    print("unreachable")
    sys.exit(1)
except (ValueError, KeyError, TypeError):
    print("invalid")
    sys.exit(1)
print("updated" if found else "created")
"""


def new_key() -> str:
    return secrets.token_urlsafe(36)


def usable(value: object) -> bool:
    return (
        isinstance(value, str)
        and MINIMUM <= len(value) <= 512
        and all(33 <= ord(character) <= 126 for character in value)
    )


def pi_environment(key: str) -> dict[str, str]:
    """What Pi needs to reach the listener: both or neither, beside PI_MEMORYGATE_URL."""
    return {"PI_MEMORYGATE_IMPORT_SOURCE": SOURCE, "PI_MEMORYGATE_IMPORT_KEY": key}


def setup(
    python: list[str],
    url: str,
    source: str,
    key: str,
    agent: str,
    *,
    env: dict[str, str] | None = None,
    run=subprocess.run,
) -> str:
    """Create the listener, or set an existing one's key and agent; "created" or "updated".

    `python` runs PROGRAM: a Python beside MemoryGate, or `docker compose exec` into it. Raises
    OSError in plain words when MemoryGate did not set it up."""
    if not (SOURCE_KEY.fullmatch(source) and AGENT.fullmatch(agent) and usable(key)):
        raise ValueError("The listener's source, agent or key is not valid.")
    try:
        result = run(
            [*python, "-c", PROGRAM, url, source, agent],
            input=key,
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
            env=env,
        )
    except (OSError, subprocess.SubprocessError):
        raise OSError(
            "MemoryGate could not be reached to set up its listener for imported chats."
        ) from None
    word = result.stdout.strip()
    if result.returncode == 0 and word in ("created", "updated"):
        return word
    if word.startswith("refused "):
        raise OSError(f"MemoryGate refused the listener setup (HTTP {word[8:]}).")
    raise OSError("MemoryGate did not set up its listener for imported chats.")


def env_values(path: Path) -> dict[str, str]:
    """NAME=value lines of an env file, the first of each name."""
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        name, sep, value = line.partition("=")
        if sep and not name.startswith("#"):
            values.setdefault(name.strip(), value)
    return values


def installed(root: Path, layout: str) -> tuple[str, str, str]:
    """The source, key and agent this installation gave Pi."""
    if layout == "ubuntu":
        pi = env_values(root / "state/pi.env")
        return (
            pi.get("PI_MEMORYGATE_IMPORT_SOURCE", ""),
            pi.get("PI_MEMORYGATE_IMPORT_KEY", ""),
            pi.get("PI_MEMORYGATE_AGENT_ID", ""),
        )
    # docker-compose.yml gives Pi this source and agent whenever .env holds the key.
    return SOURCE, env_values(root / ".env").get("MEMORYGATE_IMPORT_KEY", ""), AGENT_ID


def ensure(config: dict) -> bool:
    """Give a workspace's Pi the listener's source and key; keeps a usable key. True when changed.

    A configuration without Pi and MemoryGate environments is left alone."""
    envs = config.get("environments")
    if not isinstance(envs, dict) or any(
        not isinstance(envs.get(name), dict) for name in ("pi", "memorygate")
    ):
        return False
    pi = envs["pi"]
    current = pi.get("PI_MEMORYGATE_IMPORT_KEY")
    wanted = pi_environment(current if usable(current) else new_key())
    if all(pi.get(name) == value for name, value in wanted.items()):
        return False
    pi.update(wanted)
    return True


def setup_workspace(config: dict, port: int, *, run=subprocess.run) -> str:
    """The listener on the workspace's MemoryGate, which runs beside this Python."""
    envs = config["environments"]
    pi = envs["pi"]
    return setup(
        [sys.executable],
        f"http://127.0.0.1:{port}",
        pi["PI_MEMORYGATE_IMPORT_SOURCE"],
        pi["PI_MEMORYGATE_IMPORT_KEY"],
        pi.get("PI_MEMORYGATE_AGENT_ID", ""),
        env={
            **os.environ,
            "MEMORYGATE_ADMIN_KEY": envs["memorygate"]["MEMORYGATE_ADMIN_KEY"],
        },
        run=run,
    )


def main(argv: list[str] | None = None, *, run=subprocess.run) -> int:
    parser = argparse.ArgumentParser(
        description="Create MemoryGate's listener for imported chats on an installed stack."
    )
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--layout", choices=("repository", "ubuntu"), required=True)
    args = parser.parse_args(argv)
    try:
        source, key, agent = installed(args.root, args.layout)
    except (OSError, UnicodeError):
        source, key, agent = "", "", ""
    if not (SOURCE_KEY.fullmatch(source) and AGENT.fullmatch(agent) and usable(key)):
        print(
            "This installation has no key for MemoryGate's import listener yet. Run "
            "./install.sh again (on the source-built layout, prepare.py), then retry.",
            file=sys.stderr,
        )
        return 1
    from config_cli import compose

    command = [*compose(args.root, args.layout), "exec", "-T", "memorygate", "python"]
    try:
        outcome = setup(command, "http://127.0.0.1:8020", source, key, agent, run=run)
    except OSError as error:
        print(f"{error} Check MemoryGate with: conker status", file=sys.stderr)
        return 1
    print(
        "MemoryGate's listener for imported chats is "
        + ("set up." if outcome == "created" else "up to date.")
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
