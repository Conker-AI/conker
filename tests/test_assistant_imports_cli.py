"""conker import chatgpt|claude PATH: preview by default, import with --yes, read only
conversations.json from the zip, folder or file (feature gap 9). Exports here are synthetic."""

import hashlib
import io
import json
import shutil
import subprocess
import sys
import zipfile
from argparse import Namespace
from pathlib import Path
from urllib.error import HTTPError

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import assistant_imports
import conker as cli
import import_cli

ROOT = Path(__file__).resolve().parents[1]
EXPORT = json.dumps([{"uuid": "k1", "name": "Essay", "chat_messages": []}]).encode()
DIGEST = hashlib.sha256(EXPORT).hexdigest()

PREVIEW = {
    "schemaVersion": 1,
    "source": "claude",
    "label": "Imported from Claude",
    "digest": DIGEST,
    "bytes": len(EXPORT),
    "chats": {"inFile": 3, "new": 2, "updated": 0, "unchanged": 1},
    "messages": {"inFile": 9, "new": 6, "yours": 3, "offeredToMemory": 3},
    "firstAt": 1714557600.0,
    "lastAt": 1730000000.0,
    "sampleTitles": ["Essay help", "Trip \x1b[31mplans"],
    "skipped": {"toolOrHiddenMessages": 2, "shortenedMessages": 1},
    "memory": {"on": True, "reason": None, "configured": False},
}
RESULT = {
    "schemaVersion": 1,
    "batchId": "impb_" + "a" * 32,
    "source": "claude",
    "label": "Imported from Claude",
    "digest": DIGEST,
    "chats": {"new": 2, "updated": 0, "unchanged": 1},
    "messages": {"added": 6, "offeredToMemory": 3},
    "skipped": {},
    "memory": {"on": True, "reason": None, "configured": True},
}


class Pi:
    def __init__(self):
        self.calls = []

    def __call__(self, method, path, raw):
        self.calls.append((method, path, raw))
        return RESULT if path.endswith(DIGEST) else PREVIEW


def args(path, *, yes=False, as_json=False, source="claude"):
    return Namespace(
        source=source, path=Path(path), yes=yes, preview=not yes, json=as_json
    )


@pytest.fixture
def export(tmp_path):
    path = tmp_path / "conversations.json"
    path.write_bytes(EXPORT)
    return path


def test_preview_is_the_default_and_imports_nothing(export):
    pi, out = Pi(), []
    assert assistant_imports.run(pi, args(export), emit=out.append) == 0
    assert pi.calls == [("POST", "/imports/claude/preview", EXPORT)]
    (text,) = out
    assert "Claude export: 3 chats, 9 messages (2024-05-01 to 2024-10-27)" in text
    assert "New: 2 chats" in text and "Already imported: 1" in text
    assert "3 of your messages would be offered to memory as outside content" in text
    assert "wait until MemoryGate's import listener is set up" in text
    assert "Left out: 2 tool, hidden or reasoning messages." in text
    assert "Trip \\x1b[31mplans" in text and "\x1b" not in text
    assert f"conker import claude {export} --yes" in text


def test_yes_imports_exactly_the_file_by_its_digest(export):
    pi, out = Pi(), []
    assert assistant_imports.run(pi, args(export, yes=True), emit=out.append) == 0
    assert pi.calls == [("POST", f"/imports/claude/{DIGEST}", EXPORT)]
    assert "Imported from Claude: 2 new chats" in out[0] and "read-only" in out[0]
    assert "3 of your messages are offered to memory" in out[0]


def test_json_prints_pis_answer(export):
    out = []
    assistant_imports.run(Pi(), args(export, as_json=True), emit=out.append)
    assert json.loads(out[0])["digest"] == DIGEST


def test_only_conversations_json_is_read_from_a_zip_or_folder(tmp_path):
    archive = tmp_path / "export.zip"
    with zipfile.ZipFile(archive, "w") as handle:
        handle.writestr("conversations.json", EXPORT)
        handle.writestr("users.json", b'{"secret": true}')
        handle.writestr("files/photo.png", b"\x89PNG" + b"0" * 100)
    assert assistant_imports.read_export(archive) == EXPORT
    folder = tmp_path / "unpacked"
    folder.mkdir()
    (folder / "conversations.json").write_bytes(EXPORT)
    assert assistant_imports.read_export(folder) == EXPORT
    nested = tmp_path / "nested.zip"
    with zipfile.ZipFile(nested, "w") as handle:
        handle.writestr("export-2026/conversations.json", EXPORT)
    assert assistant_imports.read_export(nested) == EXPORT


@pytest.mark.parametrize(
    ("members", "message"),
    [
        ({"users.json": b"{}"}, "exactly one conversations.json"),
        ({"a/conversations.json": b"[]", "b/conversations.json": b"[]"}, "exactly one"),
        ({"a/b/conversations.json": b"[]"}, "exactly one"),
    ],
)
def test_a_zip_without_one_export_is_refused(tmp_path, members, message):
    archive = tmp_path / "export.zip"
    with zipfile.ZipFile(archive, "w") as handle:
        for name, data in members.items():
            handle.writestr(name, data)
    with pytest.raises(ValueError, match=message):
        assistant_imports.read_export(archive)


