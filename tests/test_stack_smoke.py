"""The stack smoke test's checks, against a fake Gateway that behaves like Pi and ToolGate."""

from typing import Any

import pytest

from scripts import stack_smoke
from scripts.stack_smoke import SmokeFailure

SESSION = "ses_0123456789abcdef"


class FakeGateway:
    def __init__(self, answer_after=1, turn_status="completed", restore=True):
        self.polls = 0
        self.answer_after, self.turn_status, self.restore = answer_after, turn_status, restore
        self.trashed = False
        self.calls = []

    def raw(self, method, path, body=None, query=None, accept="application/json"):
        return 200, '<html><div id="root"></div></html>'

    def request(self, method, path, body: Any = None, query: Any = None):
        self.calls.append((method, path, body, query))
        if (method, path) == ("POST", "/api/pi/sessions"):
            return {"session_id": SESSION}
        if path == f"/api/pi/sessions/{SESSION}/turns":
            assert len(body["request_id"]) >= 16 and body["text"]
            return {"submission": {}}
        if path == f"/api/pi/sessions/{SESSION}":
            self.polls += 1
            done = self.polls > self.answer_after
            turn = {"status": self.turn_status if done else "running", "detail": "model down"}
            messages = [{"role": "user", "content": "hi"}]
            if done and self.turn_status == "completed":
                messages.append({"role": "assistant", "content": "Four."})
            return {"turns": [turn], "messages": messages}
        if path == "/api/control/pi/sessions/trash":
            if body["trashed"] or self.restore:
                self.trashed = body["trashed"]
            return {"sessions": body["sessions"], "trashed": body["trashed"]}
        if path == "/api/pi/sessions/history":
            in_trash = query.get("trashed") == "only"
            return {"results": [{"id": SESSION}] if in_trash == self.trashed else []}
        if path == "/api/owner/requests":
            return {"results": [], "next_cursor": None}
        raise AssertionError(f"unexpected call {method} {path}")


def test_a_chat_is_answered_after_the_turn_settles():
    gateway = FakeGateway(answer_after=2)
    session, summary = stack_smoke.chat_round_trip(gateway, sleep=lambda _: None)
    assert session == SESSION and gateway.polls == 3
    assert "Four." in summary and "completed" in summary


def test_a_failed_turn_fails_the_smoke_with_its_detail():
    with pytest.raises(SmokeFailure, match="failed: model down"):
        stack_smoke.chat_round_trip(FakeGateway(turn_status="failed"), sleep=lambda _: None)


def test_no_answer_in_time_fails_the_smoke():
    with pytest.raises(SmokeFailure, match="No answer within 0s"):
        stack_smoke.chat_round_trip(FakeGateway(answer_after=99), seconds=0, sleep=lambda _: None)


def test_trash_and_restore_checks_both_lists():
    gateway = FakeGateway()
    assert stack_smoke.trash_and_restore(gateway, SESSION) == "chat moved to Trash and restored"
    bodies = [c[2] for c in gateway.calls if c[1] == "/api/control/pi/sessions/trash"]
    assert bodies == [
        {"sessions": [SESSION], "trashed": True},
        {"sessions": [SESSION], "trashed": False},
    ]


def test_a_chat_left_in_the_trash_fails_the_smoke():
    with pytest.raises(SmokeFailure, match="not in the chat list"):
        stack_smoke.trash_and_restore(FakeGateway(restore=False), SESSION)


def test_inbox_and_dashboard_checks():
    gateway = FakeGateway()
    assert stack_smoke.check_inbox(gateway) == "inbox listed (0 requests)"
    assert stack_smoke.check_dashboard(gateway).startswith("dashboard served")


def test_an_inbox_without_its_list_fails_the_smoke():
    gateway = FakeGateway()
    gateway.request = lambda *args, **kwargs: {"error": "x"}
    with pytest.raises(SmokeFailure, match="unexpected shape"):
        stack_smoke.check_inbox(gateway)
