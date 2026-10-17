"""Chat settings from the CLI: output format and chat names."""

import re

from conker_context import pi_call

SESSION = r"[A-Za-z0-9_-]{1,128}"


def register(commands):
    """Register the chat-settings parser and its subcommands."""
    chat = commands.add_parser("chat-settings", help="Manage chat settings")
    subparsers = chat.add_subparsers(dest="operation", required=True)

    output = subparsers.add_parser("output", help="Manage output settings")
    output_subparsers = output.add_subparsers(dest="output_operation", required=True)

    output_show = output_subparsers.add_parser(
        "show", help="Show current output settings"
    )
    output_show.add_argument("session")

    output_set = output_subparsers.add_parser("set", help="Set output settings")
    output_set.add_argument("session")
    output_set.add_argument(
        "--format",
        choices=["auto", "text", "list", "table", "document", "code", "json"],
    )
    output_set.add_argument("--length", choices=["auto", "short", "medium", "long"])
    output_set.add_argument("--language")

    title = subparsers.add_parser("title", help="Manage chat title")
    title_subparsers = title.add_subparsers(dest="title_operation", required=True)

    title_show = title_subparsers.add_parser("show", help="Show current title")
    title_show.add_argument("session")

    title_set = title_subparsers.add_parser("set", help="Set title")
    title_set.add_argument("session")
    title_set.add_argument("title")

    title_auto = title_subparsers.add_parser(
        "auto", help="Generate title automatically"
    )
    title_auto.add_argument("session")


def operation(args, config, request):
    """Run one chat subcommand and return the value to print."""
    if args.operation == "output":
        if args.output_operation == "show":
            return pi_call(request, config, f"/sessions/{args.session}/output")

        elif args.output_operation == "set":
            if not any([args.format, args.length, args.language]):
                raise ValueError("Give --format, --length or --language.")

            if args.language and not re.fullmatch(
                r"^(auto|[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3})$", args.language
            ):
                raise ValueError("Use auto or a language tag such as ru or en-GB.")

            current = pi_call(request, config, f"/sessions/{args.session}/output")
            output = current["output"].copy()

            if args.format:
                output["format"] = args.format
            if args.length:
                output["length"] = args.length
            if args.language:
                output["language"] = args.language

            body = {"expected_revision": current["revision"], "output": output}
            return pi_call(request, config, f"/sessions/{args.session}/output", body)

    elif args.operation == "title":
        if args.title_operation == "show":
            return pi_call(request, config, f"/sessions/{args.session}/title")

        elif args.title_operation == "set":
            title = args.title.strip()
            if not (1 <= len(title) <= 60) or "\n" in title or "\r" in title:
                raise ValueError("Use a name of 1-60 characters on one line.")

            current = pi_call(request, config, f"/sessions/{args.session}/title")
            body = {"expected_revision": current["revision"], "title": title}
            return pi_call(request, config, f"/sessions/{args.session}/title", body)

        elif args.title_operation == "auto":
            current = pi_call(request, config, f"/sessions/{args.session}/title")
            body = {"expected_revision": current["revision"]}
            return pi_call(
                request, config, f"/sessions/{args.session}/title/auto", body
            )

    else:
        raise ValueError(f"Unknown chat operation: {args.operation}")
