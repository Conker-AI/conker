"""conker prompt enhance: Pi's prompt enhance from the development CLI and the installed launcher."""

import io
import json
import sys
from email.message import Message
from pathlib import Path
from types import SimpleNamespace
from urllib.error import HTTPError
from urllib.parse import urlsplit

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import config_cli  # noqa: E402
import owner_cli  # noqa: E402

from scripts import conker as cli  # noqa: E402

REPLY = {
    "text": "Goal: plan a trip.\n\nTask: list three options.",
    "notes": ["Added a goal", "Asked for a list"],
    "modelId": "claude-haiku-4-5",
    "templateId": None,
    "fields": {},
}
CHAT = "ses_" + "a" * 16


def calls(monkeypatch, capsys, arguments, answers=()):
    sent, pending = [], list(answers)

    class Opener:
        def open(self, request, timeout):
            sent.append(request)
            answer = pending.pop(0) if pending else REPLY
            if isinstance(answer, HTTPError):
                raise answer
            return io.BytesIO(json.dumps(answer).encode())

    monkeypatch.setattr(
        cli,
        "read_config",
        lambda: {"environments": {"pi": {"PI_ADMIN_KEY": "fixture-admin-key"}}},
    )
    monkeypatch.setattr(cli, "build_opener", lambda *handlers: Opener())
    monkeypatch.setattr(sys, "argv", ["conker.py", "prompt", *arguments])
    code = cli.cli()
    return code, sent, capsys.readouterr()


def test_enhance_posts_the_draft_and_prints_the_rewrite(monkeypatch, capsys):
    code, sent, out = calls(monkeypatch, capsys, ["enhance", "plan a trip"])
    assert code == 0
    assert urlsplit(sent[0].full_url).path == "/prompts/enhance"
    assert sent[0].get_method() == "POST"
    assert json.loads(sent[0].data) == {"text": "plan a trip"}
    assert out.out.splitlines() == [
        "Goal: plan a trip.",
        "",
        "Task: list three options.",
        "",
        "What changed:",
        "- Added a goal",
        "- Asked for a list",
        "",
        "Written by claude-haiku-4-5. Nothing was sent or saved.",
    ]


def test_enhance_sends_the_chat_and_template_and_can_print_json(monkeypatch, capsys):
    arguments = ["enhance", "plan a trip", "--chat", CHAT, "--template", "tpl_1", "--json"]
    code, sent, out = calls(monkeypatch, capsys, arguments)
    assert code == 0 and json.loads(out.out) == REPLY
    assert json.loads(sent[0].data) == {
        "text": "plan a trip",
        "sessionId": CHAT,
        "templateId": "tpl_1",
    }


def test_enhance_without_notes_prints_no_changes_block(monkeypatch, capsys):
    reply = {**REPLY, "notes": []}
    _, _, out = calls(monkeypatch, capsys, ["enhance", "plan a trip"], [reply])
    assert "What changed" not in out.out


def test_bad_values_are_refused_before_calling_pi(monkeypatch, capsys):
    for arguments in (
        ["enhance", "   "],
        ["enhance", "x" * 8001],
        ["enhance", "plan a trip", "--chat", "../sessions"],
        ["enhance", "plan a trip", "--chat", "ses_1"],
    ):
        code, sent, out = calls(monkeypatch, capsys, arguments)
        assert code == 1 and sent == [] and out.err, arguments


def test_pis_refusal_is_shown_in_its_own_words(monkeypatch, capsys):
    detail = {"detail": {"code": "spending_cap_reached", "message": "Today's cap is reached."}}
    body = io.BytesIO(json.dumps(detail).encode())
    refusal = HTTPError("http://pi/prompts/enhance", 503, "x", Message(), body)
    code, _, out = calls(monkeypatch, capsys, ["enhance", "plan a trip"], [refusal])
    assert code == 1 and out.out == ""
    assert "spending_cap_reached" in out.err and "Today's cap is reached." in out.err


class Relay:
    """Pi in its container: answers each relayed call from `answers` by (method, path)."""

    def __init__(self, monkeypatch, answers):
        self.answers, self.sent = answers, []
        monkeypatch.setattr(config_cli.subprocess, "run", self.run)

    def run(self, argv, **options):
        method, path = argv[-2:]
        body = json.loads(options["input"]) if options["input"] else None
        self.sent.append((method, path, body))
        status, value = self.answers[(method, path)]
        stdout = f"{status}\n".encode() + json.dumps(value).encode()
        return SimpleNamespace(returncode=0, stdout=stdout, stderr=b"")


def main(*argv: str) -> int:
    return owner_cli.main(["--root", "/srv/conker", "--layout", "ubuntu", *argv])


def test_installed_launcher_reaches_pi_through_the_relay(monkeypatch, capsys):
    relay = Relay(monkeypatch, {("POST", "/prompts/enhance"): (200, REPLY)})
    assert main("prompt", "enhance", "plan a trip", "--chat", CHAT) == 0
    assert relay.sent == [("POST", "/prompts/enhance", {"text": "plan a trip", "sessionId": CHAT})]
    assert capsys.readouterr().out.startswith("Goal: plan a trip.")
    assert main("prompt", "enhance", "plan a trip", "--json") == 0
    assert json.loads(capsys.readouterr().out) == REPLY


def test_the_relay_opens_only_the_enhance_route():
    call = owner_cli.caller(["fixture"])
    with pytest.raises(ValueError):
        call(None, "pi", "/prompts/other", {"text": "x"})
    with pytest.raises(ValueError):
        call(None, "pi", "/prompts/enhance")  # a read of a write-only route
