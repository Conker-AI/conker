"""Input validation for the conker CLI: identities, bounded files, MCP endpoints, drafts and history queries."""

import hashlib
import json
import re
from urllib.parse import urlsplit

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
