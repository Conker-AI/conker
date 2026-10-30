"""MemoryGate's listener for imported chats (scripts/import_listener.py): every installer makes its
key and gives it to Pi, and creates the listener through MemoryGate's admin API once it answers."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import import_listener

from tests.ubuntu_generator import prepare

ADMIN = "admin-" + "a" * 40
KEY = "listener-" + "k" * 40


class FakeMemoryGate:
    """The two admin routes the setup uses, as MemoryGate answers them."""

    def __init__(self, sources=None):
        self.sources = dict(sources or {})
        self.posted = []
        gate = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def answer(self, status, value):
                body = json.dumps(value).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def allowed(self):
                if self.path != "/evidence/sources":
                    self.answer(404, {"detail": "Not Found"})
                    return False
                if self.headers.get("X-MemoryGate-Key") != ADMIN:
                    self.answer(401, {"detail": "missing or invalid X-MemoryGate-Key"})
                    return False
                return True

            def do_GET(self):
                if self.allowed():
                    rows = [
                        {key: row[key] for key in row if key != "secrets"}
                        for row in gate.sources.values()
                    ]
                    self.answer(200, {"results": rows})

            def do_POST(self):
                if self.allowed():
                    body = json.loads(
                        self.rfile.read(int(self.headers["Content-Length"]))
                    )
                    gate.posted.append(body)
                    gate.sources[body["source_key"]] = body
                    self.answer(200, {"source_key": body["source_key"]})

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *_args):
        self.server.shutdown()
        self.server.server_close()


class Recording:
    """subprocess.run, keeping each call's argv, stdin and stdout."""

    def __init__(self):
        self.calls = []

    def __call__(self, argv, **options):
        options = {name: value for name, value in options.items() if name != "check"}
        result = subprocess.run(argv, check=False, **options)
        self.calls.append((argv, options.get("input"), result.stdout))
        return result


def run_setup(url, admin=ADMIN, key=KEY, run=subprocess.run):
    return import_listener.setup(
        [sys.executable],
        url,
        import_listener.SOURCE,
        key,
        "conker_companion",
        env={**os.environ, "MEMORYGATE_ADMIN_KEY": admin},
        run=run,
    )


def test_the_listener_is_created_with_pis_key_and_agent_and_set_again_after():
    with FakeMemoryGate() as gate:
        assert run_setup(gate.url) == "created"
        assert run_setup(gate.url) == "updated"
    source = gate.sources["assistant-imports"]
    assert source["source_type"] == "imported_chat" and source["enabled"] is True
    assert source["config"] == {"agent_id": "conker_companion"}
    # MemoryGate compares a listener key as given, so it gets the same plaintext as Pi.
    assert source["secrets"] == {"ingest_key": KEY}
    assert gate.posted[0] == gate.posted[1]


def test_an_existing_listener_keeps_the_owners_choices():
    owned = {
        "source_key": "assistant-imports",
        "source_type": "imported_chat",
        "label": "My old chats",
        "description": "Turned off for now",
        "enabled": False,
        "config": {"agent_id": "someone_else", "note": "kept"},
    }
    with FakeMemoryGate({"assistant-imports": owned}) as gate:
        assert run_setup(gate.url) == "updated"
    source = gate.sources["assistant-imports"]
    assert source["enabled"] is False
    assert (source["label"], source["description"]) == (
        "My old chats",
        "Turned off for now",
    )
    assert source["config"] == {"agent_id": "conker_companion", "note": "kept"}
    assert source["secrets"] == {"ingest_key": KEY}


def test_a_refusal_is_said_in_plain_words_and_no_key_is_printed():
    run = Recording()
    with FakeMemoryGate() as gate:
        with pytest.raises(OSError, match=r"refused the listener setup \(HTTP 401\)"):
            run_setup(gate.url, admin="wrong-" + "b" * 40, run=run)
        assert gate.sources == {}
    with pytest.raises(OSError, match="did not set up its listener"):
        run_setup("http://127.0.0.1:9", run=run)
    for argv, stdin, stdout in run.calls:
        assert stdin == KEY
        assert KEY not in " ".join(argv) and KEY not in stdout and ADMIN not in stdout
    with pytest.raises(ValueError):
        run_setup("http://127.0.0.1:9", key="short")


