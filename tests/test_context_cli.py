"""Chat context CLI provides all dashboard context features from the terminal."""

import json
import sys
from pathlib import Path

from tests._context_cli_helpers import invoke  # noqa: F401  (fixture)

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from scripts.cli.conker_context import NO_SETTINGS


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
    assert policy_response["policy"]["messagePolicies"]["msg_b"] == "keep-exact"  # Not mutated

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
    assert run("budget", "ses_a", "--window", "4000", "--reserve", "500", "--other", "0") == 0
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
