"""conker loops: Pi's open loops (promises across chats) from the development CLI."""

import io
import json
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from scripts import conker as cli

LOOP_ID = "loop_" + "c" * 32
LOOP = {
    "id": LOOP_ID,
    "sessionId": "chat_1",
    "sessionTitle": "Exams",
    "messageId": "msg_1",
    "quote": "I'll send the essay by Friday",
    "text": "Send the essay",
    "promisedBy": "owner",
    "dueOn": "2026-11-13",
    "overdue": True,
    "state": "open",
    "revision": 2,
    "createdAt": 1.0,
    "updatedAt": 2.0,
}
PAGE = {
    "today": "2026-11-14",
    "timeZone": "Europe/Riga",
    "items": [
        LOOP,
        {
            **LOOP,
            "id": "loop_" + "d" * 32,
            "sessionTitle": "",
            "text": "Check the\nweather",
            "promisedBy": "conker",
            "dueOn": None,
            "overdue": False,
            "state": "done",
        },
    ],
    "nextAfter": "loop_" + "d" * 32,
}


def calls(monkeypatch, capsys, arguments, answers=()):
    sent, pending = [], list(answers)

    class Opener:
        def open(self, request, timeout):
            sent.append(request)
            return io.BytesIO(json.dumps(pending.pop(0) if pending else {"ok": True}).encode())

    monkeypatch.setattr(
        cli,
        "read_config",
        lambda: {"environments": {"pi": {"PI_ADMIN_KEY": "fixture-admin-key"}}},
    )
    monkeypatch.setattr(cli, "build_opener", lambda *handlers: Opener())
    monkeypatch.setattr(sys, "argv", ["conker.py", "loops", *arguments])
    code = cli.cli()
    return code, sent, capsys.readouterr()


def query(request):
    return parse_qs(urlsplit(request.full_url).query)


def test_list_reads_open_loops_with_the_flags(monkeypatch, capsys):
    code, sent, out = calls(monkeypatch, capsys, ["list", "--json"], [PAGE])
    assert code == 0 and json.loads(out.out) == PAGE
    assert urlsplit(sent[0].full_url).path == "/open-loops" and sent[0].get_method() == "GET"
    assert query(sent[0]) == {"state": ["open"], "limit": ["50"]}
    arguments = ["list", "--dropped", "--due-before", "2026-12-01", "--limit", "7"]
    code, sent, _ = calls(monkeypatch, capsys, [*arguments, "--after", PAGE["nextAfter"], "--json"])
    assert query(sent[0]) == {
        "state": ["dropped"],
        "limit": ["7"],
        "due_before": ["2026-12-01"],
        "after": [PAGE["nextAfter"]],
    }
    _, sent, _ = calls(monkeypatch, capsys, ["list", "--all", "--json"])
    assert query(sent[0])["state"] == ["all"]


def test_list_prints_one_line_per_loop(monkeypatch, capsys):
    code, _, out = calls(monkeypatch, capsys, ["list"], [PAGE])
    assert code == 0
    assert out.out.splitlines() == [
        "2 shown; today is 2026-11-14 (Europe/Riga).",
        f"2026-11-13  owner   Send the essay  OVERDUE  ({LOOP_ID} in Exams)",
        f"undated     conker  Check the weather  [done]  ({'loop_' + 'd' * 32} in chat_1)",
        f"Next page: --after {'loop_' + 'd' * 32}",
    ]


def test_add_posts_the_promise(monkeypatch, capsys):
    arguments = ["add", "chat_1", "  Send the essay ", "--by", "conker", "--due", "2026-11-20"]
    code, sent, out = calls(monkeypatch, capsys, [*arguments, "--message", "msg_1"], [{"loop": LOOP}])
    assert code == 0 and json.loads(out.out) == {"loop": LOOP}
    assert urlsplit(sent[0].full_url).path == "/open-loops" and sent[0].get_method() == "POST"
    assert json.loads(sent[0].data) == {
        "session_id": "chat_1",
        "text": "Send the essay",
        "promised_by": "conker",
        "due_on": "2026-11-20",
        "message_id": "msg_1",
    }
    _, sent, _ = calls(monkeypatch, capsys, ["add", "chat_1", "Call mum"])
    assert json.loads(sent[0].data) == {
        "session_id": "chat_1",
        "text": "Call mum",
        "promised_by": "owner",
    }


def test_done_drop_and_reopen_set_the_state(monkeypatch, capsys):
    for verb, state in (("done", "done"), ("drop", "dropped"), ("reopen", "open")):
        code, sent, _ = calls(monkeypatch, capsys, [verb, LOOP_ID], [{"loop": LOOP}])
        assert code == 0
        assert urlsplit(sent[0].full_url).path == f"/open-loops/{LOOP_ID}/state"
        assert sent[0].get_method() == "POST" and json.loads(sent[0].data) == {"state": state}


def test_bad_values_are_refused_before_calling_pi(monkeypatch, capsys):
    for arguments in (
        ["list", "--limit", "0"],
        ["list", "--limit", "101"],
        ["list", "--due-before", "2026-02-30"],
        ["list", "--after", "../sessions"],
        ["add", "chat_1", "   "],
        ["add", "chat_1", "x" * 501],
        ["add", "../chat", "Send it"],
        ["add", "chat_1", "Send it", "--due", "Friday"],
        ["add", "chat_1", "Send it", "--message", "a/b"],
        ["done", "loop_1"],
        ["drop", "../../sessions"],
    ):
        code, sent, out = calls(monkeypatch, capsys, arguments)
        assert code == 1 and sent == [] and out.err, arguments
