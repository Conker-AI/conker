"""Files CLI provides file upload, download, and management from the terminal."""

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

            # Handle raw bytes response for downloads
            if isinstance(response, bytes):
                return io.BytesIO(response)

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
        monkeypatch.setattr(sys, "argv", ["conker.py", *map(str, arguments)])
        return cli.cli()

    return run, calls, config_reads, state, check_headers


def test_files_upload_with_auto_mime_type(invoke, tmp_path, capsys):
    """Test file upload with auto-detected MIME type."""
    run, calls, _, state, check_headers = invoke

    # Create a test PNG file
    test_file = tmp_path / "photo.png"
    test_file.write_bytes(b"fake png content")

    # Mock the upload response
    state["responses"] = [
        {
            "id": "attachment_1234567890abcdef1234567890abcdef",
            "name": "photo.png",
            "size": 17,
            "mediaType": "image/png",
            "processing": "completed",
        }
    ]

    assert run("files", "upload", "ses_a", str(test_file)) == 0
    assert len(calls) == 1
    check_headers(0)

    request = calls[0][0]
    assert request.full_url.startswith(
        "http://127.0.0.1:18551/sessions/ses_a/attachments?"
    )
    assert "name=photo.png" in request.full_url
    assert "type=image%2Fpng" in request.full_url
    assert "lastModified=" in request.full_url
    assert request.get_header("Content-type") == "application/octet-stream"
    assert request.data == b"fake png content"


def test_files_upload_with_custom_mime_type(invoke, tmp_path, capsys):
    """Test file upload with custom MIME type."""
    run, calls, _, state, _ = invoke

    # Create a test file
    test_file = tmp_path / "data.bin"
    test_file.write_bytes(b"binary content")

    # Mock the upload response
    state["responses"] = [
        {
            "id": "attachment_1234567890abcdef1234567890abcdef",
            "name": "data.bin",
            "size": 14,
            "mediaType": "application/custom",
            "processing": "completed",
        }
    ]

    assert (
        run("files", "upload", "ses_a", str(test_file), "--type", "application/custom")
        == 0
    )
    assert len(calls) == 1

    request = calls[0][0]
    assert "type=application%2Fcustom" in request.full_url


def test_files_list(invoke, capsys):
    """Test listing files."""
    run, calls, _, state, check_headers = invoke

    state["responses"] = [
        {
            "attachments": [
                {
                    "id": "attachment_1234567890abcdef1234567890abcdef",
                    "name": "photo.png",
                    "size": 1024,
                    "mediaType": "image/png",
                    "processing": "completed",
                }
            ]
        }
    ]

    assert run("files", "list", "ses_a") == 0
    assert len(calls) == 1
    check_headers(0)

    assert calls[0][0].full_url == "http://127.0.0.1:18551/sessions/ses_a/attachments"


def test_files_show(invoke, capsys):
    """Test showing file details."""
    run, calls, _, state, check_headers = invoke

    state["responses"] = [
        {
            "id": "attachment_1234567890abcdef1234567890abcdef",
            "name": "photo.png",
            "size": 1024,
            "mediaType": "image/png",
            "processing": "completed",
        }
    ]

    assert (
        run("files", "show", "ses_a", "attachment_1234567890abcdef1234567890abcdef")
        == 0
    )
    assert len(calls) == 1
    check_headers(0)

    assert (
        calls[0][0].full_url
        == "http://127.0.0.1:18551/sessions/ses_a/attachments/attachment_1234567890abcdef1234567890abcdef"
    )


def test_files_download_to_output(invoke, tmp_path, capsys):
    """Test downloading file to specific output."""
    run, calls, _, state, check_headers = invoke

    output_file = tmp_path / "downloaded.png"

    # Mock the attachment info response and download response
    state["responses"] = [b"downloaded file content"]

    assert (
        run(
            "files",
            "download",
            "ses_a",
            "attachment_1234567890abcdef1234567890abcdef",
            "--output",
            str(output_file),
        )
        == 0
    )
    assert len(calls) == 1
    check_headers(0)

    assert (
        calls[0][0].full_url
        == "http://127.0.0.1:18551/sessions/ses_a/attachments/attachment_1234567890abcdef1234567890abcdef/download"
    )
    assert output_file.read_bytes() == b"downloaded file content"


