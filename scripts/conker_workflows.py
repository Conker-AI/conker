"""conker workflow: describe a workflow in words, review the draft, then publish it.

Pi's talking model drafts (POST /workflow-drafts/draft). ToolGate stores the draft in its editor
and validates it. Nothing is published or run until the owner runs `conker workflow publish`.
"""

from __future__ import annotations

import json
import re
import sys
from urllib.error import HTTPError

DRAFT_ID = re.compile(r"[a-zA-Z][a-zA-Z0-9_-]{0,63}")
EDITOR = "/v2/owner/editor-drafts/"
QUESTIONS = 4  # rounds of builder questions before asking for a fuller description
REPAIRS = 2  # rounds of fixing what Pi or ToolGate found wrong
CAPABILITIES = 200


def register(commands):
    workflow = commands.add_parser(
        "workflow", help="Draft a workflow from a description, review it and publish it"
    )
    operations = workflow.add_subparsers(dest="operation", required=True)
    draft = operations.add_parser(
        "draft", help="Describe a workflow; the talking model drafts it for review"
    )
    draft.add_argument("description", help="What the workflow should do, in your words")
    draft.add_argument(
        "--id",
        help="Draft id (letters, digits, - and _); made from its name if omitted",
    )
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
        help="The revision you reviewed, from show or draft",
    )
    publish.add_argument(
        "--authorization",
        choices=["owner_confirmation", "auto"],
        default="owner_confirmation",
        help="owner_confirmation (default) asks you before each run; auto runs without asking",
    )


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
        return ValueError(
            f"{service} refused this ({detail.get('code')}): {detail['message']}"
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


def ask(question: str) -> str:
    if not sys.stdin.isatty():
        return ""
    print(question, file=sys.stderr)
    try:
        return input("> ").strip()
    except EOFError:
        return ""


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
                        "kind": kind,
                        "name": item["name"],
                        "description": item.get("description", ""),
                        "inputs": [
                            field
                            for field in item.get("inputs", [])
                            if field.get("name")
                        ],
                        "version": max(1, int(item.get("version") or 1)),
                    }
                )
            after = page.get("next_after")
            if not after:
                break
    return found[:CAPABILITIES]


def steps(document: dict) -> list[str]:
    lines = []
    for node in document["nodes"]:
        config = node["config"]
        target = {
            "tool_call": f" -> tool {config.get('tool')}",
            "workflow_call": f" -> workflow {config.get('toolId')} v{config.get('version')}",
        }.get(node["type"], "")
        lines.append(f"{node['label']} ({node['type']}){target}")
    return lines


def exists(request, config, identity: str) -> bool:
    try:
        request(config, "toolgate-owner", EDITOR + identity)
    except HTTPError as exc:
        if exc.code == 404:
            exc.close()
            return False
        raise refusal(exc, "ToolGate") from None
    return True


def draft(args, config, request, answer=ask) -> dict:
    if args.id is not None and not DRAFT_ID.fullmatch(args.id):
        raise ValueError(
            "A draft id starts with a letter and uses letters, digits, - and _."
        )
    available = capabilities(request, config)
    if not available:
        raise ValueError(
            "ToolGate lists no active tools or published workflows to build from."
        )
    body = {"description": args.description, "capabilities": available}
    if args.id:
        body["draftId"] = args.id
    conversation = []
    for _ in range(QUESTIONS + 1):
        result = call(
            request,
            config,
            "pi",
            "/workflow-drafts/draft",
            {**body, "conversation": conversation},
        )
        if result["ready"]:
            break
        reply = answer(result["reply"])
        if not reply:
            raise ValueError(
                f"The builder asks: {result['reply']} Add the answer to your description and run it again."
            )
        conversation += [
            {"role": "builder", "content": result["reply"][:4000]},
            {"role": "owner", "content": reply[:4000]},
        ]
    else:
        raise ValueError(
            "The builder still has questions. Describe the workflow in more detail."
        )
    document, issues = result["document"], result["issues"]
    identity = document["id"]
    if exists(request, config, identity):
        raise ValueError(
            f"A draft named {identity} already exists. Choose another with --id."
        )
    revision = 0
    for attempt in range(REPAIRS + 1):
        if not issues:
            saved = call(
                request,
                config,
                "toolgate-owner",
                EDITOR + identity,
                {"expected_revision": revision, "document": document},
                changes=True,
            )
            revision = saved["revision"]
            check = call(
                request, config, "toolgate-owner", EDITOR + identity + "/validation"
            )
            issues = [item["message"] for item in check["issues"]]
        if not issues or attempt == REPAIRS:
            break
        repair = call(
            request,
            config,
            "pi",
            "/workflow-drafts/draft",
            {
                **body,
                "draftId": identity,
                "conversation": conversation,
                "previous": document,
                "issues": issues[:20],
            },
        )
        if not repair["ready"]:
            break
        result, document, issues = repair, repair["document"], repair["issues"]
    valid = revision > 0 and not issues
    return {
        "draft": identity,
        "saved": revision > 0,
        "revision": revision,
        "valid": valid,
        "summary": result["reply"],
        "name": document["name"],
        "effect": document["effect"],
        "inputs": [field["name"] for field in document["inputs"]],
        "steps": steps(document),
        "issues": issues,
        "modelId": result["modelId"],
        "next": (
            f"Review it, then: conker workflow publish {identity} --expected-revision {revision}"
            if valid
            else "Fix it in the workflow editor, or describe it again with more detail."
        ),
    }


def workflow_operation(args, config, request) -> dict:
    if args.operation == "draft":
        return draft(args, config, request)
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
        return {
            "draft": args.id,
            "revision": record["revision"],
            "name": document["name"],
            "description": document["description"],
            "effect": document["effect"],
            "agentVisible": document["agentVisible"],
            "inputs": document["inputs"],
            "outputs": document["outputs"],
            "steps": steps(document),
            "nodes": document["nodes"],
            "valid": check["graph_valid"],
            "issues": [item["message"] for item in check["issues"]],
            "publications": published,
        }
    published = call(request, config, "toolgate-owner", path + "/publications")["items"]
    return call(
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
