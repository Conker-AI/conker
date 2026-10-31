import json
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from workspace_providers import create_app


def test_scoped_credentials_and_browser_origin_cannot_cross_boundary(tmp_path):
    config = {
        "native_providers": {
            "state": str(tmp_path),
            "codex": str(tmp_path / "absent"),
            "claude": str(tmp_path / "absent"),
            "control_key": "c" * 32,
            "inference_key": "i" * 32,
        }
    }
    with TestClient(create_app(config)) as client:
        control, inference = (
            {"Authorization": "Bearer " + "c" * 32},
            {"Authorization": "Bearer " + "i" * 32},
        )
        assert client.get("/chatgpt").status_code == 401
        assert client.get("/chatgpt", headers=inference).status_code == 401
        assert client.get("/inference/status", headers=control).status_code == 401
        assert (
            client.get(
                "/chatgpt", headers={**control, "Origin": "https://malicious.test"}
            ).status_code
            == 401
        )
        assert client.get("/chatgpt?token=x", headers=control).status_code == 401
        assert (
            client.get("/chatgpt", headers=control).json()["credentialsIncluded"]
            is False
        )
        assert client.get("/inference/status", headers=inference).json() == {
            "available": False,
            "connected": False,
        }
        assert (
            client.post(
                "/chatgpt", headers=control, json={"operation": "execute"}
            ).status_code
            == 503
        )
        assert client.get("/claude", headers=control).json()["available"] is False


def test_claude_native_request_disables_tools_and_does_not_copy_ambient_tokens(
    tmp_path, monkeypatch
):
    from native_claude import Claude

    monkeypatch.setenv("ANTHROPIC_API_KEY", "ambient-secret-must-not-be-used")
    monkeypatch.setenv("CLAUDE_CODE_OAUTH_TOKEN", "ambient-token-must-not-be-used")
    native = Claude(tmp_path / "claude.exe", tmp_path / "own-auth")
    messages = [
        {"role": "user", "content": "hello"},
        {"role": "assistant", "content": '{"tool":"notes.read","args":{}}'},
        {
            "role": "tool",
            "content": '{"tool":"notes.read","ok":true,"result":{"text":"untrusted"}}',
        },
    ]
    with patch("native_claude.subprocess.Popen") as run:
        process = run.return_value
        process.poll.return_value = 0
        process.returncode = 0
        process.communicate.return_value = (
            b'{"result":"answer","usage":{"input_tokens":3,"output_tokens":2}}',
            b"",
        )
        result = native.complete(
            {
                "model": "sonnet",
                "messages": messages,
                "timeout": 30,
            }
        )
    args, kwargs = run.call_args
    assert args[0][args[0].index("--tools") + 1] == ""
    assert "--strict-mcp-config" in args[0] and "--no-session-persistence" in args[0]
    assert not any(
        key in kwargs["env"] for key in ("ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN")
    )
    assert kwargs["env"]["CLAUDE_CONFIG_DIR"] == str(tmp_path / "own-auth")
    assert json.loads(process.communicate.call_args.kwargs["input"]) == {
        "conversation": messages
    }
    assert args[0][args[0].index("--mcp-config") + 1] == '{"mcpServers":{}}'
    # Replaces Claude Code's own prompt, which carries a memory folder and coding instructions.
    prompt = args[0][args[0].index("--system-prompt") + 1]
    assert "Conker" in prompt and "no tools or memory" in prompt
    assert result["text"] == "answer"


def test_native_claude_exposes_current_official_oauth_location_only(tmp_path):
    from io import BytesIO
    from types import SimpleNamespace

    from native_claude import Claude

    native = Claude(tmp_path / "claude.exe", tmp_path / "own-auth")
    official = "https://claude.com/cai/oauth/authorize?state=synthetic"
    process = SimpleNamespace(
        stdout=BytesIO(
            (official + "\nhttps://claude.com.evil.test/oauth/authorize\n").encode()
        )
    )
    native.process = process
    native._read_login(process)
    assert native.url == official