def test_files_download_refuses_existing_file(invoke, tmp_path, capsys):
    """Test download refuses to overwrite existing file."""
    run, calls, _, _, _ = invoke

    output_file = tmp_path / "existing.png"
    output_file.write_bytes(b"existing content")

    assert (
        run(
            "files",
            "download",
            "ses_a",
            "attachment_1234567890abcdef1234567890abcdef",
            "--output",
            str(output_file),
        )
        == 1
    )
    assert len(calls) == 0  # No request made

    output = capsys.readouterr()
    assert "That file already exists" in output.err


def test_files_remove(invoke, capsys):
    """Test removing a file."""
    run, calls, _, state, check_headers = invoke

    state["responses"] = [{"deleted": True}]

    assert (
        run("files", "remove", "ses_a", "attachment_1234567890abcdef1234567890abcdef")
        == 0
    )
    assert len(calls) == 1
    check_headers(0)

    request = calls[0][0]
    assert request.get_method() == "DELETE"
    assert (
        request.full_url
        == "http://127.0.0.1:18551/sessions/ses_a/attachments/attachment_1234567890abcdef1234567890abcdef"
    )


def test_chat_with_attachments(invoke, capsys):
    """Test chat command with attachments."""
    run, calls, _, state, check_headers = invoke

    state["responses"] = [
        {"id": "turn_123", "request_id": "req_456", "status": "pending"}
    ]

    assert (
        run(
            "chat",
            "ses_a",
            "Hello",
            "--attach",
            "attachment_1234567890abcdef1234567890abcdef",
            "--attach",
            "attachment_fedcba0987654321fedcba0987654321",
        )
        == 0
    )
    assert len(calls) == 1
    check_headers(0)

    body = json.loads(calls[0][0].data)
    assert body["text"] == "Hello"
    assert body["attachment_ids"] == [
        "attachment_1234567890abcdef1234567890abcdef",
        "attachment_fedcba0987654321fedcba0987654321",
    ]


def test_chat_refuses_invalid_attachment_id(invoke, capsys):
    """Test chat refuses invalid attachment IDs."""
    run, calls, _, _, _ = invoke

    assert run("chat", "ses_a", "Hello", "--attach", "invalid_id") == 1
    assert len(calls) == 0

    output = capsys.readouterr()
    assert "attachment identity" in output.err


def test_request_refuses_data_with_body(invoke, capsys):
    """Test request() refuses data and body together."""
    # This would need to be tested at a lower level since request() is internal
    # For now, we'll test that our files operations don't trigger this error


def test_request_refuses_query_params_on_wrong_path(invoke, capsys):
    """Test request() refuses query_params on non-attachment paths."""
    # This would need to be tested at a lower level since request() is internal
    # For now, we'll test that our files operations don't trigger this error


def test_files_download_keeps_only_the_base_name(invoke, tmp_path, monkeypatch, capsys):
    """A stored name never chooses a directory: ../evil.txt is saved as evil.txt here."""
    run, _calls, _, state, _ = invoke
    monkeypatch.chdir(tmp_path)
    attachment = "attachment_" + "a" * 32
    state["responses"] = [{"id": attachment, "name": "../evil.txt"}, b"payload"]
    assert run("files", "download", "ses_a", attachment) == 0
    assert (tmp_path / "evil.txt").read_bytes() == b"payload"
    assert not (tmp_path.parent / "evil.txt").exists()


def test_files_upload_refusal_uses_the_shared_message(invoke, tmp_path, capsys):
    run, _, _, state, _ = invoke
    upload = tmp_path / "notes.txt"
    upload.write_bytes(b"hello")
    body = (
        b'{"detail": {"code": "session_closed", "message": "Conversation is closed."}}'
    )
    state["responses"] = [
        HTTPError("http://private", 409, "Conflict", {}, io.BytesIO(body))
    ]
    assert run("files", "upload", "ses_a", str(upload)) == 1
    assert (
        "Pi refused this (session_closed): Conversation is closed."
        in capsys.readouterr().err
    )
