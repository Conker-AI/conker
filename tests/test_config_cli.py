"""conker config on an installed stack: every call is one relay inside a service's container."""

import json
import os
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from threading import Thread
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import config_cli


def test_an_installed_stack_is_reached_inside_the_pi_container(monkeypatch):
    root = Path("/srv/conker")
    command = config_cli.compose(root, "ubuntu")
    assert command == [
        "docker",
        "compose",
        "--project-directory",
        str(root),
        "-f",
        str(root / "compose.json"),
    ]
    repository = config_cli.compose(root, "repository")
    assert repository[-2:] == ["-f", str(root / "docker-compose.yml")]
    assert str(root / ".env") in repository and str(root / "versions.env") in repository
    calls = []

    def answer(stdout, code=0, stderr=b""):
        def run(sent, **options):
            calls.append((sent, options["input"]))
            return SimpleNamespace(returncode=code, stdout=stdout, stderr=stderr)

        monkeypatch.setattr(config_cli.subprocess, "run", run)

    answer(b'200\n{"revision": 1, "values": {}}')
    assert config_cli.request(command, "pi", "/owner/settings") == {
        "revision": 1,
        "values": {},
    }
    body = {"expected_revision": 1, "values": {"you.call_me": "Zoë"}}
    config_cli.request(command, "pi", "/owner/settings", body)
    (read, nothing), (write, sent) = calls
    assert read[: len(command)] == command
    assert read[len(command) :] == [
        "exec",
        "-T",
        "pi",
        "python",
        "-c",
        config_cli.RELAY,
        "GET",
        "/owner/settings",
    ]
    assert nothing == b"" and write[-2:] == ["POST", "/owner/settings"]
    assert json.loads(sent) == body
    for stdout, code, stderr, message in [
        (b'409\n{"detail": {"code": "revision_conflict"}}', 0, b"", "changed while"),
        (
            b'422\n{"detail": {"code": "invalid_settings", "message": "Too deep."}}',
            0,
            b"",
            r"HTTP 422\): Too deep\. Nothing was saved\.$",
        ),
        (b"", 1, b'service "pi" is not running\n', 'service "pi" is not running'),
        (b"200\nnot json", 0, b"", "other than JSON"),
    ]:
        answer(stdout, code, stderr)
        with pytest.raises(config_cli.NotConfirmed, match=message):
            config_cli.request(command, "pi", "/owner/settings", body)
    for path in ("/owner/settings@elsewhere", "//elsewhere/x", "/sessions/../owner"):
        with pytest.raises(ValueError, match="not a settings home"):
            config_cli.request(command, "pi", path)
    answer(b'404\n{"detail": "Conversation unavailable."}')
    with pytest.raises(
        config_cli.NotConfirmed, match=r"\): Conversation unavailable\.$"
    ):
        config_cli.request(command, "pi", "/sessions/ses_gone/output")


def test_the_relay_calls_pi_with_its_own_key_and_reports_the_status():
    seen = []

    class Pi(BaseHTTPRequestHandler):
        def do_GET(self):
            seen.append(("GET", self.path, self.headers["X-Pi-Key"]))
            self.answer(200, {"revision": 2, "values": {}})

        def do_POST(self):
            body = self.rfile.read(int(self.headers["Content-Length"]))
            seen.append(("POST", self.path, json.loads(body)))
            self.answer(409, {"detail": {"code": "revision_conflict"}})

        def answer(self, status, value):
            content = json.dumps(value).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)

        def log_message(self, *_args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Pi)
    Thread(target=server.serve_forever, daemon=True).start()
    relay = config_cli.RELAY.replace(
        "127.0.0.1:8050", f"127.0.0.1:{server.server_port}"
    )
    environment = {**os.environ, "PI_ADMIN_KEY": "recovery-key"}
    try:
        got, posted = (
            subprocess.run(
                [sys.executable, "-c", relay, method, "/owner/settings"],
                input=sent,
                capture_output=True,
                env=environment,
                timeout=30,
                check=False,
            )
            for method, sent in (("GET", b""), ("POST", b'{"expected_revision": 1}'))
        )
    finally:
        server.shutdown()
    assert got.stdout == b'200\n{"revision": 2, "values": {}}', got.stderr
    assert posted.stdout.startswith(b"409\n"), posted.stderr
    assert seen == [
        ("GET", "/owner/settings", "recovery-key"),
        ("POST", "/owner/settings", {"expected_revision": 1}),
    ]


