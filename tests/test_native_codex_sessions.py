"""Synthetic native protocol checks; never open a real account or run a task."""

import base64
import json
import sys
import threading
import time
from contextlib import contextmanager
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import chatgpt_provider
import native_codex_sessions as native
import workspace_providers

ID = "019a08ad-8872-7000-8123-123456789abc"
OTHER = "019a08ad-8872-7000-8123-123456789abd"


def row(**changes):
    return {
        "id": ID,
        "sessionId": OTHER,
        "name": "Synthetic saved thread",
        "preview": "Synthetic first input",
        "cwd": "C:/synthetic/work",
        "createdAt": 1700000000,
        "updatedAt": 1700000100,
        "modelProvider": "openai",
        "source": "cli",
        "status": {"type": "active", "activeFlags": ["waitingOnApproval"]},
        "ephemeral": False,
        "turns": [],
        **changes,
    }


@pytest.fixture
def inventory(tmp_path, monkeypatch):
    sessions = native.Sessions(tmp_path / "codex.exe", tmp_path / "own-home")
    state = {"data": [row()], "nextCursor": None}
    calls = []

    class Observer:
        def call(self, method, params):
            calls.append((method, params))
            if method == "thread/list":
                return state
            assert method == "thread/read"
            return {"thread": state["data"][0]}

    @contextmanager
    def observer():
        yield Observer()

    monkeypatch.setattr(sessions, "_observer", observer)
    return sessions, state, calls


def test_list_and_detail_are_bounded_saved_metadata_without_activity_claims(inventory):
    sessions, _state, calls = inventory
    result = sessions.list()
    assert set(result) == {
        "schemaVersion",
        "provider",
        "scope",
        "runtimeVisibility",
        "archived",
        "results",
        "nextCursor",
    }
    assert result == {
        "schemaVersion": 1,
        "provider": "codex",
        "scope": "saved_threads",
        "runtimeVisibility": "observer_only",
        "archived": False,
        "results": [
            {
                key: value
                for key, value in row().items()
                if key
                in {
                    "id",
                    "name",
                    "preview",
                    "cwd",
                    "createdAt",
                    "updatedAt",
                    "modelProvider",
                    "source",
                }
            }
            | {"previewTruncated": False}
        ],
        "nextCursor": None,
    }
    assert calls == [
        (
            "thread/list",
            {
                "limit": 25,
                "archived": False,
                "sortKey": "updated_at",
                "sortDirection": "desc",
                "sourceKinds": list(native.SOURCE_KINDS),
            },
        )
    ]
    detail = sessions.status(ID)
    assert set(detail) == {
        "schemaVersion",
        "provider",
        "scope",
        "runtimeVisibility",
        "session",
    }
    assert detail["session"] == result["results"][0]
    assert calls[-1] == ("thread/read", {"threadId": ID, "includeTurns": False})
    assert "thread/list" not in chatgpt_provider.METHODS
    assert "thread/read" not in chatgpt_provider.METHODS


def test_display_is_plain_bounded_unicode_with_explicit_preview_omission(inventory):
    sessions, state, _calls = inventory
    state["data"] = [
        row(name="\u202e\x00" + "猫" * 350, preview="\x00\u202e" + "😀" * 501)
    ]
    result = sessions.list()["results"][0]
    assert result["name"] == "猫" * 300
    assert result["preview"] == "😀" * 500 and result["previewTruncated"]
    state["data"] = [row(name=None, preview="exact")]
    assert sessions.list()["results"][0]["name"] is None
    assert not sessions.list()["results"][0]["previewTruncated"]


@pytest.mark.parametrize(
    "source,expected",
    [
        ("exec", "exec"),
        ("appServer", "appServer"),
        ({"subAgent": {"thread_spawn": {"parent_thread_id": ID}}}, "subAgent"),
        ({"custom": "private classifier"}, "custom"),
        ("future", "unknown"),
        (None, "unknown"),
    ],
)
def test_sources_do_not_expose_unbounded_native_classifiers(
    inventory, source, expected
):
    sessions, state, _calls = inventory
    state["data"] = [row(source=source)]
    assert sessions.list()["results"][0]["source"] == expected


