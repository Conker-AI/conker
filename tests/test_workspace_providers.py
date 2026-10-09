import json
import sys
from pathlib import Path
from unittest.mock import patch

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
