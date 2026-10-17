"""Chat context settings from the CLI: rules, instructions, budget, summary and fork."""

import json
import uuid
from pathlib import Path
from urllib.error import HTTPError

from conker_inputs import identity, read_text

SESSION = r"[A-Za-z0-9_-]{1,128}"
MESSAGE = r"[A-Za-z0-9_-]{1,200}"
RULES = {"pin": "keep-exact", "exclude": "exclude", "retrieve": "retrieve", "summarize": "allow-summary"}
NO_SETTINGS = "This chat has no context settings yet. Start with: context budget SESSION --window N --reserve N"


def register(commands):
    """Register the context parser and its subcommands."""
    context = commands.add_parser("context", help="Read and change one chat's context settings")
    subparsers = context.add_subparsers(dest="operation", required=True)
    
    # Show command
    show = subparsers.add_parser("show", help="Show current context settings and summary")
    show.add_argument("session")
    
    # Rule command
    rule = subparsers.add_parser("rule", help="Set or clear a message's context rule")
    rule.add_argument("session")
    rule.add_argument("message")
    rule.add_argument("rule", choices=["pin", "exclude", "retrieve", "summarize", "clear"])
    
    # Instructions command
    instructions = subparsers.add_parser("instructions", help="Set session instructions")
    instructions.add_argument("session")
    instructions.add_argument("file", nargs="?", type=Path)
    instructions.add_argument("--clear", action="store_true")
    
    # Budget command
    budget = subparsers.add_parser("budget", help="Set context budget limits")
    budget.add_argument("session")
    budget.add_argument("--window", type=int, required=True)
    budget.add_argument("--reserve", type=int, required=True)
    budget.add_argument("--other", type=int, default=0)
    
    # Summary edit command
    summary_edit = subparsers.add_parser("summary-edit", help="Edit the chat summary")
    summary_edit.add_argument("session")
    summary_edit.add_argument("file", type=Path)
    
    # Summary restore command
    summary_restore = subparsers.add_parser("summary-restore", help="Restore a previous summary version")
    summary_restore.add_argument("session")
    summary_restore.add_argument("revision", type=int)
    
    # Fork command
    fork = subparsers.add_parser("fork", help="Create a new chat from a summary")
    fork.add_argument("session")
    fork.add_argument("file", type=Path)
    fork.add_argument("--request-id")


def _pi_request_wrapper(request, config, service, path, body=None, *, timeout=660):
    """Wrap Pi request calls to handle HTTP errors consistently."""
    try:
        return request(config, service, path, body, timeout=timeout)
    except HTTPError as exc:
        if 400 <= exc.code <= 499:
            try:
                raw = exc.read(8192)
                exc.close()
                error_body = json.loads(raw.decode("utf-8", errors="replace"))
                detail = error_body.get("detail", {})
                code = detail.get("code")
                message = detail.get("message")
                if code and message:
                    raise ValueError(f"Pi refused this ({code}): {message}") from None
            except (json.JSONDecodeError, UnicodeDecodeError, OSError):
                pass
            raise ValueError(f"Pi refused this (HTTP {exc.code}).") from None
        raise


