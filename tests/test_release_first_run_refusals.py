"""Refusals of the release gate's first-run steps (scripts/release_first_run.py): browser sign-in,
bounded JSON replies, model and boundary choices, setup status, the conversation and the rehearsal.
Every command and HTTP call is a fake; nothing reaches a network, Docker or the home folder."""

from __future__ import annotations

import io
import json
import sys
from pathlib import Path
from typing import Any

import pytest

# The gate runs as `python3 scripts/release_acceptance.py`, so its modules import each other flat.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import release_first_run
from release_checks import SETUP_STEP_IDS, AcceptanceError, Evidence
from release_first_run import FirstRunSteps

ROUTE = "qwen2.5:0.5b"


class Result:
    def __init__(self, stdout: str):
        self.stdout = stdout
        self.stderr = ""
        self.returncode = 0


class ScriptedRunner:
    """Answers each phase with a scripted stdout (dicts and lists become JSON)."""

    def __init__(self, replies: dict[str, Any] | None = None):
        self.env = {"CONKER_LOCAL_MODEL": ROUTE}
        self.replies = replies or {}
        self.calls: list[tuple[list[str], str, dict[str, Any]]] = []

    def run(self, args, *, phase="command", **kwargs):
        self.calls.append((list(args), phase, kwargs))
        body = self.replies.get(phase, {"status": "ok"})
        return Result(body if isinstance(body, str) else json.dumps(body))

    def phases(self) -> list[str]:
        return [phase for _, phase, _ in self.calls]


def steps(tmp_path: Path, replies: dict[str, Any] | None = None) -> FirstRunSteps:
    gate = FirstRunSteps()
    gate.runner = ScriptedRunner(replies)
    gate.evidence = Evidence(tmp_path / "evidence")
    gate.work = tmp_path / "work"
    gate.work.mkdir()
    gate.snapshot_store = tmp_path / "snapshots"
    gate.cert = tmp_path / "gateway.pem"
    gate.password = "release-test-password"
    gate.require_conversation = True
    return gate


def events(gate: FirstRunSteps) -> list[dict[str, Any]]:
    if not gate.evidence.events_path.exists():
        return []
    return [json.loads(line) for line in gate.evidence.events_path.read_text().splitlines()]


def candidate(**overrides: Any) -> dict[str, Any]:
    return {"id": "local-answer", "route": ROUTE, "execution": "local", "status": "ready", **overrides}


# --- browser sign-in -------------------------------------------------------------------------


@pytest.fixture()
def fake_tls(monkeypatch):
    seen: dict[str, Any] = {}

    def create_default_context(*, cafile=None):
        seen["cafile"] = cafile
        return None  # HTTPSHandler accepts context=None; no request is ever sent

    monkeypatch.setattr(release_first_run.ssl, "create_default_context", create_default_context)
    return seen


def scripted_auth(gate: FirstRunSteps, replies: list[dict[str, Any]]) -> list[tuple]:
    calls: list[tuple] = []

    def request_json(opener, method, path, body=None, *, csrf=None, timeout=30):
        calls.append((method, path, body, csrf))
        return replies[len(calls) - 1]

    gate._request_json = request_json  # type: ignore[method-assign]
    return calls


def test_sign_in_refuses_a_session_that_never_becomes_authenticated(tmp_path, fake_tls):
    gate = steps(tmp_path, {"certificate-export": "-----BEGIN CERTIFICATE-----\nx\n"})
    calls = scripted_auth(
        gate,
        [{"csrf_token": "c1"}, {"authenticated": True}, {"authenticated": False}],
    )

    with pytest.raises(AcceptanceError, match="did not become authenticated"):
        gate.setup_password_and_authenticate()

    assert not hasattr(gate, "browser")
    assert not (gate.evidence.root / "browser-auth.json").exists()
    assert calls[1] == ("POST", "/auth/login", {"password": gate.password}, "c1")
    # The password goes to the host on stdin twice, never on the command line.
    args, phase, kwargs = gate.runner.calls[0]
    assert phase == "host-password-setup"
    assert kwargs["input_text"] == f"{gate.password}\n{gate.password}\n"
    assert gate.password not in " ".join(args)


