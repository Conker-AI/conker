"""The real native Codex observer process: read-only protocol, deadlines, isolation and cleanup."""

import json
import sys
import threading
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import native_codex_sessions as native

from tests.test_native_codex_sessions import ID, row


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
            # Long enough for two interpreters to start on a loaded machine: the child must have
            # spawned its grandchild and written the marker before the observer times out.
            sessions._command(["-c", code], time.monotonic() + 8) as command,
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
