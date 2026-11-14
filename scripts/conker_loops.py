"""conker loops: promises across chats (Pi's open loops), listed, filed and closed from the CLI.

Pi routes: GET /open-loops, POST /open-loops, POST /open-loops/{id}/state (Conker-AI/pi, docs
open-loops.md). Pi checks every value; this module only shapes the call and prints the page.
"""

import re
from datetime import date

from conker_context import pi_call

LOOP_ID = r"loop_[0-9a-f]{32}"
SESSION = r"[A-Za-z0-9_-]{1,128}"
MESSAGE = r"[A-Za-z0-9_-]{1,200}"
STATES = {"done": "done", "drop": "dropped", "reopen": "open"}


def _date(value: str) -> str:
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError:
        raise ValueError(f"Give the date as YYYY-MM-DD, not {value!r}.") from None


def register(commands):
    """Register `conker loops list|add|done|drop|reopen`."""
    loops = commands.add_parser("loops", help="Promises across chats: who promised, by when")
    verbs = loops.add_subparsers(dest="operation", required=True)
    listed = verbs.add_parser("list", help="Open promises, soonest due first, undated last")
    which = listed.add_mutually_exclusive_group()
    which.add_argument("--done", action="store_true", help="Only the ones marked done")
    which.add_argument("--dropped", action="store_true", help="Only the dropped ones")
    which.add_argument("--all", action="store_true", help="Every state")
    listed.add_argument("--due-before", help="Only dated ones due before this day (YYYY-MM-DD)")
    listed.add_argument(
        "--limit", type=int, default=50, help="How many to show, 1 to 100 (default 50)"
    )
    listed.add_argument("--after", help="The page cursor the previous page printed")
    listed.add_argument("--json", action="store_true", help="Print Pi's reply as JSON")
    add = verbs.add_parser("add", help="File a promise for a chat")
    add.add_argument("session", help="The chat it belongs to")
    add.add_argument("text", help="What was promised, 1-500 characters")
    add.add_argument(
        "--by", choices=["owner", "conker"], default="owner", help="Who promised (default you)"
    )
    add.add_argument("--due", help="Due date, YYYY-MM-DD in your time zone")
    add.add_argument("--message", help="The chat message it came from")
    for verb, words in (
        ("done", "Mark a promise done"),
        ("drop", "Drop a promise (not one, or no longer)"),
        ("reopen", "Open a promise again"),
    ):
        verbs.add_parser(verb, help=words).add_argument("loop", help="Its id, loop_...")


def list_query(args):
    """Pi's /open-loops query for the flags; only what was given beyond the state."""
    if not 1 <= args.limit <= 100:
        raise ValueError("--limit must be from 1 to 100.")
    state = "done" if args.done else "dropped" if args.dropped else "all" if args.all else "open"
    query = {"state": state, "limit": args.limit}
    if args.due_before is not None:
        query["due_before"] = _date(args.due_before)
    if args.after is not None:
        if not re.fullmatch(LOOP_ID, args.after.strip()):
            raise ValueError("Use the --after value the previous page printed.")
        query["after"] = args.after.strip()
    return query


def render(page):
    """A header, one line per loop, then how to get the next page."""
    count = len(page["items"])
    lines = [f"{count} shown; today is {page['today']} ({page['timeZone']})."]
    for item in page["items"]:
        due = item["dueOn"] or "undated"
        mark = "  OVERDUE" if item["overdue"] else ""
        state = "" if item["state"] == "open" else f"  [{item['state']}]"
        title = item["sessionTitle"] or item["sessionId"]
        text = " ".join(item["text"].split())
        lines.append(
            f"{due:<10}  {item['promisedBy']:<6}  {text}{mark}{state}  ({item['id']} in {title})"
        )
    if page.get("nextAfter"):
        lines.append(f"Next page: --after {page['nextAfter']}")
    return "\n".join(lines)


def _add_body(args):
    text = args.text.strip()
    if not 1 <= len(text) <= 500:
        raise ValueError("Give the promise as 1-500 characters.")
    if not re.fullmatch(SESSION, args.session):
        raise ValueError("Use a chat identity (letters, digits, - and _).")
    body = {"session_id": args.session, "text": text, "promised_by": args.by}
    if args.due is not None:
        body["due_on"] = _date(args.due)
    if args.message is not None:
        if not re.fullmatch(MESSAGE, args.message):
            raise ValueError("Use a message identity (letters, digits, - and _).")
        body["message_id"] = args.message
    return body


def operation(args, config, request):
    """Run one loops verb; returns the value to print, or None when it printed itself."""
    if args.operation == "list":
        page = pi_call(request, config, "/open-loops", query=list_query(args))
        if args.json:
            return page
        print(render(page))
        return None
    if args.operation == "add":
        return pi_call(request, config, "/open-loops", _add_body(args))
    if not re.fullmatch(LOOP_ID, args.loop):
        raise ValueError("Use a loop identity (loop_ followed by 32 hex digits).")
    path = f"/open-loops/{args.loop}/state"
    return pi_call(request, config, path, {"state": STATES[args.operation]})
