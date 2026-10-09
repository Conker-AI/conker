"""Conker CLI: the same chats, model roles and native sign-ins as the UI."""

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import uuid
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

from workspace import read_config

SKILL_ID = r"[a-z0-9]+(?:-[a-z0-9]+)*"
MCP_ID = r"mcp\.[a-z0-9][a-z0-9.-]{1,74}"


def identity(value, pattern, label, maximum=128):
    if (
        not isinstance(value, str)
        or len(value) > maximum
        or not re.fullmatch(pattern, value)
    ):
        raise ValueError(f"Use a valid {label}.")
    return value


def read_text(path, maximum_bytes, label):
    with path.open("rb") as stream:
        raw = stream.read(maximum_bytes + 1)
    if len(raw) > maximum_bytes:
        raise ValueError(f"{label} exceeds its file size limit.")
    try:
        return raw.decode("utf-8-sig")
    except UnicodeError:
        raise ValueError(f"{label} must be a UTF-8 text file.") from None


def read_json(path, maximum_bytes=1048576):
    def pairs(values):
        result = {}
        for key, value in values:
            if key in result:
                raise ValueError("JSON must not contain duplicate keys.")
            result[key] = value
        return result

    def invalid_constant(_value):
        raise ValueError("JSON numbers must be finite.")

    try:
        value = json.loads(
            read_text(path, maximum_bytes, "JSON"),
            object_pairs_hook=pairs,
            parse_constant=invalid_constant,
        )
    except RecursionError:
        raise ValueError("JSON nesting exceeds the supported limit.") from None
    if not isinstance(value, dict):
        raise ValueError("JSON must contain an object.")  # noqa: TRY004 - invalid file content, not a Python caller type
    return value


def mcp_endpoint(url):
    try:
        parsed = urlsplit(url)
        valid = (
            isinstance(url, str)
            and 1 <= len(url) <= 2048
            and (
                parsed.scheme == "https"
                and parsed.hostname
                and parsed.port in {None, 443}
                and not parsed.username
                and not parsed.password
                and not parsed.query
                and not parsed.fragment
                and "\\" not in url
                and not any(ord(character) < 33 for character in url)
            )
        )
    except (ValueError, TypeError, AttributeError):
        valid = False
    if not valid:
        raise ValueError(
            "Use a public HTTPS MCP endpoint on port 443 without credentials, query or fragment."
        )
    return url


def secret_reference(value):
    if value is not None:
        identity(value, r"[A-Z][A-Z0-9_]{0,99}", "existing vault reference", 100)
    return value


def imported_mcp(args):
    identity(args.id, MCP_ID, "MCP capability ID")
    discovery = read_json(args.file)
    tools, server = discovery.get("tools"), discovery.get("server")
    if (
        not isinstance(tools, list)
        or len(tools) > 64
        or not all(isinstance(tool, dict) for tool in tools)
        or not isinstance(server, dict)
    ):
        raise ValueError(
            "Select a saved MCP discovery response containing server and tools."
        )
    matches = [tool for tool in tools if tool.get("name") == args.tool]
    if len(matches) != 1:
        raise ValueError("Select exactly one tool from the saved discovery.")
    tool = matches[0]
    remote_name = identity(
        tool.get("name"), r"[A-Za-z0-9_.-]{1,128}", "remote tool name"
    )
    schema, digest = tool.get("inputSchema"), tool.get("schemaHash")
    identity(digest, r"[a-f0-9]{64}", "saved schema hash")
    if not isinstance(schema, dict) or schema.get("type") != "object":
        raise ValueError("The selected MCP input schema must declare type object.")
    try:
        encoded = json.dumps(
            schema,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        ).encode()
    except (ValueError, UnicodeError, RecursionError):
        raise ValueError(
            "The saved MCP schema is not supported finite UTF-8 JSON."
        ) from None
    if len(encoded) > 32768 or hashlib.sha256(encoded).hexdigest() != digest:
        raise ValueError(
            "The saved MCP schema must match its exact discovery hash and size limit."
        )
    name = args.name if args.name is not None else remote_name[:120]
    description = tool.get("description", "")
    if (
        not isinstance(name, str)
        or not name.strip()
        or len(name) > 120
        or not isinstance(description, str)
        or len(description) > 4000
    ):
        raise ValueError(
            "Use a display name of 1-120 characters and a description of at most 4000 characters."
        )
    return {
        "id": args.id,
        "name": name,
        "description": description.strip() or f"MCP tool {remote_name}",
        "url": mcp_endpoint(server.get("url")),
        "tool_name": remote_name,
        "input_schema": schema,
        "schema_hash": digest,
        "secret_ref": secret_reference(args.secret_ref),
    }


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


