"""Paged history remains a bounded read with literal, query-bound continuation."""

import io
import json
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlsplit

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import conker as cli

CURSOR = "h1." + "a" * 64 + ".ses_anchor"


@pytest.fixture
def invoke(monkeypatch):
    calls = []
    response = {"schemaVersion": 1, "results": [], "next_cursor": CURSOR}
    monkeypatch.setattr(
        cli,
        "read_config",
        lambda: {"environments": {"pi": {"PI_ADMIN_KEY": "synthetic-runtime-key"}}},
    )

    class Opener:
        def open(self, request, timeout):
            calls.append(request)
            assert timeout == 660
            return io.BytesIO(json.dumps(response).encode())

    def opener(*handlers):
        assert handlers[0].proxies == {}
        assert isinstance(handlers[1], cli.NoRedirect)
        return Opener()

    monkeypatch.setattr(cli, "build_opener", opener)

    def run(*arguments):
        monkeypatch.setattr(sys, "argv", ["conker.py", *map(str, arguments)])
        return cli.cli()

    return run, calls, response


def test_default_page_is_one_compact_get_and_prints_continuation(invoke, capsys):
    run, calls, response = invoke
    assert run("sessions") == 0
    assert len(calls) == 1
    request = calls[0]
    assert request.full_url == "http://127.0.0.1:18551/sessions/history?limit=50"
    assert request.get_method() == "GET" and request.data is None
    assert request.get_header("X-pi-key") == "synthetic-runtime-key"
    assert json.loads(capsys.readouterr().out) == response


def test_query_and_cursor_are_encoded_once_without_changing_path(invoke, capsys):
    run, calls, _ = invoke
    query = "שלום Straße 🦔 100%_ & ?x=1#fragment /../"
    assert run("sessions", "--limit", 7, "--query", query, "--cursor", CURSOR) == 0
    url = urlsplit(calls[0].full_url)
    assert url.path == "/sessions/history" and url.fragment == ""
    assert parse_qs(url.query) == {"limit": ["7"], "q": [query], "cursor": [CURSOR]}
    assert "%25" in url.query and "%2525" not in url.query
    assert len(calls) == 1, "Continuation must not fetch every page automatically"
    assert "synthetic-runtime-key" not in capsys.readouterr().out


@pytest.mark.parametrize(
    "arguments",
    [
        ("--limit", 0),
        ("--limit", 51),
        ("--limit", -1),
        ("--query", "x" * 201),
        ("--query", "🦔" * 201),
        ("--query", "nul\x00query"),
        ("--query", "\ud800"),
        ("--cursor", ""),
        ("--cursor", "h1." + "a" * 64 + "." + "x" * 129),
        ("--cursor", CURSOR + "&q=other"),
        ("--cursor", "../other"),
    ],
)
def test_invalid_cli_values_fail_before_network(invoke, arguments, capsys):
    run, calls, _ = invoke
    assert run("sessions", *arguments) == 1
    assert calls == []
    assert "Traceback" not in capsys.readouterr().err


def test_unicode_boundary_and_explicit_empty_query(invoke):
    run, calls, _ = invoke
    assert run("sessions", "--query", "🦔" * 200, "--limit", 1) == 0
    assert parse_qs(urlsplit(calls[-1].full_url).query)["q"] == ["🦔" * 200]
    assert run("sessions", "--query", "") == 0
    assert parse_qs(urlsplit(calls[-1].full_url).query, keep_blank_values=True)[
        "q"
    ] == [""]


@pytest.mark.parametrize(
    "service,path,body,query",
    [
        ("pi", "/sessions", None, {"limit": 1}),
        ("pi-owner", "/sessions/history", None, {"limit": 1}),
        ("pi", "/sessions/history", {}, {"limit": 1}),
        ("pi", "/sessions/history?q=raw", None, {}),
        ("pi", "/sessions/history#raw", None, {}),
        ("pi", "/sessions/history", None, {"unknown": "x"}),
        ("pi", "/sessions/history", None, {"limit": True}),
        ("pi", "/sessions/history", None, {"q": ["one", "two"]}),
        ("pi", "/sessions/history", None, {"cursor": None}),
    ],
)
def test_structured_query_cannot_widen_other_requests(
    monkeypatch, service, path, body, query
):
    monkeypatch.setattr(
        cli, "build_opener", lambda *_: pytest.fail("Unexpected network")
    )
    with pytest.raises(ValueError):
        cli.request({}, service, path, body, query=query)


@pytest.mark.parametrize("status", [401, 422, 503])
def test_history_error_is_read_specific_safe_and_never_retried(
    invoke, monkeypatch, capsys, status
):
    run, _, _ = invoke
    attempts = []

    def request(*args, **kwargs):
        attempts.append((args, kwargs))
        raise HTTPError(
            "http://synthetic/history",
            status,
            "Private server detail",
            {},
            io.BytesIO(b"Private body"),
        )

    monkeypatch.setattr(cli, "request", request)
    assert run("sessions", "--cursor", CURSOR) == 1
    assert len(attempts) == 1
    error = capsys.readouterr().err
    assert "Private" not in error and "Traceback" not in error
    assert "--cursor" in error if status == 422 else f"HTTP {status}" in error


def test_raw_legacy_list_remains_available_without_structured_query(invoke):
    run, calls, _ = invoke
    assert run("api", "pi", "/sessions") == 0
    assert calls[0].full_url == "http://127.0.0.1:18551/sessions"