class Captured:
    def __init__(self, stdout="created\n", returncode=0):
        self.calls, self.stdout, self.returncode = [], stdout, returncode

    def __call__(self, argv, **options):
        self.calls.append((argv, options))
        return subprocess.CompletedProcess(argv, self.returncode, self.stdout, "")


def test_conker_setup_runs_it_inside_memorygate_with_the_key_on_stdin(tmp_path, capsys):
    (tmp_path / ".env").write_text(f"CONKER_PORT=8050\nMEMORYGATE_IMPORT_KEY={KEY}\n")
    run = Captured()
    assert (
        import_listener.main(
            ["--root", str(tmp_path), "--layout", "repository"], run=run
        )
        == 0
    )
    assert "is set up" in capsys.readouterr().out
    ((argv, options),) = run.calls
    assert argv[:2] == ["docker", "compose"] and str(tmp_path / ".env") in argv
    at = argv.index("exec")
    assert argv[at : at + 5] == ["exec", "-T", "memorygate", "python", "-c"]
    assert argv[at + 6 :] == [
        "http://127.0.0.1:8020",
        "assistant-imports",
        "conker_companion",
    ]
    assert options["input"] == KEY and KEY not in " ".join(argv)

    deployment = tmp_path / "ubuntu"
    (deployment / "state").mkdir(parents=True)
    (deployment / "state/pi.env").write_text(
        "PI_MEMORYGATE_AGENT_ID=conker_companion\n"
        f"PI_MEMORYGATE_IMPORT_SOURCE=assistant-imports\nPI_MEMORYGATE_IMPORT_KEY={KEY}\n"
    )
    run = Captured("updated\n")
    assert (
        import_listener.main(["--root", str(deployment), "--layout", "ubuntu"], run=run)
        == 0
    )
    assert "is up to date" in capsys.readouterr().out
    ((argv, options),) = run.calls
    assert str(deployment / "compose.json") in argv and options["input"] == KEY

    run = Captured("refused 401\n", returncode=1)
    assert (
        import_listener.main(["--root", str(deployment), "--layout", "ubuntu"], run=run)
        == 1
    )
    assert "HTTP 401" in capsys.readouterr().err


def test_without_a_key_it_says_how_to_get_one_and_calls_nothing(tmp_path, capsys):
    run = Captured()
    (tmp_path / ".env").write_text("CONKER_PORT=8050\n")
    assert (
        import_listener.main(
            ["--root", str(tmp_path), "--layout", "repository"], run=run
        )
        == 1
    )
    assert (
        import_listener.main(
            ["--root", str(tmp_path / "none"), "--layout", "ubuntu"], run=run
        )
        == 1
    )
    assert "Run ./install.sh again" in capsys.readouterr().err
    assert run.calls == []


def ubuntu_env(tmp_path):
    return {
        path.stem: dict(line.split("=", 1) for line in path.read_text().splitlines())
        for path in (tmp_path / "state").glob("*.env")
    }


def test_the_ubuntu_layout_gives_pi_the_key_and_keeps_it(tmp_path):
    prepare(tmp_path)
    env = ubuntu_env(tmp_path)
    keys = json.loads((tmp_path / "state/credentials.json").read_text())
    assert env["pi"]["PI_MEMORYGATE_IMPORT_SOURCE"] == "assistant-imports"
    assert env["pi"]["PI_MEMORYGATE_IMPORT_KEY"] == keys["memorygate_import"]
    assert import_listener.usable(keys["memorygate_import"])
    # MemoryGate gets the key only through its admin API, never from a file.
    for name in env:
        if name != "pi":
            assert keys["memorygate_import"] not in json.dumps(env[name])


