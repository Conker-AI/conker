"""Memory correction CLI preserves reviewed text and never replays uncertain writes."""

import io
import json
import sys
from pathlib import Path
from urllib.error import HTTPError

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import conker as cli

REQUEST_ID = "reviewed_correction_0001"
MEMORY_ID = "mem:companion_record-01"
PAYLOAD_HASH = "b" * 64


@pytest.fixture
def invoke(monkeypatch):
    calls, config_reads = [], []
    state = {"response": {"schemaVersion": 1, "status": "unknown"}, "failure": None}

    def config():
        config_reads.append(True)
        return {
            "environments": {
                "gateway": {"GATEWAY_PI_OWNER_KEY": "fixture-owner-key"},
                "pi": {"PI_ADMIN_KEY": "not-for-owner-correction"},
            }
        }

    class Opener:
        def open(self, request, timeout):
            calls.append((request, timeout))
            if state["failure"] is not None:
                raise state["failure"]
            raw = state.get("raw")
            if raw is None:
                raw = json.dumps(state["response"], ensure_ascii=False).encode("utf-8")
            return io.BytesIO(raw)

    def opener(*handlers):
        assert handlers[0].proxies == {}
        assert isinstance(handlers[1], cli.NoRedirect)
        return Opener()

    monkeypatch.setattr(cli, "read_config", config)
    monkeypatch.setattr(cli, "build_opener", opener)

    def run(*arguments):
        monkeypatch.setattr(sys, "argv", ["conker.py", "memory-edit", *map(str, arguments)])
        return cli.cli()

    return run, calls, config_reads, state


def correction_file(tmp_path, text):
    path = tmp_path / "reviewed-memory.txt"
    path.write_bytes(text.encode("utf-8"))
    return path


def apply_args(path, revision=7, memory_id=MEMORY_ID, request_id=REQUEST_ID):
    return (
        "apply", memory_id, path, "--expected-revision", revision,
        "--request-id", request_id,
    )


def test_inspect_pending_and_status_are_only_owner_gets(invoke, capsys):
    run, calls, _, _ = invoke
    assert run("show", MEMORY_ID) == 0
    assert run("pending") == 0
    assert run("status", REQUEST_ID) == 0
    assert [request.full_url for request, _ in calls] == [
        f"http://127.0.0.1:18551/memory/corrections/memories/{MEMORY_ID}",
        "http://127.0.0.1:18551/memory/corrections/pending",
        f"http://127.0.0.1:18551/memory/corrections/{REQUEST_ID}",
    ]
    for request, timeout in calls:
        assert request.get_method() == "GET" and request.data is None
        assert request.get_header("X-pi-owner-key") == "fixture-owner-key"
        assert request.get_header("X-pi-key") is None
        assert timeout == 35
    output = capsys.readouterr()
    assert "fixture-owner-key" not in output.out + output.err
    assert "not-for-owner-correction" not in output.out + output.err


def test_apply_keeps_reviewed_identity_revision_and_exact_utf8_text(invoke, tmp_path):
    run, calls, _, _ = invoke
    text = "  שלום 🦔\r\nA corrected statement.\n  "
    assert run(*apply_args(correction_file(tmp_path, text))) == 0
    assert len(calls) == 1
    request, timeout = calls[0]
    assert request.full_url == "http://127.0.0.1:18551/memory/corrections"
    assert request.get_method() == "POST" and timeout == 45
    assert request.get_header("X-pi-owner-key") == "fixture-owner-key"
    assert request.get_header("X-pi-key") is None
    assert json.loads(request.data) == {
        "request_id": REQUEST_ID,
        "memory_id": MEMORY_ID,
        "expected_revision": 7,
        "text": text,
    }


def test_explicit_retry_uses_only_the_original_request_and_reviewed_hash(invoke):
    run, calls, _, _ = invoke
    assert run("retry", REQUEST_ID, "--expected-payload-hash", PAYLOAD_HASH) == 0
    assert len(calls) == 1
    request, timeout = calls[0]
    assert request.full_url.endswith(f"/memory/corrections/{REQUEST_ID}/retry")
    assert request.get_method() == "POST" and timeout == 45
    assert json.loads(request.data) == {"expected_payload_hash": PAYLOAD_HASH}