def test_sign_in_pins_the_exported_certificate_and_records_no_secret(tmp_path, fake_tls):
    certificate = "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----\n"
    gate = steps(tmp_path, {"certificate-export": certificate})
    scripted_auth(
        gate,
        [
            {"csrf_token": "c1"},
            {"authenticated": True},
            {"authenticated": True, "csrf_token": "c2"},
        ],
    )

    gate.setup_password_and_authenticate()

    assert gate.cert.read_text(encoding="utf-8") == certificate
    assert fake_tls["cafile"] == str(gate.cert)
    # The login reply carried no token, so the session's token is kept.
    assert gate.browser[1] == "c2"
    record = json.loads((gate.evidence.root / "browser-auth.json").read_text())
    assert record["login_authenticated"] is True
    assert record["cookie_names"] == []
    assert len(record["certificate_sha256"]) == 64
    assert gate.password not in gate.evidence.events_path.read_text()
    assert events(gate)[-1]["phase"] == "browser-auth"


# --- bounded JSON replies --------------------------------------------------------------------


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()


class FakeOpener:
    def __init__(self, raw: bytes):
        self.raw = raw
        self.requests: list[Any] = []

    def open(self, request, timeout):
        self.requests.append((request, timeout))
        return FakeResponse(self.raw)


def test_reply_over_one_mebibyte_is_refused(tmp_path):
    gate = steps(tmp_path)
    opener = FakeOpener(b"{" + b" " * 1048576 + b"}")

    with pytest.raises(AcceptanceError, match=r"response from /auth/session exceeded 1 MiB"):
        gate._request_json(opener, "GET", "/auth/session")


def test_reply_of_exactly_one_mebibyte_is_read(tmp_path):
    gate = steps(tmp_path)
    raw = b'{"ok": true}'
    opener = FakeOpener(raw + b" " * (1048576 - len(raw)))

    assert gate._request_json(opener, "GET", "/auth/session") == {"ok": True}


@pytest.mark.parametrize("raw", [b"[]", b'"text"', b"null", b"3"])
def test_reply_that_is_not_a_json_object_is_refused(tmp_path, raw):
    gate = steps(tmp_path)

    with pytest.raises(AcceptanceError, match="response from /auth/login was not a JSON object"):
        gate._request_json(FakeOpener(raw), "POST", "/auth/login", {"password": "x"})


def test_reply_that_is_not_json_raises(tmp_path):
    gate = steps(tmp_path)

    with pytest.raises(json.JSONDecodeError):
        gate._request_json(FakeOpener(b"<html>sign in</html>"), "GET", "/auth/session")


def test_get_sends_no_body_and_no_csrf_header(tmp_path):
    gate = steps(tmp_path)
    opener = FakeOpener(b"{}")

    gate._request_json(opener, "GET", "/auth/session")

    request, timeout = opener.requests[0]
    assert request.full_url == "https://localhost:8050/auth/session"
    assert request.get_method() == "GET"
    assert request.data is None
    assert request.get_header("Content-type") is None
    assert request.get_header("X-csrf-token") is None
    assert request.get_header("Origin") == "https://localhost:8050"
    assert timeout == 30


def test_post_sends_json_with_its_csrf_token_and_timeout(tmp_path):
    gate = steps(tmp_path)
    opener = FakeOpener(b"{}")

    gate._request_json(opener, "POST", "/auth/login", {"password": "p"}, csrf="tok", timeout=7)

    request, timeout = opener.requests[0]
    assert request.get_method() == "POST"
    assert json.loads(request.data) == {"password": "p"}
    assert request.get_header("Content-type") == "application/json"
    assert request.get_header("X-csrf-token") == "tok"
    assert timeout == 7


