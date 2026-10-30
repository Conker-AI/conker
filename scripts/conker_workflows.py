"""conker workflow: describe a workflow in words, review the draft, then publish it.

Drafting is a tool request in Pi (POST /tool-drafts, scripts/tool_drafts.py): `draft` is
`conker tool draft`, and `from-chat` files one from your own message in a chat. Pi drafts it in
the background and the draft waits in the Inbox; `dismiss` declines such a request. ToolGate
stores drafts in its editor and validates them: `list`, `show` and `publish` work on those.
Nothing is published or run until the owner runs `conker workflow publish`.
"""

from __future__ import annotations

import json
import re
from types import SimpleNamespace
from urllib.error import HTTPError

import tool_drafts

DRAFT_ID = re.compile(r"[a-zA-Z][a-zA-Z0-9_-]{0,63}")
CHAT_ID = re.compile(r"[A-Za-z0-9_-]{1,128}")
EDITOR = "/v2/owner/editor-drafts/"
CAPABILITIES = 200
TOOL_REQUESTS = {"draft", "from-chat"}


def register(commands):
    workflow = commands.add_parser(
        "workflow", help="Draft a workflow from a description, review it and publish it"
    )
    operations = workflow.add_subparsers(dest="operation", required=True)
    draft = operations.add_parser(
        "draft",
        help="Describe a workflow; Pi drafts it in the background (as conker tool draft)",
    )
    draft.add_argument("description", help="What the workflow should do, in your words")
    tool_drafts.waiting_arguments(draft)
    chat = operations.add_parser(
        "from-chat",
        help="Draft a workflow from one of your chat messages; it waits in the Inbox",
    )
    chat.add_argument("session", help="The chat")
    chat.add_argument("message", help="Your message in it, as show lists it")
    tool_drafts.waiting_arguments(chat)
    dismiss = operations.add_parser(
        "dismiss", help="Decline a tool request waiting in the Inbox; nothing is made"
    )
    dismiss.add_argument("request", help="The request's id (creq_...)")
    operations.add_parser("list", help="Saved workflow drafts")
    show = operations.add_parser(
        "show", help="One draft: its steps and whether it is valid"
    )
    show.add_argument("id")
    publish = operations.add_parser("publish", help="Publish a reviewed draft")
    publish.add_argument("id")
    publish.add_argument(
        "--expected-revision",
        type=int,
        required=True,
        help="The revision you reviewed, from show",
    )
    publish.add_argument(
        "--authorization",
        choices=["owner_confirmation", "auto"],
        default="owner_confirmation",
        help="owner_confirmation (default) asks you before each run; auto runs without asking",
    )
    publish.add_argument(
        "--request",
        help="The tool request it was drafted for (creq_...): Conker tells that chat it is live",
    )


class Refused(ValueError):
    """A service's refusal, with its code when it gave one."""

    def __init__(self, message: str, code: str | None = None):
        super().__init__(message)
        self.code = code


def refusal(exc: HTTPError, service: str) -> ValueError:
    """The service's own refusal message instead of a bare status."""
    try:
        body = json.loads(exc.read(8192).decode("utf-8", errors="replace"))
    except (ValueError, OSError):
        body = None
    finally:
        exc.close()
    detail = body.get("detail") if isinstance(body, dict) else None
    if isinstance(detail, dict) and isinstance(detail.get("message"), str):
        return Refused(
            f"{service} refused this ({detail.get('code')}): {detail['message']}",
            detail.get("code"),
        )
    if isinstance(detail, list) and detail and isinstance(detail[0], dict):
        return ValueError(
            f"{service} refused this: {str(detail[0].get('msg', ''))[:300]}"
        )
    return ValueError(f"{service} refused this (HTTP {exc.code}).")


def call(request, config, service, path, body=None, *, changes=False, **options):
    """A refusal becomes its message. A failed change keeps the HTTP error, since it may have landed."""
    try:
        return request(config, service, path, body, **options)
    except HTTPError as exc:
        if changes and exc.code >= 500:
            raise
        raise refusal(exc, "Pi" if service.startswith("pi") else "ToolGate") from None


def capabilities(request, config) -> list[dict]:
    """Active tools and published workflows, as ToolGate's editor lists them."""
    found = []
    for kind in ("tool", "workflow"):
        after = None
        while len(found) < CAPABILITIES:
            query = {"kind": kind, "limit": 100, **({"after": after} if after else {})}
            page = call(
                request,
                config,
                "toolgate-owner",
                "/v2/owner/editor-capabilities",
                query=query,
            )
            for item in page["items"]:
                found.append(
                    {
                        "id": item["id"],
                        "authorization": str(item.get("authorization") or "auto"),
                    }
                )
            after = page.get("next_after")
            if not after:
                break
    return found[:CAPABILITIES]


