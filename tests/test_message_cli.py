"""Message CLI provides branching, retry, compare and version selection from the terminal."""

import io
import json
import sys
from pathlib import Path
from urllib.error import HTTPError

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
        monkeypatch.setattr(sys, "argv", ["conker.py", "message", *map(str, arguments)])
        return cli.cli()

    return run, calls, config_reads, state, check_headers


def test_list_sends_get_with_query_params(invoke, capsys):
    run, calls, _, state, check_headers = invoke
    state["responses"] = [{"results": [], "next_cursor": None}]
    assert run("list", "ses_a") == 0
    assert len(calls) == 1
    check_headers(0)
    assert (
        calls[0][0].full_url
        == "http://127.0.0.1:18551/sessions/ses_a/branch-history?limit=100"
    )

    # Test with limit and cursor
    calls.clear()
    state["responses"] = [{"results": [], "next_cursor": None}]
    assert run("list", "ses_a", "--limit", "5", "--cursor", "msg_x") == 0
    assert len(calls) == 1
    check_headers(0)
    assert (
        calls[0][0].full_url
        == "http://127.0.0.1:18551/sessions/ses_a/branch-history?limit=5&cursor=msg_x"
    )


def test_list_validation_exits_without_request(invoke, capsys):
    run, calls, _, _state, _ = invoke
    assert run("list", "ses_a", "--limit", "0") == 1
    assert len(calls) == 0
    assert "Use a limit of 1-200." in capsys.readouterr().err

    calls.clear()
    assert run("list", "ses_a", "--cursor", "../x") == 1
    assert len(calls) == 0


def test_branch_without_summary_makes_three_gets_then_post(invoke, capsys):
    run, calls, _, state, check_headers = invoke
    state["responses"] = [
        {"revision": 3, "settings": {}},
        {"revision": 1, "policy": None},
        {"revision": 1, "summary": None},
        {"session_id": "ses_new", "parent_id": "ses_a", "message_id": "msg_new"},
    ]
    assert run("branch", "ses_a", "msg_b") == 0
    assert len(calls) == 4
    check_headers(0)
    check_headers(1)
    check_headers(2)
    check_headers(3)
    assert calls[0][0].full_url == "http://127.0.0.1:18551/sessions/ses_a/settings"
    assert calls[1][0].full_url == "http://127.0.0.1:18551/context/ses_a"
    assert calls[2][0].full_url == "http://127.0.0.1:18551/context/ses_a/summary"
    assert (
        calls[3][0].full_url
        == "http://127.0.0.1:18551/sessions/ses_a/messages/msg_b/fork"
    )
    body = json.loads(calls[3][0].data)
    assert body["expected_settings_revision"] == 3
    assert body["expected_context_revision"] == 1
    assert "reviewed_summary" not in body
    assert body["request_id"].startswith("branch_")
    output = capsys.readouterr()
    result = json.loads(output.out)
    assert result["request_id"] == body["request_id"]


def test_branch_with_summary_requires_option(invoke, capsys):
    run, calls, _, state, _ = invoke
    state["responses"] = [
        {"revision": 3, "settings": {}},
        {"revision": 1, "policy": None},
        {"revision": 1, "summary": "existing summary"},
    ]
    assert run("branch", "ses_a", "msg_b") == 1
    assert len(calls) == 3  # Only the three GETs
    assert "This chat has a summary" in capsys.readouterr().err