@pytest.mark.parametrize(
    "change",
    [
        {"id": "--last"},
        {"id": ID.upper()},
        {"id": OTHER + "/output"},
        {"turns": [{"private": "transcript"}]},
        {"turns": None},
        {"ephemeral": True},
        {"ephemeral": None},
        {"createdAt": True},
        {"updatedAt": -1},
        {"createdAt": 9007199254740992},
        {"name": []},
        {"preview": None},
        {"cwd": ""},
        {"cwd": "x" * 4097},
        {"cwd": "C:/work\ncommand"},
        {"modelProvider": "\u202eopenai"},
        {"modelProvider": "x" * 201},
    ],
)
def test_malformed_or_transcript_bearing_native_rows_fail_closed(inventory, change):
    sessions, state, _calls = inventory
    state["data"] = [row(**change)]
    with pytest.raises(native.SessionError, match="native_sessions_unavailable"):
        sessions.list()


def test_duplicate_overlimit_and_wrong_detail_identity_are_rejected(inventory):
    sessions, state, _calls = inventory
    state["data"] = [row(), row()]
    with pytest.raises(native.SessionError):
        sessions.list()
    with pytest.raises(native.SessionError):
        sessions.list({"limit": 1})
    state["data"] = [row(id=OTHER)]
    with pytest.raises(native.SessionError):
        sessions.status(ID)


def test_paging_binds_opaque_cursor_to_profile_filter_and_size(inventory, tmp_path):
    sessions, state, calls = inventory
    state["nextCursor"] = "native opaque cursor/% 😀"
    cursor = sessions.list({"limit": 2, "archived": True})["nextCursor"]
    assert native.CURSOR.fullmatch(cursor)
    state["nextCursor"] = None
    result = sessions.list({"limit": 2, "archived": True, "cursor": cursor})
    assert result["archived"] and result["nextCursor"] is None
    assert calls[-1][1]["cursor"] == "native opaque cursor/% 😀"
    before = len(calls)
    for values in (
        {"cursor": cursor},
        {"limit": 2, "cursor": cursor},
        {"limit": 3, "archived": True, "cursor": cursor},
    ):
        with pytest.raises(native.SessionError, match="invalid_native_session_request"):
            sessions.list(values)
    other = native.Sessions(sessions.executable, tmp_path / "other-home")
    with pytest.raises(native.SessionError, match="invalid_native_session_request"):
        other.list({"limit": 2, "archived": True, "cursor": cursor})
    assert len(calls) == before


def test_native_cursor_overflow_or_no_progress_is_not_empty_success(inventory):
    sessions, state, _calls = inventory
    state["nextCursor"] = "next"
    cursor = sessions.list()["nextCursor"]
    with pytest.raises(native.SessionError, match="native_sessions_unavailable"):
        sessions.list({"cursor": cursor})
    for value in ("", "😀" * 1025, [], 123):
        state["nextCursor"] = value
        with pytest.raises(native.SessionError):
            sessions.list()


@pytest.mark.parametrize(
    "value",
    [
        {"limit": True},
        {"limit": "01"},
        {"limit": 0},
        {"limit": 51},
        {"limit": "２"},
        {"archived": 1},
        {"archived": "True"},
        {"cursor": ""},
        {"cursor": "="},
        {"cursor": "a" * 8193},
        {"limit": None},
        {"threadId": ID},
    ],
)
def test_invalid_query_never_starts_observer(inventory, value):
    sessions, _state, calls = inventory
    with pytest.raises(native.SessionError, match="invalid_native_session_request"):
        sessions.list(value)
    assert calls == []


@pytest.mark.parametrize(
    "raw",
    [
        b"limit=2&limit=3",
        b"cursor=",
        b"unknown=x",
        b"limit=2&archived=false&cursor=a&extra=b",
        b"limit",
        b"archived=TRUE",
        b"limit=%FF",
        b"cursor=" + b"x" * 8500,
    ],
)
def test_raw_query_duplicate_unknown_and_bounded_validation(raw):
    with pytest.raises(native.SessionError) as error:
        native.raw_list_query(raw)
    assert error.value.status == 422


def test_canonical_query_is_idempotent_and_raw_defaults_match():
    value = {"limit": 25, "archived": False, "cursor": None}
    assert native.list_query(value) == value
    assert native.raw_list_query(b"") == value
    assert native.raw_list_query(b"limit=50&archived=true") == {
        **value,
        "limit": 50,
        "archived": True,
    }


