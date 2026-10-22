"""Subscription allowance: percent left per window, read from the official runtimes only."""

import json
import subprocess
import sys
import threading
from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import plan_limits
from workspace_providers import create_app

CODEX = {
    "rateLimits": {
        "planType": "plus",
        "primary": {
            "usedPercent": 19,
            "windowDurationMins": 300,
            "resetsAt": 1760984399,
        },
        "secondary": {
            "usedPercent": 3,
            "windowDurationMins": 10080,
            "resetsAt": 1761184799,
        },
    },
    "rateLimitResetCredits": {"availableCount": 1, "credits": None},
}

CLAUDE_STREAM = "\n".join(
    json.dumps(event)
    for event in (
        {"type": "system", "subtype": "init"},
        {
            "type": "assistant",
            "local_command_run": True,
            "message": {"content": [{"type": "text", "text": "usage"}]},
            "usage_report": {
                "session": {"total_cost_usd": 0},
                "rate_limits": {
                    "limits": [
                        {
                            "kind": "session",
                            "group": "session",
                            "percent": 19,
                            "resets_at": "2026-10-20T18:19:59.534176+00:00",
                            "severity": "normal",
                            "is_active": True,
                        },
                        {
                            "kind": "weekly_all",
                            "group": "weekly",
                            "percent": 3,
                            "resets_at": "2026-10-23T01:59:59.534200+00:00",
                            "severity": "normal",
                            "is_active": False,
                        },
                        {
                            "kind": "weekly_scoped",
                            "group": "weekly",
                            "percent": 140,
                            "resets_at": None,
                            "scope": {"model": {"display_name": "Opus"}},
                        },
                    ],
                    "extra_usage": {"is_enabled": False, "utilization": None},
                },
            },
        },
        {"type": "result", "subtype": "success", "num_turns": 0, "total_cost_usd": 0},
    )
)


def test_chatgpt_windows_are_percent_left_with_reset_times():
    value = plan_limits.chatgpt(CODEX)
    assert value["available"] is True and value["plan"] == "plus"
    assert value["resetCredits"] == 1
    assert [
        (w["label"], w["usedPercent"], w["leftPercent"], w["minutes"])
        for w in value["windows"]
    ] == [("5-hour", 19, 81, 300), ("weekly", 3, 97, 10080)]
    assert value["windows"][0]["resetsAt"] == "2025-10-20T18:19:59Z"


def test_chatgpt_named_buckets_keep_their_name_and_bad_values_are_dropped():
    value = plan_limits.chatgpt(
        {
            "rateLimits": CODEX["rateLimits"],
            "rateLimitsByLimitId": {
                "codex": CODEX["rateLimits"],
                "gpt_pro": {
                    "limitName": "GPT-5 Pro",
                    "primary": {"usedPercent": 50.4, "windowDurationMins": 1440},
                    "secondary": {"usedPercent": "lots"},
                },
            },
        }
    )
    labels = [w["label"] for w in value["windows"]]
    assert labels == ["5-hour", "weekly", "GPT-5 Pro 1-day"]
    assert (
        value["windows"][2]["usedPercent"] == 50
        and value["windows"][2]["resetsAt"] is None
    )
    assert plan_limits.chatgpt({"rateLimits": {}}) == {
        "provider": "chatgpt",
        "available": False,
        "problem": "limits_unavailable",
    }
    assert plan_limits.chatgpt("nope")["problem"] == "invalid_provider_response"


def test_claude_usage_report_becomes_the_same_shape():
    value = plan_limits.claude(CLAUDE_STREAM.encode())
    assert value["available"] is True and value["extraUsageEnabled"] is False
    assert [
        (w["label"], w["usedPercent"], w["leftPercent"]) for w in value["windows"]
    ] == [
        ("5-hour", 19, 81),
        ("weekly", 3, 97),
        ("weekly Opus", 100, 0),
    ]
    assert value["windows"][0]["resetsAt"] == "2026-10-20T18:19:59Z"


def test_claude_without_plan_usage_is_unavailable_not_zero():
    null_limits = CLAUDE_STREAM.replace('"limits": [', '"limits_off": [')
    assert plan_limits.claude(null_limits)["problem"] == "limits_unavailable"
    assert plan_limits.claude(b"not json at all")["problem"] == "limits_unavailable"
    assert plan_limits.claude(b"x" * (plan_limits.MAX_OUTPUT + 1))["problem"] == (
        "invalid_provider_response"
    )