@pytest.fixture
def native_sign_in(tmp_path, monkeypatch):
    import native_claude

    class Process:
        def __init__(self):
            self.returncode = None
            self.terminations = 0

        def poll(self):
            return self.returncode

        def terminate(self):
            self.terminations += 1
            self.returncode = 0

        def wait(self, timeout):
            return self.returncode

    executable = tmp_path / "synthetic-claude.exe"
    executable.touch()
    native = native_claude.Claude(executable, tmp_path / "private-auth")
    processes, commands = [], []
    state = {"connected": False, "clock": 1000}

    def spawn(command, **_kwargs):
        commands.append(command)
        process = Process()
        processes.append(process)
        return process

    monkeypatch.setattr(native_claude.subprocess, "Popen", spawn)
    monkeypatch.setattr(
        native_claude.subprocess,
        "run",
        lambda *_a, **_k: SimpleNamespace(
            stdout=json.dumps({"loggedIn": state["connected"]}).encode()
        ),
    )
    monkeypatch.setattr(
        native_claude.threading,
        "Thread",
        lambda **_kwargs: SimpleNamespace(start=lambda: None),
    )
    monkeypatch.setattr(native_claude.time, "monotonic", lambda: state["clock"])
    return native, processes, commands, state


def test_claude_cancel_is_bound_to_captured_attempt_and_cannot_stop_replacement(
    native_sign_in,
):
    native, processes, commands, _state = native_sign_in
    first = native.apply({"operation": "login", "billing": "subscription"})
    original_cancel = {"operation": "cancel", "loginId": first["loginId"]}
    assert first["loginState"] == "pending" and first["loginId"].startswith("login_")
    assert native.status()["loginId"] == first["loginId"]
    canceled = native.apply(original_cancel)
    assert canceled["loginState"] == "canceled" and canceled["loginId"] is None
    assert processes[0].terminations == 1

    replacement = native.apply({"operation": "login", "billing": "api"})
    assert replacement["loginId"] != first["loginId"]
    native.url = "https://claude.com/cai/oauth/authorize?state=replacement"
    for invalid in (
        original_cancel,
        {"operation": "cancel"},
        {"operation": "cancel", "loginId": None},
        {"operation": "cancel", "loginId": replacement["loginId"], "billing": "api"},
    ):
        with pytest.raises(ValueError, match="Invalid native authentication operation"):
            native.apply(invalid)
        assert processes[1].terminations == 0
        assert native.status()["loginId"] == replacement["loginId"]
        assert native.url is not None
    assert commands[0][-1] == "--claudeai" and commands[1][-1] == "--console"

    result = native.apply({"operation": "cancel", "loginId": replacement["loginId"]})
    assert result["loginState"] == "canceled" and result["loginId"] is None
    assert processes[1].terminations == 1 and native.url is None
    with pytest.raises(ValueError):
        native.apply({"operation": "cancel", "loginId": replacement["loginId"]})


@pytest.mark.parametrize("connected", [True, False])
def test_claude_finished_attempt_cannot_be_canceled(native_sign_in, connected):
    native, processes, _commands, state = native_sign_in
    pending = native.apply({"operation": "login"})
    processes[0].returncode = 0
    state["connected"] = connected
    # The process can finish before the owner refreshes its status.
    with pytest.raises(ValueError):
        native.apply({"operation": "cancel", "loginId": pending["loginId"]})
    result = native.status()
    assert result["loginState"] == ("complete" if connected else "failed")
    assert result["loginId"] is None and result["connected"] == connected
    assert processes[0].terminations == 0


def test_claude_expired_attempt_clears_identity(native_sign_in):
    native, processes, _commands, state = native_sign_in
    pending = native.apply({"operation": "login"})
    state["clock"] += 601
    result = native.status()
    assert result["loginState"] == "expired" and result["loginId"] is None
    assert processes[0].terminations == 1
    with pytest.raises(ValueError):
        native.apply({"operation": "cancel", "loginId": pending["loginId"]})


@pytest.mark.parametrize("model", ["-p", "--verbose", "-"])
def test_a_claude_model_that_reads_as_an_option_is_refused_before_launch(tmp_path, model):
    from native_claude import Claude

    native = Claude(tmp_path / "claude.exe", tmp_path / "own-auth")
    with (
        patch("native_claude.subprocess.Popen") as run,
        pytest.raises(ValueError, match="Invalid native inference request"),
    ):
        native.complete(
            {"model": model, "messages": [{"role": "user", "content": "hi"}], "timeout": 30}
        )
    run.assert_not_called()
