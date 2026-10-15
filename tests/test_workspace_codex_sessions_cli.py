"""Codex history stays read-only and scoped through the host-owner CLI."""

import io
import json
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlsplit

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import conker as cli

THREAD = "01994263-4321-7123-8123-123456789abc"


@pytest.fixture
def invoke(monkeypatch):
    calls, config_reads = [], []

    def configuration():
        config_reads.append(True)
        return {
            "native_providers": {
                "control_key": "owner-only",
                "inference_key": "inference-only",
            }
        }

    class Opener:
        def open(self, request, timeout):
            assert timeout == 30
            calls.append(request)
            return io.BytesIO(json.dumps({"provider": "codex", "results": []}).encode())

    def opener(*handlers):
        assert handlers[0].proxies == {} and isinstance(handlers[1], cli.NoRedirect)
        return Opener()

    monkeypatch.setattr(cli, "read_config", configuration)
    monkeypatch.setattr(cli, "build_opener", opener)

    def run(*arguments):
        monkeypatch.setattr(sys, "argv", ["conker.py", "native-sessions", *arguments])
        return cli.cli()

    return run, calls, config_reads


def test_codex_default_archive_and_next_page_are_owner_gets(invoke):
    run, calls, _ = invoke
    assert run("codex", "list") == 0
    assert (
        run(
            "codex",
            "list",
            "--limit",
            "10",
            "--archived",
            "--cursor",
            "opaque_next-123",
        )
        == 0
    )
    assert run("codex", "status", THREAD) == 0
    assert [urlsplit(request.full_url).path for request in calls] == [
        "/codex/sessions",
        "/codex/sessions",
        "/codex/sessions/" + THREAD,
    ]
    assert parse_qs(urlsplit(calls[0].full_url).query) == {
        "limit": ["25"],
        "archived": ["false"],
    }
    assert parse_qs(urlsplit(calls[1].full_url).query) == {
        "limit": ["10"],
        "archived": ["true"],
        "cursor": ["opaque_next-123"],
    }
    assert not urlsplit(calls[2].full_url).query
    assert all(
        request.get_method() == "GET" and request.data is None for request in calls
    )
    assert all(
        request.get_header("Authorization") == "Bearer owner-only" for request in calls
    )


@pytest.mark.parametrize(
    "arguments",
    [
        ("codex", "list", "--limit", "0"),
        ("codex", "list", "--limit", "51"),
        ("codex", "list", "--cursor", ""),
        ("codex", "list", "--cursor", "x" * 8193),
        ("codex", "list", "--cursor", "bad&cursor=2"),
        ("codex", "list", "--cursor", "тест"),
        ("codex", "status", THREAD.upper()),
        ("codex", "status", "01994263"),
        ("codex", "status", "../other"),
        ("codex", "output", THREAD),
        ("codex", "stop", THREAD, "--expected-identity", "a" * 64),
        ("claude", "list", "--limit", "25"),
        ("claude", "list", "--cursor", "page"),
        ("claude", "list", "--archived"),
    ],
)
def test_invalid_or_unsupported_requests_fail_before_configuration(
    invoke, capsys, arguments
):
    run, calls, config_reads = invoke
    assert run(*arguments) == 1
    assert not calls and not config_reads
    assert "Traceback" not in capsys.readouterr().err


@pytest.mark.parametrize(
    "service,path,body",
    [
        ("providers", "/codex/sessions", {}),
        ("providers", "/codex/sessions/" + THREAD, None),
        ("providers", "/claude/sessions", None),
        ("providers", "/chatgpt", None),
        ("pi", "/codex/sessions", None),
    ],
)
def test_query_exception_does_not_spread_to_other_requests(invoke, service, path, body):
    _, calls, _ = invoke
    with pytest.raises(ValueError, match="Structured query"):
        cli.request({}, service, path, body, query={"limit": 25})
    assert calls == []


@pytest.mark.parametrize("status", [401, 422, 503])
def test_failed_read_is_not_retried_or_misreported_as_a_mutation(
    invoke, monkeypatch, capsys, status
):
    run, _, _ = invoke
    attempts = []

    def request(*args, **kwargs):
        attempts.append((args, kwargs))
        raise HTTPError("http://private", status, "PRIVATE", {}, None)

    monkeypatch.setattr(cli, "request", request)
    assert run("codex", "list") == 1
    assert len(attempts) == 1
    error = capsys.readouterr().err
    assert "PRIVATE" not in error and "inspect status" not in error
    assert ("without --cursor" if status == 422 else "could not be read") in error
