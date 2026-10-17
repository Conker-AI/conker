"""Chat context CLI provides all dashboard context features from the terminal."""

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
    state = {"response": {"revision": 1, "policy": None}, "failure": None}

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
            if state["failure"] is not None:
                raise state["failure"]
            raw = state.get("raw")
            if raw is None:
                raw = json.dumps(state["response"], ensure_ascii=False).encode("utf-8")
            return io.BytesIO(raw)

    def opener(*handlers):
        assert handlers[0].proxies == {}
        assert isinstance(handlers[1], cli.NoRedirect)
        return Opener()

    monkeypatch.setattr(cli, "read_config", config)
    monkeypatch.setattr(cli, "build_opener", opener)

    def run(*arguments):
        monkeypatch.setattr(sys, "argv", ["conker.py", "context", *map(str, arguments)])
        return cli.cli()

    return run, calls, config_reads, state


def test_show_makes_two_gets_and_prints_combined_response(invoke, capsys):
    run, calls, _, state = invoke
    state["response"] = {"revision": 1, "policy": {"sessionInstructions": "test", "messagePolicies": {}, "budget": {"contextWindowTokens": 8000, "outputReserveTokens": 1000, "otherInputTokens": 0}}}
    assert run("show", "ses_a") == 0
    assert len(calls) == 2
    assert calls[0][0].full_url == "http://127.0.0.1:18551/context/ses_a"
    assert calls[1][0].full_url == "http://127.0.0.1:18551/context/ses_a/summary"
    output = capsys.readouterr()
    result = json.loads(output.out)
    assert "context" in result and "summary" in result


def test_rule_posts_policy_with_message_rule_and_revision(invoke, capsys):
    run, calls, _, state = invoke
    state["response"] = {"revision": 2, "policy": {"sessionInstructions": "", "messagePolicies": {}, "budget": {"contextWindowTokens": 8000, "outputReserveTokens": 1000, "otherInputTokens": 0}}}
    assert run("rule", "ses_a", "msg_b", "pin") == 0
    assert len(calls) == 2
    # First call GETs policy
    assert calls[0][0].full_url == "http://127.0.0.1:18551/context/ses_a"
    assert calls[0][0].get_method() == "GET"
    # Second call POSTs updated policy
    assert calls[1][0].full_url == "http://127.0.0.1:18551/context/ses_a"
    assert calls[1][0].get_method() == "POST"
    body = json.loads(calls[1][0].data)
    assert body["expected_revision"] == 2
    assert body["policy"]["messagePolicies"]["msg_b"] == "keep-exact"


def test_rule_clear_removes_message_rule_and_clear_exits_without_post(invoke, capsys):
    run, calls, _, state = invoke
    state["response"] = {"revision": 1, "policy": {"sessionInstructions": "", "messagePolicies": {"msg_b": "keep-exact"}, "budget": {"contextWindowTokens": 8000, "outputReserveTokens": 1000, "otherInputTokens": 0}}}
    
    # Test clear removes rule
    assert run("rule", "ses_a", "msg_b", "clear") == 0
    assert len(calls) == 2
    body = json.loads(calls[1][0].data)
    assert "msg_b" not in body["policy"]["messagePolicies"]
    
    # Test clear on non-existent rule
    calls.clear()
    state["response"] = {"revision": 1, "policy": {"sessionInstructions": "", "messagePolicies": {}, "budget": {"contextWindowTokens": 8000, "outputReserveTokens": 1000, "otherInputTokens": 0}}}
    assert run("rule", "ses_a", "msg_c", "clear") == 1
    assert len(calls) == 1  # Only GET, no POST
    assert "That message has no context rule." in capsys.readouterr().err


def test_rule_on_null_policy_exits_with_no_settings(invoke, capsys):
    run, calls, _, state = invoke
    state["response"] = {"revision": 0, "policy": None}
    assert run("rule", "ses_a", "msg_b", "pin") == 1
    assert len(calls) == 1
    assert NO_SETTINGS in capsys.readouterr().err