def operation(args, config, request):
    """Run one context subcommand and return the value to print."""
    # Validate session ID for all operations
    identity(args.session, SESSION, "chat identity")
    
    if args.operation == "show":
        policy = _pi_request_wrapper(request, config, "pi", f"/context/{args.session}")
        summary = _pi_request_wrapper(request, config, "pi", f"/context/{args.session}/summary")
        return {"context": policy, "summary": summary}
    
    elif args.operation == "rule":
        identity(args.message, MESSAGE, "message identity")
        policy_response = _pi_request_wrapper(request, config, "pi", f"/context/{args.session}")
        if policy_response.get("policy") is None:
            raise ValueError(NO_SETTINGS)

        policy = policy_response["policy"].copy()
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
        return _pi_request_wrapper(request, config, "pi", f"/context/{args.session}", body)
    
    elif args.operation == "instructions":
        # Validate inputs
        if args.file and args.clear:
            raise ValueError("Give an instructions file or --clear.")
        if not args.file and not args.clear:
            raise ValueError("Give an instructions file or --clear.")
        
        if args.clear:
            text = ""
        else:
            text = read_text(args.file, 64000, "Instructions file")
            text = text.rstrip("\r\n")
            if len(text) > 16000:
                raise ValueError("Session instructions are limited to 16000 characters.")
        
        # Get current policy
        policy_response = _pi_request_wrapper(request, config, "pi", f"/context/{args.session}")
        if policy_response.get("policy") is None:
            raise ValueError(NO_SETTINGS)

        policy = policy_response["policy"].copy()
        policy["sessionInstructions"] = text
        body = {"expected_revision": policy_response["revision"], "policy": policy}
        return _pi_request_wrapper(request, config, "pi", f"/context/{args.session}", body)
    
    elif args.operation == "budget":
        # Validate budget parameters
        if not (2 <= args.window <= 10000000):
            raise ValueError("Use a window of 2-10000000 tokens, a reserve of at least 1 that is smaller than the window, and other input of 0 or more.")
        if args.reserve < 1 or args.reserve >= args.window:
            raise ValueError("Use a window of 2-10000000 tokens, a reserve of at least 1 that is smaller than the window, and other input of 0 or more.")
        if args.other < 0:
            raise ValueError("Use a window of 2-10000000 tokens, a reserve of at least 1 that is smaller than the window, and other input of 0 or more.")
        
        # Get current policy
        policy_response = _pi_request_wrapper(request, config, "pi", f"/context/{args.session}")
        policy = policy_response.get("policy")

        if policy is None:
            # Create new policy with budget
            policy = {
                "sessionInstructions": "",
                "messagePolicies": {},
                "budget": {
                    "contextWindowTokens": args.window,
                    "outputReserveTokens": args.reserve,
                    "otherInputTokens": args.other
                }
            }
        else:
            # Update budget in existing policy
            policy = policy.copy()
            budget = policy.get("budget", {}).copy()
            budget["contextWindowTokens"] = args.window
            budget["outputReserveTokens"] = args.reserve
            if args.other != 0:  # Only update other if explicitly provided
                budget["otherInputTokens"] = args.other
            policy["budget"] = budget

        body = {"expected_revision": policy_response["revision"], "policy": policy}
        return _pi_request_wrapper(request, config, "pi", f"/context/{args.session}", body)
    
    elif args.operation == "summary-edit":
        text = read_text(args.file, 64000, "Summary file")
        text = text.rstrip("\r\n")
        if len(text) > 16000:
            raise ValueError("Summaries are limited to 16000 characters.")

        summary_response = _pi_request_wrapper(request, config, "pi", f"/context/{args.session}/summary")
        body = {"expected_revision": summary_response["revision"], "summary": text}
        return _pi_request_wrapper(request, config, "pi", f"/context/{args.session}/summary", body)
    
    elif args.operation == "summary-restore":
        if args.revision < 0:
            raise ValueError("Revision must be 0 or greater.")

        summary_response = _pi_request_wrapper(request, config, "pi", f"/context/{args.session}/summary")
        versions = summary_response.get("versions", [])

        if not any(v.get("revision") == args.revision for v in versions):
            raise ValueError("That summary version does not exist.")

        body = {
            "expected_revision": summary_response["revision"],
            "revision": args.revision
        }
        return _pi_request_wrapper(request, config, "pi", f"/context/{args.session}/summary/restore", body)
    
    elif args.operation == "fork":
        # Validate and load summary
        text = read_text(args.file, 64000, "Summary file")
        text = text.rstrip("\r\n")
        if len(text) > 16000:
            raise ValueError("Summaries are limited to 16000 characters.")
        
        # Validate request ID
        request_id = args.request_id
        if request_id:
            identity(request_id, r"[A-Za-z0-9_-]{16,128}", "fork request identity")
        else:
            request_id = "fork_" + uuid.uuid4().hex
        
        # Get policy to check revision
        policy_response = _pi_request_wrapper(request, config, "pi", f"/context/{args.session}")
        if policy_response["revision"] == 0:
            raise ValueError("Fork needs saved context settings; set them first.")

        # Get last message ID
        session_response = _pi_request_wrapper(request, config, "pi", f"/sessions/{args.session}")
        messages = session_response.get("messages", [])
        last_message_id = messages[-1]["id"] if messages else None

        # Create fork
        body = {
            "expected_revision": policy_response["revision"],
            "expected_last_message_id": last_message_id,
            "summary": text,
            "request_id": request_id
        }
        response = _pi_request_wrapper(request, config, "pi", f"/context/{args.session}/fork", body)
        response["request_id"] = request_id
        return response
    
    else:
        raise ValueError(f"Unknown context operation: {args.operation}")