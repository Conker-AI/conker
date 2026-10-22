"""conker workflow: describe a workflow in words, review the draft, then publish it.

Pi's talking model drafts (POST /workflow-drafts/draft). ToolGate stores the draft in its editor
and validates it. Nothing is published or run until the owner runs `conker workflow publish`.
"""

from __future__ import annotations

import json
import re
import sys
from types import SimpleNamespace
from urllib.error import HTTPError

DRAFT_ID = re.compile(r"[a-zA-Z][a-zA-Z0-9_-]{0,63}")
CHAT_ID = re.compile(r"[A-Za-z0-9_-]{1,128}")
PROPOSAL_ID = re.compile(r"wfp_[0-9a-f]{32}")
EDITOR = "/v2/owner/editor-drafts/"
QUESTIONS = 4  # rounds of builder questions before asking for a fuller description
REPAIRS = 2  # rounds of fixing what Pi or ToolGate found wrong
CAPABILITIES = 200
TOOLS = 8  # matching tools sent to the model; a small local model reads about 20 tokens a second
STOP = {
    "the",
    "and",
    "for",
    "with",
    "from",
    "that",
    "this",
    "then",
    "into",
    "when",
    "what",
    "your",
    "you",
    "are",
    "was",
    "its",
    "all",
    "any",
    "get",
    "give",
    "gives",
    "return",
    "returns",
    "find",
    "found",
    "list",
    "show",
    "tell",
    "make",
    "use",
    "using",
    "each",
    "every",
    "about",
}
# Terminal control characters (C0 except tab and newline, DEL, C1) in text from a model.
CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f-\x9f]")


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
        "--all-tools",
        action="store_true",
        help="Offer every tool to the model, not only the ones matching the description",
    )
    draft.add_argument(
        "--id",
        help="Draft id (letters, digits, - and _); made from its name if omitted",
    )
    chat = operations.add_parser(
        "from-chat",
        help="Turn one of your chat messages into a workflow draft; it waits in the Inbox",
    )
    chat.add_argument("session", help="The chat")
    chat.add_argument("message", help="Your message in it, as show lists it")
    chat.add_argument("--id", help="Draft id; made from its name if omitted")
    chat.add_argument(
        "--all-tools", action="store_true", help="Offer every tool to the model"
    )
    dismiss = operations.add_parser(
        "dismiss",
        help="Take a draft made from chat out of the Inbox without publishing",
    )
    dismiss.add_argument("proposal", help="The Inbox item's id (wfp_...)")
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


def builder(request, config, body: dict) -> dict:
    """One draft from Pi. Output the model mangled is retried once, telling it what was wrong."""
    try:
        return call(request, config, "pi", "/workflow-drafts/draft", body)
    except Refused as exc:
        if exc.code != "unusable":
            raise
        retry = {**body, "issues": [*body.get("issues", []), str(exc)][-20:]}
        return call(request, config, "pi", "/workflow-drafts/draft", retry)


def ask(question: str) -> str:
    if not sys.stdin.isatty():
        return ""
    # Model text: show control characters as escapes rather than let them drive the terminal.
    print(CONTROL.sub(lambda m: f"\\x{ord(m.group()):02x}", question), file=sys.stderr)
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
                        "authorization": str(item.get("authorization") or "auto"),
                    }
                )
            after = page.get("next_after")
            if not after:
                break
    return found[:CAPABILITIES]


def words(text: str) -> set[str]:
    """Lowercase word stems: `disks` and `disk` match, short and common words do not count."""
    found = set()
    for word in re.findall(r"[a-z0-9]+", text.lower()):
        word = word[:-1] if len(word) > 4 and word.endswith("s") else word
        if len(word) >= 3 and word not in STOP:
            found.add(word)
    return found


def relevant(available: list[dict], text: str, limit: int = TOOLS) -> list[dict]:
    """The capabilities whose id, name, description or inputs share words with the request.

    The model reads every capability it is offered; a slow local model cannot read all of them
    within Pi's time limit. When nothing matches, every capability is offered.
    """
    wanted = words(text)
    vocabulary = [
        words(" ".join([item["id"], item["name"], item["description"]]))
        | words(" ".join(field["name"] for field in item["inputs"]))
        for item in available
    ]
    # A word most tools share ("search") says less than one only a few have ("web").
    spread = {word: sum(word in own for own in vocabulary) for word in wanted}
    scored = []
    for index, (item, own) in enumerate(zip(available, vocabulary, strict=True)):
        if shared := wanted & own:
            scored.append((-sum(1 / spread[word] for word in shared), index, item))
    return [item for *_, item in sorted(scored)[:limit]] or available


def compact(item: dict) -> dict:
    """What the model needs from a capability, in fewer words; never its authorization."""
    return {
        "id": item["id"],
        "kind": item["kind"],
        "name": item["name"],
        "description": item["description"][:240],
        "inputs": [
            {
                **{
                    key: field[key]
                    for key in ("name", "type", "required")
                    if key in field
                },
                "description": str(field.get("description", ""))[:100],
            }
            for field in item["inputs"]
        ],
        "version": item["version"],
    }


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
    """A validation issue, naming its step so the builder knows where to look."""
    step = issue.get("node_id")
    return f"Step {step}: {issue['message']}" if step else issue["message"]


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
    offered = available if args.all_tools else relevant(available, args.description)
    asks = {item["id"] for item in available if item["authorization"] != "auto"}
    body = {
        "description": args.description,
        "capabilities": [compact(item) for item in offered],
    }
    if args.id:
        body["draftId"] = args.id
    conversation = []
    for _ in range(QUESTIONS + 1):
        result = builder(request, config, {**body, "conversation": conversation})
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
            issues = [problem(item) for item in check["issues"]]
        if not issues or attempt == REPAIRS:
            break
        repair = builder(
            request,
            config,
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
        "steps": steps(document, asks),
        "toolsOffered": len(offered),
        "issues": issues,
        "modelId": result["modelId"],
        "next": (
            f"Review it, then: conker workflow publish {identity} --expected-revision {revision}"
            if valid
            else "Fix it in the workflow editor, or describe it again with more detail."
        ),
    }


def from_chat(args, config, request, answer=ask) -> dict:
    """Draft from one of the owner's own messages, then record it for the Inbox."""
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
    request_args = SimpleNamespace(
        description=text.strip(), id=args.id, all_tools=args.all_tools
    )
    result = draft(request_args, config, request, answer)
    if result["saved"]:
        result["inbox"] = call(
            request,
            config,
            "pi",
            "/workflow-proposals",
            {
                "sessionId": args.session,
                "messageId": args.message,
                "draftId": result["draft"],
                "name": result["name"][:100],
                "valid": result["valid"],
            },
            changes=True,
        )
    return result


def workflow_operation(args, config, request) -> dict:
    if args.operation == "draft":
        return draft(args, config, request)
    if args.operation == "from-chat":
        return from_chat(args, config, request)
    if args.operation == "dismiss":
        if not PROPOSAL_ID.fullmatch(args.proposal):
            raise ValueError("Use an Inbox item id that starts with wfp_.")
        return call(
            request,
            config,
            "pi",
            f"/workflow-proposals/{args.proposal}/dismiss",
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
    try:
        result["inbox"] = call(
            request,
            config,
            "pi",
            "/workflow-proposals/published",
            {"draftId": args.id},
            changes=True,
        )
    except (ValueError, OSError):
        # Published either way; only the Inbox item may stay until it is dismissed by hand.
        result["inbox"] = {
            "closed": None,
            "note": "Pi did not confirm the Inbox update.",
        }
    return result