# --- model candidate and boundary digest ----------------------------------------------------


@pytest.mark.parametrize(
    ("candidates", "count"),
    [
        (None, 0),
        ([], 0),
        ("not a list", 0),
        (["local-answer"], 0),
        ([candidate(route="other:1b")], 0),
        ([candidate(execution="remote")], 0),
        ([candidate(status="probing")], 0),
        ([candidate(id=7)], 0),
        ([candidate(), candidate(id="second")], 2),
    ],
)
def test_model_step_needs_exactly_one_ready_local_candidate(tmp_path, candidates, count):
    gate = steps(tmp_path, {"setup-model-options": {"candidates": candidates}})

    with pytest.raises(AcceptanceError, match=f"setup exposed {count} ready local candidates"):
        gate.configure_first_run()

    assert "setup-model-probe" not in gate.runner.phases()
    assert not (gate.evidence.root / "setup-configuration.json").exists()


@pytest.mark.parametrize(
    "inspection",
    [
        {},
        {"digest": None},
        {"digest": 123},
        {"digest": "a" * 63},
        {"digest": "a" * 65},
        {"digest": "A" * 64},
        {"digest": "g" * 64},
        {"digest": "a" * 64 + "\n"},
    ],
)
def test_boundary_step_refuses_anything_but_an_exact_digest(tmp_path, inspection):
    gate = steps(
        tmp_path,
        {
            "setup-model-options": {"candidates": [candidate()]},
            "setup-boundaries-inspect": inspection,
        },
    )

    with pytest.raises(AcceptanceError, match="no exact policy digest"):
        gate.configure_first_run()

    assert "setup-boundaries-confirm" not in gate.runner.phases()


def test_protection_step_needs_a_snapshot_store(tmp_path):
    gate = steps(
        tmp_path,
        {
            "setup-model-options": {"candidates": [candidate()]},
            "setup-boundaries-inspect": {"digest": "b" * 64},
        },
    )
    gate.snapshot_store = None

    with pytest.raises(AssertionError):
        gate.configure_first_run()

    assert "setup-protection-policy" not in gate.runner.phases()


# --- setup status ----------------------------------------------------------------------------


def complete_status() -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "state": "complete",
        "currentStep": None,
        "recommendedNextOperation": None,
        "steps": [{"id": step, "state": "complete"} for step in sorted(SETUP_STEP_IDS)],
    }


def test_incomplete_setup_status_is_kept_as_evidence_then_refused(tmp_path):
    status = complete_status()
    status["state"] = "in_progress"
    status["steps"][0]["state"] = "pending"
    gate = steps(tmp_path, {"setup-status": status})

    with pytest.raises(AcceptanceError, match="setup did not finish every release step"):
        gate.verify_setup_status()

    assert json.loads((gate.evidence.root / "setup-status.json").read_text()) == status
    assert "setup-status" not in [event["phase"] for event in events(gate)]


def test_complete_setup_status_passes(tmp_path):
    gate = steps(tmp_path, {"setup-status": complete_status()})

    gate.verify_setup_status()

    assert events(gate)[-1] == {**events(gate)[-1], "phase": "setup-status", "status": "passed"}
    assert events(gate)[-1]["reported_state"] == "complete"


# --- conversation ----------------------------------------------------------------------------


def conversation_gate(tmp_path: Path, replies: list[dict[str, Any]]):
    gate = steps(tmp_path)
    gate.browser = ("opener", "csrf-1")
    posts: list[tuple] = []

    def verified_post(opener, csrf, path, body, timeout=30):
        posts.append((opener, csrf, path, body, timeout))
        return replies[len(posts) - 1]

    gate._verified_post = verified_post
    return gate, posts


def test_conversation_skipped_when_disabled_sends_nothing(tmp_path):
    gate, posts = conversation_gate(tmp_path, [])
    gate.require_conversation = False

    gate.rehearse_conversation()

    assert posts == []
    assert events(gate)[-1]["status"] == "skipped"


