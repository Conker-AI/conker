"""Chat context settings from the CLI: rules, instructions, budget, summary and fork."""

import copy
import json
import uuid
from pathlib import Path
from urllib.error import HTTPError

from conker_inputs import identity, read_text

SESSION = r"[A-Za-z0-9_-]{1,128}"
MESSAGE = r"[A-Za-z0-9_-]{1,200}"
RULES = {
    "pin": "keep-exact",
    "exclude": "exclude",
    "retrieve": "retrieve",
    "summarize": "allow-summary",
}
BUDGET_RULE = (
    "Use a window of 2-10000000 tokens, a reserve of at least 1 that is smaller "
    "than the window, and other input of 0 or more."
)
NO_SETTINGS = "This chat has no context settings yet. Start with: context budget SESSION --window N --reserve N"


def register(commands):
    """Register the context parser and its subcommands."""
    context = commands.add_parser(
        "context", help="Read and change one chat's context settings"
    )
    subparsers = context.add_subparsers(dest="operation", required=True)

    show = subparsers.add_parser(
        "show", help="Show current context settings and summary"
    )
    show.add_argument("session")

    rule = subparsers.add_parser("rule", help="Set or clear a message's context rule")
    rule.add_argument("session")
    rule.add_argument("message")
    rule.add_argument(
        "rule", choices=["pin", "exclude", "retrieve", "summarize", "clear"]
    )

    instructions = subparsers.add_parser(
        "instructions", help="Set session instructions"
    )
    instructions.add_argument("session")
    instructions.add_argument("file", nargs="?", type=Path)
    instructions.add_argument("--clear", action="store_true")

    budget = subparsers.add_parser("budget", help="Set context budget limits")
    budget.add_argument("session")
    budget.add_argument("--window", type=int, required=True)
    budget.add_argument("--reserve", type=int, required=True)
    budget.add_argument("--other", type=int, default=None)

    summary_edit = subparsers.add_parser("summary-edit", help="Edit the chat summary")
    summary_edit.add_argument("session")
    summary_edit.add_argument("file", type=Path)

    summary_restore = subparsers.add_parser(
        "summary-restore", help="Restore a previous summary version"
    )
    summary_restore.add_argument("session")
    summary_restore.add_argument("revision", type=int)

    fork = subparsers.add_parser("fork", help="Create a new chat from a summary")
    fork.add_argument("session")
    fork.add_argument("file", type=Path)
    fork.add_argument("--request-id")


def pi_call(request, config, path, body=None):
    """Make a Pi service call with consistent error handling."""
    try:
        return request(config, "pi", path, body, timeout=660)
    except HTTPError as exc:
        if 400 <= exc.code <= 499:
            try:
                raw = exc.read(8192)
                exc.close()
                body = json.loads(raw.decode("utf-8", errors="replace"))
            except (json.JSONDecodeError, UnicodeDecodeError, OSError):
                raise ValueError(f"Pi refused this (HTTP {exc.code}).") from None

            detail = body.get("detail") if isinstance(body, dict) else None
            if detail is not None:
                if isinstance(detail, dict):
                    code = detail.get("code")
                    message = detail.get("message")
                    if (
                        isinstance(code, str)
                        and isinstance(message, str)
                        and code
                        and message
                    ):
                        raise ValueError(
                            f"Pi refused this ({code}): {message}"
                        ) from None
                elif isinstance(detail, str) and detail and len(detail) <= 300:
                    raise ValueError(f"Pi refused this: {detail}") from None

            raise ValueError(f"Pi refused this (HTTP {exc.code}).") from None
        raise


def _file_text(path, label, limit_message):
    """Read file text with size limit and strip exactly one trailing line ending."""
    text = read_text(path, 64000, label)
    if text.endswith("\r\n"):
        text = text[:-2]
    elif text.endswith("\n"):
        text = text[:-1]
    if len(text) > 16000:
        raise ValueError(limit_message)
    return text


