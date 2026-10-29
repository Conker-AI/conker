"""The server's Claude plan runtime: the bridge with ChatGPT passed on to the host worker, its
container entrypoint, and the pinned, checked Claude Code download."""

import base64
import hashlib
import importlib.util
import io
import json
import sys
import tarfile
from pathlib import Path
from typing import ClassVar

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import subscription_runtime
from chatgpt_relay import ChatGPTRelay
from workspace_providers import create_app

CONTROL = {"Authorization": "Bearer " + "c" * 32}
INFERENCE = {"Authorization": "Bearer " + "i" * 32}
PAYLOAD = {
    "model": "gpt-5",
    "messages": [{"role": "user", "content": "hi"}],
    "timeout": 30,
}


class Response:
    def __init__(self, status, body):
        self.status, self.stream = status, io.BytesIO(body)

    def read(self, limit=-1):
        return self.stream.read(limit)

    def readline(self, limit=-1):
        return self.stream.readline(limit)


class Worker:
    """The host ChatGPT worker's socket, as http.client sees it."""

    answers: ClassVar[dict] = {}
    sent: ClassVar[list] = []

    def __init__(self, path, timeout):
        self.sock, self.path, self.timeout = None, path, timeout

    def request(self, method, route, body=None, headers=None):
        if route not in self.answers:
            raise ConnectionRefusedError()
        Worker.sent.append((method, route, body, headers))
        self.route = route

    def getresponse(self):
        return Response(*self.answers[self.route])

    def close(self):
        pass


@pytest.fixture
def worker():
    Worker.answers, Worker.sent = {}, []
    return Worker


def app(tmp_path, relay):
    return create_app(
        {
            "native_providers": {
                "state": str(tmp_path),
                "codex": "",
                "claude": str(tmp_path / "absent-claude"),
                "control_key": "c" * 32,
                "inference_key": "i" * 32,
            }
        },
        chatgpt_relay=relay,
    )


def test_chatgpt_answers_go_to_the_host_worker_unchanged(tmp_path, worker):
    events = [{"type": "delta", "text": "Hel"}, {"type": "done", "inputTokens": 1}]
    worker.answers = {
        "/status": (200, b'{"available": true, "connected": true}'),
        "/responses": (
            200,
            b"".join(json.dumps(item).encode() + b"\n" for item in events),
        ),
    }
    relay = ChatGPTRelay(tmp_path / "inference.sock", connection=worker)
    with TestClient(app(tmp_path, relay)) as client:
        assert client.get("/inference/status", headers=INFERENCE).json() == {
            "available": True,
            "connected": True,
        }
        answer = client.post(
            "/inference/responses",
            headers=INFERENCE,
            json={**PAYLOAD, "request_id": "request_1234567890abcdef"},
        )
    assert [json.loads(line) for line in answer.text.splitlines()] == events
    method, route, body, headers = worker.sent[-1]
    # The request id stays with this runtime's cancellation; the worker gets the answer request.
    assert (method, route, json.loads(body)) == ("POST", "/responses", PAYLOAD)
    assert headers == {"Content-Type": "application/json"}


def test_without_the_host_worker_chatgpt_is_unavailable(tmp_path, worker):
    relay = ChatGPTRelay(tmp_path / "absent.sock", connection=worker)
    with TestClient(app(tmp_path, relay)) as client:
        assert client.get("/inference/status", headers=INFERENCE).json() == {
            "available": False,
            "connected": False,
        }
        assert client.get("/inference/limits", headers=INFERENCE).json() == {
            "provider": "chatgpt",
            "available": False,
            "problem": "runtime_unavailable",
        }
        answer = client.post("/inference/responses", headers=INFERENCE, json=PAYLOAD)
    assert json.loads(answer.text.splitlines()[0]) == {
        "type": "error",
        "code": "runtime_unavailable",
    }


def test_a_busy_or_failing_worker_is_reported_by_code(tmp_path, worker):
    relay = ChatGPTRelay(tmp_path / "inference.sock", connection=worker)
    worker.answers = {"/responses": (503, b"")}
    with pytest.raises(ValueError, match="busy"):
        list(relay.events(PAYLOAD))
    worker.answers = {"/responses": (200, b"[]\n")}
    with pytest.raises(ValueError, match="invalid_provider_response"):
        list(relay.events(PAYLOAD))
    with pytest.raises(ValueError, match="invalid_request"):
        list(relay.events({**PAYLOAD, "tools": []}))


def test_the_relay_runtime_keeps_no_chatgpt_or_codex_control(tmp_path, worker):
    relay = ChatGPTRelay(tmp_path / "inference.sock", connection=worker)
    with TestClient(app(tmp_path, relay)) as client:
        for route in ("/chatgpt", "/chatgpt/limits", "/codex/sessions"):
            assert client.get(route, headers=CONTROL).status_code == 404
        assert client.get("/claude", headers=CONTROL).json()["available"] is False
        # The keys stay apart: the inference key cannot reach control routes, and back.
        assert client.get("/claude", headers=INFERENCE).status_code == 401
        assert (
            client.get("/inference/claude/status", headers=CONTROL).status_code == 401
        )
        assert client.get("/inference/claude/status", headers=INFERENCE).json() == {
            "available": False,
            "connected": False,
        }


