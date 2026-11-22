"""Chat context CLI: summary edit and restore, fork, and the shape of refusals."""

import io
import json
from typing import Any, cast
from urllib.error import HTTPError

from tests._context_cli_helpers import invoke  # noqa: F401  (fixture)


def test_summary_edit_posts_to_summary_endpoint(invoke, tmp_path):
    run, calls, _, state, check_headers = invoke
    state["responses"] = [
        {"revision": 2, "summary": "old", "source_session_id": None, "versions": []},
        {"revision": 3},
    ]
    file = tmp_path / "summary.txt"
    file.write_text("New summary")
    assert run("summary-edit", "ses_a", str(file)) == 0
    assert len(calls) == 2
    check_headers(0)
    check_headers(1)
    assert calls[1][0].full_url == "http://127.0.0.1:18551/context/ses_a/summary"
    body = json.loads(calls[1][0].data)
    assert body["expected_revision"] == 2
    assert body["summary"] == "New summary"


def test_summary_restore_posts_to_restore_endpoint(invoke, capsys):
    run, calls, _, state, check_headers = invoke
    state["responses"] = [
        {
            "revision": 3,
            "summary": "current",
            "source_session_id": None,
            "versions": [
                {
                    "revision": 1,
                    "summary": "old",
                    "source_session_id": None,
                    "created_at": "2023-01-01T00:00:00Z",
                    "restored_from": None,
                }
            ],
        },
        {"revision": 4},
    ]
    assert run("summary-restore", "ses_a", "1") == 0
    assert len(calls) == 2
    check_headers(0)
    check_headers(1)
    assert calls[1][0].full_url == "http://127.0.0.1:18551/context/ses_a/summary/restore"
    body = json.loads(calls[1][0].data)
    assert body["expected_revision"] == 3
    assert body["revision"] == 1

    # Test unknown revision exits without posting
    calls.clear()
    state["responses"] = [
        {
            "revision": 3,
            "summary": "current",
            "source_session_id": None,
            "versions": [
                {
                    "revision": 1,
                    "summary": "old",
                    "source_session_id": None,
                    "created_at": "2023-01-01T00:00:00Z",
                    "restored_from": None,
                }
            ],
        }
    ]
    assert run("summary-restore", "ses_a", "99") == 1
    assert len(calls) == 1  # Only GET
    check_headers(0)
    assert "That summary version does not exist." in capsys.readouterr().err


def test_fork_generated_id_and_last_message(invoke, tmp_path, capsys):
    run, calls, _, state, check_headers = invoke
    policy_response = {
        "revision": 1,
        "policy": {
            "sessionInstructions": "",
            "messagePolicies": {},
            "budget": {
                "contextWindowTokens": 8000,
                "outputReserveTokens": 1000,
                "otherInputTokens": 0,
            },
        },
    }
    state["responses"] = [
        policy_response,
        {"messages": [{"id": "msg_123"}, {"id": "msg_456"}]},
        {"session_id": "ses_new", "parent_id": "ses_a", "replayed": False},
    ]

    file = tmp_path / "summary.txt"
    file.write_text("Fork summary")

    result = run("fork", "ses_a", str(file))
    assert result == 0

    # Should have: GET policy, GET session, POST fork
    assert len(calls) == 3
    check_headers(0)
    check_headers(1)
    check_headers(2)
    assert calls[0][0].full_url == "http://127.0.0.1:18551/context/ses_a"
    assert calls[1][0].full_url == "http://127.0.0.1:18551/sessions/ses_a"
    fork_call = calls[2][0]
    assert fork_call.full_url == "http://127.0.0.1:18551/context/ses_a/fork"
    body = json.loads(fork_call.data)
    assert body["expected_revision"] == 1
    assert body["expected_last_message_id"] == "msg_456"
    assert body["summary"] == "Fork summary"
    assert body["request_id"].startswith("fork_")
    assert len(body["request_id"]) == 37  # fork_ + 32 hex chars

    # Check response has request_id added
    output = capsys.readouterr()
    result_json = json.loads(output.out)
    assert result_json["request_id"] == body["request_id"]