@pytest.mark.parametrize("session", [{}, {"session_id": ""}, {"session_id": None}])
def test_conversation_refuses_a_missing_session(tmp_path, session):
    gate, posts = conversation_gate(tmp_path, [session])

    with pytest.raises(AcceptanceError, match="did not create a session"):
        gate.rehearse_conversation()

    assert len(posts) == 1


@pytest.mark.parametrize(
    "turn",
    [
        {},
        {"turn_id": "t1"},
        {"turn_id": "t1", "message": None},
        {"turn_id": "t1", "message": {"content": None}},
        {"turn_id": "t1", "message": {"content": "  \n "}},
        {"message": {"content": "assembled release accepted"}},
    ],
)
def test_conversation_refuses_a_turn_with_no_recorded_answer(tmp_path, turn):
    gate, _ = conversation_gate(tmp_path, [{"session_id": "s1"}, turn])

    with pytest.raises(AcceptanceError, match="produced no recorded answer"):
        gate.rehearse_conversation()

    assert not (gate.evidence.root / "conversation.json").exists()


def test_conversation_records_a_digest_not_the_reply(tmp_path):
    reply = "assembled release accepted"
    gate, posts = conversation_gate(
        tmp_path,
        [{"session_id": "s1"}, {"turn_id": "t1", "status": "complete", "message": {"content": reply}}],
    )

    gate.rehearse_conversation()

    _, csrf, path, body, timeout = posts[1]
    assert (csrf, path, timeout) == ("csrf-1", "/api/pi/sessions/s1/turns", 240)
    assert body["request_id"].startswith("release_acceptance_")
    record = json.loads((gate.evidence.root / "conversation.json").read_text())
    assert record["reply_length"] == len(reply)
    assert reply not in json.dumps(record)


# --- rehearsal -------------------------------------------------------------------------------


def test_rehearsal_refused_without_the_conversation(tmp_path):
    gate = steps(tmp_path)
    gate.require_conversation = False

    with pytest.raises(AcceptanceError, match="requires the conversation rehearsal"):
        gate.complete_rehearsal()

    assert gate.runner.calls == []


@pytest.mark.parametrize(
    "request_id",
    [None, 42, "", "1starts-with-digit", "has space", "semi;colon", "a" * 129, "a/../b"],
)
def test_rehearsal_refuses_an_unbounded_approval_id(tmp_path, request_id):
    gate = steps(tmp_path, {"setup-rehearsal-approval-start": {"approvalRequestId": request_id}})

    with pytest.raises(AcceptanceError, match="one bounded approval request ID"):
        gate.complete_rehearsal()

    assert not (gate.work / "rehearsal-approval.json").exists()
    assert "setup-rehearsal-approval-decide" not in gate.runner.phases()


def test_rehearsal_accepts_the_longest_bounded_id(tmp_path):
    request_id = "a" + "Z9_.:-" * 21 + "b"  # 128 characters
    gate = steps(
        tmp_path,
        {
            "setup-rehearsal-approval-start": {"approvalRequestId": request_id},
            "setup-rehearsal-finalize": {"source": "conker.first-run-rehearsal"},
        },
    )

    gate.complete_rehearsal()

    assert json.loads((gate.work / "rehearsal-approval.json").read_text())["id"] == request_id


@pytest.mark.parametrize("receipt", [{}, {"source": "someone.else"}, {"source": None}])
def test_rehearsal_refuses_a_receipt_from_another_source(tmp_path, receipt):
    gate = steps(
        tmp_path,
        {
            "setup-rehearsal-approval-start": {"approvalRequestId": "setup-approval-1"},
            "setup-rehearsal-finalize": receipt,
        },
    )

    with pytest.raises(AcceptanceError, match="expected first-run rehearsal receipt"):
        gate.complete_rehearsal()

    assert not (gate.evidence.root / "setup-rehearsal.json").exists()
    assert gate.runner.phases()[-1] == "setup-rehearsal-finalize"