def test_budget_creates_policy_on_null_and_updates_existing(invoke, capsys):
    run, calls, _, state = invoke
    
    # Test creating policy from null
    state["response"] = {"revision": 0, "policy": None}
    assert run("budget", "ses_a", "--window", "4000", "--reserve", "500") == 0
    assert len(calls) == 2
    body = json.loads(calls[1][0].data)
    assert body["policy"]["sessionInstructions"] == ""
    assert body["policy"]["messagePolicies"] == {}
    assert body["policy"]["budget"]["otherInputTokens"] == 0
    
    # Test updating existing policy
    calls.clear()
    state["response"] = {"revision": 1, "policy": {"sessionInstructions": "test", "messagePolicies": {"msg_x": "exclude"}, "budget": {"contextWindowTokens": 8000, "outputReserveTokens": 1000, "otherInputTokens": 50}}}
    assert run("budget", "ses_a", "--window", "4000", "--reserve", "500", "--other", "25") == 0
    body = json.loads(calls[1][0].data)
    assert body["policy"]["sessionInstructions"] == "test"  # Kept
    assert body["policy"]["messagePolicies"]["msg_x"] == "exclude"  # Kept
    assert body["policy"]["budget"]["otherInputTokens"] == 25  # Updated


def test_budget_validation_exits_without_request(invoke, capsys):
    run, calls, _, _ = invoke
    assert run("budget", "ses_a", "--window", "10", "--reserve", "10") == 1
    assert len(calls) == 0
    assert "window of 2-10000000" in capsys.readouterr().err


def test_instructions_from_file_and_clear_and_validation(invoke, tmp_path, capsys):
    run, calls, _, state = invoke
    
    # Test from file with trailing newline removed
    state["response"] = {"revision": 1, "policy": {"sessionInstructions": "", "messagePolicies": {}, "budget": {"contextWindowTokens": 8000, "outputReserveTokens": 1000, "otherInputTokens": 0}}}
    file = tmp_path / "instructions.txt"
    file.write_text("Test instructions\n")
    assert run("instructions", "ses_a", str(file)) == 0
    body = json.loads(calls[1][0].data)
    assert body["policy"]["sessionInstructions"] == "Test instructions"
    
    # Test --clear posts empty string
    calls.clear()
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
    run, calls, _, state = invoke
    state["response"] = {"revision": 2, "summary": "old", "source_session_id": None, "versions": []}
    file = tmp_path / "summary.txt"
    file.write_text("New summary")
    assert run("summary-edit", "ses_a", str(file)) == 0
    assert len(calls) == 2
    assert calls[1][0].full_url == "http://127.0.0.1:18551/context/ses_a/summary"
    body = json.loads(calls[1][0].data)
    assert body["expected_revision"] == 2
    assert body["summary"] == "New summary"


def test_summary_restore_posts_to_restore_endpoint(invoke, capsys):
    run, calls, _, state = invoke
    state["response"] = {"revision": 3, "summary": "current", "source_session_id": None, "versions": [{"revision": 1, "summary": "old", "source_session_id": None, "created_at": "2023-01-01T00:00:00Z", "restored_from": None}]}
    assert run("summary-restore", "ses_a", "1") == 0
    assert len(calls) == 2
    assert calls[1][0].full_url == "http://127.0.0.1:18551/context/ses_a/summary/restore"
    body = json.loads(calls[1][0].data)
    assert body["expected_revision"] == 3
    assert body["revision"] == 1
    
    # Test unknown revision exits without posting
    calls.clear()
    assert run("summary-restore", "ses_a", "99") == 1
    assert len(calls) == 1  # Only GET
    assert "That summary version does not exist." in capsys.readouterr().err


