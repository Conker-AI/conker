"""`scripts/check_quickstart.py`: the `--run` mode, the page probe and the command line, on any platform.

The preview is never really started: subprocess, the symlink and the process-group kill are replaced
by recorders, and the page probe talks to a loopback server started per test.
"""

from __future__ import annotations

import signal
import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace

import pytest

from scripts import check_quickstart

README = """# Conker

## Quickstart

```sh
git clone https://github.com/Conker-AI/conker.git
cd conker/dashboard
npm ci
npm run dev -- --host localhost --port 5173 --strictPort
```

Open http://localhost:5173

## Next
"""


@pytest.fixture()
def preview(tmp_path, monkeypatch):
    """Pretend to be Linux with a README in tmp_path; record what --run would execute."""
    (tmp_path / "README.md").write_text(README, encoding="utf-8")
    log = SimpleNamespace(ran=[], popen=[], killed=[], waited=[], polls=[])
    monkeypatch.setattr(check_quickstart, "ROOT", tmp_path)
    monkeypatch.setattr(check_quickstart.sys, "platform", "linux")
    monkeypatch.setattr(check_quickstart.os, "symlink", lambda target, link: None)
    monkeypatch.setattr(
        check_quickstart.os, "killpg", lambda pid, sig: log.killed.append((pid, sig)), raising=False
    )
    monkeypatch.setattr(check_quickstart.time, "sleep", lambda seconds: None)
    monkeypatch.setattr(
        check_quickstart.subprocess,
        "run",
        lambda command, **options: log.ran.append((command, options["cwd"].name, options["check"])),
    )

    class Server:
        pid = 31337

        def __init__(self, command, **options):
            log.popen.append((command, options["cwd"].name, options["start_new_session"]))

        def poll(self):
            log.polls.append(1)
            return None

        def wait(self, timeout):
            log.waited.append(timeout)

    monkeypatch.setattr(check_quickstart.subprocess, "Popen", Server)
    return log


def test_run_refuses_on_windows_with_exit_2(monkeypatch, capsys):
    monkeypatch.setattr(check_quickstart.sys, "platform", "win32")
    assert check_quickstart.run() == 2
    assert capsys.readouterr().err.strip() == (
        "--run needs Linux or macOS (it starts the server in its own process group)."
    )


def test_run_runs_the_preview_lines_as_written_and_stops_the_server(preview, monkeypatch, capsys):
    monkeypatch.setattr(check_quickstart, "answers", lambda url: url == "http://localhost:5173")
    assert check_quickstart.run() == 0
    out = capsys.readouterr().out.splitlines()
    assert out[:3] == [
        "$ cd conker/dashboard",
        "$ npm ci",
        "$ npm run dev -- --host localhost --port 5173 --strictPort",
    ]
    assert out[3].startswith("The preview answered at http://localhost:5173 after ")
    assert [(command, folder, checked) for command, folder, checked in preview.ran] == [
        ("npm ci", "dashboard", True)
    ]
    assert preview.popen == [
        ("npm run dev -- --host localhost --port 5173 --strictPort", "dashboard", True)
    ]
    assert preview.killed == [(31337, signal.SIGTERM)]
    assert preview.waited == [30]


def test_run_fails_when_the_preview_never_answers_within_the_limit(preview, monkeypatch, capsys):
    monkeypatch.setattr(check_quickstart, "LIMIT_SECONDS", 0)
    monkeypatch.setattr(check_quickstart, "answers", lambda url: pytest.fail("deadline passed"))
    assert check_quickstart.run() == 1
    assert capsys.readouterr().err.strip() == (
        "The preview did not answer at http://localhost:5173 within 0 s."
    )
    assert preview.killed == [(31337, signal.SIGTERM)]


def test_run_stops_waiting_when_the_server_exits_early(preview, monkeypatch, capsys):
    monkeypatch.setattr(check_quickstart, "answers", lambda url: False)
    calls = iter([None, 1])

    def poll():
        return next(calls)

    monkeypatch.setattr(
        check_quickstart.subprocess,
        "Popen",
        lambda command, **options: SimpleNamespace(pid=5, poll=poll, wait=lambda timeout: None),
    )
    assert check_quickstart.run() == 1
    assert capsys.readouterr().err.strip() == (
        "The preview did not answer at http://localhost:5173 within 300 s."
    )


# ---- the command line --------------------------------------------------------------------


def test_main_prints_each_problem_and_exits_1(monkeypatch, capsys):
    monkeypatch.setattr(check_quickstart, "check", lambda: ["first problem", "second problem"])
    assert check_quickstart.main([]) == 1
    assert capsys.readouterr().err.splitlines() == ["first problem", "second problem"]


def test_main_refuses_an_unknown_argument_with_exit_2(monkeypatch, capsys):
    monkeypatch.setattr(check_quickstart, "check", lambda: [])
    assert check_quickstart.main(["--bogus"]) == 2
    assert capsys.readouterr().err.startswith("Hold the README quickstart to what it promises.")


def test_main_says_the_quickstart_is_sound_when_nothing_is_wrong(monkeypatch, capsys):
    monkeypatch.setattr(check_quickstart, "check", lambda: [])
    assert check_quickstart.main([]) == 0
    assert capsys.readouterr().out.strip() == "The quickstart names only commands that exist."


def test_main_runs_the_preview_when_asked(monkeypatch):
    monkeypatch.setattr(check_quickstart, "check", lambda: [])
    monkeypatch.setattr(check_quickstart, "run", lambda: 7)
    assert check_quickstart.main(["--run"]) == 7


def test_check_asks_for_the_dashboard_lockfile(tmp_path, monkeypatch):
    (tmp_path / "dashboard").mkdir()
    (tmp_path / "dashboard/package.json").write_text(
        '{"scripts": {"dev": "vite"}}', encoding="utf-8"
    )
    (tmp_path / "README.md").write_text(README, encoding="utf-8")
    (tmp_path / "install.sh").write_text(
        'REPO_URL="https://github.com/Conker-AI/conker.git"\n', encoding="utf-8"
    )
    (tmp_path / "conker").write_text("    status)  :\n", encoding="utf-8")
    monkeypatch.setattr(check_quickstart, "ROOT", tmp_path)
    problems = check_quickstart.check()
    assert "npm ci needs dashboard/package-lock.json." in problems


# ---- the page probe ----------------------------------------------------------------------


@pytest.fixture()
def page():
    answer = {"status": 200, "body": b'<div id="root"></div>'}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(answer["status"])
            self.send_header("Content-Length", str(len(answer["body"])))
            self.end_headers()
            self.wfile.write(answer["body"])

        def log_message(self, *_):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}", answer
    server.shutdown()
    server.server_close()
    thread.join(timeout=5)


def test_a_page_with_the_app_root_answers(page):
    url, _ = page
    assert check_quickstart.answers(url) is True


@pytest.mark.parametrize(
    "answer",
    [{"body": b"<html>starting</html>"}, {"status": 404}, {"status": 500}],
)
def test_a_page_without_the_app_root_or_with_an_error_does_not_answer(page, answer):
    url, current = page
    current.update(answer)
    assert check_quickstart.answers(url) is False


def test_nothing_listening_does_not_answer():
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    assert check_quickstart.answers(f"http://127.0.0.1:{port}") is False
