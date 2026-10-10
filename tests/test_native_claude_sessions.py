"""Native registry reads and exact Stop preserve their own owner-only authority."""

import json
import sys
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import native_claude_sessions as native
import workspace_providers


def row(**changes):
    return {
        "kind": "background",
        "id": "abcd1234",
        "sessionId": "session-original",
        "cwd": "C:/synthetic/work",
        "startedAt": 1720000000000,
        "name": "Synthetic task",
        "state": "working",
        "status": "busy",
        **changes,
    }


@pytest.fixture
def registry(tmp_path, monkeypatch):
    executable = tmp_path / "claude.exe"
    executable.touch()
    home = tmp_path / "isolated-auth"
    home.mkdir()
    session = native.Sessions(executable, home)
    state = {"rows": [row()], "logs": b"recent output\n"}
    calls = []

    def run(arguments, deadline):
        assert time.monotonic() < deadline <= time.monotonic() + 20.1
        calls.append(arguments)
        if arguments == ["agents", "--json", "--all"]:
            return json.dumps(state["rows"]).encode()
        if arguments == ["logs", "abcd1234"]:
            return state["logs"]
        if arguments == ["stop", "abcd1234"]:
            return b"Native stop accepted"
        raise AssertionError(arguments)

    monkeypatch.setattr(session, "_run", run)
    return session, state, calls


def test_discovery_is_bounded_native_background_snapshot_and_counts_omissions(registry):
    sessions, state, calls = registry
    state["rows"] = [row(id=f"session{i}", startedAt=i) for i in range(105)]
    state["rows"] += [{"kind": "interactive", "cwd": "elsewhere"}, {"kind": "future"}]
    result = sessions.list()
    assert result.keys() == {
        "schemaVersion",
        "provider",
        "scope",
        "results",
        "truncated",
        "omittedCount",
    }
    assert (result["schemaVersion"], result["provider"], result["scope"]) == (
        1,
        "claude",
        "background_sessions",
    )
    assert result["truncated"] and result["omittedCount"] == 2
    assert len(result["results"]) == 100
    assert result["results"][0]["id"] == "session104"
    # Exact lookup is over the bounded native response, before the display cap.
    assert sessions.status("session0")["result"]["id"] == "session0"
    assert calls == [["agents", "--json", "--all"]] * 2


def test_supported_empty_inventory_is_distinct_from_missing_runtime(registry):
    sessions, state, _calls = registry
    state["rows"] = []
    assert sessions.list()["results"] == []
    sessions.executable.unlink()
    with pytest.raises(native.SessionError, match="native_sessions_unavailable"):
        sessions.list()


@pytest.mark.parametrize("state", [None, "finished", {"private": "not exposed"}])
def test_unrecognized_state_never_claims_success_or_allows_stop(registry, state):
    sessions, data, _calls = registry
    data["rows"] = [row(state=state, status="future", waitingFor="unexpected")]
    result = sessions.list()["results"][0]
    assert (
        result["state"],
        result["processStatus"],
        result["waitingFor"],
        result["canStop"],
    ) == ("unknown", None, None, False)


def test_waiting_reason_and_name_are_only_bounded_inert_evidence(registry):
    sessions, state, _calls = registry
    state["rows"] = [
        row(
            state="blocked",
            status="waiting",
            waitingFor="permission prompt",
            name="\x00\u202e" + "x" * 400,
        )
    ]
    result = sessions.status("abcd1234")["result"]
    assert result["waitingFor"] == "permission_prompt"
    assert result["name"] == "x" * 300 and result["canStop"]


@pytest.mark.parametrize(
    "change",
    [
        {"id": "--all"},
        {"id": "a/b"},
        {"id": "a" * 101},
        {"sessionId": "bad name"},
        {"cwd": "C:/private\ncommand"},
        {"cwd": "x" * 4097},
        {"cwd": ""},
        {"startedAt": True},
        {"startedAt": -1},
        {"startedAt": 9007199254740992},
        {"name": []},
    ],
)
def test_malformed_native_identity_fails_closed(registry, change):
    sessions, state, _calls = registry
    state["rows"] = [row(**change)]
    with pytest.raises(native.SessionError, match="native_sessions_unavailable"):
        sessions.list()


def test_duplicate_native_identity_is_ambiguous_and_unavailable(registry):
    sessions, state, _calls = registry
    state["rows"] = [row(), row(sessionId="replacement")]
    with pytest.raises(native.SessionError, match="native_sessions_unavailable"):
        sessions.list()


@pytest.mark.parametrize(
    "raw",
    [
        b"not supported",
        b"{}",
        b'[{"kind":"interactive","kind":"background"}]',
        b"[NaN]",
    ],
)
def test_unsupported_or_malformed_discovery_never_becomes_empty(
    registry, monkeypatch, raw
):
    sessions, _state, _calls = registry
    monkeypatch.setattr(sessions, "_run", lambda *_: raw)
    with pytest.raises(native.SessionError, match="native_sessions_unavailable"):
        sessions.list()