def test_noncanonical_malformed_cursor_fails_before_start(inventory):
    sessions, _state, calls = inventory
    for raw in (b"{}", b'[{"secret":"not echoed"}]', b'{"v":1,"v":1}', b"NaN"):
        cursor = base64.urlsafe_b64encode(raw).decode().rstrip("=")
        with pytest.raises(native.SessionError, match="invalid_native_session_request"):
            sessions.list({"cursor": cursor})
    assert calls == []


@pytest.mark.parametrize("nested", [None, [], "", "x" * 4097, "\ud800"])
def test_bound_malformed_nested_cursor_is_invalid_request_not_unavailable(
    inventory, nested
):
    sessions, _state, calls = inventory
    value = {
        "v": 1,
        "scope": sessions.scope,
        "limit": 25,
        "archived": False,
        "cursor": nested,
    }
    cursor = base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")
    with pytest.raises(native.SessionError) as caught:
        sessions.list({"cursor": cursor})
    assert (
        caught.value.status == 422
        and str(caught.value) == "invalid_native_session_request"
    )
    assert calls == []


@pytest.fixture
def process_server(tmp_path, monkeypatch):
    """Run real owned Python pipes, substitute only the installed native executable."""
    sessions = native.Sessions(sys._base_executable, tmp_path)
    record = tmp_path / "requests.jsonl"
    state = {
        "result": {"data": [row()], "nextCursor": None},
        "version": f"codex-cli {native.CODEX_VERSION}",
        "prefix": "",
    }
    commands = []
    popen = native.subprocess.Popen

    def start(arguments, **options):
        commands.append((arguments, options))
        assert arguments[0] == str(sessions.executable)
        if arguments[1:] == ["--version"]:
            code = f"print({state['version']!r})"
        else:
            assert arguments[1:] == [
                "app-server",
                "--stdio",
                "-c",
                'cli_auth_credentials_store="file"',
            ]
            code = "import sys,json,pathlib,time\n" + state["prefix"] + "\n"
            code += f"record=pathlib.Path({str(record)!r})\n"
            code += "for line in sys.stdin:\n request=json.loads(line)\n with record.open('a',encoding='utf-8') as output: output.write(json.dumps(request)+'\\n')\n"
            code += " if request['method']=='initialized': continue\n"
            code += f" response={{'id':request['id'],'result':{{}} if request['method']=='initialize' else {state['result']!r}}}\n"
            if "error" in state:
                code += f" if request['method']!='initialize': response={{'id':request['id'],'error':{state['error']!r}}}\n"
            if "response" in state:
                code += f" if request['method']!='initialize': response={state['response']!r}\n"
            code += " sys.stdout.write(json.dumps(response)+'\\n');sys.stdout.flush()\n"
        return popen([sys._base_executable, "-c", code], **options)

    monkeypatch.setattr(native.subprocess, "Popen", start)
    return sessions, state, commands, record


def test_real_observer_exact_readonly_protocol_isolated_env_and_owned_cleanup(
    process_server, monkeypatch
):
    sessions, _state, commands, record = process_server
    monkeypatch.setenv("OPENAI_API_KEY", "never-forwarded")
    monkeypatch.setenv("CODEX_HOME", "other-native-store")
    monkeypatch.setenv("CODEX_AUTH_TOKEN", "never-forwarded")
    assert sessions.list()["results"][0]["id"] == ID
    requests = [json.loads(line) for line in record.read_text().splitlines()]
    assert [value["method"] for value in requests] == [
        "initialize",
        "initialized",
        "thread/list",
    ]
    assert requests[0]["params"] == {
        "clientInfo": {"name": "conker_saved_history", "version": "1.0.0"}
    }
    assert "useStateDbOnly" not in requests[-1]["params"]
    assert sessions.process is None
    for _arguments, options in commands:
        assert options["cwd"] == sessions.home
        assert options["env"]["CODEX_HOME"] == str(sessions.home)
        assert (
            "OPENAI_API_KEY" not in options["env"]
            and "CODEX_AUTH_TOKEN" not in options["env"]
        )
    assert not any(
        "daemon" in argument or "proxy" in argument
        for arguments, _ in commands
        for argument in arguments
    )


