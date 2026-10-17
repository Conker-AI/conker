"""A chat's output settings and name from the CLI."""

import re

from conker_context import pi_call

LANGUAGE = r"auto|[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}"


def register(commands):
    """Register the output and title areas."""
    output = commands.add_parser(
        "output", help="Read and change one chat's answer format, length and language"
    )
    output_commands = output.add_subparsers(dest="operation", required=True)
    output_commands.add_parser(
        "show", help="Show the chat's output settings"
    ).add_argument("session")
    output_set = output_commands.add_parser(
        "set", help="Change only the given output settings"
    )
    output_set.add_argument("session")
    output_set.add_argument(
        "--format",
        choices=["auto", "text", "list", "table", "document", "code", "json"],
    )
    output_set.add_argument("--length", choices=["auto", "short", "medium", "long"])
    output_set.add_argument(
        "--language", help="auto or a language tag such as ru or en-GB"
    )

    title = commands.add_parser("title", help="Read and change one chat's name")
    title_commands = title.add_subparsers(dest="operation", required=True)
    title_commands.add_parser(
        "show", help="Show the chat's name and who set it"
    ).add_argument("session")
    title_set = title_commands.add_parser("set", help="Name the chat yourself")
    title_set.add_argument("session")
    title_set.add_argument("title")
    title_commands.add_parser("auto", help="Ask Jev to name the chat").add_argument(
        "session"
    )


def operation(args, config, request):
    """Run one output or title subcommand and return the value to print."""
    path = f"/sessions/{args.session}/{args.command}"
    if args.operation == "show":
        return pi_call(request, config, path)
    if args.command == "output":
        if not (args.format or args.length or args.language):
            raise ValueError("Give --format, --length or --language.")
        if args.language and not re.fullmatch(LANGUAGE, args.language):
            raise ValueError("Use auto or a language tag such as ru or en-GB.")
        current = pi_call(request, config, path)
        output = dict(current["output"])
        for key in ("format", "length", "language"):
            if getattr(args, key):
                output[key] = getattr(args, key)
        return pi_call(
            request,
            config,
            path,
            {"expected_revision": current["revision"], "output": output},
        )
    if args.operation == "set":
        title = args.title.strip()
        if not 1 <= len(title) <= 60 or any(
            ord(character) < 32 or ord(character) == 127 for character in title
        ):
            raise ValueError("Use a name of 1-60 characters on one line.")
        current = pi_call(request, config, path)
        return pi_call(
            request,
            config,
            path,
            {"expected_revision": current["revision"], "title": title},
        )
    current = pi_call(request, config, path)
    return pi_call(
        request, config, path + "/auto", {"expected_revision": current["revision"]}
    )