def test_identity_uses_exact_session_start_cwd_and_store_not_status_or_name(
    registry, tmp_path
):
    sessions, state, _calls = registry
    original = sessions.status("abcd1234")["result"]["identity"]
    assert native.DIGEST.fullmatch(original)
    state["rows"] = [row(name="Renamed", state="blocked", status="waiting")]
    assert sessions.status("abcd1234")["result"]["identity"] == original
    for changes in (
        {"sessionId": "other"},
        {"startedAt": 42},
        {"cwd": "C:/other"},
        {"sessionId": None},
    ):
        assert sessions._row(row(**changes))["identity"] != original
    another = native.Sessions(
        sessions.executable, tmp_path / "different-isolated-store"
    )
    assert another._row(row())["identity"] != original


def test_stop_rechecks_exact_native_identity_and_does_not_report_stopped(registry):
    sessions, _state, calls = registry
    observed = sessions.status("abcd1234")["result"]
    result = sessions.stop(observed["id"], {"expectedIdentity": observed["identity"]})
    assert result == {
        "schemaVersion": 1,
        "provider": "claude",
        "id": "abcd1234",
        "identity": observed["identity"],
        "status": "stop_requested",
        "automaticReplay": False,
    }
    assert calls == [
        ["agents", "--json", "--all"],
        ["agents", "--json", "--all"],
        ["stop", "abcd1234"],
    ]


def test_stop_changed_identity_terminal_state_and_prefix_never_dispatch(registry):
    sessions, state, calls = registry
    observed = sessions.list()["results"][0]
    state["rows"] = [row(sessionId="replacement")]
    with pytest.raises(native.SessionError, match="native_session_changed") as error:
        sessions.stop("abcd1234", {"expectedIdentity": observed["identity"]})
    assert error.value.status == 409
    state["rows"] = [row(state="done")]
    with pytest.raises(native.SessionError, match="native_session_not_stoppable"):
        sessions.stop("abcd1234", {"expectedIdentity": observed["identity"]})
    with pytest.raises(native.SessionError, match="native_session_not_found") as error:
        sessions.stop("abcd", {"expectedIdentity": observed["identity"]})
    assert error.value.status == 404 and all(call[0] == "agents" for call in calls)


@pytest.mark.parametrize(
    "body",
    [{}, {"expectedIdentity": "bad"}, {"expectedIdentity": "a" * 64, "pid": 123}, []],
)
def test_invalid_stop_request_does_not_launch_native_command(registry, body):
    sessions, _state, calls = registry
    with pytest.raises(native.SessionError, match="invalid_native_session_request"):
        sessions.stop("abcd1234", body)
    assert calls == []


def test_log_output_is_utf8_bounded_inert_and_identity_bound(registry):
    sessions, state, calls = registry
    state["logs"] = (
        "\x1b[31m" + "🙂" * 20000 + "\x1b]52;c;secret\x07\x00\u202eEND\n"
    ).encode()
    result = sessions.output("abcd1234")
    assert result["truncated"] and not result["outputPersisted"]
    assert len(result["text"].encode()) <= 65536
    assert result["text"].endswith("END\n") and "secret" not in result["text"]
    assert "\x1b" not in result["text"] and "\u202e" not in result["text"]
    assert result["identity"] == sessions._row(row())["identity"]
    assert calls == [
        ["agents", "--json", "--all"],
        ["logs", "abcd1234"],
        ["agents", "--json", "--all"],
    ]


def test_replacement_during_logs_cannot_leak_output_under_old_identity(
    registry, monkeypatch
):
    sessions, state, calls = registry
    previous = sessions._run

    def run(arguments, deadline):
        result = previous(arguments, deadline)
        if arguments[0] == "logs":
            state["rows"] = [row(sessionId="replacement")]
        return result

    monkeypatch.setattr(sessions, "_run", run)
    with pytest.raises(native.SessionError, match="native_session_changed"):
        sessions.output("abcd1234")
    assert len(calls) == 3


def test_unknown_stop_outcome_is_not_replayed(registry, monkeypatch):
    sessions, _state, calls = registry
    identity = sessions._row(row())["identity"]
    previous = sessions._run

    def run(arguments, deadline):
        previous(arguments, deadline)
        if arguments[0] == "stop":
            raise native.SessionError()
        return json.dumps([row()]).encode()

    monkeypatch.setattr(sessions, "_run", run)
    with pytest.raises(native.SessionError, match="native_sessions_unavailable"):
        sessions.stop("abcd1234", {"expectedIdentity": identity})
    assert sum(call[0] == "stop" for call in calls) == 1