def test_fork_posts_with_generated_request_id_and_last_message(invoke, tmp_path):
    run, calls, _, state = invoke
    state["response"] = {"revision": 1, "policy": {"sessionInstructions": "", "messagePolicies": {}, "budget": {"contextWindowTokens": 8000, "outputReserveTokens": 1000, "otherInputTokens": 0}}}

    file = tmp_path / "summary.txt"
    file.write_text("Fork summary")

    # Override the opener to return different responses for different calls
    original_open = None
    dynamic_responses = [
        state["response"],  # First call: GET policy
        {"messages": [{"id": "msg_123"}, {"id": "msg_456"}]},  # Second call: GET session
        {"session_id": "new_session", "parent_id": "ses_a", "replayed": []}  # Third call: POST fork
    ]
    call_index = [0]

    def dynamic_open(self, request, timeout):
        calls.append((request, timeout))
        response = dynamic_responses[call_index[0]]
        call_index[0] += 1
        return io.BytesIO(json.dumps(response, ensure_ascii=False).encode("utf-8"))

    # Patch the Opener.open method
    import cli
    opener_instance = None
    for mock in cli.build_opener.__closure__[0].cell_contents if hasattr(cli.build_opener, '__closure__') else []:
        if hasattr(mock, 'open'):
            opener_instance = mock
            break

    if opener_instance:
        original_open = opener_instance.open
        opener_instance.open = dynamic_open.__get__(opener_instance, type(opener_instance))

    try:
        result = run("fork", "ses_a", str(file))
        assert result == 0

        # Should have: GET policy, GET session, POST fork
        assert len(calls) == 3
        fork_call = calls[2][0]
        assert fork_call.full_url == "http://127.0.0.1:18551/context/ses_a/fork"
        body = json.loads(fork_call.data)
        assert body["expected_revision"] == 1
        assert body["expected_last_message_id"] == "msg_456"
        assert body["summary"] == "Fork summary"
        assert body["request_id"].startswith("fork_")
        assert len(body["request_id"]) == 36  # fork_ + 32 hex chars
    finally:
        if opener_instance and original_open:
            opener_instance.open = original_open


def test_fork_with_request_id_and_revision_0_validation(invoke, tmp_path, capsys):
    run, calls, _, state = invoke
    
    # Test --request-id is used
    state["response"] = {"revision": 1, "policy": {"sessionInstructions": "", "messagePolicies": {}, "budget": {"contextWindowTokens": 8000, "outputReserveTokens": 1000, "otherInputTokens": 0}}}
    file = tmp_path / "summary.txt"
    file.write_text("Summary")
    
    # Mock the needed requests
    def session_response(request, timeout):
        calls.append((request, timeout))
        if "/sessions/" in request.full_url:
            return io.BytesIO(json.dumps({"messages": []}).encode("utf-8"))
        return io.BytesIO(json.dumps(state["response"], ensure_ascii=False).encode("utf-8"))
    
    import conker_context
    original_wrapper = conker_context._pi_request_wrapper
    conker_context._pi_request_wrapper = session_response
    
    try:
        assert run("fork", "ses_a", str(file), "--request-id", "custom_fork_id_123") == 0
        body = json.loads(calls[2][0].data)
        assert body["request_id"] == "custom_fork_id_123"
    finally:
        conker_context._pi_request_wrapper = original_wrapper
    
    # Test revision 0 exits without posting
    calls.clear()
    state["response"] = {"revision": 0, "policy": None}
    assert run("fork", "ses_a", str(file)) == 1
    assert len(calls) == 1  # Only GET policy
    assert "Fork needs saved context settings" in capsys.readouterr().err


def test_http_409_with_detail_code_prints_refused_message(invoke, capsys):
    run, calls, _, state = invoke
    state["failure"] = HTTPError(
        "http://private", 409, "Conflict", {}, 
        io.BytesIO(b'{"detail": {"code": "revision_conflict", "message": "Context policy changed; reload before saving."}}')
    )
    assert run("show", "ses_a") == 1
    assert len(calls) == 1
    output = capsys.readouterr()
    assert "Pi refused this (revision_conflict): Context policy changed; reload before saving." in output.err


def test_show_with_invalid_session_exits_without_config_read(invoke):
    run, calls, config_reads, _ = invoke
    assert run("show", "../x") == 1
    assert not calls and not config_reads


NO_SETTINGS = "This chat has no context settings yet. Start with: context budget SESSION --window N --reserve N"