def operation(args, config, request):
    """Run one context subcommand and return the value to print."""
    if args.operation == "show":
        policy = pi_call(request, config, f"/context/{args.session}")
        summary = pi_call(request, config, f"/context/{args.session}/summary")
        return {"context": policy, "summary": summary}

    elif args.operation == "rule":
        identity(args.message, MESSAGE, "message identity")
        policy_response = pi_call(request, config, f"/context/{args.session}")
        if policy_response.get("policy") is None:
            raise ValueError(NO_SETTINGS)

        policy = copy.deepcopy(policy_response["policy"])
        revision = policy_response["revision"]
        message_policies = policy.get("messagePolicies", {})

        if args.rule == "clear":
            if args.message not in message_policies:
                raise ValueError("That message has no context rule.")
            del message_policies[args.message]
        else:
            message_policies[args.message] = RULES[args.rule]

        policy["messagePolicies"] = message_policies
        body = {"expected_revision": revision, "policy": policy}
        return pi_call(request, config, f"/context/{args.session}", body)

    elif args.operation == "instructions":
        if args.file and args.clear:
            raise ValueError("Give an instructions file or --clear.")
        if not args.file and not args.clear:
            raise ValueError("Give an instructions file or --clear.")

        if args.clear:
            text = ""
        else:
            text = _file_text(
                args.file,
                "Instructions file",
                "Session instructions are limited to 16000 characters.",
            )

        policy_response = pi_call(request, config, f"/context/{args.session}")
        if policy_response.get("policy") is None:
            raise ValueError(NO_SETTINGS)

        policy = copy.deepcopy(policy_response["policy"])
        policy["sessionInstructions"] = text
        body = {"expected_revision": policy_response["revision"], "policy": policy}
        return pi_call(request, config, f"/context/{args.session}", body)

    elif args.operation == "budget":
        if not (2 <= args.window <= 10000000):
            raise ValueError(BUDGET_RULE)
        if args.reserve < 1 or args.reserve >= args.window:
            raise ValueError(BUDGET_RULE)
        if args.other is not None and args.other < 0:
            raise ValueError(BUDGET_RULE)

        policy_response = pi_call(request, config, f"/context/{args.session}")
        policy = policy_response.get("policy")

        if policy is None:
            policy = {
                "sessionInstructions": "",
                "messagePolicies": {},
                "budget": {
                    "contextWindowTokens": args.window,
                    "outputReserveTokens": args.reserve,
                    "otherInputTokens": 0 if args.other is None else args.other,
                },
            }
        else:
            policy = copy.deepcopy(policy)
            budget = policy["budget"]
            budget["contextWindowTokens"] = args.window
            budget["outputReserveTokens"] = args.reserve
            if args.other is not None:
                budget["otherInputTokens"] = args.other
            policy["budget"] = budget

        body = {"expected_revision": policy_response["revision"], "policy": policy}
        return pi_call(request, config, f"/context/{args.session}", body)

    elif args.operation == "summary-edit":
        text = _file_text(
            args.file, "Summary file", "Summaries are limited to 16000 characters."
        )

        summary_response = pi_call(request, config, f"/context/{args.session}/summary")
        body = {"expected_revision": summary_response["revision"], "summary": text}
        return pi_call(request, config, f"/context/{args.session}/summary", body)

    elif args.operation == "summary-restore":
        if args.revision < 0:
            raise ValueError("Revision must be 0 or greater.")

        summary_response = pi_call(request, config, f"/context/{args.session}/summary")
        versions = summary_response.get("versions", [])

        if not any(v.get("revision") == args.revision for v in versions):
            raise ValueError("That summary version does not exist.")

        body = {
            "expected_revision": summary_response["revision"],
            "revision": args.revision,
        }
        return pi_call(
            request, config, f"/context/{args.session}/summary/restore", body
        )

    elif args.operation == "fork":
        text = _file_text(
            args.file, "Summary file", "Summaries are limited to 16000 characters."
        )

        request_id = args.request_id
        if request_id:
            identity(request_id, r"[A-Za-z0-9_-]{16,128}", "fork request identity")
        else:
            request_id = "fork_" + uuid.uuid4().hex

        policy_response = pi_call(request, config, f"/context/{args.session}")
        if policy_response["revision"] == 0:
            raise ValueError("Fork needs saved context settings; set them first.")

        session_response = pi_call(request, config, f"/sessions/{args.session}")
        messages = session_response.get("messages", [])
        last_message_id = messages[-1]["id"] if messages else None

        body = {
            "expected_revision": policy_response["revision"],
            "expected_last_message_id": last_message_id,
            "summary": text,
            "request_id": request_id,
        }
        response = pi_call(request, config, f"/context/{args.session}/fork", body)
        response["request_id"] = request_id
        return response

    else:
        raise ValueError(f"Unknown context operation: {args.operation}")