def test_oversized_and_missing_exports_are_refused_before_pi_is_called(
    tmp_path, monkeypatch
):
    monkeypatch.setattr(assistant_imports, "MAX_BYTES", 10)
    big = tmp_path / "conversations.json"
    big.write_bytes(b"[" + b" " * 20 + b"]")
    with pytest.raises(ValueError, match="larger than"):
        assistant_imports.read_export(big)
    archive = tmp_path / "bomb.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as handle:
        handle.writestr("conversations.json", b"[" + b" " * 5000 + b"]")
    with pytest.raises(ValueError, match="larger than"):
        assistant_imports.read_export(archive)
    with pytest.raises(ValueError, match="no file"):
        assistant_imports.read_export(tmp_path / "missing.json")
    empty = tmp_path / "empty"
    empty.mkdir()
    with pytest.raises(ValueError, match="no conversations.json"):
        assistant_imports.read_export(empty)
    pi = Pi()
    with pytest.raises(ValueError):
        assistant_imports.run(pi, args(big), emit=print)
    assert pi.calls == []


def test_the_parser_takes_preview_or_yes_but_not_both(capsys):
    import conker_parser

    parser = conker_parser.build_parser("conker")
    parsed = parser.parse_args(["import", "chatgpt", "export.zip"])
    assert (parsed.command, parsed.source, parsed.yes) == ("import", "chatgpt", False)
    assert parser.parse_args(["import", "claude", "x", "--yes"]).yes is True
    with pytest.raises(SystemExit):
        parser.parse_args(["import", "chatgpt", "x", "--yes", "--preview"])
    with pytest.raises(SystemExit):
        parser.parse_args(["import", "gemini", "x"])
    capsys.readouterr()


def test_development_cli_posts_the_raw_export_to_pi(monkeypatch, capsys, export):
    calls = []

    def fake(config, service, path, body=None, **options):
        calls.append((service, options.get("method"), path, body, options.get("data")))
        assert options.get("content_type") == "application/json"
        return PREVIEW

    monkeypatch.setattr(cli, "read_config", dict)
    monkeypatch.setattr(cli, "request", fake)
    monkeypatch.setattr(sys, "argv", ["conker.py", "import", "claude", str(export)])
    assert cli.main() == 0
    assert calls == [("pi", "POST", "/imports/claude/preview", None, EXPORT)]
    assert "Nothing was imported" in capsys.readouterr().out


def test_development_cli_shows_pis_refusal(monkeypatch, capsys, export):
    def refuse(config, service, path, body=None, **options):
        detail = {
            "detail": {
                "code": "wrong_format",
                "message": "It looks like a Claude export.",
            }
        }
        raise HTTPError(
            "http://pi", 422, "refused", {}, io.BytesIO(json.dumps(detail).encode())
        )

    monkeypatch.setattr(cli, "read_config", dict)
    monkeypatch.setattr(cli, "request", refuse)
    monkeypatch.setattr(sys, "argv", ["conker.py", "import", "chatgpt", str(export)])
    assert cli.cli() == 1
    assert "It looks like a Claude export" in capsys.readouterr().err


def test_installed_caller_sends_only_import_routes(monkeypatch):
    seen = []

    def run(command, **options):
        seen.append((command, options["input"]))
        return subprocess.CompletedProcess(
            command, 0, b"200\n" + json.dumps(RESULT).encode()
        )

    monkeypatch.setattr(import_cli.subprocess, "run", run)
    call = import_cli.caller(["docker", "compose"])
    assert call("POST", f"/imports/claude/{DIGEST}", EXPORT) == RESULT
    ((command, sent),) = seen
    assert command[:5] == ["docker", "compose", "exec", "-T", "pi"]
    assert command[-2:] == ["POST", f"/imports/claude/{DIGEST}"] and sent == EXPORT
    for method, path in (
        ("GET", "/imports"),
        ("POST", "/sessions"),
        ("POST", "/imports/x/y"),
    ):
        with pytest.raises(ValueError):
            call(method, path, EXPORT)


def test_installed_caller_reports_pis_refusal(monkeypatch):
    refusal = b'422\n{"detail": {"code": "not_json", "message": "The file is not valid JSON."}}'
    monkeypatch.setattr(
        import_cli.subprocess,
        "run",
        lambda command, **options: subprocess.CompletedProcess(command, 0, refusal),
    )
    with pytest.raises(import_cli.Refused, match="The file is not valid JSON"):
        import_cli.caller(["docker", "compose"])(
            "POST", "/imports/chatgpt/preview", b"x"
        )


FAKE_PI = """
import json, os, sys
from pathlib import Path
method, path = sys.argv[-2:]
data = sys.stdin.buffer.read()
Path(os.environ["FAKE_PI_STATE"]).write_text(json.dumps([method, path, data.decode()]))
sys.stdout.write("200\\n" + os.environ["FAKE_PI_ANSWER"])
"""


@pytest.mark.skipif(
    sys.platform == "win32", reason="Python starts the recording Docker, a POSIX script"
)
def test_installed_launcher_previews_through_the_pi_container(
    ubuntu_cli, tmp_path, export
):
    scripts = ubuntu_cli.deployment / "sources/companion/scripts"
    for name in ("assistant_imports.py", "import_cli.py"):
        shutil.copy2(ROOT / "scripts" / name, scripts / name)
    fake, state = tmp_path / "fake_pi.py", tmp_path / "pi-call.json"
    fake.write_text(FAKE_PI, encoding="utf-8")
    ubuntu_cli.environment.update(
        FAKE_PI=str(fake), FAKE_PI_STATE=str(state), FAKE_PI_ANSWER=json.dumps(PREVIEW)
    )
    result = ubuntu_cli("import", "claude", str(export))
    assert result.returncode == 0, result.stderr
    assert "Claude export: 3 chats" in result.stdout
    method, path, body = json.loads(state.read_text(encoding="utf-8"))
    assert (method, path, body.encode()) == ("POST", "/imports/claude/preview", EXPORT)
    log = ubuntu_cli.docker_log.read_text(encoding="utf-8")
    assert "exec -T pi python -c" in log and "X-Pi-Key" in log
