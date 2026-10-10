"""The host-owner CLI has the same isolated native session recovery operations."""

import io
import json
import sys
from pathlib import Path
from urllib.error import HTTPError

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import conker as cli


@pytest.fixture
def invoke(monkeypatch):
    calls = []
    monkeypatch.setattr(
        cli,
        "read_config",
        lambda: {
            "native_providers": {
                "control_key": "owner-only",
                "inference_key": "not-for-control",
            }
        },
    )

    class Opener:
        def open(self, request, timeout):
            assert timeout == 30
            calls.append(request)
            return io.BytesIO(b'{"schemaVersion":1,"provider":"claude"}')

    def opener(*handlers):
        assert handlers[0].proxies == {} and isinstance(handlers[1], cli.NoRedirect)
        return Opener()

    monkeypatch.setattr(cli, "build_opener", opener)

    def run(*arguments):
        monkeypatch.setattr(sys, "argv", ["conker.py", *arguments])
        return cli.cli()

    return run, calls


def test_list_status_and_output_are_only_owner_reads(invoke, capsys):
    run, calls = invoke
    assert run("native-sessions", "claude", "list") == 0
    assert run("native-sessions", "claude", "status", "abcd1234") == 0
    assert run("native-sessions", "claude", "output", "abcd1234") == 0
    assert [request.full_url for request in calls] == [
        "http://127.0.0.1:18570/claude/sessions",
        "http://127.0.0.1:18570/claude/sessions/abcd1234",
        "http://127.0.0.1:18570/claude/sessions/abcd1234/output",
    ]
    assert all(
        request.get_method() == "GET" and request.data is None for request in calls
    )
    assert all(
        request.get_header("Authorization") == "Bearer owner-only" for request in calls
    )
    assert "not-for-control" not in capsys.readouterr().out


def test_stop_uses_explicit_observed_identity_in_one_post(invoke):
    run, calls = invoke
    assert (
        run(
            "native-sessions",
            "claude",
            "stop",
            "abcd1234",
            "--expected-identity",
            "a" * 64,
        )
        == 0
    )
    assert len(calls) == 1 and calls[0].get_method() == "POST"
    assert calls[0].full_url.endswith("/claude/sessions/abcd1234/stop")
    assert json.loads(calls[0].data) == {"expectedIdentity": "a" * 64}


@pytest.mark.parametrize(
    "identity", ["../other", "name with spaces", "a?query", "x" * 101, "тест"]
)
def test_invalid_native_ids_fail_without_requests_or_tracebacks(
    invoke, identity, capsys
):
    run, calls = invoke
    assert run("native-sessions", "claude", "status", identity) == 1
    assert calls == [] and "Traceback" not in capsys.readouterr().err


def test_invalid_digest_refuses_before_network(invoke, capsys):
    run, calls = invoke
    assert (
        run(
            "native-sessions",
            "claude",
            "stop",
            "abcd1234",
            "--expected-identity",
            "A" * 64,
        )
        == 1
    )
    assert not calls and "observed native session identity" in capsys.readouterr().err


def test_uncertain_stop_is_never_replayed(invoke, monkeypatch, capsys):
    run, _calls = invoke
    attempts = []

    def request(*args, **kwargs):
        attempts.append((args, kwargs))
        raise HTTPError("http://private", 503, "PRIVATE", {}, None)

    monkeypatch.setattr(cli, "request", request)
    assert (
        run(
            "native-sessions",
            "claude",
            "stop",
            "abcd1234",
            "--expected-identity",
            "a" * 64,
        )
        == 1
    )
    assert len(attempts) == 1
    error = capsys.readouterr().err
    assert "inspect status" in error and "PRIVATE" not in error


def test_native_response_is_bounded_before_json_parsing(invoke, monkeypatch, capsys):
    run, _calls = invoke
    reads = []

    class Response(io.BytesIO):
        def read(self, size=-1):
            reads.append(size)
            return super().read(size)

    class Opener:
        def open(self, request, timeout):
            assert timeout == 30
            return Response(b"PRIVATE" * 200000)

    monkeypatch.setattr(cli, "build_opener", lambda *_: Opener())
    assert run("native-sessions", "claude", "list") == 1
    assert reads == [1048577]
    error = capsys.readouterr().err
    assert "size limit" in error and "PRIVATE" not in error


@pytest.mark.parametrize("encoding", ["ascii", "cp1252"])
def test_native_json_survives_redirected_legacy_stdout(invoke, monkeypatch, encoding):
    run, _calls = invoke
    value = {
        "schemaVersion": 1,
        "provider": "claude",
        "result": {"cwd": "C:/工作/🦔", "name": "Привет · שלום", "text": "你好 🙂"},
    }
    monkeypatch.setattr(cli, "request", lambda *_args, **_kwargs: value)
    raw = io.BytesIO()
    stdout = io.TextIOWrapper(raw, encoding=encoding, errors="strict", newline="\n")
    with monkeypatch.context() as context:
        context.setattr(sys, "stdout", stdout)
        assert run("native-sessions", "claude", "status", "abcd1234") == 0
        stdout.flush()
    encoded = raw.getvalue()
    assert encoded.isascii()
    assert json.loads(encoded.decode("ascii")) == value
    stdout.detach()
