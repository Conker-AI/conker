"""`scripts/workspace.py` commands through `main()`: what install, up, down, status and build do or refuse.

Every case uses its own tmp_path as the repository root and state folder; subprocess work (docker,
pip, the service launcher) is replaced by a recorder, so nothing is installed or started.
"""

from __future__ import annotations

import json
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from scripts import local_stack, workspace
from scripts.devstack import workspace_build, workspace_memory, workspace_setup

CONFIG = {"workspace_schema": 1, "python": "venv-python"}


@pytest.fixture()
def home(tmp_path, monkeypatch):
    """A workspace root with its own state folder, config and a built dashboard."""
    state = tmp_path / ".local-run"
    (state / "gateway").mkdir(parents=True)
    (tmp_path / "dashboard/dist").mkdir(parents=True)
    (tmp_path / "dashboard/dist/index.html").write_text("<div id=root>", encoding="utf-8")
    monkeypatch.setattr(workspace, "ROOT", tmp_path)
    monkeypatch.setattr(workspace, "STATE", state)
    monkeypatch.setattr(workspace, "CONFIG", state / "configuration.json")
    monkeypatch.setattr(workspace.time, "sleep", lambda seconds: None)
    return tmp_path


def save_config(home, **extra):
    config = {**CONFIG, **extra}
    (home / ".local-run/configuration.json").write_text(json.dumps(config), encoding="utf-8")
    return config


def run_main(monkeypatch, *argv):
    monkeypatch.setattr(workspace.sys, "argv", ["workspace.py", *argv])
    workspace.main()


# ---- up ----------------------------------------------------------------------------------


class Services:
    """Records launches and answers ownership from what has been launched."""

    def __init__(self, listener_verified=True):
        self.running: set[str] = set()
        self.launched: list[tuple[str, str]] = []
        self.listener_verified = listener_verified

    def launch(self, config, command, service):
        self.launched.append((command, service))
        (self.running.add if command == "start" else self.running.discard)(service)

    def owned_process(self, config, service):
        return service in self.running

    def owned_listener(self, config, service):
        return self.listener_verified

    def install(self, monkeypatch):
        monkeypatch.setattr(workspace, "launch", self.launch)
        monkeypatch.setattr(workspace, "owned_process", self.owned_process)
        monkeypatch.setattr(workspace, "owned_listener", self.owned_listener)
        monkeypatch.setattr(workspace, "wait_health", lambda service: None)


@pytest.fixture()
def listener(monkeypatch):
    """The two helpers `up` imports; neither changes the configuration unless told to."""
    import import_listener

    from scripts import service_keys

    behaviour = {"changed": False, "memory": None}
    monkeypatch.setattr(service_keys, "ensure", lambda config, url: behaviour["changed"])
    monkeypatch.setattr(import_listener, "ensure", lambda config: False)

    def setup_workspace(config, port):
        if behaviour["memory"]:
            raise behaviour["memory"]
        return "ok"

    monkeypatch.setattr(import_listener, "setup_workspace", setup_workspace)
    return behaviour


@pytest.fixture(autouse=True)
def scripts_on_path(monkeypatch):
    monkeypatch.syspath_prepend(str(workspace.ROOT / "scripts"))


def test_up_refuses_before_the_dashboard_is_built(home, monkeypatch):
    save_config(home)
    (home / "dashboard/dist/index.html").unlink()
    with pytest.raises(SystemExit) as raised:
        run_main(monkeypatch, "up")
    assert str(raised.value) == "Build the dashboard first: python scripts/workspace.py build"


def test_up_starts_each_service_in_order_and_reports_unreachable_memory(
    home, monkeypatch, listener, capsys
):
    save_config(home)
    listener["memory"] = OSError("refused")
    services = Services()
    services.install(monkeypatch)
    run_main(monkeypatch, "up")
    assert [service for _, service in services.launched] == [
        "postgres",
        "memorygate",
        "toolgate",
        "pi",
        "gateway",
    ]
    lines = capsys.readouterr().out.splitlines()
    assert lines[0] == "postgres: responding"
    assert "imported chats: cannot reach memory yet (refused)" in lines
    assert lines[-1].startswith("Conker is available at https://localhost:18550.")