@pytest.mark.parametrize("operation", ["apply", "retry"])
@pytest.mark.parametrize("failure", ["http", "timeout", "invalid-json", "oversize"])
def test_uncertain_writes_are_not_replayed_or_echoed(
    invoke, tmp_path, capsys, operation, failure
):
    run, calls, _, state = invoke
    if failure == "http":
        state["failure"] = HTTPError(
            "http://private", 503, "PRIVATE_DIAGNOSTIC", {}, io.BytesIO(b"PRIVATE_BODY")
        )
    elif failure == "timeout":
        state["failure"] = TimeoutError("PRIVATE_DIAGNOSTIC")
    else:
        state["raw"] = b"PRIVATE_BODY" if failure == "invalid-json" else b"x" * 128001
    args = (
        apply_args(correction_file(tmp_path, "Private correction"))
        if operation == "apply"
        else ("retry", REQUEST_ID, "--expected-payload-hash", PAYLOAD_HASH)
    )
    assert run(*args) == 1
    assert len(calls) == 1 and calls[0][0].get_method() == "POST"
    output = capsys.readouterr()
    assert output.out == ""
    assert f"memory-edit status {REQUEST_ID}" in output.err
    assert "automatically repeated" in output.err
    assert "PRIVATE" not in output.err and "Private correction" not in output.err


def test_failed_status_never_dispatches_a_retry(invoke, capsys):
    run, calls, _, state = invoke
    state["failure"] = HTTPError("http://private", 404, "PRIVATE", {}, None)
    assert run("status", REQUEST_ID) == 1
    assert len(calls) == 1 and calls[0][0].get_method() == "GET"
    assert "could not be read" in capsys.readouterr().err


@pytest.mark.parametrize(
    "arguments",
    [
        ("show", "../other"),
        ("show", "mem?options"),
        ("show", "a" * 201),
        ("show", "זיכרון"),
        ("status", "short"),
        ("status", "a" * 129),
        ("retry", REQUEST_ID, "--expected-payload-hash", "B" * 64),
        ("retry", REQUEST_ID, "--expected-payload-hash", "b" * 63),
        ("retry", "../request_identity", "--expected-payload-hash", PAYLOAD_HASH),
    ],
)
def test_invalid_target_or_recovery_identity_precedes_credentials(invoke, arguments):
    run, calls, config_reads, _ = invoke
    assert run(*arguments) == 1
    assert not calls and not config_reads


@pytest.mark.parametrize("revision", [0, -1, 2147483647])
def test_invalid_revision_precedes_file_and_credential_reads(invoke, tmp_path, revision):
    run, calls, config_reads, _ = invoke
    assert run(*apply_args(tmp_path / "not-created.txt", revision=revision)) == 1
    assert not calls and not config_reads


@pytest.mark.parametrize(
    "raw",
    [b"", b" \r\n\t", b"bad\x00text", b"a" * 16001, b"\xff", b"x" * 64004],
    ids=["empty", "whitespace", "nul", "codepoint-limit", "invalid-utf8", "byte-limit"],
)
def test_invalid_replacement_precedes_credentials(invoke, tmp_path, raw):
    run, calls, config_reads, _ = invoke
    path = tmp_path / "invalid.txt"
    path.write_bytes(raw)
    assert run(*apply_args(path)) == 1
    assert not calls and not config_reads


def test_maximum_unicode_text_and_utf8_bom_are_preserved(invoke, tmp_path):
    run, calls, _, _ = invoke
    path = tmp_path / "unicode.txt"
    text = "🦔" * 16000
    path.write_bytes(b"\xef\xbb\xbf" + text.encode("utf-8"))
    assert run(*apply_args(path, revision=2147483646)) == 0
    assert json.loads(calls[0][0].data)["text"] == text


@pytest.mark.parametrize("encoding", ["ascii", "cp1252"])
def test_authoritative_unicode_snapshot_survives_redirected_output(invoke, monkeypatch, encoding):
    run, _, _, state = invoke
    state["response"] = {"schemaVersion": 1, "memoryId": MEMORY_ID, "text": "שלום 🦔"}
    buffer = io.BytesIO()
    stream = io.TextIOWrapper(buffer, encoding=encoding, write_through=True)
    monkeypatch.setattr(sys, "stdout", stream)
    assert run("show", MEMORY_ID) == 0
    assert json.loads(buffer.getvalue()) == state["response"]
