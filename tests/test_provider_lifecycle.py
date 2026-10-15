"""Provider restarts do not mistake native background supervisors for owned workers."""

import io
import json
import sys
from pathlib import Path

import psutil
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import provider_lifecycle
import workspace_providers

LAUNCHER = Path("C:/synthetic/scripts/local_stack.py")
COMMAND = ["python", str(LAUNCHER), "serve", "providers"]


class Process:
    next_pid = 1000

    def __init__(self, command, created=12):
        self.pid = Process.next_pid
        Process.next_pid += 1
        self.command = command
        self.created = created
        self.signals = []
        self.descendants = []

    def cmdline(self):
        return self.command

    def create_time(self):
        return self.created

    def children(self, recursive):
        assert recursive
        return self.descendants

    def terminate(self):
        self.signals.append("terminate")

    def kill(self):
        self.signals.append("kill")


@pytest.fixture
def family(monkeypatch):
    root, worker = Process(COMMAND), Process(COMMAND)
    supervisor = Process(["claude.exe", "daemon", "run"])
    agent = Process(["claude.exe", "-p", "synthetic prompt"])
    root.descendants = [worker, supervisor, agent]
    processes = {process.pid: process for process in [root, worker, supervisor, agent]}
    monkeypatch.setattr(psutil, "Process", lambda pid: processes[pid])
    waits = []

    def wait(processes, timeout):
        waits.append((processes, timeout))
        return [p for p in processes if p.signals], [
            p for p in processes if not p.signals
        ]

    monkeypatch.setattr(psutil, "wait_procs", wait)
    monkeypatch.setattr(provider_lifecycle, "graceful_stop", lambda *_: False)
    return root, worker, supervisor, agent, waits


def test_fallback_selects_only_exact_service_processes_including_venv_launcher(family):
    root, worker, supervisor, agent, waits = family
    provider_lifecycle.stop(root, {}, 18570, LAUNCHER)
    assert root.signals == worker.signals == ["terminate"]
    assert supervisor.signals == agent.signals == []
    assert all(
        supervisor not in processes and agent not in processes for processes, _ in waits
    )


def test_graceful_shutdown_does_not_signal_native_jobs_or_exited_service(
    family, monkeypatch
):
    root, worker, supervisor, agent, waits = family
    monkeypatch.setattr(provider_lifecycle, "graceful_stop", lambda *_: True)

    def wait(processes, timeout):
        waits.append((processes, timeout))
        return processes, []

    monkeypatch.setattr(psutil, "wait_procs", wait)
    provider_lifecycle.stop(root, {}, 18570, LAUNCHER)
    assert not any(process.signals for process in [root, worker, supervisor, agent])
    assert waits[0] == ([root, worker], 15)


def test_changed_pid_identity_is_not_signaled(family, monkeypatch):
    root, worker, _supervisor, _agent, _waits = family

    def graceful(*_):
        worker.created += 1
        return False

    monkeypatch.setattr(provider_lifecycle, "graceful_stop", graceful)
    with pytest.raises(SystemExit, match="identity changed"):
        provider_lifecycle.stop(root, {}, 18570, LAUNCHER)
    assert root.signals == worker.signals == []


def test_changed_process_command_is_not_signaled(family, monkeypatch):
    root, worker, _supervisor, _agent, _waits = family

    def graceful(*_):
        worker.command = ["unrelated", "process"]
        return False

    monkeypatch.setattr(provider_lifecycle, "graceful_stop", graceful)
    with pytest.raises(SystemExit, match="identity changed"):
        provider_lifecycle.stop(root, {}, 18570, LAUNCHER)
    assert root.signals == worker.signals == []


def test_foreign_launcher_is_refused_without_private_request(family, monkeypatch):
    root, *_ = family
    root.command = ["python", "C:/foreign/local_stack.py", "serve", "providers"]
    monkeypatch.setattr(
        provider_lifecycle,
        "graceful_stop",
        lambda *_: pytest.fail("No request to foreign service"),
    )
    with pytest.raises(SystemExit, match="identity no longer matches"):
        provider_lifecycle.stop(root, {}, 18570, LAUNCHER)


def test_private_shutdown_request_is_scoped_bounded_and_not_redirected(monkeypatch):
    requests = []

    class Opener:
        def open(self, request, timeout):
            requests.append((request, timeout))
            return io.BytesIO(b'{"status":"stopping"}')

    def opener(*handlers):
        assert handlers[0].proxies == {} and isinstance(
            handlers[1], provider_lifecycle.NoRedirect
        )
        return Opener()

    monkeypatch.setattr(provider_lifecycle, "build_opener", opener)
    assert provider_lifecycle.graceful_stop(
        {"native_providers": {"control_key": "c" * 32}}, 18570
    )
    request, timeout = requests[0]
    assert request.full_url == "http://127.0.0.1:18570/lifecycle/stop"
    assert request.data == b"{}" and timeout == 3
    assert request.get_header("Authorization") == "Bearer " + "c" * 32


def test_shutdown_route_is_owner_only_exact_and_only_requests_server_exit(tmp_path):
    config = {
        "native_providers": {
            "state": str(tmp_path),
            "codex": str(tmp_path / "absent"),
            "claude": str(tmp_path / "absent"),
            "control_key": "c" * 32,
            "inference_key": "i" * 32,
        }
    }
    app = workspace_providers.create_app(config)
    called = []
    owner = {"Authorization": "Bearer " + "c" * 32}
    with TestClient(app) as client:
        assert client.post("/lifecycle/stop", headers=owner, json={}).status_code == 503
        app.state.request_shutdown = lambda: called.append(True)
        assert (
            client.post(
                "/lifecycle/stop",
                headers={"Authorization": "Bearer " + "i" * 32},
                json={},
            ).status_code
            == 401
        )
        assert (
            client.post(
                "/lifecycle/stop",
                headers={**owner, "Origin": "https://browser"},
                json={},
            ).status_code
            == 401
        )
        assert (
            client.post("/lifecycle/stop?x=1", headers=owner, json={}).status_code
            == 401
        )
        for value in ([], None, {"stopNativeSessions": True}):
            assert (
                client.post(
                    "/lifecycle/stop", headers=owner, content=json.dumps(value)
                ).status_code
                == 422
            )
        assert called == []
        result = client.post("/lifecycle/stop", headers=owner, json={})
        assert result.status_code == 200 and result.json() == {"status": "stopping"}
        assert called == [True]
