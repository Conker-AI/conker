"""conker prompt enhance: Jev rewrites an unsent draft into a clearer prompt (Pi's prompt enhance).

Pi route: POST /prompts/enhance (Conker-AI/pi, docs prompt-enhance.md). Pi owns the rules: one
model call on the drafting model, counted by the daily spending cap, nothing saved or sent. This
module only shapes the call and prints the rewrite, so the owner can copy it into a chat.
"""

import json
import re
from urllib.error import HTTPError

from scripts.conker_context import pi_call

TEXT_LIMIT = 8000
CHAT = r"ses_[0-9a-f]{16}"


def register(commands):
    """Register `conker prompt enhance TEXT [--template ID] [--chat CHAT_ID] [--json]`."""
    prompt = commands.add_parser("prompt", help="Rewrite a draft into a clearer prompt")
    verbs = prompt.add_subparsers(dest="operation", required=True)
    enhance = verbs.add_parser("enhance", help="Rewrite a draft with Jev; nothing is sent or saved")
    enhance.add_argument("text", help="Your draft, 1-8000 characters")
    enhance.add_argument(
        "--template", help="A prompt template id (Pi does not offer templates yet and refuses one)"
    )
    enhance.add_argument("--chat", help="The chat the draft is for, so its privacy applies")
    enhance.add_argument("--json", action="store_true", help="Print Pi's reply as JSON")


def enhance_body(args):
    """Pi's request body for the flags; Pi checks every value again."""
    text = args.text.strip()
    if not text:
        raise ValueError("Give the draft as text.")
    if len(text) > TEXT_LIMIT:
        raise ValueError(f"The draft is too long: {len(text)} characters, at most {TEXT_LIMIT}.")
    body = {"text": args.text}
    if args.chat is not None:
        if not re.fullmatch(CHAT, args.chat):
            raise ValueError("Use a chat identity (ses_ followed by 16 hex digits).")
        body["sessionId"] = args.chat
    if args.template is not None:
        body["templateId"] = args.template
    return body


def render(reply):
    """The rewritten prompt, then what Jev changed and which model wrote it."""
    lines = [reply["text"]]
    if reply["notes"]:
        lines += ["", "What changed:"] + [f"- {note}" for note in reply["notes"]]
    lines += ["", f"Written by {reply['modelId']}. Nothing was sent or saved."]
    return "\n".join(lines)


def _refused(exc):
    """Pi's own words for a refusal. pi_call words 4xx replies, but this route also refuses with
    503 (daily cap reached, no model, model down) and 502 (unusable answer); nothing was sent or
    saved, so the owner is told why instead of "not confirmed"."""
    try:
        detail = json.loads(exc.read(8192).decode("utf-8", errors="replace")).get("detail")
    except (ValueError, AttributeError, OSError):
        detail = None
    finally:
        exc.close()
    if isinstance(detail, dict) and isinstance(detail.get("message"), str):
        return ValueError(f"Pi refused this ({detail.get('code')}): {detail['message']}")
    return ValueError(f"Pi refused this (HTTP {exc.code}).")


def operation(args, config, request):
    """Run `prompt enhance`; returns the value to print, or None when it printed itself."""

    def asking(*call, **options):
        try:
            return request(*call, **options)
        except HTTPError as exc:
            if exc.code < 500:
                raise
            raise _refused(exc) from None

    reply = pi_call(asking, config, "/prompts/enhance", enhance_body(args))
    if args.json:
        return reply
    print(render(reply))
    return None