def request(config, service, path, body=None):
    if service not in {"providers", "toolgate-owner", "pi-owner", "toolgate", "pi"}:
        raise ValueError("Choose a configured Conker service.")
    if (
        not path.startswith("/")
        or path.startswith("//")
        or any(character in path for character in "?#\\")
        or any(ord(character) < 32 for character in path)
    ):
        raise ValueError("Use a service-relative path without query or fragment.")
    if service == "providers":
        origin, headers = (
            "http://127.0.0.1:18570",
            {"Authorization": "Bearer " + config["native_providers"]["control_key"]},
        )
    elif service == "toolgate-owner":
        gateway = config["environments"]["gateway"]
        origin, headers = (
            "http://127.0.0.1:18510",
            {"X-ToolGate-Owner-Key": gateway["GATEWAY_TOOLGATE_OWNER_KEY"]},
        )
        if path.endswith("/access"):
            headers["X-ToolGate-Execution-Key"] = gateway[
                "GATEWAY_TOOLGATE_EXECUTION_KEY"
            ]
    elif service == "pi-owner":
        origin, headers = (
            "http://127.0.0.1:18551",
            {
                "X-Pi-Owner-Key": config["environments"]["gateway"][
                    "GATEWAY_PI_OWNER_KEY"
                ]
            },
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
    chat.add_argument(
        "--skill",
        action="append",
        default=[],
        help="Select a saved skill (up to three)",
    )
    skills = commands.add_parser("skills", help="Manage reusable SKILL.md instructions")
    skill_commands = skills.add_subparsers(dest="operation", required=True)
    skill_commands.add_parser("list")
    skill_show = skill_commands.add_parser("show")
    skill_show.add_argument("id")
    skill_import = skill_commands.add_parser("import")
    skill_import.add_argument("file", type=Path)
    skill_import.add_argument("--expected-revision", type=int, default=0)
    skill_import.add_argument(
        "--expected-id", help="Bind a replacement to the inspected skill ID"
    )
    skill_state = skill_commands.add_parser("state")
    skill_state.add_argument("id")
    skill_state.add_argument("--enabled", choices=["true", "false"], required=True)
    skill_state.add_argument("--expected-revision", type=int, required=True)
    mcp = commands.add_parser(
        "mcp", help="Discover and manage remote MCP tools through ToolGate"
    )
    mcp_commands = mcp.add_subparsers(dest="operation", required=True)
    mcp_commands.add_parser("list")
    discover = mcp_commands.add_parser("discover")
    discover.add_argument("url", help="Public HTTPS Streamable HTTP endpoint")
    discover.add_argument(
        "--secret-ref",
        help="Existing ToolGate vault reference; never a credential value",
    )
    mcp_import = mcp_commands.add_parser(
        "import", help="Import one tool from saved discovery JSON"
    )
    mcp_import.add_argument("file", type=Path)
    mcp_import.add_argument("--tool", required=True, help="Exact remote tool name")
    mcp_import.add_argument("--id", required=True, help="New mcp.<name> capability ID")
    mcp_import.add_argument("--name", help="Display name")
    mcp_import.add_argument("--secret-ref")
    for operation in ("state", "access"):
        item = mcp_commands.add_parser(operation)
        item.add_argument("id")
        item.add_argument(
            "--enabled", choices=["true", "false"], required=operation == "state"
        )
        item.add_argument("--expected-digest", required=operation == "state")
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
    if args.command in {"chat", "show", "thinking"}:
        identity(args.session, r"[A-Za-z0-9_-]{1,128}", "conversation ID")
    if args.command == "thinking" and args.cancel:
        identity(args.cancel, r"[A-Za-z0-9_-]{1,128}", "turn ID")
    if args.command == "chat":
        if len(args.skill) > 3 or len(set(args.skill)) != len(args.skill):
            raise ValueError("Select at most three distinct skills.")
        for selected in args.skill:
            identity(selected, SKILL_ID, "skill ID", 64)
        if args.request_id:
            identity(args.request_id, r"[A-Za-z0-9_-]{16,128}", "request ID")
    if args.command == "skills":
        if hasattr(args, "id"):
            identity(args.id, SKILL_ID, "skill ID", 64)
        if hasattr(args, "expected_revision") and args.expected_revision < (
            1 if args.operation == "state" else 0
        ):
            raise ValueError(
                "Use the current nonnegative revision (state changes require 1 or higher)."
            )
        if args.operation == "import" and args.expected_id:
            identity(args.expected_id, SKILL_ID, "skill ID", 64)
    if args.command == "mcp" and args.operation in {"state", "access"}:
        identity(args.id, MCP_ID, "MCP capability ID")
        if args.expected_digest is not None:
            identity(args.expected_digest, r"[a-f0-9]{64}", "exact saved digest")
            if args.enabled is None:
                raise ValueError(
                    "Use --enabled together with --expected-digest to change access."
                )
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
                **({"skill_ids": args.skill} if args.skill else {}),
            },
        )
    elif args.command == "skills":
        path, body = "/skills", None
        if args.operation == "show":
            path += "/" + args.id
        elif args.operation == "import":
            markdown = read_text(args.file, 128000, "SKILL.md")
            if not 1 <= len(markdown) <= 32000:
                raise ValueError("SKILL.md must be at most 32,000 characters.")
            path += "/import"
            body = {"markdown": markdown, "expected_revision": args.expected_revision}
            if args.expected_revision > 0 and not args.expected_id:
                raise ValueError("Supply --expected-id when replacing a saved skill.")
            if args.expected_id:
                body["expected_id"] = args.expected_id
        elif args.operation == "state":
            path += "/" + args.id + "/state"
            body = {
                "enabled": args.enabled == "true",
                "expected_revision": args.expected_revision,
            }
        value = request(config, "pi-owner", path, body)
    elif args.command == "mcp":
        path, body = "/v2/owner/mcp/tools", None
        if args.operation == "discover":
            path = "/v2/owner/mcp/discover"
            body = {
                "url": mcp_endpoint(args.url),
                "secret_ref": secret_reference(args.secret_ref),
            }
        elif args.operation == "import":
            path = "/v2/owner/mcp/import"
            body = imported_mcp(args)
        elif args.operation in {"state", "access"}:
            path += "/" + args.id + "/" + args.operation
            if args.enabled is not None:
                if not args.expected_digest:
                    raise ValueError(
                        "Supply --expected-digest from the inspected tool before changing access."
                    )
                body = {
                    "enabled": args.enabled == "true",
                    "expected_digest": args.expected_digest,
                }
        value = request(config, "toolgate-owner", path, body)
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
            read_json(args.save) if args.save else None,
        )
    elif args.command == "api":
        value = request(
            config,
            args.service,
            args.path,
            read_json(args.body) if args.body else None,
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


def cli():
    try:
        return main()
    except HTTPError as exc:
        print(
            f"Request was not confirmed (HTTP {exc.code}); inspect status before retrying.",
            file=sys.stderr,
        )
        return 1
    except (ValueError, OSError) as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(cli())
