"""`scripts/stack_smoke.py`: each smoke check fails with its exact message, and passes on a healthy Gateway.

The Gateway session is driven through its public methods with a stand-in HTTP opener; the checks
run against an in-memory Gateway, so no workspace has to be running.
"""

from __future__ import annotations

import io
import json
import ssl
import urllib.error
from pathlib import Path

import pytest

from scripts import stack_smoke
from scripts.stack_smoke import SmokeFailure

ORIGIN = "https://localhost:8050"


class Response:
    def __init__(self, status=200, body="", cookies=()):
        self.status = status
        self._body = body.encode()
        self.headers = type("Headers", (), {"get_all": lambda _self, name: list(cookies)})()

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


class Opener:
    """Answers each request from a queue and keeps what was sent."""

    def __init__(self, *answers):
        self.answers = list(answers)
        self.sent = []

    def open(self, request, timeout):
        self.sent.append(request)
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer


@pytest.fixture()
def gateway(monkeypatch):
    # The workspace's own certificate is not needed to check how requests are built.
    system_trust = ssl.create_default_context
    monkeypatch.setattr(stack_smoke.ssl, "create_default_context", lambda cafile: system_trust())
    return stack_smoke.Gateway(ORIGIN, Path("tls.crt"))


def test_gateway_builds_the_exact_origin_cookie_and_csrf_headers(gateway):
    gateway.opener = Opener(
        Response(body="{}", cookies=["sid=abc; Path=/; HttpOnly", "other=1; Secure"]),
        Response(body='{"ok": true}'),
    )
    gateway.csrf = "token"
    gateway.request("POST", "/api/x", {"a": 1}, query={"limit": 5})
    assert gateway.cookies == {"sid": "abc", "other": "1"}
    assert gateway.request("GET", "/api/y") == {"ok": True}
    first, second = gateway.opener.sent
    assert first.full_url == ORIGIN + "/api/x?limit=5"
    assert first.get_header("X-csrf-token") == "token"
    assert first.get_header("Origin") == ORIGIN
    assert json.loads(first.data) == {"a": 1}
    assert second.get_header("Cookie") == "sid=abc; other=1"
    assert second.data is None
    assert second.get_header("X-csrf-token") is None


def test_gateway_turns_an_http_error_into_a_failure_with_the_start_of_the_body(gateway):
    error = urllib.error.HTTPError(ORIGIN, 403, "Forbidden", {}, io.BytesIO(b"x" * 400))  # type: ignore[arg-type]
    gateway.opener = Opener(error)
    with pytest.raises(SmokeFailure) as raised:
        gateway.request("POST", "/auth/login", {"password": "p"})
    assert str(raised.value) == "POST /auth/login answered 403: " + "x" * 300


def test_an_empty_answer_is_an_empty_object(gateway):
    gateway.opener = Opener(Response(body=""))
    assert gateway.request("GET", "/empty") == {}


def test_sign_in_uses_the_rotated_csrf_token(gateway):
    gateway.opener = Opener(
        Response(body='{"csrf_token": "before"}'),
        Response(body="{}"),
        Response(body='{"authenticated": true, "csrf_token": "after"}'),
    )
    gateway.sign_in("pw")
    assert gateway.csrf == "after"
    login = gateway.opener.sent[1]
    assert login.get_header("X-csrf-token") == "before"
    assert json.loads(login.data) == {"password": "pw"}


def test_sign_in_refuses_a_session_that_is_not_authenticated(gateway):
    gateway.opener = Opener(
        Response(body='{"csrf_token": "before"}'),
        Response(body="{}"),
        Response(body='{"authenticated": false, "csrf_token": "after"}'),
    )
    with pytest.raises(SmokeFailure) as raised:
        gateway.sign_in("pw")
    assert str(raised.value) == "Sign-in did not authenticate the session."


class FakeGateway:
    """Routes by (method, path); each handler gets (body, query) and may be a list to step through."""

    def __init__(self, routes):
        self.routes = routes
        self.requests = []

    def raw(self, method, path, body=None, query=None, accept="application/json"):
        answer = self.routes[(method, path)]
        return answer if isinstance(answer, tuple) else (200, answer)

    def request(self, method, path, body=None, query=None):
        self.requests.append((method, path, body, query))
        answer = self.routes[(method, path)]
        if callable(answer):
            return answer(body, query)
        if isinstance(answer, list):
            return answer.pop(0) if len(answer) > 1 else answer[0]
        return answer


def test_dashboard_check_names_the_path_that_did_not_serve_it():
    page = '<div id="root"></div>'
    healthy = FakeGateway({("GET", "/"): page, ("GET", "/inbox"): page})
    assert stack_smoke.check_dashboard(healthy) == "dashboard served at / and /inbox"
    broken = FakeGateway({("GET", "/"): page, ("GET", "/inbox"): (200, "<html></html>")})
    with pytest.raises(SmokeFailure) as raised:
        stack_smoke.check_dashboard(broken)
    assert str(raised.value) == "GET /inbox did not serve the dashboard."
    wrong_status = FakeGateway({("GET", "/"): (500, page)})
    with pytest.raises(SmokeFailure) as raised:
        stack_smoke.check_dashboard(wrong_status)
    assert str(raised.value) == "GET / did not serve the dashboard."


def test_inbox_check_counts_requests_and_refuses_an_unexpected_shape():
    ok = FakeGateway({("GET", "/api/owner/requests"): {"results": [1, 2], "next_cursor": None}})
    assert stack_smoke.check_inbox(ok) == "inbox listed (2 requests)"
    bad = FakeGateway({("GET", "/api/owner/requests"): {"results": [1]}})
    with pytest.raises(SmokeFailure) as raised:
        stack_smoke.check_inbox(bad)
    assert str(raised.value) == "Inbox list has an unexpected shape: ['results']"