def test_empty_success_version_mismatch_and_missing_runtime_are_distinct(
    process_server,
):
    sessions, state, commands, _record = process_server
    state["result"]["data"] = []
    assert sessions.list()["results"] == []
    state["version"] = "codex-cli newer-unreviewed"
    with pytest.raises(native.SessionError, match="native_sessions_unavailable"):
        sessions.list()
    assert commands[-1][0][1:] == ["--version"]
    sessions.executable = sessions.home / "missing"
    before = len(commands)
    with pytest.raises(native.SessionError):
        sessions.list()
    assert len(commands) == before


@pytest.mark.parametrize(
    "error,status,code",
    [
        (
            {"code": -32600, "message": f"thread not loaded: {ID}"},
            404,
            "native_session_not_found",
        ),
        (
            {"code": -32603, "message": "PRIVATE failure"},
            503,
            "native_sessions_unavailable",
        ),
        (
            {"code": -32600, "message": "PRIVATE failure"},
            503,
            "native_sessions_unavailable",
        ),
    ],
)
def test_read_errors_are_static_without_native_error_details(
    process_server, error, status, code
):
    sessions, state, _commands, _record = process_server
    state["error"] = error
    with pytest.raises(native.SessionError) as caught:
        sessions.status(ID)
    assert caught.value.status == status and str(caught.value) == code


def test_expired_native_cursor_never_restarts_first_page(process_server):
    sessions, state, _commands, record = process_server
    cursor = sessions._cursor("expired", native.list_query({}))
    state["error"] = {"code": -32600, "message": "invalid cursor: PRIVATE"}
    with pytest.raises(
        native.SessionError, match="invalid_native_session_request"
    ) as caught:
        sessions.list({"cursor": cursor})
    assert caught.value.status == 422
    requests = [json.loads(line) for line in record.read_text().splitlines()]
    assert [value["method"] for value in requests].count("thread/list") == 1
    assert requests[-1]["params"]["cursor"] == "expired"


@pytest.mark.parametrize(
    "response",
    [
        {"id": 900, "result": {}},
        {"id": True, "result": {}},
        {"id": 2, "method": "item/tool/requestApproval", "params": {}},
        {"id": 2, "result": []},
    ],
)
def test_protocol_confusion_and_server_requests_receive_no_reply(
    process_server, response
):
    sessions, state, _commands, record = process_server
    state["response"] = response
    with pytest.raises(native.SessionError, match="native_sessions_unavailable"):
        sessions.list()
    assert len(record.read_text().splitlines()) == 3


def test_real_pipe_deadline_stdout_stderr_overflow_and_invalid_json_are_static(
    tmp_path,
):
    sessions = native.Sessions(sys._base_executable, tmp_path)
    cases = [
        ("import time;time.sleep(60)", 0.15),
        ("import sys;sys.stdout.write('x'*4194305)", 5),
        ("import sys;sys.stderr.write('SECRET'*1400)", 5),
        ("print('not JSON')", 5),
    ]
    for code, seconds in cases:
        with (
            pytest.raises(native.SessionError, match="native_sessions_unavailable"),
            sessions._command(["-c", code], time.monotonic() + seconds) as command,
        ):
            command.call("initialize", {})
        assert sessions.process is None


def test_forbidden_rpc_is_rejected_before_writing(tmp_path):
    sessions = native.Sessions(sys._base_executable, tmp_path)
    with sessions._command(
        ["-c", "import time;time.sleep(60)"], time.monotonic() + 3
    ) as command:
        with pytest.raises(native.SessionError):
            command.call("thread/resume", {"threadId": ID})
        assert command.sequence == 0


def test_continuous_notifications_cannot_extend_whole_operation_deadline(
    process_server, monkeypatch
):
    sessions, state, _commands, _record = process_server
    monkeypatch.setattr(native, "OPERATION_SECONDS", 0.35)
    state["prefix"] = (
        'while True:\n sys.stdout.write(\'{"method":"notice"}\\n\');sys.stdout.flush();time.sleep(.01)'
    )
    started = time.monotonic()
    with pytest.raises(native.SessionError, match="native_sessions_unavailable"):
        sessions.list()
    assert time.monotonic() - started < 3
    assert sessions.process is None


