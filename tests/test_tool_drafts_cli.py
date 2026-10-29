"""conker tool draft: Pi files a tool request at once, drafts it in the background, and the command
waits for it to be ready or failed (contract C4)."""

import io
import json
import sys
from argparse import Namespace
from pathlib import Path
from urllib.error import HTTPError

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import conker as cli
import tool_drafts

IDENTITY = "creq_" + "a" * 32


def request(status=None, **payload):
    return {
        "id": IDENTITY,
        "kind": "tool_draft",
        "title": "Draft a tool: disk space",
        "summary": "disk space",
        "payload": {
            "description": "disk space",
            **({"status": status} if status else {}),
            **payload,
        },
        "sessionId": None,
        "state": "open",
        "result": None,
        "createdAt": 1.0,
        "decidedAt": None,
    }


class Pi:
    """Answers POST /tool-drafts once, then each GET with the next request in `later`."""

    def __init__(self, *later):
        self.calls, self.later = [], list(later)

    def __call__(self, method, path, body):
        self.calls.append((method, path, body))
        if method == "POST":
            return request("drafting")
        return self.later.pop(0)


def arguments(**options):
    return Namespace(
        **{
            "description": "Show free disk space",
            "no_wait": False,
            "request_id": None,
            "timeout": 60,
            "json": False,
            **options,
        }
    )


def run(pi, *, clock=None, **options):
    printed = []
    moments = iter(range(0, 10_000, 3))
    code = tool_drafts.run(
        pi,
        arguments(**options),
        emit=printed.append,
        clock=clock or (lambda: next(moments)),
        sleep=lambda _seconds: None,
    )
    return code, "\n".join(printed)


def test_waits_until_ready_and_prints_steps_and_issues():
    ready = request(
        "ready",
        steps=["Read the disk usage", "Answer with the free space"],
        issues=[
            "The tool disk.usage needs a path",
            {"message": "No return step", "code": "x"},
        ],
        note="ToolGate could not check this draft.",
    )
    pi = Pi(request("drafting"), ready)
    code, out = run(pi)
    assert code == 0
    assert "1. Read the disk usage" in out and "2. Answer with the free space" in out
    assert "- The tool disk.usage needs a path" in out and "- No return step" in out
    assert "ToolGate could not check this draft." in out
    assert "in the Inbox" in out
    method, path, body = pi.calls[0]
    assert (method, path) == ("POST", "/tool-drafts")
    assert body["description"] == "Show free disk space"
    assert tool_drafts.REQUEST_ID.fullmatch(body["request_id"])
    assert [call[:2] for call in pi.calls[1:]] == [
        ("GET", f"/change-requests/{IDENTITY}")
    ] * 2


def test_a_failed_draft_prints_the_reason_and_fails():
    code, out = run(
        Pi(request("failed", error="Pi restarted while drafting. Try again."))
    )
    assert code == 1
    assert "The draft failed: Pi restarted while drafting. Try again." in out


def test_no_wait_returns_once_the_request_is_filed():
    pi = Pi()
    code, out = run(pi, no_wait=True)
    assert code == 0 and len(pi.calls) == 1
    assert "Drafting. It will be in the Inbox when it is ready." in out


def test_still_drafting_when_the_time_runs_out_is_its_own_exit_code():
    pi = Pi(*[request("drafting")] * 50)
    code, out = run(pi, timeout=10)
    assert code == tool_drafts.STILL_DRAFTING
    assert "Drafting." in out


def test_a_request_from_before_background_drafting_counts_as_ready():
    assert tool_drafts.status(request()) == "ready"
    with pytest.raises(ValueError, match="unknown draft status"):
        tool_drafts.status(request("thinking"))


def test_model_text_cannot_drive_the_terminal():
    code, out = run(Pi(request("ready", steps=["Read \x1b[2Jdisk"], issues=[])))
    assert code == 0 and "\x1b" not in out and "\\x1b[2Jdisk" in out


def test_json_prints_the_request():
    _code, out = run(Pi(request("ready", steps=[], issues=[])), json=True)
    assert json.loads(out)["id"] == IDENTITY


@pytest.mark.parametrize(
    ("options", "message"),
    [
        ({"description": "  "}, "1 to 4,000 characters"),
        ({"description": "x" * 4001}, "1 to 4,000 characters"),
        ({"request_id": "short"}, "request id"),
        ({"timeout": -1}, "timeout"),
    ],
)
def test_bad_input_is_refused_before_pi_is_called(options, message):
    pi = Pi()
    with pytest.raises(ValueError, match=message):
        run(pi, **options)
    assert pi.calls == []


def test_an_unconfirmed_request_names_the_id_to_repeat_it_with():
    def lost(method, path, body):
        raise OSError("connection reset")

    with pytest.raises(OSError, match="--request-id tooldraft_x{16}"):
        run(lost, request_id="tooldraft_" + "x" * 16)


def test_an_answer_that_is_not_a_tool_request_is_refused():
    with pytest.raises(ValueError, match="not answer with a tool request"):
        run(lambda *_: {"id": IDENTITY, "kind": "memory"})


def test_development_cli_reaches_pi_with_the_owner_routes(monkeypatch, capsys):
    calls = []

    def fake(config, service, path, body=None, **options):
        calls.append((service, options.get("method"), path, body))
        if path == "/tool-drafts":
            return request("drafting")
        return request("ready", steps=["Check the disk"], issues=[])

    monkeypatch.setattr(cli, "read_config", dict)
    monkeypatch.setattr(cli, "request", fake)
    monkeypatch.setattr(tool_drafts.time, "sleep", lambda _seconds: None)
    monkeypatch.setattr(
        sys, "argv", ["conker.py", "tool", "draft", "Check the disk", "--timeout", "30"]
    )
    assert cli.main() == 0
    assert "1. Check the disk" in capsys.readouterr().out
    assert [call[:3] for call in calls] == [
        ("pi", "POST", "/tool-drafts"),
        ("pi", "GET", f"/change-requests/{IDENTITY}"),
    ]


def test_development_cli_shows_pis_refusal(monkeypatch, capsys):
    def refuse(config, service, path, body=None, **options):
        detail = {
            "detail": {
                "code": "request_reused",
                "message": "This request_id was already used.",
            }
        }
        raise HTTPError(
            "http://pi", 409, "conflict", {}, io.BytesIO(json.dumps(detail).encode())
        )

    monkeypatch.setattr(cli, "read_config", dict)
    monkeypatch.setattr(cli, "request", refuse)
    monkeypatch.setattr(sys, "argv", ["conker.py", "tool", "draft", "Check the disk"])
    assert cli.cli() == 1
    assert "request_reused" in capsys.readouterr().err
