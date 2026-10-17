"""Review CLI provides fact checks, decisions, threads and model profiles from the terminal."""

import io
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import conker as cli


@pytest.fixture
def invoke(monkeypatch):
    calls, config_reads = [], []
    state = {"responses": []}

    def config():
        config_reads.append(True)
        return {
            "environments": {
                "gateway": {"GATEWAY_PI_OWNER_KEY": "fixture-owner-key"},
                "pi": {"PI_ADMIN_KEY": "fixture-admin-key"},
            }
        }

    class Opener:
        def open(self, request, timeout):
            calls.append((request, timeout))
            if not state["responses"]:
                raise AssertionError("unexpected request")

            response = state["responses"].pop(0)
            if isinstance(response, Exception):
                raise response

            raw = json.dumps(response, ensure_ascii=False).encode("utf-8")
            return io.BytesIO(raw)

    def opener(*handlers):
        assert handlers[0].proxies == {}
        assert isinstance(handlers[1], cli.NoRedirect)
        return Opener()

    def check_headers(call_index=0):
        """Check that a request has the correct headers."""
        request = calls[call_index][0]
        headers = dict(request.headers) if hasattr(request, "headers") else {}
        assert headers.get("X-pi-key") == "fixture-admin-key"
        assert headers.get("X-Pi-Owner-Key") is None

    monkeypatch.setattr(cli, "read_config", config)
    monkeypatch.setattr(cli, "build_opener", opener)

    def run(*arguments):
        monkeypatch.setattr(sys, "argv", ["conker.py", *map(str, arguments)])
        return cli.cli()

    return run, calls, config_reads, state, check_headers


# --- fact-check ---


def test_fact_check_posts_with_generated_request_id(invoke, capsys):
    run, calls, _, state, check_headers = invoke
    state["responses"] = [
        {
            "request_id": "ignored",
            "message_id": "msg_1",
            "modelId": "model_x",
            "claims": [],
            "counts": {"total": 0, "supported": 0, "refuted": 0, "unverifiable": 0},
            "sources": [],
            "sourcesTruncated": False,
            "replayed": False,
        }
    ]
    assert run("message", "fact-check", "ses_a", "msg_b") == 0
    assert len(calls) == 1
    check_headers(0)
    assert (
        calls[0][0].full_url
        == "http://127.0.0.1:18551/sessions/ses_a/messages/msg_b/fact-check"
    )
    body = json.loads(calls[0][0].data)
    assert body["request_id"].startswith("check_")
    assert "model_id" not in body
    output = capsys.readouterr()
    assert "Request id: check_" in output.err


def test_fact_check_with_model_and_custom_request_id(invoke, capsys):
    run, calls, _, state, check_headers = invoke
    state["responses"] = [
        {
            "request_id": "custom_check_id_123456",
            "message_id": "msg_1",
            "modelId": "fact_model",
            "claims": [],
            "counts": {"total": 0, "supported": 0, "refuted": 0, "unverifiable": 0},
            "sources": [],
            "sourcesTruncated": False,
            "replayed": False,
        }
    ]
    assert (
        run(
            "message",
            "fact-check",
            "ses_a",
            "msg_b",
            "--model",
            "fact_model",
            "--request-id",
            "custom_check_id_123456",
        )
        == 0
    )
    assert len(calls) == 1
    check_headers(0)
    body = json.loads(calls[0][0].data)
    assert body["model_id"] == "fact_model"
    assert body["request_id"] == "custom_check_id_123456"
    output = capsys.readouterr()
    assert "Request id: custom_check_id_123456" in output.err


def test_fact_check_short_request_id_exits(invoke, capsys):
    run, calls, _, _state, _ = invoke
    assert run("message", "fact-check", "ses_a", "msg_b", "--request-id", "short") == 1
    assert len(calls) == 0
    assert "fact-check request identity" in capsys.readouterr().err


def test_fact_check_empty_model_exits(invoke, capsys):
    run, calls, _, _state, _ = invoke
    assert run("message", "fact-check", "ses_a", "msg_b", "--model", "") == 1
    assert len(calls) == 0
    assert "Use a model ID of 1 to 200 characters." in capsys.readouterr().err


# --- fact-checks ---


def test_fact_checks_gets_results(invoke):
    run, calls, _, state, check_headers = invoke
    state["responses"] = [{"results": [{"request_id": "check_1", "claims": []}]}]
    assert run("message", "fact-checks", "ses_a", "msg_b") == 0
    assert len(calls) == 1
    check_headers(0)
    assert (
        calls[0][0].full_url
        == "http://127.0.0.1:18551/sessions/ses_a/messages/msg_b/fact-checks"
    )
    assert calls[0][0].data is None


# --- decide ---


def test_decide_posts_with_cites_and_replaces(invoke):
    run, calls, _, state, check_headers = invoke
    state["responses"] = [
        {"revision": 3, "items": []},
        {"revision": 4, "items": [{"id": "dec_abcdef0123456789"}]},
    ]
    assert (
        run(
            "context",
            "decide",
            "ses_a",
            "Decision text",
            "--cite",
            "msg_1",
            "--cite",
            "msg_2",
            "--replaces",
            "dec_0123456789abcdef",
        )
        == 0
    )
    assert len(calls) == 2
    check_headers(0)
    check_headers(1)
    assert calls[0][0].full_url == "http://127.0.0.1:18551/context/ses_a/items"
    assert calls[1][0].full_url == "http://127.0.0.1:18551/context/ses_a/items"
    body = json.loads(calls[1][0].data)
    assert body["expected_revision"] == 3
    assert body["kind"] == "decision"
    assert body["text"] == "Decision text"
    assert body["author"] == "owner"
    assert body["cites"] == ["msg_1", "msg_2"]
    assert body["replaces"] == "dec_0123456789abcdef"