def test_the_container_settings_come_from_its_environment(tmp_path):
    environment = {
        "SUBSCRIPTIONS_CONTROL_KEY": "c" * 32,
        "SUBSCRIPTIONS_INFERENCE_KEY": "i" * 32,
        "SUBSCRIPTIONS_STATE": str(tmp_path / "state"),
        "HOME": str(tmp_path / "state/home"),
    }
    settings = subscription_runtime.configuration(environment)["native_providers"]
    assert settings == {
        "control_key": "c" * 32,
        "inference_key": "i" * 32,
        "state": str(tmp_path / "state"),
        "claude": str(Path("/opt/claude/bin/claude")),
        "codex": "",
    }
    home = subscription_runtime.prepare(environment)
    assert home == tmp_path / "state/claude-auth" and home.is_dir()
    assert (tmp_path / "state/home").is_dir()


def test_status_never_shows_the_sign_in_itself(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("SUBSCRIPTIONS_STATE", str(tmp_path))
    monkeypatch.setenv("SUBSCRIPTIONS_CLAUDE", str(tmp_path / "absent-claude"))
    monkeypatch.setenv("HOME", str(tmp_path / "home"))
    assert subscription_runtime.main(["status"]) == 0
    value = json.loads(capsys.readouterr().out)
    assert value == {
        "available": False,
        "connected": False,
        "runtime": "Claude Code",
        "models": [],
        "credentialsIncluded": False,
    }
    assert subscription_runtime.main(["export"]) == 2


def test_login_is_the_official_cli_sign_in_with_the_runtimes_own_folder(
    tmp_path, monkeypatch
):
    calls = []
    monkeypatch.setenv("SUBSCRIPTIONS_STATE", str(tmp_path))
    monkeypatch.setenv("SUBSCRIPTIONS_CLAUDE", str(tmp_path / "claude"))
    monkeypatch.setenv("HOME", str(tmp_path / "home"))
    monkeypatch.setenv("SUBSCRIPTIONS_CONTROL_KEY", "c" * 32)
    monkeypatch.setenv("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "1")
    monkeypatch.setattr(subscription_runtime.os, "chdir", lambda _path: None)
    monkeypatch.setattr(
        subscription_runtime.os, "execve", lambda *arguments: calls.append(arguments)
    )
    subscription_runtime.main(["login"])
    _executable, arguments, environment = calls[0]
    assert arguments[1:] == ["auth", "login", "--claudeai"]
    assert environment["CLAUDE_CONFIG_DIR"] == str(tmp_path / "claude-auth")
    assert environment["CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"] == "1"
    assert "SUBSCRIPTIONS_CONTROL_KEY" not in environment


def fetcher():
    path = ROOT / "services/subscriptions/fetch_claude.py"
    spec = importlib.util.spec_from_file_location("fetch_claude", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def package(files):
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
        for name, content in files.items():
            info = tarfile.TarInfo(name)
            info.size = len(content)
            archive.addfile(info, io.BytesIO(content))
    return buffer.getvalue()


def test_the_claude_download_must_match_its_pin(tmp_path):
    fetch = fetcher()
    data = package({"package/claude": b"binary", "package/README.md": b"readme"})
    integrity = "sha512-" + base64.b64encode(hashlib.sha512(data).digest()).decode()
    fetch.verify(data, integrity)
    with pytest.raises(ValueError, match="pinned SHA-512"):
        fetch.verify(data + b"x", integrity)
    with pytest.raises(ValueError, match="SHA-512"):
        fetch.verify(data, "sha1-abc")
    fetch.extract(data, tmp_path / "bin/claude")
    assert (tmp_path / "bin/claude").read_bytes() == b"binary"
    assert sorted(path.name for path in tmp_path.rglob("*")) == ["bin", "claude"]
    with pytest.raises(KeyError):
        fetch.extract(package({"package/other": b"x"}), tmp_path / "other")


def test_every_platform_is_pinned_to_one_version():
    fetch = fetcher()
    assert set(fetch.PACKAGES) == {"amd64", "arm64"}
    for platform, integrity in fetch.PACKAGES.values():
        assert (
            integrity.startswith("sha512-")
            and len(base64.b64decode(integrity[7:])) == 64
        )
        assert fetch.url(platform).endswith(
            f"/claude-code-{platform}-{fetch.VERSION}.tgz"
        )
    dockerfile = (ROOT / "services/subscriptions/Dockerfile").read_text(
        encoding="utf-8"
    )
    assert (
        "@sha256:"
        in dockerfile.splitlines()[
            [line.startswith("FROM ") for line in dockerfile.splitlines()].index(True)
        ]
    )
    assert "USER 1000:1000" in dockerfile
    ignored = (ROOT / "services/subscriptions/Dockerfile.dockerignore").read_text(
        encoding="utf-8"
    )
    copied = {
        word
        for word in dockerfile.replace("\\\n", " ").split()
        if word.startswith("scripts/")
    }
    assert copied == {
        line[1:] for line in ignored.splitlines() if line.startswith("!scripts/")
    }
