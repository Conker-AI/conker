"""Chat CLI provides output settings and chat names from the terminal."""

import io
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import conker as cli


@pytest.fixture
def invoke(monkeypatch):
    calls, config_reads = [], []
    state = {"responses": []}

    def config():
        config_reads.append(True)
        return {
            "environments": {
                "gateway": {"GATEWAY_PI_OWNER_KEY": "fixture-owner-key"},
                "pi": {"PI_ADMIN_KEY": "fixture-admin-key"},
            }
        }

    class Opener:
        def open(self, request, timeout):
            calls.append((request, timeout))
            if not state["responses"]:
                raise AssertionError("unexpected request")

            response = state["responses"].pop(0)
            if isinstance(response, Exception):
                raise response

            raw = json.dumps(response, ensure_ascii=False).encode("utf-8")
            return io.BytesIO(raw)

    def opener(*handlers):
        assert handlers[0].proxies == {}
        assert isinstance(handlers[1], cli.NoRedirect)
        return Opener()

    def check_headers(call_index=0):
        """Check that a request has the correct headers."""
        request = calls[call_index][0]
        headers = dict(request.headers) if hasattr(request, "headers") else {}
        assert headers.get("X-pi-key") == "fixture-admin-key"
        assert headers.get("X-Pi-Owner-Key") is None

    monkeypatch.setattr(cli, "read_config", config)
    monkeypatch.setattr(cli, "build_opener", opener)

    def run(*arguments):
        monkeypatch.setattr(
            sys, "argv", ["conker.py", "chat-settings", *map(str, arguments)]
        )
        return cli.cli()

    return run, calls, config_reads, state, check_headers


def test_output_show_gets_settings(invoke):
    run, calls, _, state, check_headers = invoke
    state["responses"] = [
        {
            "revision": 1,
            "output": {"format": "auto", "length": "auto", "language": "auto"},
        }
    ]
    assert run("output", "show", "ses_a") == 0
    assert len(calls) == 1
    check_headers(0)
    assert calls[0][0].full_url == "http://127.0.0.1:18551/sessions/ses_a/output"


def test_output_set_updates_partial_values(invoke):
    run, calls, _, state, check_headers = invoke
    state["responses"] = [
        {
            "revision": 1,
            "output": {"format": "auto", "length": "auto", "language": "auto"},
        },
        {
            "revision": 2,
            "output": {"format": "text", "length": "auto", "language": "auto"},
        },
    ]
    assert run("output", "set", "ses_a", "--format", "text") == 0
    assert len(calls) == 2
    check_headers(0)
    check_headers(1)
    assert calls[0][0].full_url == "http://127.0.0.1:18551/sessions/ses_a/output"
    assert calls[1][0].full_url == "http://127.0.0.1:18551/sessions/ses_a/output"
    body = json.loads(calls[1][0].data)
    assert body["expected_revision"] == 1
    assert body["output"]["format"] == "text"
    assert body["output"]["length"] == "auto"
    assert body["output"]["language"] == "auto"


def test_output_set_validation_exits_without_request(invoke, capsys):
    run, calls, _, _state, _ = invoke
    assert run("output", "set", "ses_a") == 1
    assert len(calls) == 0
    assert "Give --format, --length or --language." in capsys.readouterr().err

    calls.clear()
    assert run("output", "set", "ses_a", "--language", "English") == 1
    assert len(calls) == 0
    assert "Use auto or a language tag" in capsys.readouterr().err


def test_title_show_gets_title(invoke):
    run, calls, _, state, check_headers = invoke
    state["responses"] = [
        {"revision": 1, "title": "Chat Title", "source": "owner", "modelId": None}
    ]
    assert run("title", "show", "ses_a") == 0
    assert len(calls) == 1
    check_headers(0)
    assert calls[0][0].full_url == "http://127.0.0.1:18551/sessions/ses_a/title"


def test_title_set_posts_title(invoke):
    run, calls, _, state, check_headers = invoke
    state["responses"] = [
        {"revision": 1, "title": "Old Title", "source": "owner", "modelId": None},
        {"revision": 2, "title": "New Title"},
    ]
    assert run("title", "set", "ses_a", "New Title") == 0
    assert len(calls) == 2
    check_headers(0)
    check_headers(1)
    assert calls[0][0].full_url == "http://127.0.0.1:18551/sessions/ses_a/title"
    assert calls[1][0].full_url == "http://127.0.0.1:18551/sessions/ses_a/title"
    body = json.loads(calls[1][0].data)
    assert body["expected_revision"] == 1
    assert body["title"] == "New Title"


def test_title_auto_posts_to_auto_endpoint(invoke):
    run, calls, _, state, check_headers = invoke
    state["responses"] = [
        {"revision": 1, "title": "Old Title", "source": "owner", "modelId": None},
        {"revision": 2, "title": "Auto Title", "source": "auto", "modelId": "model_x"},
    ]
    assert run("title", "auto", "ses_a") == 0
    assert len(calls) == 2
    check_headers(0)
    check_headers(1)
    assert calls[0][0].full_url == "http://127.0.0.1:18551/sessions/ses_a/title"
    assert calls[1][0].full_url == "http://127.0.0.1:18551/sessions/ses_a/title/auto"
    body = json.loads(calls[1][0].data)
    assert body["expected_revision"] == 1


def test_title_set_validation_exits_without_request(invoke, capsys):
    run, calls, _, _state, _ = invoke
    assert run("title", "set", "ses_a", "  ") == 1
    assert len(calls) == 0
    assert "Use a name of 1-60 characters" in capsys.readouterr().err

    calls.clear()
    long_title = "x" * 61
    assert run("title", "set", "ses_a", long_title) == 1
    assert len(calls) == 0

    calls.clear()
    assert run("title", "set", "ses_a", "Title\nwith newline") == 1
    assert len(calls) == 0


def test_invalid_session_exits_without_config_read(invoke):
    run, calls, config_reads, _state, _ = invoke
    assert run("output", "show", "../x") == 1
    assert not calls and not config_reads