class FakeRPC:
    def __init__(self, account, result=None, error=None):
        self.account, self.result, self.error, self.calls = account, result, error, []

    def call(self, method, params=None):
        self.calls.append((method, params))
        if method == "account/read":
            return {"account": self.account}
        if self.error:
            raise self.error
        return self.result


def control(rpc):
    return SimpleNamespace(rpc=rpc, lock=threading.RLock())


def test_read_chatgpt_asks_codex_only_when_signed_in():
    rpc = FakeRPC({"type": "chatgpt"}, CODEX)
    assert plan_limits.read_chatgpt(control(rpc))["available"] is True
    assert rpc.calls[-1] == (
        "account/rateLimits/read",
        {"excludeResetCreditDetails": True},
    )

    signed_out = FakeRPC(None, CODEX)
    assert (
        plan_limits.read_chatgpt(control(signed_out))["problem"] == "sign_in_required"
    )
    assert [method for method, _ in signed_out.calls] == ["account/read"]

    failing = FakeRPC({"type": "chatgpt"}, error=ValueError("runtime_unavailable"))
    assert (
        plan_limits.read_chatgpt(control(failing))["problem"] == "runtime_unavailable"
    )
    leaking = FakeRPC({"type": "chatgpt"}, error=ValueError("token=secret value!\n"))
    assert (
        plan_limits.read_chatgpt(control(leaking))["problem"] == "runtime_unavailable"
    )
    assert plan_limits.read_chatgpt(control(None))["problem"] == "runtime_unavailable"


def test_read_claude_runs_only_the_local_usage_command(tmp_path, monkeypatch):
    executable = tmp_path / "claude.exe"
    executable.write_bytes(b"")
    seen = {}

    def run(command, **options):
        seen.update(command=command, **options)
        return subprocess.CompletedProcess(command, 0, CLAUDE_STREAM.encode(), b"")

    monkeypatch.setattr(plan_limits.subprocess, "run", run)
    runtime = SimpleNamespace(
        executable=executable,
        status=lambda: {"connected": True},
        options=lambda: {
            "env": {"CLAUDE_CONFIG_DIR": "isolated"},
            "cwd": str(tmp_path),
        },
    )
    assert plan_limits.read_claude(runtime)["windows"][0]["leftPercent"] == 81
    command = seen["command"]
    assert command[1:3] == ["-p", "/usage"]
    assert command[command.index("--tools") + 1] == ""
    assert command[command.index("--max-turns") + 1] == "1"
    assert "--strict-mcp-config" in command and "--no-session-persistence" in command
    assert seen["stdin"] is subprocess.DEVNULL
    assert seen["env"] == {"CLAUDE_CONFIG_DIR": "isolated"}

    runtime.status = lambda: {"connected": False}
    assert plan_limits.read_claude(runtime)["problem"] == "sign_in_required"
    runtime.executable = tmp_path / "absent"
    assert plan_limits.read_claude(runtime)["problem"] == "runtime_unavailable"


def test_limits_routes_need_the_control_key(tmp_path):
    config = {
        "native_providers": {
            "state": str(tmp_path),
            "codex": str(tmp_path / "absent"),
            "claude": str(tmp_path / "absent"),
            "control_key": "c" * 32,
            "inference_key": "i" * 32,
        }
    }
    control_key = {"Authorization": "Bearer " + "c" * 32}
    inference_key = {"Authorization": "Bearer " + "i" * 32}
    with TestClient(create_app(config)) as client:
        for path in ("/chatgpt/limits", "/claude/limits"):
            assert client.get(path).status_code == 401
            assert client.get(path, headers=inference_key).status_code == 401
            value = client.get(path, headers=control_key).json()
            assert value == {
                "provider": path.split("/")[1],
                "available": False,
                "problem": "runtime_unavailable",
            }