def test_observer_timeout_never_kills_an_independent_child(tmp_path):
    import psutil

    sessions = native.Sessions(sys._base_executable, tmp_path)
    marker = tmp_path / "owned-synthetic-child.json"
    code = (
        "import subprocess,sys,pathlib,json,time; "
        "p=subprocess.Popen([sys.executable,'-c','import time;time.sleep(60)'],"
        "creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)); "
        f"pathlib.Path({str(marker)!r}).write_text(json.dumps([p.pid,time.time()])); "
        "time.sleep(60)"
    )
    try:
        with (
            pytest.raises(native.SessionError),
            sessions._command(["-c", code], time.monotonic() + 1) as command,
        ):
            command.call("initialize", {})
        pid, created = json.loads(marker.read_text())
        child = psutil.Process(pid)
        assert abs(child.create_time() - created) < 3 and child.is_running()
    finally:
        if marker.exists():
            pid, created = json.loads(marker.read_text())
            child = psutil.Process(pid)
            if abs(child.create_time() - created) < 3:
                child.kill()
                child.wait(timeout=3)


def test_shutdown_cancels_only_current_observer_and_refuses_new_work(process_server):
    sessions, state, _commands, _record = process_server
    state["prefix"] = "time.sleep(60)"
    outcomes = []

    def observe():
        try:
            sessions.list()
        except native.SessionError as error:
            outcomes.append(str(error))

    worker = threading.Thread(target=observe)
    worker.start()
    deadline = time.monotonic() + 3
    while (
        sessions.process is None or sessions.process.args[-1].startswith("print(")
    ) and time.monotonic() < deadline:
        time.sleep(0.01)
    sessions.close()
    worker.join(timeout=3)
    assert not worker.is_alive() and outcomes == ["native_sessions_unavailable"]
    assert sessions.process is None
    with pytest.raises(native.SessionError):
        sessions.list()


def test_observer_is_single_flight_without_queued_process_growth(process_server):
    sessions, _state, commands, _record = process_server
    sessions.lock.acquire()
    try:
        with pytest.raises(native.SessionError):
            sessions.list()
    finally:
        sessions.lock.release()
    assert commands == []


def test_host_routes_preserve_control_credential_exact_queries_and_lifespan(
    inventory, tmp_path, monkeypatch
):
    sessions, _state, calls = inventory
    monkeypatch.setattr(workspace_providers, "CodexSessions", lambda *_: sessions)
    config = {
        "native_providers": {
            "state": str(tmp_path),
            "codex": str(tmp_path / "absent"),
            "claude": str(tmp_path / "absent"),
            "control_key": "c" * 32,
            "inference_key": "i" * 32,
        }
    }
    control, inference = (
        {"Authorization": "Bearer " + "c" * 32},
        {"Authorization": "Bearer " + "i" * 32},
    )
    with TestClient(workspace_providers.create_app(config)) as client:
        for path in ("/codex/sessions?limit=1", f"/codex/sessions/{ID}"):
            assert client.get(path, headers=inference).status_code == 401
            assert (
                client.get(
                    path, headers={**control, "Origin": "https://browser"}
                ).status_code
                == 401
            )
        assert calls == []
        assert client.get(
            "/codex/sessions?limit=1&archived=true", headers=control
        ).json()["archived"]
        assert (
            client.get(f"/codex/sessions/{ID}", headers=control).json()["session"]["id"]
            == ID
        )
        before = len(calls)
        for query in ("limit=1&limit=2", "extra=1", "cursor=", "archived=1"):
            response = client.get("/codex/sessions?" + query, headers=control)
            assert response.status_code == 422 and response.json() == {
                "error": "invalid_native_session_request"
            }
        assert (
            client.get(f"/codex/sessions/{ID}?limit=1", headers=control).status_code
            == 401
        )
        assert (
            client.get("/claude/sessions?limit=1", headers=control).status_code == 401
        )
        assert client.get("/chatgpt?limit=1", headers=control).status_code == 401
        assert client.get("/codex/sessions/--last", headers=control).status_code == 422
        assert (
            client.post(
                f"/codex/sessions/{ID}/stop", headers=control, json={}
            ).status_code
            == 404
        )
        assert (
            client.get(f"/codex/sessions/{ID}/output", headers=control).status_code
            == 404
        )
        assert len(calls) == before
    assert sessions.closed.is_set()