def test_up_reports_memory_reachable_for_imported_chats(home, monkeypatch, listener, capsys):
    save_config(home)
    Services().install(monkeypatch)
    run_main(monkeypatch, "up")
    assert "imported chats: can reach memory" in capsys.readouterr().out


def test_up_does_not_launch_what_this_workspace_already_runs(home, monkeypatch, listener):
    save_config(home)
    services = Services()
    services.running.update({"postgres", "memorygate"})
    services.install(monkeypatch)
    run_main(monkeypatch, "up")
    assert [service for _, service in services.launched] == ["toolgate", "pi", "gateway"]


def test_up_adds_native_providers_and_meaning_search_in_their_place(home, monkeypatch, listener):
    save_config(home, native_providers={"x": 1}, meaning_search={"model": "m"})
    services = Services()
    services.install(monkeypatch)
    run_main(monkeypatch, "up")
    assert [service for _, service in services.launched] == [
        "postgres",
        "qdrant",
        "embeddings",
        "memorygate",
        "toolgate",
        "decisions",
        "providers",
        "pi",
        "gateway",
    ]


def test_up_saves_the_configuration_when_a_service_key_was_added(home, monkeypatch, listener):
    save_config(home)
    listener["changed"] = True
    Services().install(monkeypatch)
    run_main(monkeypatch, "up")
    assert json.loads((home / ".local-run/configuration.json").read_text()) == CONFIG


def test_up_refuses_a_service_that_answers_without_a_verified_listener(home, monkeypatch, listener):
    save_config(home)
    Services(listener_verified=False).install(monkeypatch)
    with pytest.raises(SystemExit) as raised:
        run_main(monkeypatch, "up")
    assert str(raised.value) == (
        "postgres responded without a verified workspace listener; inspect before continuing."
    )


def test_up_waits_for_the_gateway_certificate(home, monkeypatch, listener):
    save_config(home)
    sleeps = []
    monkeypatch.setattr(workspace.time, "sleep", sleeps.append)
    Services().install(monkeypatch)
    run_main(monkeypatch, "up")
    assert sleeps == [0.5] * 20


# ---- down, status, password, build --------------------------------------------------------


def test_down_stops_services_in_reverse_order(home, monkeypatch, capsys):
    save_config(home)
    services = Services()
    services.running.update({"pi", "toolgate", "gateway"})
    services.install(monkeypatch)
    run_main(monkeypatch, "down")
    assert services.launched == [("stop", "gateway"), ("stop", "pi"), ("stop", "toolgate")]
    assert capsys.readouterr().out.strip() == "Workspace stopped. All data retained."


def test_status_says_what_each_service_is_doing(home, monkeypatch, capsys):
    save_config(home, meaning_search={"model": "bge"})
    states = {"gateway": "listening", "pi": "starting"}
    monkeypatch.setattr(
        workspace, "service_state", lambda config, name: states.get(name, "stopped")
    )
    monkeypatch.setattr(workspace_memory, "status", lambda config: "ready")
    run_main(monkeypatch, "status")
    lines = capsys.readouterr().out.splitlines()
    assert "gateway: running; listening (inspect System for health)" in lines
    assert "pi: running; port not listening (starting or unhealthy)" in lines
    assert "postgres: stopped" in lines
    assert "qdrant: stopped" in lines
    assert lines[-2:] == ["memory corrections: ready", "meaning search: configured (bge)"]


def test_status_names_the_command_that_sets_up_meaning_search(home, monkeypatch, capsys):
    save_config(home)
    monkeypatch.setattr(workspace, "service_state", lambda config, name: "stopped")
    monkeypatch.setattr(workspace_memory, "status", lambda config: "off")
    run_main(monkeypatch, "status")
    assert capsys.readouterr().out.splitlines()[-1] == (
        "meaning search: not configured; python scripts/workspace.py meaning-search"
    )


def test_password_recovery_runs_the_gateway_reset_without_the_password_in_arguments(
    home, monkeypatch
):
    save_config(
        home,
        repositories={"pi": "/src/pi"},
        environments={"gateway": {"GATEWAY_DB_PATH": "/db/auth.db"}},
    )
    seen = {}

    def run(command, env, check):
        seen.update(command=command, env=env, check=check)

    monkeypatch.setattr(workspace.subprocess, "run", run)
    run_main(monkeypatch, "password")
    assert seen["command"] == [
        "venv-python",
        "-m",
        "gateway",
        "reset-password",
        "--db",
        "/db/auth.db",
    ]
    assert seen["env"]["PYTHONPATH"] == "/src/pi"
    assert seen["check"] is True


