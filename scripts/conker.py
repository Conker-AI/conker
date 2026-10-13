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
from urllib.parse import urlencode, urlsplit
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


def draft_path(target, task=None):
    identity(target, r"[A-Za-z0-9_-]{1,128}", "conversation ID or new")
    if task is not None:
        if target == "new":
            raise ValueError("A task draft requires an existing conversation.")
        identity(task, r"[A-Za-z0-9_-]{1,128}", "task ID")
    return f"/drafts/{target}" + (f"/tasks/{task}" if task else "")


def memory_edit_operation(args):
    """Validate the exact correction before reading credentials or sending it."""
    path, body = "/memory/corrections", None
    if args.operation in {"show", "apply"}:
        identity(
            args.memory_id,
            r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}",
            "memory ID",
            200,
        )
    if args.operation in {"apply", "status", "retry"}:
        identity(args.request_id, r"[A-Za-z0-9_-]{16,128}", "request ID")
    if args.operation == "show":
        path += "/memories/" + args.memory_id
    elif args.operation == "pending":
        path += "/pending"
    elif args.operation == "status":
        path += "/" + args.request_id
    elif args.operation == "retry":
        identity(
            args.expected_payload_hash,
            r"[0-9a-f]{64}",
            "reviewed correction payload hash",
            64,
        )
        path += "/" + args.request_id + "/retry"
        body = {"expected_payload_hash": args.expected_payload_hash}
    elif args.operation == "apply":
        if not 1 <= args.expected_revision <= 2147483646:
            raise ValueError("Use the reviewed memory revision (1–2147483646).")
        text = read_text(args.file, 64003, "Replacement memory text")
        if not text.strip() or len(text) > 16000 or "\x00" in text:
            raise ValueError(
                "Replacement memory text must be nonblank, at most 16,000 characters, without NUL."
            )
        body = {
            "request_id": args.request_id,
            "memory_id": args.memory_id,
            "expected_revision": args.expected_revision,
            "text": text,
        }
    return path, body


def draft_payload(path, target, revision):
    value = read_json(path, 65536)
    allowed = {"text", "model_id", "skill_ids", "think", "research_mode"}
    if target == "new":
        allowed.update({"title", "agent_id", "privacy"})
    if set(value) - allowed or not isinstance(value.get("text"), str):
        raise ValueError(
            "Draft JSON must contain text and only supported composer fields."
        )
    if len(value["text"]) > 16000:
        raise ValueError("Draft text exceeds 16,000 characters.")
    model = value.get("model_id")
    if model is not None and (not isinstance(model, str) or not 1 <= len(model) <= 200):
        raise ValueError(
            "Use a model ID of 1 to 200 characters, or null for Automatic."
        )
    skills = value.get("skill_ids", [])
    if not isinstance(skills, list) or len(skills) > 3:
        raise ValueError("Select at most three distinct skills.")
    for selected in skills:
        identity(selected, SKILL_ID, "skill ID", 64)
    if len(set(skills)) != len(skills):
        raise ValueError("Select at most three distinct skills.")
    if "think" in value and type(value["think"]) is not bool:
        raise ValueError("Draft think must be true or false.")
    if value.get("research_mode", "off") not in ("off", "web", "deep"):
        raise ValueError("Draft research_mode must be off, web, or deep.")
    if target == "new":
        title = value.get("title", "")
        if not isinstance(title, str) or len(title) > 1024:
            raise ValueError("Draft title must contain at most 1,024 characters.")
        if value.get("agent_id") is not None:
            identity(value["agent_id"], r"(?:companion|agent_[0-9a-f]{32})", "agent ID")
        privacy = value.get("privacy", {})
        if (
            not isinstance(privacy, dict)
            or set(privacy) - {"memoryDisabled", "harnessDisabled"}
            or any(type(flag) is not bool for flag in privacy.values())
        ):
            raise ValueError(
                "Draft privacy must contain only memoryDisabled and harnessDisabled booleans."
            )
    payload = {**value, "expected_revision": revision}
    if len(json.dumps(payload, ensure_ascii=False).encode("utf-8")) > 65536:
        raise ValueError("Draft exceeds the 64 KiB request limit.")
    return payload


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


