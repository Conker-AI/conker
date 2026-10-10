"""Local startup must not take ownership of another checkout or listener."""

import importlib.util
import json
import os
import socket
import subprocess
import sys
from pathlib import Path

import pytest

SPEC = importlib.util.spec_from_file_location(
    "workspace_launcher", Path(__file__).resolve().parents[1] / "scripts/workspace.py"
)
workspace = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(workspace)


def test_foreign_configuration_is_preserved(tmp_path, monkeypatch):
    configuration = tmp_path / "configuration.json"
    original = '{"owner": "existing-installation"}'
    configuration.write_text(original)
    monkeypatch.setattr(workspace, "CONFIG", configuration)
    with pytest.raises(SystemExit, match="different local stack"):
        workspace.install("qwen2.5:3b")
    assert configuration.read_text() == original


def test_existing_install_does_not_rotate_credentials(tmp_path, monkeypatch):
    configuration = tmp_path / "configuration.json"
    original = json.dumps({"workspace_schema": 1, "existing_secret": "retained"})
    configuration.write_text(original)
    monkeypatch.setattr(workspace, "CONFIG", configuration)
    monkeypatch.setattr(
        workspace,
        "run",
        lambda *a, **kw: pytest.fail(
            "Existing install must not execute setup commands"
        ),
    )
    workspace.install("another-model")
    assert configuration.read_text() == original


def test_enhancement_refuses_a_running_memorygate_before_source_changes(monkeypatch):
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[1] / "scripts"))
    import workspace_setup

    inspected = []

    def owned(config, service):
        inspected.append(service)
        return service == "memorygate"

    monkeypatch.setattr(workspace_setup, "owned_process", owned)
    monkeypatch.setattr(
        workspace_setup,
        "run",
        lambda *args, **kwargs: pytest.fail("Active runtimes must not be enhanced"),
    )
    with pytest.raises(SystemExit, match="Stop this workspace"):
        workspace_setup.enhance({}, None)
    assert "memorygate" in inspected


def test_unrelated_listener_is_never_adopted(tmp_path, monkeypatch):
    monkeypatch.setattr(workspace, "STATE", tmp_path)
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        monkeypatch.setattr(workspace, "PORTS", {"pi": listener.getsockname()[1]})
        with pytest.raises(SystemExit, match="unrelated process"):
            workspace.owned_listener({}, "pi")


def test_closed_port_does_not_require_a_pid(tmp_path, monkeypatch):
    monkeypatch.setattr(workspace, "STATE", tmp_path)
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    monkeypatch.setattr(workspace, "PORTS", {"pi": port})
    assert workspace.owned_listener({}, "pi") is False


def test_workspace_ports_are_unique_and_unprivileged():
    assert len(set(workspace.PORTS.values())) == len(workspace.PORTS)
    assert all(1024 < value < 65536 for value in workspace.PORTS.values())


def test_same_label_with_another_volume_is_rejected(tmp_path, monkeypatch):
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        port = listener.getsockname()[1]
        monkeypatch.setattr(workspace, "PORTS", {"postgres": port})
        details = [
            {
                "State": {"Running": True},
                "Config": {"Labels": {"conker.local-integration": "true"}},
                "HostConfig": {
                    "PortBindings": {
                        "5432/tcp": [{"HostIp": "127.0.0.1", "HostPort": str(port)}]
                    }
                },
                "Mounts": [
                    {
                        "Destination": "/var/lib/postgresql/data",
                        "Name": "other-workspace",
                    }
                ],
            }
        ]
        monkeypatch.setattr(
            workspace,
            "run",
            lambda *a, **kw: "test" if "--format" in a else json.dumps(details),
        )
        with pytest.raises(SystemExit, match="does not belong"):
            workspace.owned_listener(
                {"postgres_container": "test", "postgres_volume": "this-workspace"},
                "postgres",
            )


def test_stale_pid_is_not_enough_to_adopt_a_listener(tmp_path, monkeypatch):
    (tmp_path / "pi").mkdir()
    (tmp_path / "pi/pid").write_text("123")
    monkeypatch.setattr(workspace, "STATE", tmp_path)

    def reject_identity(*args, **kwargs):
        raise subprocess.CalledProcessError(1, "identity check")

    monkeypatch.setattr(workspace, "run", reject_identity)
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        monkeypatch.setattr(workspace, "PORTS", {"pi": listener.getsockname()[1]})
        with pytest.raises(SystemExit, match="not owned"):
            workspace.owned_listener({"python": "managed-python"}, "pi")


