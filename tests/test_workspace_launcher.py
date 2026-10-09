"""Local startup must not take ownership of another checkout or listener."""
import importlib.util
import json
import socket
import subprocess
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
    monkeypatch.setattr(workspace, "run", lambda *a, **kw: pytest.fail("Existing install must not execute setup commands"))
    workspace.install("another-model")
    assert configuration.read_text() == original


def test_enhancement_refuses_a_running_memorygate_before_source_changes(monkeypatch):
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[1] / "scripts"))
    import workspace_setup

    inspected = []

    def owned(config, service):
        inspected.append(service)
        return service == "memorygate"

    monkeypatch.setattr(workspace_setup, "owned_listener", owned)
    monkeypatch.setattr(workspace_setup, "run", lambda *args, **kwargs: pytest.fail("Active runtimes must not be enhanced"))
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
        details = [{"State": {"Running": True}, "Config": {"Labels": {"conker.local-integration": "true"}},
                    "HostConfig": {"PortBindings": {"5432/tcp": [{"HostIp": "127.0.0.1", "HostPort": str(port)}]}},
                    "Mounts": [{"Destination": "/var/lib/postgresql/data", "Name": "other-workspace"}]}]
        monkeypatch.setattr(workspace, "run", lambda *a, **kw: json.dumps(details))
        with pytest.raises(SystemExit, match="does not belong"):
            workspace.owned_listener({"postgres_container": "test", "postgres_volume": "this-workspace"}, "postgres")


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