def test_the_repository_layout_wires_the_key_to_pi_and_creates_the_listener():
    services = yaml.safe_load(
        (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    )["services"]
    pi = services["pi"]["environment"]
    # Both or neither: Pi stops at startup on one without the other.
    assert (
        pi["PI_MEMORYGATE_IMPORT_SOURCE"]
        == "${MEMORYGATE_IMPORT_KEY:+assistant-imports}"
    )
    assert pi["PI_MEMORYGATE_IMPORT_KEY"] == "${MEMORYGATE_IMPORT_KEY:-}"
    assert "MEMORYGATE_IMPORT_KEY" not in json.dumps(services["memorygate"])
    installer = (ROOT / "install.sh").read_text(encoding="utf-8")
    assert (
        "MEMORYGATE_IMPORT_KEY=$(keep_or_make_long MEMORYGATE_IMPORT_KEY)" in installer
    )
    assert "\nMEMORYGATE_IMPORT_KEY=$MEMORYGATE_IMPORT_KEY\n" in installer
    assert "    wait_for_health\n    create_import_listener\n" in installer
    assert 'scripts/import_listener.py" --root "$ROOT" --layout repository' in installer


def test_a_workspace_gets_the_key_once_and_sets_up_beside_memorygate():
    config = {
        "environments": {
            "pi": {"PI_MEMORYGATE_AGENT_ID": "local_companion"},
            "memorygate": {"MEMORYGATE_ADMIN_KEY": ADMIN},
        }
    }
    assert import_listener.ensure(config) is True
    pi = config["environments"]["pi"]
    assert pi["PI_MEMORYGATE_IMPORT_SOURCE"] == "assistant-imports"
    assert import_listener.usable(pi["PI_MEMORYGATE_IMPORT_KEY"])
    before = json.dumps(config)
    assert import_listener.ensure(config) is False and json.dumps(config) == before
    assert import_listener.ensure({}) is False

    run = Captured()
    assert import_listener.setup_workspace(config, 18520, run=run) == "created"
    ((argv, options),) = run.calls
    assert argv[0] == sys.executable
    assert argv[3:] == [
        "http://127.0.0.1:18520",
        "assistant-imports",
        "local_companion",
    ]
    assert options["env"]["MEMORYGATE_ADMIN_KEY"] == ADMIN
    assert options["input"] == pi["PI_MEMORYGATE_IMPORT_KEY"]


@pytest.mark.skipif(
    sys.platform == "win32", reason="Python starts the recording Docker, a POSIX script"
)
def test_conker_setup_import_listener_reaches_memorygate_through_the_launcher(
    ubuntu_cli,
):
    scripts = ubuntu_cli.deployment / "sources/companion/scripts"
    shutil.copy2(ROOT / "scripts/import_listener.py", scripts / "import_listener.py")
    refused = ubuntu_cli("setup", "import-listener")
    assert refused.returncode == 1 and "no key" in refused.stderr
    assert not ubuntu_cli.docker_log.exists()

    (ubuntu_cli.deployment / "state/pi.env").write_text(
        "PI_MEMORYGATE_AGENT_ID=conker_companion\n"
        f"PI_MEMORYGATE_IMPORT_SOURCE=assistant-imports\nPI_MEMORYGATE_IMPORT_KEY={KEY}\n",
        encoding="utf-8",
    )
    docker = ubuntu_cli.docker_log.parent / "bin/docker"
    docker.write_text(
        "#!/bin/sh\n"
        'printf \'%s\\n\' "$*" >> "$DOCKER_LOG"\n'
        'cat > "$DOCKER_LOG.stdin"\n'
        "printf 'created\\n'\n",
        encoding="utf-8",
    )
    result = ubuntu_cli("setup", "import-listener")
    assert result.returncode == 0, result.stderr
    assert "is set up" in result.stdout
    log = ubuntu_cli.docker_log.read_text(encoding="utf-8")
    assert "exec -T memorygate python -c" in log and KEY not in log
    stdin = Path(str(ubuntu_cli.docker_log) + ".stdin").read_text(encoding="utf-8")
    assert stdin == KEY
    assert ubuntu_cli("setup", "import-listener", "--now").returncode == 2