@pytest.fixture
def starting_service(tmp_path, monkeypatch):
    """A test-owned child with the real launcher identity and no listening socket."""
    root = tmp_path / "workspace"
    script = root / "scripts/local_stack.py"
    script.parent.mkdir(parents=True)
    script.write_text("import time\ntime.sleep(60)\n", encoding="utf-8")
    state = root / ".local-run"
    (state / "pi").mkdir(parents=True)
    (root / "dashboard/dist").mkdir(parents=True)
    (root / "dashboard/dist/index.html").write_text("synthetic dashboard")
    # A bound, non-listening socket reserves the closed test port.
    with socket.socket() as reserved:
        reserved.bind(("127.0.0.1", 0))
        monkeypatch.setattr(workspace, "ROOT", root)
        monkeypatch.setattr(workspace, "STATE", state)
        monkeypatch.setattr(workspace, "PORTS", {"pi": reserved.getsockname()[1]})
        monkeypatch.setattr(workspace, "ORDER", ("pi",))
        # Use the base executable so Windows has no venv launcher descendant to orphan.
        process = subprocess.Popen(
            [sys._base_executable, str(script), "serve", "pi"],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        (state / "pi/pid").write_text(str(process.pid))
        config = {"workspace_schema": 1, "python": sys.executable}
        monkeypatch.setattr(workspace, "read_config", lambda: config)
        try:
            yield config, process, reserved
        finally:
            if process.poll() is None:
                process.terminate()
            process.wait(timeout=5)


def test_starting_process_is_reported_waited_for_and_stopped_without_duplicate(
    starting_service,
    monkeypatch,
    capsys,
):
    config, process, _reserved = starting_service
    assert workspace.service_state(config, "pi") == "starting"
    monkeypatch.setattr(sys, "argv", ["workspace.py", "status"])
    workspace.main()
    assert "pi: running; port not listening" in capsys.readouterr().out
    calls = []

    def launch(_config, command, service):
        calls.append((command, service))
        assert command == "stop", "A still-starting process must never be duplicated"
        process.terminate()
        process.wait(timeout=5)

    def wait_health(service):
        assert service == "pi"
        raise SystemExit("synthetic startup still in progress")

    monkeypatch.setattr(workspace, "launch", launch)
    monkeypatch.setattr(workspace, "wait_health", wait_health)
    monkeypatch.setattr(sys, "argv", ["workspace.py", "up"])
    with pytest.raises(SystemExit, match="startup still in progress"):
        workspace.main()
    assert calls == [] and process.poll() is None
    monkeypatch.setattr(sys, "argv", ["workspace.py", "down"])
    workspace.main()
    assert calls == [("stop", "pi")]
    assert "Workspace stopped" in capsys.readouterr().out
    assert workspace.service_state(config, "pi") == "stopped"


def test_foreign_recorded_process_is_refused_even_without_listener(
    starting_service,
    tmp_path,
    monkeypatch,
):
    config, process, _reserved = starting_service
    monkeypatch.setattr(workspace, "ROOT", tmp_path / "another-workspace")
    with pytest.raises(SystemExit, match="not owned"):
        workspace.owned_process(config, "pi")
    assert process.poll() is None


def test_foreign_listener_cannot_be_attributed_to_starting_owned_process(
    starting_service,
):
    config, process, reserved = starting_service
    reserved.listen()
    with pytest.raises(SystemExit, match="not owned"):
        workspace.owned_process(config, "pi")
    assert process.poll() is None


@pytest.mark.parametrize("operation", ["enhance", "corrections"])
def test_maintenance_refuses_owned_process_before_bind(
    starting_service,
    monkeypatch,
    operation,
):
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[1] / "scripts"))
    import workspace_setup

    config, process, _reserved = starting_service
    config["ports"] = {key: workspace_setup.PORTS[key] for key in ("pi", "memorygate")}
    monkeypatch.setattr(workspace_setup, "owned_process", workspace.owned_process)
    monkeypatch.setattr(
        workspace_setup,
        "run",
        lambda *a, **kw: pytest.fail("No source or credential changes"),
    )
    with pytest.raises(SystemExit, match="Stop"):
        if operation == "enhance":
            workspace_setup.enhance(config, None)
        else:
            workspace_setup.configure_memory_corrections(config)
    assert process.poll() is None