def test_branch_drop_summary_and_file_options(invoke, tmp_path):
    run, calls, _, state, _check_headers = invoke

    # Test --drop-summary
    state["responses"] = [
        {"revision": 3, "settings": {}},
        {"revision": 1, "policy": None},
        {"revision": 1, "summary": "existing summary"},
        {"session_id": "ses_new", "parent_id": "ses_a", "message_id": "msg_new"},
    ]
    assert run("branch", "ses_a", "msg_b", "--drop-summary") == 0
    assert len(calls) == 4
    body = json.loads(calls[3][0].data)
    assert body["reviewed_summary"] == ""

    # Test --summary file
    calls.clear()
    file = tmp_path / "summary.txt"
    file.write_text("Reviewed summary\n")
    state["responses"] = [
        {"revision": 3, "settings": {}},
        {"revision": 1, "policy": None},
        {"revision": 1, "summary": "existing summary"},
        {"session_id": "ses_new", "parent_id": "ses_a", "message_id": "msg_new"},
    ]
    assert run("branch", "ses_a", "msg_b", "--summary", str(file)) == 0
    body = json.loads(calls[3][0].data)
    assert body["reviewed_summary"] == "Reviewed summary"


def test_branch_summary_options_refused_without_a_summary(invoke, capsys):
    run, calls, _, state, _ = invoke
    state["responses"] = [
        {"revision": 3, "settings": {}},
        {"revision": 1, "policy": None},
        {"revision": 0, "summary": None},
    ]
    assert run("branch", "ses_a", "msg_b", "--drop-summary") == 1
    assert len(calls) == 3
    assert "This chat has no summary" in capsys.readouterr().err


def test_retry_posts_with_model_and_prints_request_id(invoke, capsys):
    run, calls, _, state, check_headers = invoke
    state["responses"] = [
        {
            "request_id": "custom_retry_id_12345678",
            "model_id": "b",
            "turn_id": "turn_1",
            "status": "completed",
            "replayed": False,
            "message": {"id": "msg_new"},
        }
    ]
    assert (
        run(
            "retry",
            "ses_a",
            "msg_b",
            "--model",
            "b",
            "--request-id",
            "custom_retry_id_12345678",
        )
        == 0
    )
    assert len(calls) == 1
    check_headers(0)
    assert (
        calls[0][0].full_url
        == "http://127.0.0.1:18551/sessions/ses_a/messages/msg_b/retry"
    )
    body = json.loads(calls[0][0].data)
    assert body["model_id"] == "b"
    assert body["request_id"] == "custom_retry_id_12345678"
    output = capsys.readouterr()
    assert "Request id: custom_retry_id_12345678" in output.err
    result = json.loads(output.out)
    assert result["request_id"] == "custom_retry_id_12345678"


def test_retry_model_validation_exits_without_request(invoke, capsys):
    run, calls, _, _state, _ = invoke
    assert run("retry", "ses_a", "msg_b", "--model", "") == 1
    assert len(calls) == 0
    assert "Use a model ID of 1 to 200 characters." in capsys.readouterr().err


def test_retry_status_gets_receipt(invoke):
    run, calls, _, state, check_headers = invoke
    state["responses"] = [
        {
            "request_id": "retry_123",
            "model_id": "b",
            "turn_id": "turn_1",
            "status": "completed",
            "replayed": False,
            "message": {"id": "msg_new"},
        }
    ]
    assert run("retry-status", "ses_a", "retry_12345678901234567890") == 0
    assert len(calls) == 1
    check_headers(0)
    assert (
        calls[0][0].full_url
        == "http://127.0.0.1:18551/sessions/ses_a/response-retries/retry_12345678901234567890"
    )


def test_retry_status_short_id_exits(invoke, capsys):
    run, calls, _, _state, _ = invoke
    assert run("retry-status", "ses_a", "short_id") == 1
    assert len(calls) == 0
    assert "retry status request identity" in capsys.readouterr().err


