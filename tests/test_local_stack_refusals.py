"""`scripts/local_stack.py` commands: what each refuses before touching Docker or a process.

Every case runs `main()` with a throwaway .local-run in tmp_path, a recording stand-in for the
`docker` calls and a fixed answer for "is this port listening", so no container or service starts.
"""

from __future__ import annotations

import json
import subprocess
from types import SimpleNamespace

import pytest

from scripts import local_stack

LABEL = "conker.local-integration"
OWNED_QDRANT = {
    "Config": {"Labels": {LABEL: "true"}},
    "HostConfig": {"PortBindings": {"6333/tcp": [{"HostIp": "127.0.0.1", "HostPort": "6333"}]}},
    "Mounts": [{"Name": "qdrant-volume", "Destination": "/qdrant/storage"}],
}
OWNED_POSTGRES = {
    "Config": {"Labels": {LABEL: "true"}},
    "HostConfig": {"PortBindings": {"5432/tcp": [{"HostIp": "127.0.0.1", "HostPort": "55432"}]}},
    "Mounts": [{"Name": "pg-volume", "Destination": "/var/lib/postgresql/data"}],
}


class Docker:
    """Stands in for subprocess.run: `inspect` answers from `details`; every call is recorded."""

    def __init__(self, details=None):
        self.details = details
        self.calls: list[list[str]] = []

    def __call__(self, command, **_options):
        self.calls.append(list(command))
        if command[:2] in (["docker", "container"], ["docker", "inspect"]):
            if self.details is None:
                return SimpleNamespace(returncode=1, stdout=b"")
            return SimpleNamespace(returncode=0, stdout=json.dumps([self.details]).encode())
        return SimpleNamespace(returncode=0, stdout=b"")

    def verbs(self):
        return [call[1] for call in self.calls if call[1] not in {"container", "inspect"}]


@pytest.fixture()
def stack(tmp_path, monkeypatch):
    state = tmp_path / ".local-run"
    config = {
        "python": "python-for-services",
        "decision_python": "python-for-decisions",
        "qdrant_container": "qdrant-box",
        "qdrant_volume": "qdrant-volume",
        "postgres_container": "pg-box",
        "postgres_volume": "pg-volume",
        "meaning_search": {"qdrant_image": "qdrant/qdrant:test"},
        "environments": {"postgres": {"POSTGRES_USER": "u", "POSTGRES_PASSWORD": "p"}},
    }
    for name in local_stack.SERVICES:
        (state / name).mkdir(parents=True)
    (state / "configuration.json").write_text(json.dumps(config), encoding="utf-8")
    monkeypatch.setattr(local_stack, "STATE", state)
    monkeypatch.setattr(local_stack, "CONFIG", state / "configuration.json")
    monkeypatch.setattr(local_stack.os, "umask", lambda mask: 0o022)
    monkeypatch.setattr(local_stack, "listening", lambda port: False)
    return state


def run_main(monkeypatch, *argv):
    monkeypatch.setattr(local_stack.sys, "argv", ["local_stack.py", *argv])
    local_stack.main()


def use_docker(monkeypatch, details=None):
    docker = Docker(details)
    monkeypatch.setattr(local_stack.subprocess, "run", docker)
    return docker


def refused(monkeypatch, *argv):
    with pytest.raises(SystemExit) as raised:
        run_main(monkeypatch, *argv)
    return raised.value.code


def test_status_lists_every_service_with_its_port(stack, monkeypatch, capsys):
    monkeypatch.setattr(local_stack, "listening", lambda port: port == local_stack.SERVICES["pi"])
    run_main(monkeypatch, "status")
    lines = capsys.readouterr().out.splitlines()
    assert len(lines) == len(local_stack.SERVICES)
    assert f"pi: port {local_stack.SERVICES['pi']} listening (health not implied)" in lines
    assert f"gateway: port {local_stack.SERVICES['gateway']} closed" in lines


def test_a_command_that_needs_a_service_refuses_without_one(stack, monkeypatch, capsys):
    assert refused(monkeypatch, "start") == 2
    assert "Select a service." in capsys.readouterr().err


def test_serve_postgres_is_refused_because_it_runs_in_docker(stack, monkeypatch, capsys):
    use_docker(monkeypatch)
    assert refused(monkeypatch, "serve", "postgres") == 2
    assert "Use start postgres; PostgreSQL runs in Docker." in capsys.readouterr().err