def test_shutdown_failure_cannot_claim_workspace_stopped(monkeypatch, capsys):
    monkeypatch.setattr(workspace, "ORDER", ("pi",))
    monkeypatch.setattr(workspace, "read_config", dict)
    monkeypatch.setattr(workspace, "owned_process", lambda *_args: True)
    calls = []
    monkeypatch.setattr(workspace, "launch", lambda *_args: calls.append(_args[1:]))
    monkeypatch.setattr(sys, "argv", ["workspace.py", "down"])
    with pytest.raises(SystemExit, match="did not stop"):
        workspace.main()
    assert calls == [("stop", "pi")]
    assert "Workspace stopped" not in capsys.readouterr().out


@pytest.mark.parametrize("verified", [True, False])
def test_start_checks_owner_again_after_health_wait(
    tmp_path, monkeypatch, capsys, verified
):
    (tmp_path / "dashboard/dist").mkdir(parents=True)
    (tmp_path / "dashboard/dist/index.html").write_text("synthetic dashboard")
    monkeypatch.setattr(workspace, "ROOT", tmp_path)
    monkeypatch.setattr(workspace, "ORDER", ("pi",))
    monkeypatch.setattr(workspace, "read_config", dict)
    calls = []
    monkeypatch.setattr(workspace, "owned_process", lambda *_args: False)
    monkeypatch.setattr(workspace, "launch", lambda *_args: calls.append("start"))
    monkeypatch.setattr(workspace, "wait_health", lambda *_args: calls.append("health"))
    monkeypatch.setattr(
        workspace,
        "owned_listener",
        lambda *_args: calls.append("owner") or verified,
    )
    monkeypatch.setattr(sys, "argv", ["workspace.py", "up"])
    if verified:
        workspace.main()
        assert "pi: responding" in capsys.readouterr().out
    else:
        with pytest.raises(SystemExit, match="without a verified workspace listener"):
            workspace.main()
        assert "pi: responding" not in capsys.readouterr().out
    assert calls == ["start", "health", "owner"]


@pytest.mark.parametrize(
    ("running", "restarting", "listening", "expected"),
    [
        (True, False, False, "starting"),
        (False, True, False, "starting"),
        (True, False, True, "listening"),
        (False, False, False, "stopped"),
    ],
)
def test_postgres_ownership_does_not_depend_on_published_port(
    monkeypatch,
    running,
    restarting,
    listening,
    expected,
):
    config = {"postgres_container": "owned-postgres", "postgres_volume": "owned-volume"}
    details = [
        {
            "State": {"Running": running, "Restarting": restarting},
            "Config": {"Labels": {"conker.local-integration": "true"}},
            "HostConfig": {
                "PortBindings": {
                    "5432/tcp": [
                        {
                            "HostIp": "127.0.0.1",
                            "HostPort": str(workspace.PORTS["postgres"]),
                        }
                    ]
                }
            },
            "Mounts": [
                {"Destination": "/var/lib/postgresql/data", "Name": "owned-volume"}
            ],
        }
    ]
    monkeypatch.setattr(workspace, "port_listening", lambda _service: listening)
    monkeypatch.setattr(
        workspace,
        "run",
        lambda *a, **kw: "owned-postgres" if "--format" in a else json.dumps(details),
    )
    assert workspace.service_state(config, "postgres") == expected


def test_uninspectable_container_is_not_reported_stopped(monkeypatch):
    monkeypatch.setattr(workspace, "port_listening", lambda _service: False)

    def failed(*_args, **_kwargs):
        raise subprocess.CalledProcessError(1, "docker")

    monkeypatch.setattr(workspace, "run", failed)
    with pytest.raises(SystemExit, match="Could not inspect"):
        workspace.owned_process({"postgres_container": "owned-postgres"}, "postgres")


@pytest.mark.parametrize("listening", [True, False])
def test_missing_container_is_stopped_only_without_listener(monkeypatch, listening):
    monkeypatch.setattr(workspace, "port_listening", lambda _service: listening)
    monkeypatch.setattr(
        workspace, "run", lambda *_a, **_kw: "similarly-named-container"
    )
    if listening:
        with pytest.raises(SystemExit, match="unrelated process"):
            workspace.owned_process(
                {"postgres_container": "owned-postgres"}, "postgres"
            )
    else:
        assert not workspace.owned_process(
            {"postgres_container": "owned-postgres"}, "postgres"
        )
