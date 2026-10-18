"""Files shared in a chat, from the CLI: upload, list, show, download and remove."""

import mimetypes
from pathlib import Path

from conker_context import pi_call
from conker_inputs import identity

ATTACHMENT = r"attachment_[0-9a-f]{32}"


def register(commands):
    """Register the files parser and its subcommands."""
    files = commands.add_parser(
        "files", help="Upload, list, download, and remove files shared in a chat"
    )
    subparsers = files.add_subparsers(dest="operation", required=True)

    upload = subparsers.add_parser("upload", help="Share a file in a chat")
    upload.add_argument("session")
    upload.add_argument("path", type=Path)
    upload.add_argument("--type", help="MIME type (guessed from the name if not given)")

    subparsers.add_parser("list", help="List the files shared in a chat").add_argument(
        "session"
    )

    show = subparsers.add_parser("show", help="Show one file's details")
    show.add_argument("session")
    show.add_argument("id")

    download = subparsers.add_parser("download", help="Save a shared file locally")
    download.add_argument("session")
    download.add_argument("id")
    download.add_argument("--output", type=Path, help="Where to save it")

    remove = subparsers.add_parser("remove", help="Remove a file not yet sent")
    remove.add_argument("session")
    remove.add_argument("id")


def _local_name(name):
    """The base name only: a stored name never chooses a directory."""
    base = Path(str(name).replace("\\", "/")).name
    if base in ("", ".", ".."):
        raise ValueError("That file has no usable name; choose --output.")
    return Path(base)


def _save(path, data):
    try:
        with open(path, "xb") as stream:
            stream.write(data)
    except FileExistsError:
        raise ValueError("That file already exists; choose --output.") from None


def operation(args, config, request):
    """Run one files subcommand and return the value to print."""
    path = f"/sessions/{args.session}/attachments"
    if args.operation == "upload":
        if not args.path.is_file():
            raise ValueError(f"File not found: {args.path}")
        mime_type = (
            args.type
            or mimetypes.guess_type(args.path.name)[0]
            or "application/octet-stream"
        )
        return pi_call(
            request,
            config,
            path,
            data=args.path.read_bytes(),
            content_type="application/octet-stream",
            query_params={
                "name": args.path.name,
                "type": mime_type,
                "lastModified": int(args.path.stat().st_mtime),
            },
        )
    if args.operation == "list":
        return pi_call(request, config, path)
    identity(args.id, ATTACHMENT, "attachment identity")
    item = f"{path}/{args.id}"
    if args.operation == "show":
        return pi_call(request, config, item)
    if args.operation == "remove":
        return pi_call(request, config, item, method="DELETE")
    if args.output is not None:
        if args.output.exists():
            raise ValueError("That file already exists; choose --output.")
        output = args.output
    else:
        output = _local_name(pi_call(request, config, item)["name"])
        if output.exists():
            raise ValueError("That file already exists; choose --output.")
    data = pi_call(request, config, item + "/download", raw_response=True)
    _save(output, data)
    return {"id": args.id, "path": str(output), "size": len(data)}