def test_build_refuses_while_the_gateway_still_runs(home, monkeypatch):
    save_config(home)
    monkeypatch.setattr(workspace, "owned_process", lambda config, service: service == "gateway")
    monkeypatch.setattr(workspace_build, "build_dashboard", lambda root, state, run, guard: guard())
    with pytest.raises(SystemExit) as raised:
        run_main(monkeypatch, "build")
    assert str(raised.value) == (
        "Stop Gateway before rebuilding its assets. The current build was retained."
    )


def test_build_goes_ahead_when_the_gateway_is_stopped(home, monkeypatch):
    save_config(home)
    seen = []
    monkeypatch.setattr(workspace, "owned_process", lambda config, service: False)
    monkeypatch.setattr(
        workspace_build,
        "build_dashboard",
        lambda root, state, run, guard: seen.append((root, state, guard())),
    )
    run_main(monkeypatch, "build")
    assert seen == [(home, home / ".local-run", None)]


def test_setup_commands_are_handed_the_configuration_and_sources(home, monkeypatch):
    save_config(home)
    seen = []
    monkeypatch.setattr(
        workspace_setup, "configure_memory_corrections", lambda config: seen.append("memory")
    )
    monkeypatch.setattr(
        workspace_setup,
        "enhance",
        lambda config, pi, toolgate, memorygate: seen.append((pi, toolgate, memorygate)),
    )
    run_main(monkeypatch, "memory-corrections")
    run_main(monkeypatch, "enhance", "--pi-source", "a", "--memorygate-source", "c")
    assert seen == ["memory", (workspace.Path("a"), None, workspace.Path("c"))]


# ---- install -----------------------------------------------------------------------------


def test_install_writes_workspace_ports_model_and_owner_settings(home, monkeypatch, capsys):
    (home / "scripts").mkdir()
    (home / "scripts/workspace-sources.json").write_text(
        json.dumps({"pi": "rev-pi", "toolgate": "rev-tg"}), encoding="utf-8"
    )
    monkeypatch.setattr(workspace.shutil, "which", lambda name: "/bin/" + name)
    commands = []
    monkeypatch.setattr(workspace, "run", lambda *args, **kwargs: commands.append(args))
    monkeypatch.setattr(workspace, "prepare_source", lambda name, rev: f"/py/{name}")
    built, owners = [], []
    monkeypatch.setattr(workspace, "build", lambda: built.append(1))
    monkeypatch.setattr(
        workspace, "initialize_owner", lambda config: owners.append(config["python"])
    )

    def initialize():
        workspace.CONFIG.write_text(
            json.dumps(
                {
                    "environments": {
                        "pi": {
                            "PI_TOOLGATE_URL": "http://127.0.0.1:8010",
                            "PI_DECISION_URL": "http://127.0.0.1:8060",
                            "PI_DECISION_KEY": "k",
                        },
                        "gateway": {"GATEWAY_ORIGIN": "https://localhost:8050"},
                        "postgres": {"URL": "x@127.0.0.1:55432"},
                        "decisions": {"DECISION_API_KEY": "d"},
                    }
                }
            ),
            encoding="utf-8",
        )

    monkeypatch.setattr(local_stack, "initialize", initialize)
    run_main(monkeypatch, "install", "--model", "llama3:8b")
    assert commands == [("docker", "info", "--format", "{{.ServerVersion}}")]
    config = json.loads(workspace.CONFIG.read_text(encoding="utf-8"))
    assert config["workspace_schema"] == 1
    assert config["python"] == "/py/pi"
    assert config["python_by_service"] == {
        "pi": "/py/pi",
        "toolgate": "/py/toolgate",
        "gateway": "/py/pi",
    }
    assert config["postgres_container"].startswith("conker-workspace-")
    assert config["postgres_volume"] == config["postgres_container"]
    envs = config["environments"]
    assert envs["pi"]["PI_TOOLGATE_URL"] == "http://127.0.0.1:18510"
    assert envs["gateway"]["GATEWAY_ORIGIN"] == "https://localhost:18550"
    assert envs["postgres"]["URL"] == "x@127.0.0.1:55542"
    assert envs["pi"]["PI_MODEL"] == "llama3:8b"
    assert envs["pi"]["PI_SCHEDULER_ENABLED"] == "true"
    assert "PI_DECISION_URL" not in envs["pi"] and "PI_DECISION_KEY" not in envs["pi"]
    assert "decisions" not in envs
    assert owners == ["/py/pi"] and built == [1]
    assert capsys.readouterr().out.endswith(
        "Installed. Start with: python scripts/workspace.py up\nOpen https://localhost:18550\n"
    )