def test_compare_posts_two_retries_sequentially(invoke, capsys):
    run, calls, _, state, check_headers = invoke
    state["responses"] = [
        {
            "request_id": "compare_123_1",
            "model_id": "b",
            "turn_id": "turn_1",
            "status": "completed",
            "replayed": False,
            "message": {"id": "msg_b"},
        },
        {
            "request_id": "compare_123_2",
            "model_id": "c",
            "turn_id": "turn_1",
            "status": "completed",
            "replayed": False,
            "message": {"id": "msg_c"},
        },
    ]
    assert run("compare", "ses_a", "msg_b", "--models", "b,c") == 0
    assert len(calls) == 2
    check_headers(0)
    check_headers(1)
    assert (
        calls[0][0].full_url
        == "http://127.0.0.1:18551/sessions/ses_a/messages/msg_b/retry"
    )
    body1 = json.loads(calls[0][0].data)
    assert body1["model_id"] == "b"
    assert body1["request_id"].endswith("_1")
    body2 = json.loads(calls[1][0].data)
    assert body2["model_id"] == "c"
    assert body2["request_id"].endswith("_2")
    output = capsys.readouterr()
    assert "Request id:" in output.err
    result = json.loads(output.out)
    assert result["request_id"].startswith("compare_")
    assert len(result["results"]) == 2


def test_compare_stops_at_first_refusal(invoke, capsys):
    run, calls, _, state, _check_headers = invoke
    state["responses"] = [
        {
            "request_id": "compare_123_1",
            "model_id": "b",
            "turn_id": "turn_1",
            "status": "completed",
            "replayed": False,
            "message": {"id": "msg_b"},
        },
        HTTPError(
            "http://private",
            409,
            "Conflict",
            {},
            io.BytesIO(b'{"detail": "model refused"}'),
        ),
    ]
    assert run("compare", "ses_a", "msg_b", "--models", "b,c") == 1
    assert len(calls) == 2
    output = capsys.readouterr()
    assert "Compare stopped at c" in output.err
    assert "--request-id" in output.err


def test_compare_validation_exits_without_request(invoke, capsys):
    run, calls, _, _state, _ = invoke
    assert run("compare", "ses_a", "msg_b", "--models", "b,b") == 1
    assert len(calls) == 0
    assert "Compare with 1-3 distinct model IDs" in capsys.readouterr().err

    calls.clear()
    assert run("compare", "ses_a", "msg_b", "--models", "") == 1
    assert len(calls) == 0

    calls.clear()
    assert run("compare", "ses_a", "msg_b", "--models", "a,b,c,d") == 1
    assert len(calls) == 0


def test_versions_and_select(invoke, capsys):
    run, calls, _, state, check_headers = invoke

    # Test versions GET
    family_response = {
        "root_message_id": "msg_root",
        "selected_message_id": "msg_1",
        "revision": 2,
        "versions": [
            {"message_id": "msg_1", "retry_of": None, "turn_id": "turn_1"},
            {"message_id": "msg_2", "retry_of": "msg_1", "turn_id": "turn_1"},
        ],
    }
    state["responses"] = [family_response]
    assert run("versions", "ses_a", "msg_root") == 0
    assert len(calls) == 1
    check_headers(0)
    assert (
        calls[0][0].full_url
        == "http://127.0.0.1:18551/sessions/ses_a/response-families/msg_root"
    )

    # Test select with valid version
    calls.clear()
    state["responses"] = [family_response, {"revision": 3}]
    assert run("select", "ses_a", "msg_root", "msg_2") == 0
    assert len(calls) == 2
    check_headers(0)
    check_headers(1)
    assert (
        calls[1][0].full_url
        == "http://127.0.0.1:18551/sessions/ses_a/response-families/msg_root/select"
    )
    body = json.loads(calls[1][0].data)
    assert body["message_id"] == "msg_2"
    assert body["expected_revision"] == 2

    # Test select with invalid version
    calls.clear()
    state["responses"] = [family_response]
    assert run("select", "ses_a", "msg_root", "msg_invalid") == 1
    assert len(calls) == 1  # Only GET
    assert "That message is not a version of this answer." in capsys.readouterr().err


def test_invalid_session_exits_without_config_read(invoke):
    run, calls, config_reads, _state, _ = invoke
    assert run("list", "../x") == 1
    assert not calls and not config_reads