def test_fork_custom_request_id_and_no_messages(invoke, tmp_path):
    run, calls, _, state, check_headers = invoke
    policy_response = {
        "revision": 1,
        "policy": {
            "sessionInstructions": "",
            "messagePolicies": {},
            "budget": {
                "contextWindowTokens": 8000,
                "outputReserveTokens": 1000,
                "otherInputTokens": 0,
            },
        },
    }
    state["responses"] = [
        policy_response,
        {"messages": []},
        {"session_id": "ses_new", "parent_id": "ses_a", "replayed": False},
    ]

    file = tmp_path / "summary.txt"
    file.write_text("Summary")

    result = run("fork", "ses_a", str(file), "--request-id", "custom_fork_id_123")
    assert result == 0

    assert len(calls) == 3
    check_headers(0)
    check_headers(1)
    check_headers(2)
    fork_call = calls[2][0]
    body = json.loads(fork_call.data)
    assert body["request_id"] == "custom_fork_id_123"
    assert body["expected_last_message_id"] is None


def test_fork_revision_0_exits(invoke, tmp_path, capsys):
    run, calls, _, state, check_headers = invoke
    state["responses"] = [{"revision": 0, "policy": None}]

    file = tmp_path / "summary.txt"
    file.write_text("Summary")

    assert run("fork", "ses_a", str(file)) == 1
    assert len(calls) == 1
    check_headers(0)
    assert "Fork needs saved context settings" in capsys.readouterr().err


def test_fork_short_request_id_exits(invoke, tmp_path, capsys):
    run, calls, _, state, _ = invoke
    state["responses"] = [
        {
            "revision": 1,
            "policy": {
                "sessionInstructions": "",
                "messagePolicies": {},
                "budget": {
                    "contextWindowTokens": 8000,
                    "outputReserveTokens": 1000,
                    "otherInputTokens": 0,
                },
            },
        }
    ]

    file = tmp_path / "summary.txt"
    file.write_text("Summary")

    assert run("fork", "ses_a", str(file), "--request-id", "short") == 1
    assert len(calls) == 0
    assert "fork request identity" in capsys.readouterr().err


def test_refusals_various_formats(invoke, capsys):
    run, calls, _, state, check_headers = invoke

    # Test 404 with string detail
    state["responses"] = [
        HTTPError(
            "http://private",
            404,
            "Not Found",
            cast(Any, {}),
            io.BytesIO(b'{"detail": "no such session"}'),
        )
    ]
    assert run("show", "ses_a") == 1
    assert len(calls) == 1
    check_headers(0)
    assert "Pi refused this: no such session" in capsys.readouterr().err

    # Test 422 with list detail
    calls.clear()
    state["responses"] = [
        HTTPError(
            "http://private",
            422,
            "Unprocessable Entity",
            cast(Any, {}),
            io.BytesIO(b'{"detail": [{"loc": ["body"], "msg": "bad"}]}'),
        )
    ]
    assert run("show", "ses_a") == 1
    assert len(calls) == 1
    check_headers(0)
    assert "Pi refused this (HTTP 422)." in capsys.readouterr().err

    # Test 409 with non-JSON body
    calls.clear()
    state["responses"] = [
        HTTPError("http://private", 409, "Conflict", cast(Any, {}), io.BytesIO(b"not json"))
    ]
    assert run("show", "ses_a") == 1
    assert len(calls) == 1
    check_headers(0)
    assert "Pi refused this (HTTP 409)." in capsys.readouterr().err

    # Test 500 is not reworded
    calls.clear()
    state["responses"] = [
        HTTPError(
            "http://private",
            500,
            "Internal Server Error",
            cast(Any, {}),
            io.BytesIO(b"server error"),
        )
    ]
    assert run("show", "ses_a") == 1
    assert len(calls) == 1
    check_headers(0)
    output = capsys.readouterr()
    assert "HTTP 500" in output.err
    assert "Pi refused this" not in output.err


def test_show_with_invalid_session_exits_without_config_read(invoke):
    run, calls, config_reads, _state, _ = invoke
    assert run("show", "../x") == 1
    assert not calls and not config_reads