def test_decide_without_cite_sends_empty_cites_and_no_replaces(invoke):
    run, calls, _, state, _check_headers = invoke
    state["responses"] = [
        {"revision": 1, "items": []},
        {"revision": 2, "items": []},
    ]
    assert run("context", "decide", "ses_a", "Simple decision") == 0
    assert len(calls) == 2
    body = json.loads(calls[1][0].data)
    assert body["cites"] == []
    assert "replaces" not in body


def test_decide_empty_text_exits(invoke, capsys):
    run, calls, _, _state, _ = invoke
    assert run("context", "decide", "ses_a", "") == 1
    assert len(calls) == 0
    assert "Use 1-500 characters of text." in capsys.readouterr().err


def test_decide_long_text_exits(invoke, capsys):
    run, calls, _, _state, _ = invoke
    assert run("context", "decide", "ses_a", "x" * 501) == 1
    assert len(calls) == 0
    assert "Use 1-500 characters of text." in capsys.readouterr().err


def test_decide_tab_character_exits(invoke, capsys):
    run, calls, _, _state, _ = invoke
    assert run("context", "decide", "ses_a", "text\twith tab") == 1
    assert len(calls) == 0
    assert "Use 1-500 characters of text." in capsys.readouterr().err


def test_decide_too_many_cites_exits(invoke, capsys):
    run, calls, _, _state, _ = invoke
    cites = [f"msg_{i}" for i in range(11)]
    args = ["context", "decide", "ses_a", "Decision"]
    for c in cites:
        args.extend(["--cite", c])
    assert run(*args) == 1
    assert len(calls) == 0
    assert "at most 10 cites" in capsys.readouterr().err


def test_decide_duplicate_cite_exits(invoke, capsys):
    run, calls, _, _state, _ = invoke
    assert (
        run(
            "context",
            "decide",
            "ses_a",
            "Decision",
            "--cite",
            "msg_1",
            "--cite",
            "msg_1",
        )
        == 1
    )
    assert len(calls) == 0
    assert "Cites must be distinct." in capsys.readouterr().err


def test_decide_wrong_replaces_prefix_exits(invoke, capsys):
    run, calls, _, _state, _ = invoke
    assert (
        run(
            "context",
            "decide",
            "ses_a",
            "Decision",
            "--replaces",
            "thr_0123456789abcdef",
        )
        == 1
    )
    assert len(calls) == 0
    assert "decision item identity" in capsys.readouterr().err


# --- thread ---


def test_thread_posts_with_cites(invoke):
    run, calls, _, state, check_headers = invoke
    state["responses"] = [
        {"revision": 2, "items": []},
        {"revision": 3, "items": [{"id": "thr_abcdef0123456789"}]},
    ]
    assert run("context", "thread", "ses_a", "Thread text", "--cite", "msg_1") == 0
    assert len(calls) == 2
    check_headers(0)
    check_headers(1)
    body = json.loads(calls[1][0].data)
    assert body["kind"] == "thread"
    assert body["text"] == "Thread text"
    assert body["author"] == "owner"
    assert body["cites"] == ["msg_1"]
    assert "replaces" not in body


def test_thread_without_cite_sends_empty_cites(invoke):
    run, calls, _, state, _check_headers = invoke
    state["responses"] = [
        {"revision": 1, "items": []},
        {"revision": 2, "items": []},
    ]
    assert run("context", "thread", "ses_a", "Simple thread") == 0
    body = json.loads(calls[1][0].data)
    assert body["cites"] == []
    assert "replaces" not in body


# --- items ---


def test_items_gets_items(invoke):
    run, calls, _, state, check_headers = invoke
    state["responses"] = [
        {
            "revision": 1,
            "items": [
                {"id": "dec_abcdef0123456789", "kind": "decision", "text": "Decided"}
            ],
        }
    ]
    assert run("context", "items", "ses_a") == 0
    assert len(calls) == 1
    check_headers(0)
    assert calls[0][0].full_url == "http://127.0.0.1:18551/context/ses_a/items"
    assert calls[0][0].data is None


# --- item-state ---


def test_item_state_posts_state_change(invoke):
    run, calls, _, state, check_headers = invoke
    state["responses"] = [
        {"revision": 2, "items": []},
        {"revision": 3, "items": []},
    ]
    assert (
        run("context", "item-state", "ses_a", "dec_0123456789abcdef", "resolved") == 0
    )
    assert len(calls) == 2
    check_headers(0)
    check_headers(1)
    assert (
        calls[1][0].full_url
        == "http://127.0.0.1:18551/context/ses_a/items/dec_0123456789abcdef/state"
    )
    body = json.loads(calls[1][0].data)
    assert body["expected_revision"] == 2
    assert body["state"] == "resolved"


def test_item_state_invalid_item_exits(invoke, capsys):
    run, calls, _, _state, _ = invoke
    assert run("context", "item-state", "ses_a", "../x", "active") == 1
    assert len(calls) == 0
    assert "item identity" in capsys.readouterr().err


def test_item_state_invalid_state_exits(invoke):
    run, calls, _, _state, _ = invoke
    with pytest.raises(SystemExit):
        run("context", "item-state", "ses_a", "dec_0123456789abcdef", "maybe")
    assert len(calls) == 0


# --- profiles ---


def test_profiles_gets_profiles(invoke):
    run, calls, _, state, check_headers = invoke
    state["responses"] = [{"configurationRevision": 1, "models": []}]
    assert run("profiles") == 0
    assert len(calls) == 1
    check_headers(0)
    assert calls[0][0].full_url == "http://127.0.0.1:18551/models/profiles"
    assert calls[0][0].data is None