def history_query(values):
    """Keep the only query-enabled CLI route bounded and literal."""
    if not isinstance(values, dict) or set(values) - {"limit", "q", "cursor"}:
        raise ValueError("Use only limit, query and cursor for chat history.")
    if "limit" in values and (
        type(values["limit"]) is not int or not 1 <= values["limit"] <= 50
    ):
        raise ValueError("Choose a chat page size from 1 to 50.")
    if "q" in values:
        query = values["q"]
        if not isinstance(query, str) or len(query) > 200 or "\x00" in query:
            raise ValueError("Use a chat query of at most 200 characters without NUL.")
        try:
            query.encode("utf-8")
        except UnicodeError:
            raise ValueError("Use valid Unicode for the chat query.") from None
    if "cursor" in values:
        cursor = values["cursor"]
        if not isinstance(cursor, str) or not re.fullmatch(
            r"h1\.[0-9a-f]{64}\.[A-Za-z0-9_-]{1,128}", cursor, re.ASCII
        ):
            raise ValueError("Use the next_cursor returned by the same chat search.")
    return values


def request(
    config, service, path, body=None, *, query=None, timeout=660, maximum_bytes=None
):
    if service not in {"providers", "toolgate-owner", "pi-owner", "toolgate", "pi"}:
        raise ValueError("Choose a configured Conker service.")
    if (
        not path.startswith("/")
        or path.startswith("//")
        or any(character in path for character in "?#\\")
        or any(ord(character) < 32 for character in path)
    ):
        raise ValueError("Use a service-relative path without query or fragment.")
    suffix = ""
    if query is not None:
        if service == "pi" and path == "/sessions/history" and body is None:
            encoded = urlencode(history_query(query))
        elif service == "providers" and path == "/codex/sessions" and body is None:
            from native_codex_sessions import list_query

            values = list_query(query)
            encoded = urlencode(
                {
                    "limit": values["limit"],
                    "archived": "true" if values["archived"] else "false",
                    **(
                        {"cursor": values["cursor"]}
                        if values["cursor"] is not None
                        else {}
                    ),
                }
            )
        else:
            raise ValueError(
                "Structured query options are only for reading chat or Codex history."
            )
        suffix = "?" + encoded if encoded else ""
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
    data = (
        json.dumps(body, ensure_ascii=False).encode("utf-8")
        if body is not None
        else None
    )
    with build_opener(ProxyHandler({}), NoRedirect()).open(
        Request(origin + path + suffix, data=data, headers=headers), timeout=timeout
    ) as response:
        if maximum_bytes is not None:
            raw = response.read(maximum_bytes + 1)
            if len(raw) > maximum_bytes:
                raise ValueError("The service response exceeded its size limit.")
            return json.loads(raw)
        return json.load(response)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    sessions = commands.add_parser("sessions", help="Browse compact chat history pages")
    sessions.add_argument("--limit", type=int, default=50, help="Chats per page (1-50)")
    sessions.add_argument(
        "--query", help="Literal title/summary search, at most 200 characters"
    )
    sessions.add_argument(
        "--cursor", help="next_cursor from the same query; omit to refresh"
    )
    new = commands.add_parser("new")
    new.add_argument("title", nargs="?", default="")
    chat = commands.add_parser("chat")
    chat.add_argument("session")
    chat.add_argument("text")
    chat.add_argument("--model")
    chat.add_argument("--request-id")
    chat.add_argument(
        "--draft-revision",
        type=int,
        help="Consume exactly this saved draft revision when the message binds",
    )
    chat.add_argument("--research-mode", choices=["off", "web", "deep"], default="off")
    chat.add_argument(
        "--think",
        action="store_true",
        help="Request background analysis for this message",
    )
    resume = commands.add_parser(
        "resume", help="Resume the saved turn without replaying completed actions"
    )
    resume.add_argument("turn")
    usage = commands.add_parser(
        "usage", help="Inspect recorded model calls, reported usage and missing totals"
    )
    usage.add_argument("turn")
    commands.add_parser(
        "memory-forget-pending",
        help="Inspect the saved identity of an unresolved memory forget request",
    )
    memory_edit = commands.add_parser(
        "memory-edit", help="Review and correct retained Companion memory text"
    )
    memory_edit_commands = memory_edit.add_subparsers(dest="operation", required=True)
    memory_show = memory_edit_commands.add_parser(
        "show", help="Read full authoritative text and its revision before editing"
    )
    memory_show.add_argument("memory_id")
    memory_apply = memory_edit_commands.add_parser(
        "apply", help="Apply exactly the reviewed UTF-8 text file and revision"
    )
    memory_apply.add_argument("memory_id")
    memory_apply.add_argument("file", type=Path)
    memory_apply.add_argument("--expected-revision", required=True, type=int)
    memory_apply.add_argument("--request-id", required=True)
    memory_edit_commands.add_parser(
        "pending", help="Find unresolved correction identity without reading its text"
    )
    memory_status = memory_edit_commands.add_parser(
        "status", help="Check the original receipt without sending an edit"
    )
    memory_status.add_argument("request_id")
    memory_retry = memory_edit_commands.add_parser(
        "retry", help="Explicitly resend only the exact previously approved correction"
    )
    memory_retry.add_argument("request_id")
    memory_retry.add_argument("--expected-payload-hash", required=True)
    delivery = commands.add_parser(
        "memory-delivery", help="Read acknowledged memory delivery for saved messages"
    )
    delivery.add_argument("session")
    delivery.add_argument(
        "--message", help="Read one saved user message, including older history"
    )
    stop = commands.add_parser(
        "stop", help="Stop the saved submission by its request ID"
    )
    stop.add_argument("request_id")
    submission = commands.add_parser(
        "submission", help="Inspect a durable submission before deciding how to recover"
    )
    submission.add_argument("request_id")
    draft = commands.add_parser(
        "draft", help="Read or save private composer drafts without sending a message"
    )
    draft_commands = draft.add_subparsers(dest="operation", required=True)
    for operation in ("show", "save", "clear"):
        item = draft_commands.add_parser(operation)
        item.add_argument(
            "target", help="Conversation ID, or new for the unsent first message"
        )
        item.add_argument("--task", help="Separate task draft within this conversation")
        if operation == "save":
            item.add_argument(
                "file",
                type=Path,
                help="JSON with text and optional model_id, skill_ids, think, research_mode; new also accepts title, agent_id, privacy",
            )
        if operation in {"save", "clear"}:
            item.add_argument("--expected-revision", type=int, required=True)
    draft_start = draft_commands.add_parser(
        "start",
        help="Create a conversation from the saved new draft without running a model",
    )
    draft_start.add_argument("--expected-revision", type=int, required=True)
    draft_start.add_argument(
        "--request-id",
        required=True,
        help="Keep this identity for inspection or an exact retry after an uncertain result",
    )
    draft_status = draft_commands.add_parser(
        "start-status",
        help="Inspect a saved new-chat start request without repeating it",
    )
    draft_status.add_argument("request_id")
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
    native_sessions = commands.add_parser(
        "native-sessions",
        help="Read isolated Codex history or inspect and stop Claude background sessions",
    )
    native_sessions.add_argument("provider", choices=["claude", "codex"])
    native_operations = native_sessions.add_subparsers(dest="operation", required=True)
    native_list = native_operations.add_parser("list")
    native_list.add_argument(
        "--limit", type=int, help="Codex page size, 1 to 50 (default 25)"
    )
    native_list.add_argument(
        "--cursor", help="Next cursor from the same Codex history scope and page size"
    )
    native_list.add_argument(
        "--archived",
        action="store_true",
        default=None,
        help="Read archived Codex history",
    )
    for operation in ("status", "output", "stop"):
        operation_parser = native_operations.add_parser(operation)
        operation_parser.add_argument("id")
        if operation == "stop":
            operation_parser.add_argument("--expected-identity", required=True)
    api = commands.add_parser(
        "api",
        help="Host-owner access to the same service APIs; tool grants still apply",
    )
    api.add_argument("service", choices=["pi", "toolgate"])
    api.add_argument("path")
    api.add_argument("--body", type=Path)
    args = parser.parse_args()
    native_query = None
    if args.command == "native-sessions":
        if args.provider == "codex":
            from native_codex_sessions import list_query, thread_id

            if args.operation not in {"list", "status"}:
                raise ValueError(
                    "Codex saved history supports only list and status reads."
                )
            if args.operation == "list":
                native_query = list_query(
                    {
                        key: getattr(args, key)
                        for key in ("limit", "cursor", "archived")
                        if getattr(args, key) is not None
                    }
                )
            else:
                thread_id(args.id)
        elif args.operation == "list" and any(
            getattr(args, key) is not None for key in ("limit", "cursor", "archived")
        ):
            raise ValueError(
                "Pagination and archive options apply only to Codex saved history."
            )
        if args.operation != "list":
            identity(
                args.id,
                r"[A-Za-z0-9][A-Za-z0-9_-]{0,99}",
                "exact native session ID",
                100,
            )
        if args.operation == "stop":
            identity(
                args.expected_identity,
                r"[0-9a-f]{64}",
                "observed native session identity",
                64,
            )
    if args.command in {"chat", "show", "thinking", "memory-delivery"}:
        identity(args.session, r"[A-Za-z0-9_-]{1,128}", "conversation ID")
    if args.command == "memory-delivery" and args.message is not None:
        identity(args.message, r"[A-Za-z0-9_-]{1,128}", "message ID")
    if args.command == "thinking" and args.cancel:
        identity(args.cancel, r"[A-Za-z0-9_-]{1,128}", "turn ID")
    if args.command in {"resume", "usage"}:
        identity(args.turn, r"[A-Za-z0-9_-]{1,128}", "turn ID")
    if args.command in {"stop", "submission"}:
        identity(args.request_id, r"[A-Za-z0-9_-]{16,128}", "request ID")
    if args.command == "chat":
        if args.draft_revision is not None and args.draft_revision < 1:
            raise ValueError("Use a saved draft revision of 1 or higher.")
        if len(args.skill) > 3 or len(set(args.skill)) != len(args.skill):
            raise ValueError("Select at most three distinct skills.")
        for selected in args.skill:
            identity(selected, SKILL_ID, "skill ID", 64)
        if args.request_id:
            identity(args.request_id, r"[A-Za-z0-9_-]{16,128}", "request ID")
    draft_body = None
    if args.command == "draft":
        if args.operation in {"start", "start-status"}:
            identity(args.request_id, r"[A-Za-z0-9_-]{16,128}", "request ID")
        else:
            draft_path(args.target, args.task)
        if hasattr(args, "expected_revision") and args.expected_revision < (
            1 if args.operation == "start" else 0
        ):
            raise ValueError(
                "Use a current nonnegative revision; starting requires a saved draft."
            )
        if args.operation == "save":
            draft_body = draft_payload(args.file, args.target, args.expected_revision)
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
    memory_edit_request = (
        memory_edit_operation(args) if args.command == "memory-edit" else None
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
    if args.command == "native-sessions":
        path, body = f"/{args.provider}/sessions", None
        if args.operation != "list":
            path += "/" + args.id
        if args.operation in {"output", "stop"}:
            path += "/" + args.operation
        if args.operation == "stop":
            body = {"expectedIdentity": args.expected_identity}
        try:
            value = request(
                config,
                "providers",
                path,
                body,
                query=native_query,
                timeout=30,
                maximum_bytes=1048576,
            )
        except HTTPError as exc:
            if args.provider != "codex":
                raise
            exc.close()
            message = (
                "Codex history options or cursor were rejected. Start again without --cursor; "
                "keep the same archive scope and page size for later pages."
                if exc.code == 422 and args.operation == "list"
                else f"Codex saved metadata could not be read (HTTP {exc.code}); try again later."
            )
            raise ValueError(message) from None
    elif args.command == "sessions":
        query = history_query(
            {
                "limit": args.limit,
                **({"q": args.query} if args.query is not None else {}),
                **({"cursor": args.cursor} if args.cursor is not None else {}),
            }
        )
        try:
            value = request(config, "pi", "/sessions/history", query=query)
        except HTTPError as exc:
            exc.close()
            message = (
                "Chat history request was rejected. Start again without --cursor; "
                "use the same query when continuing its next page."
                if exc.code == 422
                else f"Chat history could not be read (HTTP {exc.code}); try again later."
            )
            raise ValueError(message) from None
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
                **({"think": True} if args.think else {}),
                **(
                    {"draft_revision": args.draft_revision}
                    if args.draft_revision is not None
                    else {}
                ),
                **(
                    {"research_mode": args.research_mode}
                    if args.research_mode != "off"
                    else {}
                ),
            },
        )
    elif args.command == "draft":
        if args.operation == "start":
            value = request(
                config,
                "pi-owner",
                "/drafts/new/start",
                {
                    "request_id": args.request_id,
                    "expected_revision": args.expected_revision,
                },
            )
        elif args.operation == "start-status":
            value = request(config, "pi-owner", f"/drafts/new/start/{args.request_id}")
        else:
            if args.operation == "clear":
                draft_body = {"text": "", "expected_revision": args.expected_revision}
            value = request(
                config, "pi-owner", draft_path(args.target, args.task), draft_body
            )
    elif args.command == "resume":
        value = request(config, "pi", f"/turns/{args.turn}/resume", {})
    elif args.command == "usage":
        value = request(config, "pi", f"/turns/{args.turn}/usage")
    elif args.command == "memory-forget-pending":
        value = request(config, "pi-owner", "/memory/forget-pending")
    elif args.command == "memory-edit":
        path, body = memory_edit_request
        try:
            value = request(
                config,
                "pi-owner",
                path,
                body,
                timeout=45 if body is not None else 35,
                maximum_bytes=128000,
            )
        except (HTTPError, OSError, ValueError) as exc:
            if isinstance(exc, HTTPError):
                exc.close()
            if body is not None:
                message = (
                    "Memory correction was not confirmed. Check the original request with "
                    f"memory-edit status {args.request_id}; no edit was automatically repeated."
                )
            else:
                message = (
                    "Memory correction evidence could not be read. "
                    "Check the memory or request identity and try the read again."
                )
            raise ValueError(message) from None
    elif args.command == "memory-delivery":
        path = f"/sessions/{args.session}"
        if args.message is not None:
            path += f"/messages/{args.message}"
        value = request(config, "pi", path + "/memory-delivery")
    elif args.command == "stop":
        value = request(config, "pi", f"/turn-submissions/{args.request_id}/cancel", {})
    elif args.command == "submission":
        value = request(config, "pi", f"/turn-submissions/{args.request_id}")
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
            else request(config, "pi", f"/sessions/{args.session}/thinking")
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
        if args.action == "cancel" or (
            args.provider == "chatgpt" and args.action == "logout"
        ):
            status = request(config, "providers", "/" + args.provider)
            key = "loginId" if args.action == "cancel" else "connectionId"
            if not status.get(key):
                raise ValueError("There is no matching active sign-in or connection.")
            body[key] = (
                identity(status[key], r"login_[0-9a-f]{32}", "Claude sign-in identity")
                if args.provider == "claude"
                else status[key]
            )
        if args.provider == "claude" and args.action == "login":
            body["billing"] = args.billing
        value = request(config, "providers", "/" + args.provider, body)
    print(
        json.dumps(
            value,
            indent=2,
            ensure_ascii=args.command in {"native-sessions", "memory-edit"},
        )
    )
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
