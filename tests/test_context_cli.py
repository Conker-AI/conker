"""Chat context CLI provides all dashboard context features from the terminal."""

import io
import json
import sys
from pathlib import Path
from urllib.error import HTTPError

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import conker as cli
from conker_context import NO_SETTINGS


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
        monkeypatch.setattr(sys, "argv", ["conker.py", "context", *map(str, arguments)])
        return cli.cli()

    return run, calls, config_reads, state, check_headers


def test_show_makes_two_gets_and_prints_combined_response(invoke, capsys):
    run, calls, _, state, check_headers = invoke
    state["responses"] = [
        {
            "revision": 1,
            "policy": {
                "sessionInstructions": "test",
                "messagePolicies": {},
                "budget": {
                    "contextWindowTokens": 8000,
                    "outputReserveTokens": 1000,
                    "otherInputTokens": 0,
                },
            },
        },
        {"revision": 1, "summary": "test summary"},
    ]
    assert run("show", "ses_a") == 0
    assert len(calls) == 2
    check_headers(0)
    check_headers(1)
    assert calls[0][0].full_url == "http://127.0.0.1:18551/context/ses_a"
    assert calls[1][0].full_url == "http://127.0.0.1:18551/context/ses_a/summary"
    output = capsys.readouterr()
    result = json.loads(output.out)
    assert "context" in result and "summary" in result


