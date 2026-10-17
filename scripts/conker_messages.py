"""Message actions from the CLI: branch, retry, compare and answer versions."""

import sys
import uuid
from pathlib import Path
from urllib.error import HTTPError

from conker_context import _file_text, pi_call
from conker_inputs import identity

MESSAGE = r"[A-Za-z0-9_-]{1,200}"
REQUEST = r"[A-Za-z0-9_-]{16,128}"


def register(commands):
    """Register the message parser and its subcommands."""
    message = commands.add_parser(
        "message", help="Act on one message: branch, retry, compare, versions"
    )
    subparsers = message.add_subparsers(dest="operation", required=True)

    list_parser = subparsers.add_parser(
        "list", help="Messages including those inherited from a parent chat"
    )
    list_parser.add_argument("session")
    list_parser.add_argument("--limit", type=int, default=100)
    list_parser.add_argument("--cursor")

    branch = subparsers.add_parser("branch", help="Create a new chat from this message")
    branch.add_argument("session")
    branch.add_argument("message")
    group = branch.add_mutually_exclusive_group()
    group.add_argument("--summary", type=Path)
    group.add_argument("--drop-summary", action="store_true")
    branch.add_argument("--request-id")

    retry = subparsers.add_parser("retry", help="Retry this answer with another model")
    retry.add_argument("session")
    retry.add_argument("message")
    retry.add_argument("--model", required=True)
    retry.add_argument("--request-id")

    retry_status = subparsers.add_parser(
        "retry-status", help="Check a retry request status"
    )
    retry_status.add_argument("session")
    retry_status.add_argument("request_id")

    compare = subparsers.add_parser(
        "compare", help="Compare answers from multiple models"
    )
    compare.add_argument("session")
    compare.add_argument("message")
    compare.add_argument("--models", required=True)
    compare.add_argument("--request-id")

    versions = subparsers.add_parser("versions", help="Show all versions of an answer")
    versions.add_argument("session")
    versions.add_argument("root")

    select = subparsers.add_parser("select", help="Select a version to show")
    select.add_argument("session")
    select.add_argument("root")
    select.add_argument("message")

    judge = subparsers.add_parser("judge", help="Judge answer versions")
    judge.add_argument("session")
    judge.add_argument("root")
    judge.add_argument("--model")
    judge.add_argument("--rubric", type=Path)
    judge.add_argument("--request-id")

    judgements = subparsers.add_parser("judgements", help="Show judgement results")
    judgements.add_argument("session")
    judgements.add_argument("root")

    vote = subparsers.add_parser("vote", help="Vote for an answer")
    vote.add_argument("session")
    vote.add_argument("root")
    vote.add_argument("message")
    vote.add_argument("vote", choices=["up", "down", "winner", "clear"])

    votes = subparsers.add_parser("votes", help="Show votes")
    votes.add_argument("session")
    votes.add_argument("root")

    fact_check = subparsers.add_parser(
        "fact-check", help="Check the claims in this answer"
    )
    fact_check.add_argument("session")
    fact_check.add_argument("message")
    fact_check.add_argument("--model")
    fact_check.add_argument("--request-id")

    fact_checks = subparsers.add_parser(
        "fact-checks", help="Show fact-check results for this answer"
    )
    fact_checks.add_argument("session")
    fact_checks.add_argument("message")