def test_toolgate_settings_are_reached_inside_the_gateway_container(monkeypatch):
    command = config_cli.compose(Path("/srv/conker"), "ubuntu")
    calls, answers = [], []

    def run(sent, **options):
        calls.append((sent, options["input"]))
        return answers.pop(0)

    monkeypatch.setattr(config_cli.subprocess, "run", run)
    answers.append(
        SimpleNamespace(
            returncode=0, stdout=b'200\n{"revision": 2, "settings": {}}', stderr=b""
        )
    )
    body = {"expected_revision": 1, "settings": {"tool_seconds": 60}}
    config_cli.request(
        command, "toolgate-owner", "/v2/owner/settings", body, method="PUT"
    )
    sent, payload = calls[-1]
    assert sent[len(command) :] == [
        "exec",
        "-T",
        "gateway",
        "python",
        "-c",
        config_cli.TOOLGATE_RELAY,
        "PUT",
        "/v2/owner/settings",
    ]
    assert json.loads(payload) == body
    answers.append(
        SimpleNamespace(
            returncode=0,
            stdout=b'422\n{"detail": {"code": "invalid", "message": "Too long."}}',
            stderr=b"",
        )
    )
    with pytest.raises(
        config_cli.NotConfirmed,
        match=r"^ToolGate refused it \(HTTP 422\): Too long\. Nothing was saved\.$",
    ):
        config_cli.request(command, "toolgate-owner", "/v2/owner/lockdown", {"x": 1})
    assert calls[-1][0][-2:] == ["POST", "/v2/owner/lockdown"]
    with pytest.raises(ValueError, match="only PUT"):
        config_cli.request(command, "pi", "/owner/settings", body, method="DELETE")
    with pytest.raises(ValueError, match="only PUT"):
        config_cli.request(command, "pi", "/owner/settings", method="PUT")
    with pytest.raises(config_cli.NotConfirmed, match="cannot be reached"):
        config_cli.request(command, "memorygate", "/settings")
    assert not answers


def test_the_toolgate_relay_sends_the_owner_key_and_the_method():
    seen = []

    class ToolGate(BaseHTTPRequestHandler):
        def do_GET(self):
            seen.append(("GET", self.path, self.headers["X-ToolGate-Owner-Key"], None))
            self.answer(200, {"revision": 0, "settings": {}})

        def do_PUT(self):
            body = self.rfile.read(int(self.headers["Content-Length"]))
            seen.append(
                (
                    "PUT",
                    self.path,
                    self.headers["X-ToolGate-Owner-Key"],
                    json.loads(body),
                )
            )
            self.answer(409, {"detail": {"code": "settings_revision_conflict"}})

        def answer(self, status, value):
            content = json.dumps(value).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)

        def log_message(self, *_args):
            pass

    server = HTTPServer(("127.0.0.1", 0), ToolGate)
    Thread(target=server.serve_forever, daemon=True).start()
    environment = {
        **os.environ,
        "GATEWAY_TOOLGATE_URL": f"http://127.0.0.1:{server.server_port}/",
        "GATEWAY_TOOLGATE_OWNER_KEY": "owner-key",
    }
    try:
        got, put = (
            subprocess.run(
                [sys.executable, "-c", config_cli.TOOLGATE_RELAY, method, path],
                input=sent,
                capture_output=True,
                env=environment,
                timeout=30,
                check=False,
            )
            for method, path, sent in (
                ("GET", "/v2/owner/settings", b""),
                ("PUT", "/v2/owner/settings", b'{"expected_revision": 0}'),
            )
        )
    finally:
        server.shutdown()
    assert got.stdout == b'200\n{"revision": 0, "settings": {}}', got.stderr
    assert put.stdout.startswith(b"409\n"), put.stderr
    assert seen == [
        ("GET", "/v2/owner/settings", "owner-key", None),
        ("PUT", "/v2/owner/settings", "owner-key", {"expected_revision": 0}),
    ]
