"""Refusals of two installed-stack commands: `conker tool draft` (scripts/tool_draft_cli.py) only
calls the tool-request routes and reports a missing or refusing Pi plainly; `conker providers
chatgpt` (scripts/chatgpt_cli.py) checks its identity argument before it opens the socket."""

from __future__ import annotations

import json
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import chatgpt_cli
import tool_draft_cli

IDENTITY = "creq_" + "a" * 32


def answered(monkeypatch, stdout: bytes = b"", returncode: int = 0, timeout: bool = False):
    calls: list[dict] = []

    def run(command, **options):
        calls.append({"command": command, **options})
        if timeout:
            raise subprocess.TimeoutExpired(command, 120)
        return subprocess.CompletedProcess(command, returncode, stdout, b"")

    monkeypatch.setattr(tool_draft_cli.subprocess, "run", run)
    return calls


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("GET", "/inbox", None),
        ("GET", "/change-requests/creq_short", None),
        ("GET", f"/change-requests/{IDENTITY}/approve", None),
        ("POST", "/tool-drafts", None),  # a write needs a body
        ("GET", "/tool-drafts", {"description": "x"}),  # a read never has one
    ],
)
def test_only_tool_request_calls_reach_pi(monkeypatch, method, path, body):
    calls = answered(monkeypatch, b"200\n{}")
    with pytest.raises(ValueError, match="is not a tool-request call"):
        tool_draft_cli.caller(["docker", "compose"])(method, path, body)
    assert calls == []


def test_a_call_runs_the_relay_in_the_pi_container(monkeypatch):
    calls = answered(monkeypatch, b'200\n{"id": "creq"}')
    call = tool_draft_cli.caller(["docker", "compose"])
    assert call("POST", "/tool-drafts", {"description": "disk"}) == {"id": "creq"}
    [made] = calls
    assert made["command"][:5] == ["docker", "compose", "exec", "-T", "pi"]
    assert made["command"][-2:] == ["POST", "/tool-drafts"]
    assert json.loads(made["input"]) == {"description": "disk"}


@pytest.mark.parametrize(
    ("answer", "error", "message"),
    [
        ({"timeout": True}, OSError, "did not answer"),
        ({"returncode": 1, "stdout": b"200\n{}"}, OSError, "conker status"),
        ({"stdout": b"Traceback"}, OSError, "conker status"),
        ({"stdout": b'404\n{"detail": "No such request."}'}, tool_draft_cli.Refused, r"HTTP 404\): No such"),
        ({"stdout": b"503\n"}, OSError, r"did not confirm it \(HTTP 503\)"),
        ({"stdout": b"200\nnot json"}, OSError, "other than JSON"),
    ],
)
def test_a_missing_or_refusing_pi_is_reported_plainly(monkeypatch, answer, error, message):
    answered(monkeypatch, **answer)
    with pytest.raises(error, match=message):
        tool_draft_cli.caller(["docker", "compose"])("GET", f"/change-requests/{IDENTITY}", None)


@pytest.mark.parametrize(("raised", "code"), [(OSError("down"), 1), (ValueError("bad"), 2)])
def test_tool_draft_exits_with_the_failure_kind(monkeypatch, tmp_path, capsys, raised, code):
    def run(*_arguments, **_options):
        raise raised

    monkeypatch.setattr(tool_draft_cli.tool_drafts, "run", run)
    monkeypatch.setattr(tool_draft_cli, "compose", lambda root, layout: ["docker", "compose"])
    argv = ["--root", str(tmp_path), "--layout", "ubuntu", "draft", "disk space"]
    assert tool_draft_cli.main(argv) == code
    assert str(raised) in capsys.readouterr().err


class FakeConnection:
    opened: list[Path] = []

    def __init__(self, path, status=200, content=b"{}"):
        FakeConnection.opened.append(path)
        self.status, self.content, self.sent = status, content, None

    def request(self, method, path, body=None, headers=None):
        self.sent = (method, path, body)

    def getresponse(self):
        return self

    def read(self, _limit):
        return self.content

    def close(self):
        pass


def chatgpt(monkeypatch, tmp_path, *arguments, connection: Callable[[Path], FakeConnection] = FakeConnection):
    FakeConnection.opened = []
    monkeypatch.setattr(chatgpt_cli, "Connection", connection)
    monkeypatch.setattr(sys, "argv", ["chatgpt", "--root", str(tmp_path), "--layout", "ubuntu", *arguments])
    chatgpt_cli.main()


@pytest.mark.parametrize("arguments", [["cancel"], ["logout"], ["status", "login_123"], ["login", "x"]])
def test_an_identity_is_required_or_refused_before_the_socket(monkeypatch, tmp_path, arguments):
    with pytest.raises(SystemExit) as stopped:
        chatgpt(monkeypatch, tmp_path, *arguments)
    assert stopped.value.code == 2
    assert FakeConnection.opened == []


def test_status_reads_the_layouts_control_socket(monkeypatch, tmp_path, capsys):
    chatgpt(monkeypatch, tmp_path, "status")
    assert FakeConnection.opened == [tmp_path / "state" / "provider-control/control.sock"]
    assert json.loads(capsys.readouterr().out) == {}


@pytest.mark.parametrize(
    ("status", "content", "message"),
    [
        (500, b"{}", "was not confirmed"),
        (200, b"x" * 65537, "was not confirmed"),  # an answer over 64 KiB is not read
        (200, b"not json", "service is unavailable"),
    ],
    ids=["refused", "oversized", "not-json"],
)
def test_an_unconfirmed_answer_exits_1(monkeypatch, tmp_path, capsys, status, content, message):
    def connection(path):
        return FakeConnection(path, status=status, content=content)

    with pytest.raises(SystemExit) as stopped:
        chatgpt(monkeypatch, tmp_path, "logout", "conn_1", connection=connection)
    assert stopped.value.code == 1
    assert message in capsys.readouterr().err


def test_an_unreachable_socket_exits_1(monkeypatch, tmp_path, capsys):
    class Down(FakeConnection):
        def request(self, *_arguments, **_options):
            raise ConnectionRefusedError

    with pytest.raises(SystemExit) as stopped:
        chatgpt(monkeypatch, tmp_path, "models", connection=Down)
    assert stopped.value.code == 1
    assert "unavailable" in capsys.readouterr().err