def steps(document: dict, asks: set[str] = frozenset()) -> list[str]:
    lines = []
    for node in document["nodes"]:
        config = node["config"]
        target = {
            "tool_call": f" -> tool {config.get('tool')}",
            "workflow_call": f" -> workflow {config.get('toolId')} v{config.get('version')}",
        }.get(node["type"], "")
        if config.get("tool") in asks or config.get("toolId") in asks:
            target += ", asks you first"
        lines.append(f"{node['label']} ({node['type']}){target}")
    return lines


def problem(issue: dict) -> str:
    """A validation issue, naming its step."""
    step = issue.get("node_id")
    return f"Step {step}: {issue['message']}" if step else issue["message"]


def message_text(args, config, request) -> str:
    """The owner's own message in a chat, the description of a workflow drafted from it."""
    if not CHAT_ID.fullmatch(args.session) or not CHAT_ID.fullmatch(args.message):
        raise ValueError("Use the chat and message ids that show prints.")
    chat = call(request, config, "pi", f"/sessions/{args.session}")
    message = next(
        (item for item in chat.get("messages", []) if item.get("id") == args.message),
        None,
    )
    if message is None:
        raise ValueError("That message is not in that chat.")
    text = message.get("content")
    if (
        message.get("role") != "user"
        or message.get("content_status") == "forgotten"
        or not isinstance(text, str)
    ):
        raise ValueError("Make workflows only from your own messages.")
    if not 1 <= len(text.strip()) <= 4000:
        raise ValueError("Use a message of 1 to 4,000 characters.")
    return text.strip()


def tool_request(args, config, request, pi, *, emit=print) -> int:
    """`draft` and `from-chat`: a tool request in Pi, waited for as `conker tool draft` does."""
    description = (
        message_text(args, config, request)
        if args.operation == "from-chat"
        else args.description
    )
    drafting = SimpleNamespace(
        **{**vars(args), "operation": "draft", "description": description}
    )
    return tool_drafts.run(pi, drafting, emit=emit)


def workflow_operation(args, config, request) -> dict:
    if args.operation == "dismiss":
        if not tool_drafts.CHANGE_REQUEST.fullmatch(args.request):
            raise ValueError("Use the tool request's id, which starts with creq_.")
        return call(
            request,
            config,
            "pi",
            f"/change-requests/{args.request}/decline",
            {},
            changes=True,
        )
    if args.operation == "list":
        return call(request, config, "toolgate-owner", EDITOR.rstrip("/"))
    if not DRAFT_ID.fullmatch(args.id):
        raise ValueError(
            "A draft id starts with a letter and uses letters, digits, - and _."
        )
    path = EDITOR + args.id
    if args.operation == "show":
        record = call(request, config, "toolgate-owner", path)
        check = call(request, config, "toolgate-owner", path + "/validation")
        published = call(request, config, "toolgate-owner", path + "/publications")[
            "items"
        ]
        document = record["document"]
        asks = {
            item["id"]
            for item in capabilities(request, config)
            if item["authorization"] != "auto"
        }
        return {
            "draft": args.id,
            "revision": record["revision"],
            "name": document["name"],
            "description": document["description"],
            "effect": document["effect"],
            "agentVisible": document["agentVisible"],
            "inputs": document["inputs"],
            "outputs": document["outputs"],
            "steps": steps(document, asks),
            "nodes": document["nodes"],
            "valid": check["graph_valid"],
            "issues": [problem(item) for item in check["issues"]],
            "publications": published,
        }
    if args.request is not None and not tool_drafts.CHANGE_REQUEST.fullmatch(
        args.request
    ):
        raise ValueError("Use the tool request's id, which starts with creq_.")
    published = call(request, config, "toolgate-owner", path + "/publications")["items"]
    result = call(
        request,
        config,
        "toolgate-owner",
        path + "/publish",
        {
            "expected_revision": args.expected_revision,
            "expected_publication_version": max(
                (item["version"] for item in published), default=0
            ),
            "authorization": args.authorization,
        },
        changes=True,
    )
    if args.request is not None:
        result["toolRequest"] = told(request, config, args, result)
    return result


def told(request, config, args, result) -> dict:
    """Tell Pi the requested tool is live, so Conker says so in the chat that asked."""
    if not isinstance(result.get("toolId"), str):
        return {"note": "ToolGate did not say the tool's id, so Pi was not told."}
    try:
        name = call(request, config, "toolgate-owner", EDITOR + args.id)["document"][
            "name"
        ]
        return call(
            request,
            config,
            "pi",
            f"/change-requests/{args.request}/published",
            {"toolId": result["toolId"], "name": name},
            changes=True,
        )
    except (ValueError, OSError):
        # Published either way; only Conker's note in the chat is missing.
        return {"note": "Pi did not confirm the tool request. The tool is published."}