def operation(args, config, request):
    """Run one message subcommand and return the value to print."""
    s = args.session
    if args.operation == "list":
        limit = args.limit
        if not (1 <= limit <= 200):
            raise ValueError("Use a limit of 1-200.")
        cursor = args.cursor
        if cursor:
            identity(cursor, MESSAGE, "cursor message identity")
        query = {"limit": limit}
        if cursor:
            query["cursor"] = cursor
        return pi_call(request, config, f"/sessions/{s}/branch-history", query=query)

    elif args.operation == "branch":
        m = args.message
        identity(m, MESSAGE, "message identity")
        request_id = args.request_id
        if request_id:
            identity(request_id, REQUEST, "branch request identity")
        else:
            request_id = "branch_" + uuid.uuid4().hex

        settings = pi_call(request, config, f"/sessions/{s}/settings")
        context = pi_call(request, config, f"/context/{s}")
        summary = pi_call(request, config, f"/context/{s}/summary")

        body = {
            "request_id": request_id,
            "expected_settings_revision": settings["revision"],
            "expected_context_revision": context["revision"],
        }

        if summary["summary"] is None:
            if args.summary or args.drop_summary:
                raise ValueError(
                    "This chat has no summary; leave out --summary and --drop-summary."
                )
        elif args.summary:
            body["reviewed_summary"] = _file_text(
                args.summary,
                "Summary file",
                "Reviewed summaries are limited to 16000 characters.",
            )
        elif args.drop_summary:
            body["reviewed_summary"] = ""
        else:
            raise ValueError(
                "This chat has a summary that may describe later messages. Pass "
                "--summary FILE with the text the branch keeps, or --drop-summary."
            )

        response = pi_call(request, config, f"/sessions/{s}/messages/{m}/fork", body)
        response["request_id"] = request_id
        return response

    elif args.operation == "retry":
        m = args.message
        identity(m, MESSAGE, "message identity")
        model = args.model
        if not (1 <= len(model) <= 200):
            raise ValueError("Use a model ID of 1 to 200 characters.")
        request_id = args.request_id
        if request_id:
            identity(request_id, REQUEST, "retry request identity")
        else:
            request_id = "retry_" + uuid.uuid4().hex

        print(f"Request id: {request_id}", file=sys.stderr)
        body = {"request_id": request_id, "model_id": model}
        return pi_call(request, config, f"/sessions/{s}/messages/{m}/retry", body)

    elif args.operation == "retry-status":
        request_id = args.request_id
        identity(request_id, REQUEST, "retry status request identity")
        return pi_call(request, config, f"/sessions/{s}/response-retries/{request_id}")

    elif args.operation == "compare":
        m = args.message
        identity(m, MESSAGE, "message identity")
        models_str = args.models
        models = [model.strip() for model in models_str.split(",") if model.strip()]
        if len(models) < 1 or len(models) > 3 or len(set(models)) != len(models):
            raise ValueError(
                "Compare with 1-3 distinct model IDs, separated by commas."
            )
        for model in models:
            if not (1 <= len(model) <= 200):
                raise ValueError("Use a model ID of 1 to 200 characters.")

        base_id = args.request_id
        if base_id:
            identity(base_id, r"[A-Za-z0-9_-]{16,120}", "compare request identity")
        else:
            base_id = "compare_" + uuid.uuid4().hex

        print(f"Request id: {base_id}", file=sys.stderr)
        results = []
        for i, model in enumerate(models, 1):
            request_id = f"{base_id}_{i}"
            body = {"request_id": request_id, "model_id": model}
            try:
                receipt = pi_call(
                    request, config, f"/sessions/{s}/messages/{m}/retry", body
                )
                results.append(receipt)
            except (ValueError, OSError, HTTPError) as exc:
                raise ValueError(
                    f"Compare stopped at {model} ({exc}); finished answers are kept. "
                    f"Repeat with --request-id {base_id} to continue without paying twice."
                ) from None

        return {"request_id": base_id, "results": results}

    elif args.operation == "versions":
        root = args.root
        identity(root, MESSAGE, "root message identity")
        return pi_call(request, config, f"/sessions/{s}/response-families/{root}")

    elif args.operation == "select":
        root = args.root
        m = args.message
        identity(root, MESSAGE, "root message identity")
        identity(m, MESSAGE, "message identity")

        family = pi_call(request, config, f"/sessions/{s}/response-families/{root}")
        version_ids = {v["message_id"] for v in family["versions"]}
        if m not in version_ids:
            raise ValueError("That message is not a version of this answer.")

        body = {"message_id": m, "expected_revision": family["revision"]}
        return pi_call(
            request, config, f"/sessions/{s}/response-families/{root}/select", body
        )

    elif args.operation == "judge":
        root = args.root
        identity(root, MESSAGE, "root message identity")

        request_id = args.request_id
        if request_id:
            identity(request_id, REQUEST, "judge request identity")
        else:
            request_id = "judge_" + uuid.uuid4().hex

        body = {"request_id": request_id, "rubric": ""}

        if args.model is not None:
            model = args.model
            if not (1 <= len(model) <= 200):
                raise ValueError("Use a model ID of 1 to 200 characters.")
            body["model_id"] = model

        if args.rubric:
            body["rubric"] = _file_text(
                args.rubric,
                "Rubric file",
                "Rubrics are limited to 2000 characters.",
                limit=2000,
            )

        print(f"Request id: {request_id}", file=sys.stderr)
        return pi_call(
            request, config, f"/sessions/{s}/response-families/{root}/judge", body
        )

    elif args.operation == "judgements":
        root = args.root
        identity(root, MESSAGE, "root message identity")
        return pi_call(
            request, config, f"/sessions/{s}/response-families/{root}/judgements"
        )

    elif args.operation == "vote":
        root = args.root
        m = args.message
        identity(root, MESSAGE, "root message identity")
        identity(m, MESSAGE, "message identity")

        body = {"message_id": m, "vote": args.vote}
        return pi_call(
            request, config, f"/sessions/{s}/response-families/{root}/vote", body
        )

    elif args.operation == "votes":
        root = args.root
        identity(root, MESSAGE, "root message identity")
        return pi_call(request, config, f"/sessions/{s}/response-families/{root}/votes")

    elif args.operation == "fact-check":
        m = args.message
        identity(m, MESSAGE, "message identity")
        request_id = args.request_id
        if request_id:
            identity(request_id, REQUEST, "fact-check request identity")
        else:
            request_id = "check_" + uuid.uuid4().hex
        if args.model is not None:
            model = args.model
            if not (1 <= len(model) <= 200):
                raise ValueError("Use a model ID of 1 to 200 characters.")
        print(f"Request id: {request_id}", file=sys.stderr)
        body = {"request_id": request_id}
        if args.model is not None:
            body["model_id"] = model
        return pi_call(request, config, f"/sessions/{s}/messages/{m}/fact-check", body)

    elif args.operation == "fact-checks":
        m = args.message
        identity(m, MESSAGE, "message identity")
        return pi_call(request, config, f"/sessions/{s}/messages/{m}/fact-checks")

    else:
        raise ValueError(f"Unknown message operation: {args.operation}")
