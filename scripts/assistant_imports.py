"""conker import chatgpt|claude PATH: bring chats from another assistant into Conker.

PATH is the data export as it arrived (the zip), its unpacked folder, or its conversations.json.
Only conversations.json is read, and only up to Pi's size limit: the images and files in an
export never leave this machine. Without --yes the file is previewed: Pi says how many chats and
messages it would add, from when to when, and a few titles, and saves nothing. With --yes Pi
imports exactly that file (named by its SHA-256 digest): each chat is kept as an archived,
read-only chat labelled with where it came from, and the owner's own messages are offered to
memory as outside content, never as something said to Conker. Importing the same export again
adds nothing. Nothing runs during an import: no model, no tool, no Conker.

Shared by the development CLI (scripts/conker.py) and the installed launcher
(scripts/import_cli.py); each passes its own way of calling Pi.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import zipfile
from datetime import UTC, datetime
from pathlib import Path

SOURCES = {"chatgpt": "ChatGPT", "claude": "Claude"}
MEMBER = "conversations.json"
MAX_BYTES = 128 * 1024 * 1024  # Pi's own limit for one export
# Terminal control characters (C0 except tab and newline, DEL, C1) in text from the export.
CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f-\x9f]")
LEFT_OUT = {
    "chatsNotMatching": "chats that do not match the export format",
    "duplicateChats": "chats that appear twice",
    "emptyChats": "chats with nothing to keep",
    "longChats": "chats longer than 10,000 messages",
    "toolOrHiddenMessages": "tool, hidden or reasoning messages",
    "emptyMessages": "empty messages",
    "duplicateMessages": "repeated messages",
}


def register(commands):
    command = commands.add_parser(
        "import",
        help="Bring chats from ChatGPT or Claude: preview first, then import with --yes",
    )
    sources = command.add_subparsers(dest="source", required=True)
    for source, name in SOURCES.items():
        item = sources.add_parser(
            source,
            help=f"A {name} data export: the zip, its folder, or its {MEMBER}",
        )
        item.add_argument(
            "path", type=Path, help=f"The {name} export zip, folder or {MEMBER}"
        )
        mode = item.add_mutually_exclusive_group()
        mode.add_argument(
            "--preview",
            action="store_true",
            help="Show what would be imported, saving nothing (the default)",
        )
        mode.add_argument(
            "--yes",
            action="store_true",
            help="Import it: read-only chats, your words offered to memory as outside content",
        )
        item.add_argument(
            "--json", action="store_true", help="Print Pi's answer as JSON"
        )


def clean(text) -> str:
    """Text from the export, with control characters shown as escapes."""
    return CONTROL.sub(lambda m: f"\\x{ord(m.group()):02x}", str(text))


def _bounded(stream, label: str) -> bytes:
    data = stream.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError(f"{label} is larger than {MAX_BYTES // (1024 * 1024)} MB.")
    return data


def read_export(path: Path) -> bytes:
    """The bytes of conversations.json from the zip, the folder or the file itself."""
    path = Path(path)
    if path.is_dir():
        path = path / MEMBER
        if not path.is_file():
            raise ValueError(f"There is no {MEMBER} in that folder.")
    elif not path.is_file():
        raise ValueError(f"There is no file at {path}.")
    if zipfile.is_zipfile(path):
        try:
            with zipfile.ZipFile(path) as archive:
                names = [
                    info
                    for info in archive.infolist()
                    if not info.is_dir()
                    and (
                        info.filename == MEMBER or info.filename.endswith("/" + MEMBER)
                    )
                    and info.filename.count("/") <= 1
                ]
                if len(names) != 1:
                    raise ValueError(f"The zip does not hold exactly one {MEMBER}.")
                (info,) = names
                if info.flag_bits & 0x1:
                    raise ValueError(f"The {MEMBER} in the zip is encrypted.")
                if info.file_size > MAX_BYTES:
                    raise ValueError(
                        f"{MEMBER} is larger than {MAX_BYTES // (1024 * 1024)} MB."
                    )
                with archive.open(info) as stream:
                    return _bounded(stream, MEMBER)
        except (zipfile.BadZipFile, NotImplementedError, RuntimeError, EOFError) as exc:
            raise ValueError(f"The zip could not be read: {exc}") from None
    with path.open("rb") as stream:
        return _bounded(stream, "The file")


def _day(seconds) -> str:
    return datetime.fromtimestamp(seconds, UTC).strftime("%Y-%m-%d") if seconds else "?"


def _left_out(skipped: dict) -> list[str]:
    parts = [
        f"{skipped[key]:,} {words}"
        for key, words in LEFT_OUT.items()
        if skipped.get(key)
    ]
    lines = ["Left out: " + "; ".join(parts) + "."] if parts else []
    if skipped.get("shortenedMessages"):
        lines.append(
            f"{skipped['shortenedMessages']:,} very long messages are kept shortened "
            "and are not offered to memory."
        )
    return lines


def _memory(memory: dict, offered: int, done: bool) -> str:
    if not memory.get("on"):
        return clean(memory.get("reason") or "Nothing is offered to memory.")
    verb = "are" if done else "would be"
    line = f"{offered:,} of your messages {verb} offered to memory as outside content."
    if offered and not memory.get("configured"):
        line += " They wait until MemoryGate's import listener is set up (see the import guide)."
    return line


def render_preview(view: dict, path: Path) -> str:
    name, chats, messages = SOURCES[view["source"]], view["chats"], view["messages"]
    lines = [
        (
            f"{name} export: {chats['inFile']:,} chats, {messages['inFile']:,} messages "
            f"({_day(view.get('firstAt'))} to {_day(view.get('lastAt'))})."
        ),
        (
            f"New: {chats['new']:,} chats. With new messages: {chats['updated']:,}. "
            f"Already imported: {chats['unchanged']:,}."
        ),
        f"Messages to add: {messages['new']:,}, {messages['yours']:,} of them yours.",
        _memory(view.get("memory") or {}, messages["offeredToMemory"], False),
        *_left_out(view.get("skipped") or {}),
    ]
    if view.get("sampleTitles"):
        lines.append("For example:")
        lines.extend(f"  - {clean(title)}" for title in view["sampleTitles"])
    if chats["new"] or chats["updated"]:
        lines.append(
            "Nothing was imported. To import it: "
            f"conker import {view['source']} {clean(path)} --yes"
        )
    else:
        lines.append("Nothing to import: every chat in it is already here.")
    return "\n".join(lines)


def render_result(result: dict) -> str:
    chats, messages = result["chats"], result["messages"]
    lines = [
        (
            f"{result['label']}: {chats['new']:,} new chats, {chats['updated']:,} with new "
            f"messages, {chats['unchanged']:,} already here; "
            f"{messages['added']:,} messages added."
        ),
        _memory(result.get("memory") or {}, messages["offeredToMemory"], True),
        *_left_out(result.get("skipped") or {}),
        "They are archived and read-only: you can read them, and nothing runs in them.",
    ]
    return "\n".join(lines)


def run(call, args, *, emit=print) -> int:
    """Preview (the default) or, with --yes, import the export; 0 when Pi answered."""
    raw = read_export(args.path)
    if args.yes:
        digest = hashlib.sha256(raw).hexdigest()
        answer = call("POST", f"/imports/{args.source}/{digest}", raw)
        text = render_result(answer)
    else:
        answer = call("POST", f"/imports/{args.source}/preview", raw)
        text = render_preview(answer, args.path)
    emit(json.dumps(answer, indent=2, ensure_ascii=False) if args.json else text)
    return 0


def dev_caller(pi_call, request, config):
    """Pi through the development CLI's own request helper (scripts/conker.py)."""

    def call(method, path, raw):
        return pi_call(
            request,
            config,
            path,
            None,
            method=method,
            data=raw,
            content_type="application/json",
        )

    return call


def emit(text: str) -> None:
    """Print text; characters the output cannot encode (a redirected Windows pipe) are replaced."""
    encoding = sys.stdout.encoding or "utf-8"
    print(text.encode(encoding, errors="replace").decode(encoding))