def test_cli_lists_both_plans_and_marks_a_missing_runtime(monkeypatch, capsys):
    from urllib.error import HTTPError

    import conker as cli

    asked = []

    def request(config, service, path, body=None, **_):
        asked.append((service, path, body))
        if path == "/claude/limits":
            raise HTTPError(path, 404, "missing", {}, None)
        return plan_limits.chatgpt(CODEX)

    monkeypatch.setattr(cli, "read_config", lambda: {"native_providers": {}})
    monkeypatch.setattr(cli, "request", request)
    monkeypatch.setattr(sys, "argv", ["conker.py", "limits"])
    assert cli.cli() == 0
    plans = json.loads(capsys.readouterr().out)["plans"]
    assert asked == [
        ("providers", "/chatgpt/limits", None),
        ("providers", "/claude/limits", None),
    ]
    assert plans[0]["windows"][0]["leftPercent"] == 81
    assert plans[1] == {
        "provider": "claude",
        "available": False,
        "problem": "not_configured",
    }

    asked.clear()
    monkeypatch.setattr(sys, "argv", ["conker.py", "limits", "chatgpt"])
    assert cli.cli() == 0
    assert asked == [("providers", "/chatgpt/limits", None)]


def test_pi_reads_plan_usage_only_with_its_inference_key(tmp_path):
    config = {
        "native_providers": {
            "state": str(tmp_path),
            "codex": str(tmp_path / "absent"),
            "claude": str(tmp_path / "absent"),
            "control_key": "c" * 32,
            "inference_key": "i" * 32,
        }
    }
    control_key = {"Authorization": "Bearer " + "c" * 32}
    inference_key = {"Authorization": "Bearer " + "i" * 32}
    with TestClient(create_app(config)) as client:
        for path, provider in (
            ("/inference/limits", "chatgpt"),
            ("/inference/claude/limits", "claude"),
        ):
            assert client.get(path).status_code == 401
            assert client.get(path, headers=control_key).status_code == 401
            assert client.get(path, headers=inference_key).json() == {
                "provider": provider,
                "available": False,
                "problem": "runtime_unavailable",
            }


def test_the_inference_socket_serves_plan_usage_and_status_only():
    from http.server import ThreadingHTTPServer
    from urllib.error import HTTPError
    from urllib.request import urlopen

    from scripts.provider_control import inference_handler

    class Rpc:
        def call(self, method, params):
            return (
                {"account": {"type": "chatgpt"}} if method == "account/read" else CODEX
            )

    control = SimpleNamespace(
        rpc=Rpc(),
        lock=threading.Lock(),
        status=lambda: {"connected": True, "available": True},
    )
    server = ThreadingHTTPServer(("127.0.0.1", 0), inference_handler(control))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f"http://127.0.0.1:{server.server_address[1]}"
    try:
        with urlopen(origin + "/limits", timeout=10) as response:
            assert json.load(response)["windows"][0]["leftPercent"] == 81
        with urlopen(origin + "/status", timeout=10) as response:
            assert json.load(response) == {"connected": True, "available": True}
        try:
            urlopen(origin + "/chatgpt", timeout=10)
            raise AssertionError("only status and limits are served")
        except HTTPError as error:
            assert error.code == 404
    finally:
        server.shutdown()


def test_cli_reads_pis_alerts_and_dismisses_one(monkeypatch, capsys):
    import conker as cli

    asked = []

    def request(config, service, path, body=None, **_):
        asked.append((service, path, body))
        return {"ok": True}

    monkeypatch.setattr(cli, "read_config", dict)
    monkeypatch.setattr(cli, "request", request)
    alert = "plan_" + "a" * 32
    for arguments in (["--alerts"], ["--dismiss", alert]):
        monkeypatch.setattr(sys, "argv", ["conker.py", "limits", *arguments])
        assert cli.cli() == 0
    assert asked == [
        ("pi", "/plans/usage", None),
        ("pi", f"/plans/alerts/{alert}/dismiss", {}),
    ]
    monkeypatch.setattr(sys, "argv", ["conker.py", "limits", "--dismiss", "../x"])
    assert cli.cli() == 1
    assert "conker limits --alerts" in capsys.readouterr().err


def test_a_workspace_without_subscription_runtimes_reports_not_configured(
    monkeypatch, capsys
):
    import conker as cli

    def request(*_args, **_options):
        raise AssertionError("no runtime to ask")

    monkeypatch.setattr(cli, "read_config", lambda: {"environments": {}})
    monkeypatch.setattr(cli, "request", request)
    monkeypatch.setattr(sys, "argv", ["conker.py", "limits"])
    assert cli.cli() == 0
    assert json.loads(capsys.readouterr().out)["plans"] == [
        {"provider": name, "available": False, "problem": "not_configured"}
        for name in ("chatgpt", "claude")
    ]
