"""Conker CLI: the same chats, model roles and native sign-ins as the UI."""

import argparse
import json
import os
import subprocess
import sys
import uuid
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

from workspace import read_config


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


def request(config, service, path, body=None):
    if not path.startswith("/") or path.startswith("//") or "?" in path or "#" in path:
        raise ValueError("Use a service-relative path without query or fragment.")
    if service == "providers":
        origin, headers = (
            "http://127.0.0.1:18570",
            {"Authorization": "Bearer " + config["native_providers"]["control_key"]},
        )
    elif service == "toolgate":
        origin, headers = (
            "http://127.0.0.1:18510",
            {
                "X-ToolGate-Key": config["environments"]["toolgate"][
                    "TOOLGATE_ADMIN_KEY"
                ]
            },
        )
    else:
        origin, headers = (
            "http://127.0.0.1:18551",
            {"X-Pi-Key": config["environments"]["pi"]["PI_ADMIN_KEY"]},
        )
    headers["Content-Type"] = "application/json"
    data = json.dumps(body).encode() if body is not None else None
    with build_opener(ProxyHandler({}), NoRedirect()).open(
        Request(origin + path, data=data, headers=headers), timeout=660
    ) as response:
        return json.load(response)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("sessions")
    new = commands.add_parser("new")
    new.add_argument("title", nargs="?", default="")
    chat = commands.add_parser("chat")
    chat.add_argument("session")
    chat.add_argument("text")
    chat.add_argument("--model")
    chat.add_argument("--request-id")
    show = commands.add_parser("show")
    show.add_argument("session")
    think = commands.add_parser("thinking")
    think.add_argument("session")
    think.add_argument("--cancel", metavar="TURN_ID")
    models = commands.add_parser("models")
    models.add_argument(
        "--save",
        type=Path,
        help="JSON update containing expected_revision and configuration",
    )
    auth = commands.add_parser("auth")
    auth.add_argument("provider", choices=["chatgpt", "claude"])
    auth.add_argument(
        "action",
        choices=["status", "login", "cancel", "logout", "models"],
        default="status",
        nargs="?",
    )
    auth.add_argument(
        "--billing", choices=["subscription", "api"], default="subscription"
    )
    native = commands.add_parser(
        "native",
        help="Run the official agent with Conker's isolated sign-in; native permissions apply",
    )
    native.add_argument("harness", choices=["codex", "claude"])
    native.add_argument("arguments", nargs=argparse.REMAINDER)
    api = commands.add_parser(
        "api",
        help="Host-owner access to the same service APIs; tool grants still apply",
    )
    api.add_argument("service", choices=["pi", "toolgate"])
    api.add_argument("path")
    api.add_argument("--body", type=Path)
    args = parser.parse_args()
    config = read_config()
    if args.command == "native":
        native = config["native_providers"]
        env = dict(os.environ)
        for key in list(env):
            if key.startswith(("OPENAI_", "ANTHROPIC_", "CLAUDE_CODE_OAUTH")):
                del env[key]
        env["CODEX_HOME" if args.harness == "codex" else "CLAUDE_CONFIG_DIR"] = str(
            Path(native["state"])
            / ("chatgpt-auth" if args.harness == "codex" else "claude-auth")
        )
        return subprocess.call([native[args.harness], *args.arguments], env=env)
    if args.command == "sessions":
        value = request(config, "pi", "/sessions")
    elif args.command == "new":
        value = request(config, "pi", "/sessions", {"title": args.title})
    elif args.command == "show":
        value = request(config, "pi", f"/sessions/{args.session}")
    elif args.command == "chat":
        value = request(
            config,
            "pi",
            f"/sessions/{args.session}/turns",
            {
                "text": args.text,
                "request_id": args.request_id or uuid.uuid4().hex,
                **({"model_id": args.model} if args.model else {}),
            },
        )
    elif args.command == "thinking":
        value = (
            request(
                config,
                "pi",
                f"/sessions/{args.session}/thinking/{args.cancel}/cancel",
                {},
            )
            if args.cancel
            else request(config, "pi", f"/sessions/{args.session}").get("thinking", [])
        )
    elif args.command == "models":
        value = request(
            config,
            "pi",
            "/models/configuration",
            json.loads(args.save.read_text()) if args.save else None,
        )
    elif args.command == "api":
        value = request(
            config,
            args.service,
            args.path,
            json.loads(args.body.read_text()) if args.body else None,
        )
    elif args.command == "auth":
        body = (
            None
            if args.action == "status"
            or args.provider == "claude"
            and args.action == "models"
            else {"operation": args.action}
        )
        if args.provider == "chatgpt" and args.action in {"cancel", "logout"}:
            status = request(config, "providers", "/chatgpt")
            key = "loginId" if args.action == "cancel" else "connectionId"
            if not status.get(key):
                raise ValueError("There is no matching active sign-in or connection.")
            body[key] = status[key]
        if args.provider == "claude" and args.action == "login":
            body["billing"] = args.billing
        value = request(config, "providers", "/" + args.provider, body)
    print(json.dumps(value, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except HTTPError as exc:
        print(
            f"Request was not confirmed (HTTP {exc.code}); inspect status before retrying.",
            file=sys.stderr,
        )
        sys.exit(1)
    except (ValueError, OSError) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