def chat_routes(details):
    return {
        ("POST", "/api/pi/sessions"): {"session_id": "s1"},
        ("POST", "/api/pi/sessions/s1/turns"): {},
        ("GET", "/api/pi/sessions/s1"): details,
    }


def test_chat_round_trip_returns_the_chat_and_a_summary_of_the_answer():
    details = {
        "turns": [{"status": "complete", "provider": "ollama", "model": "qwen"}],
        "messages": [
            {"role": "user", "content": "hi"},
            {"role": "assistant", "content": "  Four.  "},
        ],
    }
    waits = []
    session, summary = stack_smoke.chat_round_trip(
        FakeGateway(chat_routes(details)), seconds=5, sleep=waits.append
    )
    assert session == "s1"
    assert summary == "chat answered (complete, ollama/qwen): 'Four.'"
    assert waits == []


def test_chat_round_trip_waits_while_the_turn_is_running():
    running = {"turns": [{"status": "running"}], "messages": []}
    done = {
        "turns": [{"status": "complete", "provider": "p", "model": "m"}],
        "messages": [{"role": "assistant", "content": "ok"}],
    }
    waits = []
    session, _ = stack_smoke.chat_round_trip(
        FakeGateway(chat_routes([running, done])), seconds=60, sleep=waits.append
    )
    assert session == "s1"
    assert waits == [2]


def test_chat_round_trip_refuses_a_failed_turn():
    details = {"turns": [{"status": "failed", "detail": "model missing"}], "messages": []}
    with pytest.raises(SmokeFailure) as raised:
        stack_smoke.chat_round_trip(
            FakeGateway(chat_routes(details)), seconds=5, sleep=lambda s: None
        )
    assert str(raised.value) == "Turn failed: model missing"


def test_chat_round_trip_refuses_when_no_answer_arrives_in_time():
    details = {"turns": [], "messages": []}
    with pytest.raises(SmokeFailure) as raised:
        stack_smoke.chat_round_trip(
            FakeGateway(chat_routes(details)), seconds=0, sleep=lambda s: None
        )
    assert str(raised.value) == "No answer within 0s; turns: []"


class TrashGateway:
    def __init__(self, *, answer_wrong=False, stuck=False):
        self.answer_wrong, self.stuck = answer_wrong, stuck
        self.trashed = False

    def request(self, method, path, body=None, query=None):
        body, query = body or {}, query or {}
        if path.endswith("/trash"):
            if not self.stuck:
                self.trashed = body["trashed"]
            if self.answer_wrong:
                return {"sessions": []}
            return body
        listed_as_trashed = bool(query.get("trashed"))
        visible = self.trashed == listed_as_trashed
        return {"results": [{"id": "s1"}] if visible else []}


def test_trash_and_restore_moves_the_chat_out_and_back():
    assert stack_smoke.trash_and_restore(TrashGateway(), "s1") == "chat moved to Trash and restored"


def test_trash_and_restore_refuses_an_unexpected_answer():
    with pytest.raises(SmokeFailure) as raised:
        stack_smoke.trash_and_restore(TrashGateway(answer_wrong=True), "s1")
    assert str(raised.value) == "Trash answered {'sessions': []}"


def test_trash_and_restore_refuses_a_chat_that_did_not_move():
    with pytest.raises(SmokeFailure) as raised:
        stack_smoke.trash_and_restore(TrashGateway(stuck=True), "s1")
    assert str(raised.value) == "Chat is not in the trash after trashed=True."


def test_main_reports_the_first_failed_check_and_exits_1(tmp_path, monkeypatch, capsys):
    state = tmp_path / "state"
    (state / "gateway").mkdir(parents=True)
    (state / "gateway/initial-owner-password.txt").write_text("secret\n", encoding="utf-8")
    monkeypatch.setattr(stack_smoke, "STATE", state)

    class Failing:
        def __init__(self, origin, certificate):
            self.certificate = certificate

        def sign_in(self, password):
            assert password == "secret"
            print("signing in")
            raise SmokeFailure("Sign-in did not authenticate the session.")

    monkeypatch.setattr(stack_smoke, "Gateway", Failing)
    assert stack_smoke.main() == 1
    captured = capsys.readouterr()
    assert captured.err.strip() == "FAILED: Sign-in did not authenticate the session."
    assert "secret" not in captured.out + captured.err


def test_main_passes_when_every_check_passes(tmp_path, monkeypatch, capsys):
    state = tmp_path / "state"
    (state / "gateway").mkdir(parents=True)
    (state / "gateway/initial-owner-password.txt").write_text("secret\n", encoding="utf-8")
    monkeypatch.setattr(stack_smoke, "STATE", state)
    monkeypatch.setattr(
        stack_smoke,
        "Gateway",
        lambda origin, certificate: type("G", (), {"sign_in": lambda self, p: None})(),
    )
    monkeypatch.setattr(stack_smoke, "check_dashboard", lambda gateway: "dashboard ok")
    monkeypatch.setattr(stack_smoke, "chat_round_trip", lambda gateway: ("s1", "chat ok"))
    monkeypatch.setattr(stack_smoke, "check_inbox", lambda gateway: "inbox ok")
    monkeypatch.setattr(stack_smoke, "trash_and_restore", lambda gateway, session: "trash ok")
    assert stack_smoke.main() == 0
    lines = capsys.readouterr().out.splitlines()
    assert lines[:5] == ["signed in", "dashboard ok", "chat ok", "inbox ok", "trash ok"]
    assert lines[5].startswith("stack smoke passed in ")
