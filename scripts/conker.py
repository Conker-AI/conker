"""Conker CLI: the same chats, model roles and native sign-ins as the UI."""

import json
import os
import re
import subprocess
import sys
import uuid
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

from conker_chat import operation as chat_operation
from conker_context import operation as context_operation
from conker_context import pi_call
from conker_files import operation as files_operation
from conker_inputs import (
    MCP_ID,
    SKILL_ID,
    draft_path,
    draft_payload,
    history_query,
    identity,
    imported_mcp,
    mcp_endpoint,
    memory_edit_operation,
    read_json,
    read_text,
    secret_reference,
)
from conker_messages import operation as message_operation
from conker_parser import build_parser
from workspace import read_config


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


ATTACHMENT_UPLOAD = re.compile(r"/sessions/[A-Za-z0-9_-]{1,128}/attachments")


def request(
    config,
    service,
    path,
    body=None,
    *,
    query=None,
    timeout=660,
    maximum_bytes=None,
    data=None,
    content_type=None,
    query_params=None,
    raw_response=False,
    method=None,
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

    if data is not None and body is not None:
        raise ValueError("data and body are exclusive")

    if query_params is not None and (
        service != "pi" or not ATTACHMENT_UPLOAD.fullmatch(path)
    ):
        raise ValueError("query_params only allowed for Pi attachment uploads")

    suffix = ""
    if query is not None:
        if service == "pi" and path == "/sessions/history" and body is None:
            encoded = urlencode(history_query(query))
        elif service == "pi" and path.endswith("/branch-history") and body is None:
            encoded = urlencode(
                {key: query[key] for key in ("limit", "cursor") if key in query}
            )
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
    elif query_params is not None:
        suffix = "?" + urlencode(query_params)
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
    if data is not None:
        headers["Content-Type"] = content_type or "application/octet-stream"
    else:
        headers["Content-Type"] = "application/json"
        data = (
            json.dumps(body, ensure_ascii=False).encode("utf-8")
            if body is not None
            else None
        )
    with build_opener(ProxyHandler({}), NoRedirect()).open(
        Request(origin + path + suffix, data=data, headers=headers, method=method),
        timeout=timeout,
    ) as response:
        if raw_response:
            return response.read()
        if maximum_bytes is not None:
            raw = response.read(maximum_bytes + 1)
            if len(raw) > maximum_bytes:
                raise ValueError("The service response exceeded its size limit.")
            return json.loads(raw)
        return json.load(response)


def main():
    parser = build_parser(__doc__)
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
    if args.command in {
        "chat",
        "show",
        "thinking",
        "memory-delivery",
        "context",
        "message",
        "output",
        "title",
        "files",
    }:
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
        chat_body = {
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
        }

        if args.attach:
            for attach_id in args.attach:
                identity(attach_id, r"attachment_[0-9a-f]{32}", "attachment identity")
            seen = set()
            unique_attachments = []
            for attach_id in args.attach:
                if attach_id not in seen:
                    seen.add(attach_id)
                    unique_attachments.append(attach_id)
            chat_body["attachment_ids"] = unique_attachments

        value = request(
            config,
            "pi",
            f"/sessions/{args.session}/turns",
            chat_body,
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
    elif args.command == "profiles":
        value = pi_call(request, config, "/models/profiles")
    elif args.command == "context":
        value = context_operation(args, config, request)
    elif args.command == "message":
        value = message_operation(args, config, request)
    elif args.command in {"output", "title"}:
        value = chat_operation(args, config, request)
    elif args.command == "files":
        value = files_operation(args, config, request)
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
