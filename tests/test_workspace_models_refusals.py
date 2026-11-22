"""`scripts/workspace_models.py`: the Ollama inventory read and the role configuration it builds.

The inventory is read from a real loopback HTTP server started per test, so the refusals for a
redirect, an oversized answer and a wrong shape are the script's own, not a stand-in's.
"""

from __future__ import annotations

import json
import threading
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from scripts import workspace_models

ROLES = ("answer", "summarization", "thinking", "routing", "extra")
INVENTORY_ERROR = "Local model inventory is invalid."


@pytest.fixture()
def ollama():
    """Serve one canned answer on 127.0.0.1; the fixture yields (url, set_answer)."""
    answer = {"status": 200, "body": b"{}", "headers": {}}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(answer["status"])
            for name, value in answer["headers"].items():
                self.send_header(name, value)
            self.send_header("Content-Length", str(len(answer["body"])))
            self.end_headers()
            self.wfile.write(answer["body"])

        def log_message(self, *_):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    def set_answer(body=None, status=200, headers=None):
        answer["status"] = status
        answer["body"] = body if isinstance(body, bytes) else json.dumps(body).encode()
        answer["headers"] = headers or {}

    try:
        yield f"http://127.0.0.1:{server.server_address[1]}", set_answer
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def test_inventory_lists_only_well_formed_model_names(ollama):
    url, answer = ollama
    answer(
        {
            "models": [
                {"name": "qwen3:4b"},
                {"name": ""},
                {"name": "x" * 301},
                {"name": 7},
                "not a row",
                {"model": "no-name"},
                {"name": "llama3:8b"},
            ]
        }
    )
    assert workspace_models.installed_models(url + "/") == {"qwen3:4b", "llama3:8b"}


@pytest.mark.parametrize(
    "body",
    [
        [],
        {"models": "none"},
        {"nothing": 1},
        {"models": [{"name": "m"}] * 1001},
    ],
)
def test_inventory_refuses_a_wrong_shape(ollama, body):
    url, answer = ollama
    answer(body)
    with pytest.raises(ValueError) as raised:
        workspace_models.installed_models(url)
    assert str(raised.value) == INVENTORY_ERROR


def test_inventory_refuses_an_oversized_answer(ollama):
    url, answer = ollama
    answer(b" " * 2_000_001)
    with pytest.raises(ValueError) as raised:
        workspace_models.installed_models(url)
    assert str(raised.value) == "Local model inventory is too large."


def test_inventory_does_not_follow_a_redirect(ollama):
    url, answer = ollama
    answer(b"", status=302, headers={"Location": "http://example.invalid/api/tags"})
    with pytest.raises(urllib.error.HTTPError) as raised:
        workspace_models.installed_models(url)
    assert raised.value.code == 302


@pytest.mark.parametrize(
    "url",
    [
        "https://127.0.0.1:11434",
        "http://example.com:11434",
        "http://user:pw@127.0.0.1:11434",
        "http://127.0.0.1:11434/?x=1",
        "http://127.0.0.1:11434/#frag",
        "http://127.0.0.1:11434/api",
    ],
)
def test_inventory_refuses_anything_but_the_plain_loopback_base(url):
    with pytest.raises(ValueError) as raised:
        workspace_models.installed_models(url)
    assert str(raised.value) == "Model initialization requires the configured loopback Ollama URL."


@pytest.mark.parametrize("model", ["", "   ", None, 5, "m" * 301])
def test_configuration_refuses_an_invalid_model_route(model):
    with pytest.raises(ValueError) as raised:
        workspace_models.configuration_for(model, {"qwen3:4b"}, ROLES)
    assert str(raised.value) == "The installation needs a valid local model route."


def test_a_bare_route_matches_its_latest_tag_in_the_inventory():
    value = workspace_models.configuration_for("llama3", {"llama3:latest"}, ROLES)
    assert value["defaultModelId"] == "local-answer"
    assert value["roleSettings"]["answerMode"] == "router"
    assert value["roleSettings"]["roles"]["extra"]["enabled"] is False
    assert [m["id"] for m in value["models"]] == ["local-answer", "laya-router"]


def test_a_missing_model_leaves_every_role_off_and_manual():
    value = workspace_models.configuration_for("llama3:8b", {"qwen3:4b"}, ROLES)
    assert value["defaultModelId"] is None
    assert value["roleSettings"]["answerMode"] == "manual"
    assert not any(role["enabled"] for role in value["roleSettings"]["roles"].values())
    assert [(m["id"], m["enabled"]) for m in value["models"]] == [
        ("local-answer", False),
        ("laya-router", False),
    ]
    assert [p["id"] for p in value["providers"]] == [
        "ollama",
        "decisions",
        "chatgpt",
        "claude-code",
    ]