def test_install_asks_docker_to_answer_before_anything_is_written(home, monkeypatch):
    monkeypatch.setattr(workspace.shutil, "which", lambda name: "/bin/" + name)

    def run(*args, **kwargs):
        raise subprocess.CalledProcessError(1, args)

    monkeypatch.setattr(workspace, "run", run)
    with pytest.raises(subprocess.CalledProcessError):
        run_main(monkeypatch, "install")
    assert not workspace.CONFIG.exists()


def test_initialize_owner_runs_the_owner_script_with_the_workspace_python(home, monkeypatch):
    seen = []
    monkeypatch.setattr(workspace, "run", lambda *args, **kwargs: seen.append(args))
    workspace.initialize_owner({"python": "venv-python"})
    (command,) = seen
    assert command[:2] == ("venv-python", "-c")
    assert "store.set_password(password, initial=True)" in command[2]
    assert command[3] == workspace.CONFIG


# ---- waiting for health ------------------------------------------------------------------


def test_postgres_health_returns_once_the_database_accepts_connections(home, monkeypatch):
    save_config(home, postgres_container="pg-box")
    answers = iter([1, 1, 0])
    seen = []

    def run(command, **options):
        seen.append(command)
        return subprocess.CompletedProcess(command, next(answers))

    monkeypatch.setattr(workspace.subprocess, "run", run)
    assert workspace.wait_health("postgres", seconds=5) is None
    assert len(seen) == 3
    assert seen[0] == ["docker", "exec", "pg-box", "pg_isready", "-U", "conker_local"]


def test_postgres_health_refuses_when_it_never_answers(home, monkeypatch):
    save_config(home, postgres_container="pg-box")
    monkeypatch.setattr(
        workspace.subprocess,
        "run",
        lambda command, **options: subprocess.CompletedProcess(command, 2),
    )
    with pytest.raises(SystemExit) as raised:
        workspace.wait_health("postgres", seconds=2)
    assert str(raised.value) == (
        "postgres did not become ready. Inspect .local-run/postgres/service.log."
        " Data and other processes retained."
    )


@pytest.fixture()
def http_service(monkeypatch):
    """A loopback server standing in for a service; yields (answer dict, headers seen)."""
    answer = {"status": 200, "redirect": False}
    seen = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            seen.append((self.path, self.headers.get("X-Decision-Key")))
            if answer["redirect"]:
                self.send_response(302)
                self.send_header("Location", "http://127.0.0.1:1/health")
            else:
                self.send_response(answer["status"])
            self.send_header("Content-Length", "0")
            self.end_headers()

        def log_message(self, *_):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    port = server.server_address[1]
    for name in ("toolgate", "decisions"):
        monkeypatch.setitem(workspace.PORTS, name, port)
    yield answer, seen
    server.shutdown()
    server.server_close()
    thread.join(timeout=5)


def test_service_health_returns_on_a_200_answer(home, http_service):
    _, seen = http_service
    assert workspace.wait_health("toolgate", seconds=3) is None
    assert seen == [("/health", None)]


def test_decisions_health_sends_its_key_from_the_configuration(home, http_service):
    _, seen = http_service
    save_config(home, environments={"decisions": {"DECISION_API_KEY": "decision-key"}})
    workspace.wait_health("decisions", seconds=3)
    assert seen == [("/health", "decision-key")]


@pytest.mark.parametrize("behaviour", [{"status": 503}, {"redirect": True}])
def test_service_health_refuses_a_service_that_is_not_ready(home, http_service, behaviour):
    answer, seen = http_service
    answer.update(behaviour)
    with pytest.raises(SystemExit) as raised:
        workspace.wait_health("toolgate", seconds=2)
    assert str(raised.value) == (
        "toolgate did not become ready. Inspect .local-run/toolgate/service.log."
        " Data and other processes retained."
    )
    assert len(seen) == 2
