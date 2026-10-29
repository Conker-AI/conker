"""conker tool draft: describe a tool in words; Pi drafts it in the background (contract C4).

`POST /tool-drafts` files a tool request at once. Pi's drafting worker drafts it with the drafting
model role, checks it with ToolGate and repairs it, and the request becomes ready or failed. This
command waits for that and prints the steps and any issues, or the reason it failed (--no-wait
returns as soon as the request is filed). The draft then waits in the Inbox, the same card a chat
request makes: nothing is saved in Tools, published or run from here.

It is shared by the development CLI (scripts/conker.py) and the installed launcher
(scripts/tool_draft_cli.py); each passes its own way of calling Pi.
"""

from __future__ import annotations

import json
import re
import sys
import time
import uuid

REQUEST_ID = re.compile(r"[A-Za-z0-9_.:-]{16,128}")
CHANGE_REQUEST = re.compile(r"creq_[a-f0-9]{32}")
WAIT = 1800  # seconds; a small local model can take many minutes for one draft
INTERVAL = 3
STILL_DRAFTING = 3  # exit code: the draft is not finished yet; it will be in the Inbox
# Terminal control characters (C0 except tab and newline, DEL, C1) in text from a model.
CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f-\x9f]")


def register(commands):
    tool = commands.add_parser("tool", help="Have Conker make a tool")
    operations = tool.add_subparsers(dest="operation", required=True)
    draft = operations.add_parser(
        "draft",
        help="Describe a tool; Pi drafts it in the background and it waits in the Inbox",
    )
    draft.add_argument("description", help="What the tool should do, in your words")
    draft.add_argument(
        "--no-wait",
        action="store_true",
        help="Return once the request is filed; the draft appears in the Inbox when ready",
    )
    draft.add_argument(
        "--request-id",
        help="Repeat an earlier request whose answer was lost; the same id files nothing new",
    )
    draft.add_argument(
        "--timeout",
        type=int,
        default=WAIT,
        help=f"Seconds to wait for the draft (default {WAIT})",
    )
    draft.add_argument("--json", action="store_true", help="Print the request as JSON")


def status(request: dict) -> str:
    """drafting, ready or failed. A request filed before background drafting counts as ready."""
    value = (request.get("payload") or {}).get("status") or "ready"
    if value not in {"drafting", "ready", "failed"}:
        raise ValueError(f"Pi answered with an unknown draft status: {value!r}.")
    return value


def clean(text) -> str:
    """Model text, with control characters shown as escapes instead of driving the terminal."""
    return CONTROL.sub(lambda m: f"\\x{ord(m.group()):02x}", str(text))


def checked(request) -> dict:
    if (
        not isinstance(request, dict)
        or not CHANGE_REQUEST.fullmatch(str(request.get("id", "")))
        or request.get("kind") != "tool_draft"
    ):
        raise ValueError("Pi did not answer with a tool request.")
    return request


def render(request: dict) -> str:
    payload = request.get("payload") or {}
    state = status(request)
    lines = [f"{clean(request.get('title', 'Tool request'))}  ({request['id']})"]
    if state == "drafting":
        lines.append("Drafting. It will be in the Inbox when it is ready.")
    elif state == "failed":
        lines.append(
            "The draft failed: " + clean(payload.get("error") or "no reason given.")
        )
        lines.append("Try it again from its Inbox card, or describe it again here.")
    else:
        steps = payload.get("steps") or []
        lines.append("Steps:" if steps else "No steps were drafted.")
        lines.extend(
            f"  {number}. {clean(step)}" for number, step in enumerate(steps, 1)
        )
        issues = payload.get("issues") or []
        if issues:
            lines.append("Issues:")
            for issue in issues:
                text = issue.get("message", issue) if isinstance(issue, dict) else issue
                lines.append(f"  - {clean(text)}")
        if payload.get("note"):
            lines.append(clean(payload["note"]))
        lines.append(
            "It is in the Inbox: review it there, then save or publish it in Tools."
        )
    return "\n".join(lines)


def start(call, description: str, request_id: str) -> dict:
    """File the request. The same request_id gives back the same request, never a second one."""
    text = description.strip()
    if not 1 <= len(text) <= 4000:
        raise ValueError("Describe the tool in 1 to 4,000 characters.")
    if not REQUEST_ID.fullmatch(request_id):
        raise ValueError(
            "Use a request id of 16-128 letters, digits, '_', '.', ':' or '-'."
        )
    return checked(
        call("POST", "/tool-drafts", {"description": text, "request_id": request_id})
    )


def wait(
    call,
    request: dict,
    *,
    timeout: float,
    interval: float = INTERVAL,
    clock=time.monotonic,
    sleep=time.sleep,
) -> dict:
    """The request once it is ready or failed, or as it stands when the time is up."""
    deadline = clock() + timeout
    while status(request) == "drafting" and clock() < deadline:
        sleep(interval)
        request = checked(call("GET", f"/change-requests/{request['id']}", None))
    return request


def run(call, args, *, emit=print, clock=time.monotonic, sleep=time.sleep) -> int:
    """0 ready (or filed, with --no-wait), 1 failed, 3 still drafting when the time ran out."""
    if args.timeout < 0:
        raise ValueError("Use a timeout of 0 seconds or more.")
    request_id = args.request_id or "tooldraft_" + uuid.uuid4().hex
    try:
        request = start(call, args.description, request_id)
    except OSError:
        raise OSError(
            "Pi did not confirm the request. Run the same command again with "
            f"--request-id {request_id}: it files nothing twice."
        ) from None
    if not args.no_wait:
        try:
            request = wait(
                call, request, timeout=args.timeout, clock=clock, sleep=sleep
            )
        except OSError:
            raise OSError(
                f"Pi stopped answering while the tool was drafting. Request {request['id']} "
                "goes on in the Inbox."
            ) from None
    emit(
        json.dumps(request, indent=2, ensure_ascii=False)
        if args.json
        else render(request)
    )
    state = status(request)
    if state == "failed":
        return 1
    return STILL_DRAFTING if state == "drafting" and not args.no_wait else 0


def emit(text: str) -> None:
    """Print text; characters the output cannot encode (a redirected Windows pipe) are replaced."""
    encoding = sys.stdout.encoding or "utf-8"
    print(text.encode(encoding, errors="replace").decode(encoding))