def test_real_runner_uses_isolated_environment_and_bounded_nonblocking_pipes(
    tmp_path, monkeypatch
):
    sessions = native.Sessions(sys._base_executable, tmp_path)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "not-forwarded")
    monkeypatch.setenv("CLAUDE_CODE_OAUTH_TOKEN", "not-forwarded")
    code = "import json,os; print(json.dumps({k:os.getenv(k) for k in ['CLAUDE_CONFIG_DIR','ANTHROPIC_API_KEY','CLAUDE_CODE_OAUTH_TOKEN']}))"
    result = json.loads(sessions._run(["-c", code], time.monotonic() + 5))
    assert result == {
        "CLAUDE_CONFIG_DIR": str(tmp_path),
        "ANTHROPIC_API_KEY": None,
        "CLAUDE_CODE_OAUTH_TOKEN": None,
    }


@pytest.mark.parametrize(
    "code,seconds",
    [
        ("import time; time.sleep(60)", 0.15),
        ("import sys; sys.stdout.write('x'*1048577)", 5),
        ("import sys; sys.stderr.write('PRIVATE'*2000)", 5),
        ("import sys; sys.stderr.write('PRIVATE'); sys.exit(2)", 5),
    ],
)
def test_real_runner_timeout_overflow_and_failure_are_static(tmp_path, code, seconds):
    sessions = native.Sessions(sys._base_executable, tmp_path)
    with pytest.raises(native.SessionError) as error:
        sessions._run(["-c", code], time.monotonic() + seconds)
    assert str(error.value) == "native_sessions_unavailable"


def test_timeout_kills_only_started_command_not_its_independent_child(tmp_path):
    import psutil

    sessions = native.Sessions(sys._base_executable, tmp_path)
    marker = tmp_path / "owned-test-child.json"
    code = (
        "import json,pathlib,subprocess,sys,time; "
        "p=subprocess.Popen([sys.executable,'-c','import time; time.sleep(60)'],"
        "creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)); "
        f"pathlib.Path({str(marker)!r}).write_text(json.dumps([p.pid,time.time()])); "
        "time.sleep(60)"
    )
    try:
        with pytest.raises(native.SessionError):
            sessions._run(["-c", code], time.monotonic() + 3)
        pid, started = json.loads(marker.read_text())
        child = psutil.Process(pid)
        assert abs(child.create_time() - started) < 3 and child.is_running()
    finally:
        if marker.exists():
            pid, started = json.loads(marker.read_text())
            child = psutil.Process(pid)
            if abs(child.create_time() - started) < 3:
                child.kill()
                child.wait(timeout=5)


def test_host_routes_preserve_owner_key_boundary_exact_body_and_no_query(
    registry, monkeypatch, tmp_path
):
    sessions, _state, calls = registry
    monkeypatch.setattr(workspace_providers, "Sessions", lambda *_: sessions)
    config = {
        "native_providers": {
            "state": str(tmp_path),
            "codex": str(tmp_path / "absent"),
            "claude": str(sessions.executable),
            "control_key": "c" * 32,
            "inference_key": "i" * 32,
        }
    }
    control = {"Authorization": "Bearer " + "c" * 32}
    infer = {"Authorization": "Bearer " + "i" * 32}
    digest = sessions._row(row())["identity"]
    with TestClient(workspace_providers.create_app(config)) as client:
        for path in (
            "/claude/sessions",
            "/claude/sessions/abcd1234",
            "/claude/sessions/abcd1234/output",
        ):
            assert client.get(path, headers=infer).status_code == 401
            assert (
                client.get(
                    path, headers={**control, "Origin": "https://browser"}
                ).status_code
                == 401
            )
            assert client.get(path + "?x=1", headers=control).status_code == 401
        assert calls == []
        result = client.get("/claude/sessions", headers=control)
        assert (
            result.status_code == 200
            and result.json()["results"][0]["identity"] == digest
        )
        result = client.get("/claude/sessions/abcd1234/output", headers=control)
        assert result.json()["text"] == "recent output\n"
        path = "/claude/sessions/abcd1234/stop"
        assert (
            client.post(
                path, headers=infer, json={"expectedIdentity": digest}
            ).status_code
            == 401
        )
        assert (
            client.post(
                path, headers=control, json={"expectedIdentity": digest, "launch": True}
            ).status_code
            == 422
        )
        assert (
            client.post(
                path,
                headers=control,
                content=b'{"expectedIdentity":"x","expectedIdentity":"y"}',
            ).status_code
            == 422
        )
        result = client.post(path, headers=control, json={"expectedIdentity": "0" * 64})
        assert result.status_code == 409 and result.json() == {
            "error": "native_session_changed"
        }
        assert (
            client.post(
                path, headers=control, json={"expectedIdentity": digest}
            ).json()["status"]
            == "stop_requested"
        )
        assert (
            client.get("/claude/sessions/missing", headers=control).status_code == 404
        )
        assert client.get("/claude/sessions/--all", headers=control).status_code == 422
        assert sum(call[0] == "stop" for call in calls) == 1
