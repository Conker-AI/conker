"""conker config on an installed stack: the registry and checks of conker_config, with Pi reached
inside its own container.

The launcher runs this on the host for both deployment layouts. The registry is read from this
source tree and every value is checked here before anything is sent. Each read or write is one
`docker compose exec` into the pi container, where a short relay calls Pi on its own port with the
recovery key Pi was started with: the key never leaves the container, and it reaches every home a
setting can have, chat settings included, exactly like the development CLI. ToolGate's settings
are reached the same way from the gateway container, with the owner key the gateway already holds.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

from conker_config import REGISTRY, config_operation, register

# Runs inside the pi container. Prints the HTTP status on the first line and the body after it.
RELAY = """
import os, sys, urllib.error, urllib.request
class Stay(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args):
        return None
method, path = sys.argv[1:3]
request = urllib.request.Request(
    "http://127.0.0.1:8050" + path,
    data=sys.stdin.buffer.read() if method == "POST" else None,
    method=method,
    headers={"Content-Type": "application/json", "X-Pi-Key": os.environ["PI_ADMIN_KEY"]},
)
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), Stay())
try:
    with opener.open(request, timeout=30) as response:
        status, body = response.status, response.read()
except urllib.error.HTTPError as error:
    status, body = error.code, error.read()
sys.stdout.buffer.write(str(status).encode() + b"\\n" + body)
"""
# Runs inside the gateway container: ToolGate's owner routes with the owner key the gateway holds.
# Same output as RELAY.
TOOLGATE_RELAY = """
import os, sys, urllib.error, urllib.request
class Stay(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args):
        return None
method, path = sys.argv[1:3]
request = urllib.request.Request(
    os.environ["GATEWAY_TOOLGATE_URL"].rstrip("/") + path,
    data=sys.stdin.buffer.read() if method != "GET" else None,
    method=method,
    headers={"Content-Type": "application/json",
             "X-ToolGate-Owner-Key": os.environ["GATEWAY_TOOLGATE_OWNER_KEY"]},
)
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), Stay())
try:
    with opener.open(request, timeout=30) as response:
        status, body = response.status, response.read()
except urllib.error.HTTPError as error:
    status, body = error.code, error.read()
sys.stdout.buffer.write(str(status).encode() + b"\\n" + body)
"""
# Where each settings service is reached: its container, its relay and the name the owner reads.
RELAYS = {
    "pi": ("pi", RELAY, "Pi"),
    "toolgate-owner": ("gateway", TOOLGATE_RELAY, "ToolGate"),
}


# A setting's home after its chat id is filled in: nothing that could leave Pi's own address.
HOME = re.compile(r"(?:/[A-Za-z0-9_-]+)+")


class NotConfirmed(Exception):
    """The service did not answer, or refused the request."""


def compose(root: Path, layout: str) -> list[str]:
    """The installed Compose project, as the launcher addresses it."""
    if layout == "ubuntu":
        return [
            "docker",
            "compose",
            "--project-directory",
            str(root),
            "-f",
            str(root / "compose.json"),
        ]
    return [
        "docker",
        "compose",
        "--env-file",
        str(root / "versions.env"),
        "--env-file",
        str(root / ".env"),
        "-f",
        str(root / "docker-compose.yml"),
    ]


def reason(content: bytes) -> str:
    """The service's own words for a refusal, when it gave any."""
    try:
        detail = json.loads(content).get("detail")
    except (ValueError, AttributeError):
        return ""
    if isinstance(detail, dict):
        detail = detail.get("message")
    return f": {detail.rstrip('.')}" if isinstance(detail, str) and detail else ""


def request(command: list[str], service: str, path: str, body=None, method=None):
    """conker_config's request: one call through the relay in the service's container. A save
    is a POST unless it names PUT (ToolGate replaces its whole settings document)."""
    if service not in RELAYS:
        raise NotConfirmed(
            f"Settings kept by {service} cannot be reached from this host yet."
        )
    container, relay, name = RELAYS[service]
    if not HOME.fullmatch(path):
        raise ValueError(f"{path!r} is not a settings home in {name}.")
    if method not in (None, "PUT") or (method and body is None):
        raise ValueError("Only a save may name its method, and only PUT.")
    try:
        result = subprocess.run(
            [
                *command,
                "exec",
                "-T",
                container,
                "python",
                "-c",
                relay,
                method or ("GET" if body is None else "POST"),
                path,
            ],
            input=b""
            if body is None
            else json.dumps(body, ensure_ascii=False).encode(),
            capture_output=True,
            timeout=120,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        raise NotConfirmed(
            f"{name} did not answer. Check it with: conker status"
        ) from None
    status, _, content = result.stdout.partition(b"\n")
    if result.returncode or not status.isdigit():
        said = result.stderr.decode("utf-8", "replace").strip().splitlines()
        raise NotConfirmed(
            f"{name} did not answer in its container"
            + (f" ({said[-1][:200]})" if said else "")
            + ". Check it with: conker status"
        )
    if status == b"409":
        raise NotConfirmed(
            "These settings changed while the command ran, so nothing was saved. Run it again."
        )
    if status != b"200":
        raise NotConfirmed(
            f"{name} refused it (HTTP {status.decode()}){reason(content)}."
            + ("" if body is None else " Nothing was saved.")
        )
    try:
        return json.loads(content)
    except ValueError:
        raise NotConfirmed(f"{name} answered with something other than JSON.") from None


def main(argv: list[str] | None = None) -> int:
    host = argparse.ArgumentParser(add_help=False, allow_abbrev=False)
    host.add_argument("--root", type=Path, required=True)
    host.add_argument("--layout", choices=("ubuntu", "repository"), required=True)
    installed, rest = host.parse_known_args(argv)
    parser = argparse.ArgumentParser(prog="conker")
    register(parser.add_subparsers(dest="command", required=True))
    args = parser.parse_args(["config", *rest])
    if not any(REGISTRY.glob("*.json")):
        print(f"The settings registry is missing: {REGISTRY}", file=sys.stderr)
        return 1
    try:
        return config_operation(
            args, compose(installed.root, installed.layout), request
        )
    except NotConfirmed as error:
        print(str(error), file=sys.stderr)
        return 1
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