def test_start_refuses_a_port_that_is_already_in_use(stack, monkeypatch):
    monkeypatch.setattr(local_stack, "listening", lambda port: True)
    started = []
    monkeypatch.setattr(local_stack.subprocess, "Popen", lambda *a, **k: started.append(a))
    assert (
        refused(monkeypatch, "start", "pi")
        == "Port already in use; no existing process was replaced."
    )
    assert started == []


def test_start_launches_the_service_and_records_its_pid(stack, monkeypatch, capsys):
    launched = {}

    def popen(command, **options):
        launched["command"] = command
        launched["options"] = options
        return SimpleNamespace(pid=4242)

    monkeypatch.setattr(local_stack.subprocess, "Popen", popen)
    run_main(monkeypatch, "start", "decisions")
    assert capsys.readouterr().out.strip() == (
        "Started decisions process 4242; check health before use."
    )
    assert launched["command"][0] == "python-for-decisions"
    assert launched["command"][2:] == ["serve", "decisions"]
    assert launched["options"]["stdin"] == subprocess.DEVNULL
    assert (stack / "decisions/pid").read_text(encoding="utf-8") == "4242"


def test_start_uses_the_python_chosen_for_that_service(stack, monkeypatch):
    path = stack / "configuration.json"
    config = json.loads(path.read_text(encoding="utf-8"))
    config["python_by_service"] = {"pi": "python-for-pi"}
    path.write_text(json.dumps(config), encoding="utf-8")
    launched = []
    monkeypatch.setattr(
        local_stack.subprocess,
        "Popen",
        lambda command, **_: launched.append(command[0]) or SimpleNamespace(pid=1),
    )
    run_main(monkeypatch, "start", "pi")
    assert launched == ["python-for-pi"]


# ---- Qdrant ------------------------------------------------------------------------------


def test_qdrant_refuses_a_container_that_another_setup_owns(stack, monkeypatch):
    docker = use_docker(monkeypatch, {"Config": {"Labels": {}}})
    code = refused(monkeypatch, "start", "qdrant")
    assert code == "Container name is owned by another setup; refusing to change it."
    assert docker.verbs() == []


@pytest.mark.parametrize(
    "change",
    [
        {"HostConfig": {"PortBindings": {"6333/tcp": [{"HostIp": "0.0.0.0", "HostPort": "6333"}]}}},
        {"Mounts": [{"Name": "someone-elses", "Destination": "/qdrant/storage"}]},
    ],
)
def test_qdrant_refuses_a_container_that_differs_from_the_configuration(stack, monkeypatch, change):
    docker = use_docker(monkeypatch, {**OWNED_QDRANT, **change})
    code = refused(monkeypatch, "start", "qdrant")
    assert code == "Existing Qdrant instance differs from this configuration; nothing changed."
    assert docker.verbs() == []


@pytest.mark.parametrize(("command", "verb"), [("start", "start"), ("stop", "stop")])
def test_qdrant_starts_or_stops_the_container_it_owns(stack, monkeypatch, command, verb):
    docker = use_docker(monkeypatch, OWNED_QDRANT)
    run_main(monkeypatch, command, "qdrant")
    assert docker.calls[-1] == ["docker", verb, "qdrant-box"]


def test_qdrant_refuses_to_start_when_its_port_is_occupied(stack, monkeypatch):
    docker = use_docker(monkeypatch)
    monkeypatch.setattr(local_stack, "listening", lambda port: True)
    assert refused(monkeypatch, "start", "qdrant") == "Qdrant development port is already occupied."
    assert docker.verbs() == []


def test_qdrant_creates_one_labelled_loopback_container(stack, monkeypatch):
    docker = use_docker(monkeypatch)
    run_main(monkeypatch, "start", "qdrant")
    command = docker.calls[-1]
    assert command[:3] == ["docker", "run", "--detach"]
    assert command[command.index("--label") + 1] == f"{LABEL}=true"
    assert command[command.index("--publish") + 1] == "127.0.0.1:6333:6333"
    assert command[command.index("--volume") + 1] == "qdrant-volume:/qdrant/storage"
    assert command[-1] == "qdrant/qdrant:test"


def test_stopping_a_qdrant_that_does_not_exist_does_nothing(stack, monkeypatch):
    docker = use_docker(monkeypatch)
    run_main(monkeypatch, "stop", "qdrant")
    assert docker.verbs() == []


# ---- PostgreSQL --------------------------------------------------------------------------


def test_postgres_stop_refuses_a_container_without_the_ownership_label(stack, monkeypatch):
    docker = use_docker(monkeypatch, {"Config": {"Labels": {LABEL: "false"}}})
    assert refused(monkeypatch, "stop", "postgres") == "Container ownership did not match."
    assert docker.calls[-1][:2] == ["docker", "inspect"]