def test_rule_posts_policy_with_message_rule_and_revision(invoke, capsys):
    run, calls, _, state, check_headers = invoke
    policy_response = {
        "revision": 2,
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
    state["responses"] = [policy_response, {"revision": 3}]
    assert run("rule", "ses_a", "msg_b", "pin") == 0
    assert len(calls) == 2
    check_headers(0)
    check_headers(1)
    # First call GETs policy
    assert calls[0][0].full_url == "http://127.0.0.1:18551/context/ses_a"
    assert calls[0][0].get_method() == "GET"
    # Second call POSTs updated policy
    assert calls[1][0].full_url == "http://127.0.0.1:18551/context/ses_a"
    assert calls[1][0].get_method() == "POST"
    body = json.loads(calls[1][0].data)
    assert body["expected_revision"] == 2
    assert body["policy"]["messagePolicies"]["msg_b"] == "keep-exact"
    # Check response is not mutated
    assert policy_response["policy"]["messagePolicies"] == {}


def test_rule_clear_removes_message_rule_and_clear_exits_without_post(invoke, capsys):
    run, calls, _, state, check_headers = invoke

    # Test clear removes rule
    policy_response = {
        "revision": 1,
        "policy": {
            "sessionInstructions": "",
            "messagePolicies": {"msg_b": "keep-exact"},
            "budget": {
                "contextWindowTokens": 8000,
                "outputReserveTokens": 1000,
                "otherInputTokens": 0,
            },
        },
    }
    state["responses"] = [policy_response, {"revision": 2}]
    assert run("rule", "ses_a", "msg_b", "clear") == 0
    assert len(calls) == 2
    check_headers(0)
    check_headers(1)
    body = json.loads(calls[1][0].data)
    assert "msg_b" not in body["policy"]["messagePolicies"]
    assert (
        policy_response["policy"]["messagePolicies"]["msg_b"] == "keep-exact"
    )  # Not mutated

    # Test clear on non-existent rule
    calls.clear()
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
    assert run("rule", "ses_a", "msg_c", "clear") == 1
    assert len(calls) == 1  # Only GET, no POST
    check_headers(0)
    assert "That message has no context rule." in capsys.readouterr().err


def test_rule_on_null_policy_exits_with_no_settings(invoke, capsys):
    run, calls, _, state, check_headers = invoke
    state["responses"] = [{"revision": 0, "policy": None}]
    assert run("rule", "ses_a", "msg_b", "pin") == 1
    assert len(calls) == 1
    check_headers(0)
    error = capsys.readouterr().err
    assert NO_SETTINGS.format(session="ses_a") in error
    # The command it names is one the owner has, on an installed stack too.
    assert "conker context budget ses_a --window TOKENS --reserve TOKENS" in error


def test_budget_creates_policy_on_null_and_updates_existing(invoke, capsys):
    run, calls, _, state, check_headers = invoke

    # Test creating policy from null
    state["responses"] = [{"revision": 0, "policy": None}, {"revision": 1}]
    assert run("budget", "ses_a", "--window", "4000", "--reserve", "500") == 0
    assert len(calls) == 2
    check_headers(0)
    check_headers(1)
    body = json.loads(calls[1][0].data)
    assert body["policy"]["sessionInstructions"] == ""
    assert body["policy"]["messagePolicies"] == {}
    assert body["policy"]["budget"]["otherInputTokens"] == 0

    # Test updating existing policy with --other 0
    calls.clear()
    policy_response = {
        "revision": 1,
        "policy": {
            "sessionInstructions": "test",
            "messagePolicies": {"msg_x": "exclude"},
            "budget": {
                "contextWindowTokens": 8000,
                "outputReserveTokens": 1000,
                "otherInputTokens": 50,
            },
        },
    }
    state["responses"] = [policy_response, {"revision": 2}]
    assert (
        run("budget", "ses_a", "--window", "4000", "--reserve", "500", "--other", "0")
        == 0
    )
    body = json.loads(calls[1][0].data)
    assert body["policy"]["sessionInstructions"] == "test"  # Kept
    assert body["policy"]["messagePolicies"]["msg_x"] == "exclude"  # Kept
    assert body["policy"]["budget"]["otherInputTokens"] == 0  # Updated to 0
    assert policy_response["policy"]["budget"]["otherInputTokens"] == 50  # Not mutated

    # Test omitting --other keeps existing value
    calls.clear()
    state["responses"] = [policy_response, {"revision": 2}]
    assert run("budget", "ses_a", "--window", "4000", "--reserve", "500") == 0
    body = json.loads(calls[1][0].data)
    assert body["policy"]["budget"]["otherInputTokens"] == 50  # Kept


def test_budget_validation_exits_without_request(invoke, capsys):
    run, calls, _, _state, _ = invoke
    assert run("budget", "ses_a", "--window", "10", "--reserve", "10") == 1
    assert len(calls) == 0
    assert "window of 2-10000000" in capsys.readouterr().err


def test_instructions_from_file_and_clear_and_validation(invoke, tmp_path, capsys):
    run, calls, _, state, check_headers = invoke

    # Test from file with exactly one trailing newline removed
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
        },
        {"revision": 2},
    ]
    file = tmp_path / "instructions.txt"
    file.write_text("Line one\n\n")
    assert run("instructions", "ses_a", str(file)) == 0
    assert len(calls) == 2
    check_headers(0)
    check_headers(1)
    body = json.loads(calls[1][0].data)
    # Should remove exactly one trailing line ending from "Line one\n\n"
    result = body["policy"]["sessionInstructions"]
    assert (
        result == "Line one\n" or result == "Line one\r\n"
    )  # Allow either due to platform differences

    # Test file with \r\n
    calls.clear()
    state["responses"] = [
        {
            "revision": 2,
            "policy": {
                "sessionInstructions": "",
                "messagePolicies": {},
                "budget": {
                    "contextWindowTokens": 8000,
                    "outputReserveTokens": 1000,
                    "otherInputTokens": 0,
                },
            },
        },
        {"revision": 3},
    ]
    file.write_text("a\r\n")
    assert run("instructions", "ses_a", str(file)) == 0
    body = json.loads(calls[1][0].data)
    # On Windows, "a\r\n" becomes "a\r\r\n", then one "\r\n" is removed, leaving "a\r"
    result = body["policy"]["sessionInstructions"]
    assert result == "a" or result == "a\r"  # Allow either due to platform differences

    # Test --clear posts empty string
    calls.clear()
    state["responses"] = [
        {
            "revision": 3,
            "policy": {
                "sessionInstructions": "test",
                "messagePolicies": {},
                "budget": {
                    "contextWindowTokens": 8000,
                    "outputReserveTokens": 1000,
                    "otherInputTokens": 0,
                },
            },
        },
        {"revision": 4},
    ]
    assert run("instructions", "ses_a", "--clear") == 0
    body = json.loads(calls[1][0].data)
    assert body["policy"]["sessionInstructions"] == ""

    # Test 16001 character file exits without request
    calls.clear()
    file.write_text("x" * 16001)
    assert run("instructions", "ses_a", str(file)) == 1
    assert len(calls) == 0

    # Test neither file nor --clear exits
    calls.clear()
    assert run("instructions", "ses_a") == 1
    assert len(calls) == 0


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
    assert (
        calls[1][0].full_url == "http://127.0.0.1:18551/context/ses_a/summary/restore"
    )
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
            {},
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
            {},
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
        HTTPError("http://private", 409, "Conflict", {}, io.BytesIO(b"not json"))
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
            {},
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