def test_postgres_stop_stops_the_container_it_owns(stack, monkeypatch):
    docker = use_docker(monkeypatch, OWNED_POSTGRES)
    run_main(monkeypatch, "stop", "postgres")
    assert docker.calls[-1] == ["docker", "stop", "pg-box"]


def test_postgres_start_writes_its_environment_file_then_refuses_a_foreign_container(
    stack, monkeypatch
):
    use_docker(monkeypatch, {"Config": {"Labels": {}}})
    code = refused(monkeypatch, "start", "postgres")
    assert code == "Container name is owned by another setup; refusing to change it."
    assert (stack / "postgres/environment").read_text(
        encoding="utf-8"
    ) == "POSTGRES_USER=u\nPOSTGRES_PASSWORD=p\n"


@pytest.mark.parametrize(
    "change",
    [
        {"HostConfig": {"PortBindings": {"5432/tcp": [{"HostIp": "127.0.0.1", "HostPort": "1"}]}}},
        {"Mounts": []},
    ],
)
def test_postgres_start_refuses_a_container_that_differs(stack, monkeypatch, change):
    use_docker(monkeypatch, {**OWNED_POSTGRES, **change})
    code = refused(monkeypatch, "start", "postgres")
    assert code == "Existing PostgreSQL instance differs from this configuration; nothing changed."


def test_postgres_start_restarts_the_container_it_owns(stack, monkeypatch):
    docker = use_docker(monkeypatch, OWNED_POSTGRES)
    run_main(monkeypatch, "start", "postgres")
    assert docker.calls[-1] == ["docker", "start", "pg-box"]


def test_postgres_start_refuses_an_occupied_port(stack, monkeypatch):
    docker = use_docker(monkeypatch)
    monkeypatch.setattr(local_stack, "listening", lambda port: True)
    assert (
        refused(monkeypatch, "start", "postgres")
        == "PostgreSQL development port is already occupied."
    )
    assert docker.verbs() == []


def test_postgres_start_creates_a_labelled_loopback_container(stack, monkeypatch):
    docker = use_docker(monkeypatch)
    run_main(monkeypatch, "start", "postgres")
    command = docker.calls[-1]
    assert command[command.index("--name") + 1] == "pg-box"
    assert command[command.index("--label") + 1] == f"{LABEL}=true"
    assert command[command.index("--publish") + 1] == "127.0.0.1:55432:5432"
    assert command[command.index("--env-file") + 1] == str(stack / "postgres/environment")
    assert command[-1] == "postgres:16"


# ---- stopping a service process ----------------------------------------------------------


class FakeProcess:
    def __init__(self, command, children=()):
        self.command = command
        self.children_list = list(children)
        self.terminated = []

    def cmdline(self):
        return self.command

    def children(self, recursive):
        return self.children_list

    def terminate(self):
        self.terminated.append("self")


def fake_psutil(monkeypatch, process=None, missing=False):
    import psutil

    def make(pid):
        if missing:
            raise psutil.NoSuchProcess(pid)
        return process

    monkeypatch.setattr(psutil, "Process", make)
    monkeypatch.setattr(psutil, "wait_procs", lambda procs, timeout: None)


def test_stop_refuses_a_pid_that_is_no_longer_this_service(stack, monkeypatch):
    (stack / "pi/pid").write_text("77", encoding="utf-8")
    process = FakeProcess(["python", "something_else.py", "serve", "pi"])
    fake_psutil(monkeypatch, process)
    assert (
        refused(monkeypatch, "stop", "pi") == "Process identity no longer matches; nothing stopped."
    )
    assert process.terminated == []


def test_stop_reports_a_process_that_is_already_gone(stack, monkeypatch, capsys):
    (stack / "pi/pid").write_text("77", encoding="utf-8")
    fake_psutil(monkeypatch, missing=True)
    run_main(monkeypatch, "stop", "pi")
    assert capsys.readouterr().out.strip() == "Local process already stopped."


def test_stop_ends_the_service_and_its_children_and_keeps_data(stack, monkeypatch, capsys):
    (stack / "pi/pid").write_text("77", encoding="utf-8")
    child = FakeProcess([])
    process = FakeProcess(
        ["python", str(local_stack.Path(local_stack.__file__).resolve()), "serve", "pi"], [child]
    )
    fake_psutil(monkeypatch, process)
    run_main(monkeypatch, "stop", "pi")
    assert capsys.readouterr().out.strip() == "Stopped local pi; data retained."
    assert process.terminated == ["self"]
    assert child.terminated == ["self"]
