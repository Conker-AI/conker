"""Compaction CLI provides reviewed compaction from the terminal."""

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


# --- compact ---


def test_compact_posts_with_cover_arguments(invoke, tmp_path):
    run, calls, _, state, check_headers = invoke
    summary_file = tmp_path / "summary.txt"
    summary_file.write_text("summary text")

    state["responses"] = [
        {"policy": {"budget": {"contextWindowTokens": 1000}}, "revision": 5},
        {"revision": 3},
        {
            "policyRevision": 5,
            "summaryRevision": 4,
            "covered": ["msg_1", "msg_2"],
            "folded": ["msg_1", "msg_2"],
        },
    ]
    assert (
        run(
            "context",
            "compact",
            "ses_a",
            summary_file,
            "--cover",
            "msg_1",
            "--cover",
            "msg_2",
        )
        == 0
    )
    assert len(calls) == 3
    check_headers(0)
    check_headers(1)
    check_headers(2)
    assert calls[0][0].full_url == "http://127.0.0.1:18551/context/ses_a"
    assert calls[1][0].full_url == "http://127.0.0.1:18551/context/ses_a/summary"
    assert calls[2][0].full_url == "http://127.0.0.1:18551/context/ses_a/compact"
    body = json.loads(calls[2][0].data)
    assert body["expected_policy_revision"] == 5
    assert body["expected_summary_revision"] == 3
    assert body["summary"] == "summary text"
    assert body["covers"] == ["msg_1", "msg_2"]


def test_compact_posts_with_cover_file(invoke, tmp_path):
    run, calls, _, state, check_headers = invoke
    summary_file = tmp_path / "summary.txt"
    summary_file.write_text("summary text")
    cover_file = tmp_path / "covers.txt"
    cover_file.write_text("msg_1\n\nmsg_2\n")

    state["responses"] = [
        {"policy": {"budget": {"contextWindowTokens": 1000}}, "revision": 5},
        {"revision": 3},
        {
            "policyRevision": 5,
            "summaryRevision": 4,
            "covered": ["msg_1", "msg_2"],
            "folded": ["msg_1", "msg_2"],
        },
    ]
    assert (
        run(
            "context",
            "compact",
            "ses_a",
            summary_file,
            "--cover-file",
            cover_file,
        )
        == 0
    )
    assert len(calls) == 3
    check_headers(2)
    body = json.loads(calls[2][0].data)
    assert body["covers"] == ["msg_1", "msg_2"]


def test_compact_duplicate_ids_exits(invoke, capsys, tmp_path):
    run, calls, _, _state, _ = invoke
    summary_file = tmp_path / "summary.txt"
    summary_file.write_text("summary text")

    assert (
        run(
            "context",
            "compact",
            "ses_a",
            summary_file,
            "--cover",
            "msg_1",
            "--cover",
            "msg_1",
        )
        == 1
    )
    assert len(calls) == 0
    assert "Cover each message once." in capsys.readouterr().err


def test_compact_invalid_id_exits(invoke, capsys, tmp_path):
    run, calls, _, _state, _ = invoke
    summary_file = tmp_path / "summary.txt"
    summary_file.write_text("summary text")

    assert (
        run(
            "context",
            "compact",
            "ses_a",
            summary_file,
            "--cover",
            "invalid@id",
        )
        == 1
    )
    assert len(calls) == 0
    assert "message identity" in capsys.readouterr().err


def test_compact_empty_cover_file_exits(invoke, capsys, tmp_path):
    run, calls, _, _state, _ = invoke
    summary_file = tmp_path / "summary.txt"
    summary_file.write_text("summary text")
    cover_file = tmp_path / "empty.txt"
    cover_file.write_text("\n\n")

    assert (
        run(
            "context",
            "compact",
            "ses_a",
            summary_file,
            "--cover-file",
            cover_file,
        )
        == 1
    )
    assert len(calls) == 0
    assert "Provide at least one message to cover." in capsys.readouterr().err


def test_compact_long_summary_exits(invoke, capsys, tmp_path):
    run, calls, _, _state, _ = invoke
    summary_file = tmp_path / "long.txt"
    summary_file.write_text("x" * 16001)

    assert (
        run(
            "context",
            "compact",
            "ses_a",
            summary_file,
            "--cover",
            "msg_1",
        )
        == 1
    )
    assert len(calls) == 0
    assert "Summaries are limited to 16000 characters." in capsys.readouterr().err


def test_compact_neither_cover_nor_cover_file_exits(invoke, capsys, tmp_path):
    run, calls, _, _state, _ = invoke
    summary_file = tmp_path / "summary.txt"
    summary_file.write_text("summary text")

    with pytest.raises(SystemExit):
        run("context", "compact", "ses_a", summary_file)
    assert len(calls) == 0


def test_compact_both_cover_and_cover_file_exits(invoke, capsys, tmp_path):
    run, calls, _, _state, _ = invoke
    summary_file = tmp_path / "summary.txt"
    summary_file.write_text("summary text")
    cover_file = tmp_path / "covers.txt"
    cover_file.write_text("msg_1")

    with pytest.raises(SystemExit):
        run(
            "context",
            "compact",
            "ses_a",
            summary_file,
            "--cover",
            "msg_1",
            "--cover-file",
            cover_file,
        )
    assert len(calls) == 0


def test_compact_null_policy_stops_after_one_get(invoke, capsys, tmp_path):
    run, calls, _, state, _ = invoke
    summary_file = tmp_path / "summary.txt"
    summary_file.write_text("summary text")

    state["responses"] = [{"policy": None, "revision": 0}]

    assert (
        run(
            "context",
            "compact",
            "ses_a",
            summary_file,
            "--cover",
            "msg_1",
        )
        == 1
    )
    assert len(calls) == 1
    assert calls[0][0].full_url == "http://127.0.0.1:18551/context/ses_a"
    assert "Set context settings before compacting" in capsys.readouterr().err


def test_compact_pi_pinned_refusal_prints_details(invoke, capsys, tmp_path):
    run, calls, _, state, _ = invoke
    summary_file = tmp_path / "summary.txt"
    summary_file.write_text("summary text")

    state["responses"] = [
        {"policy": {"budget": {"contextWindowTokens": 1000}}, "revision": 5},
        {"revision": 3},
        HTTPError(
            "url",
            409,
            "Pinned messages",
            {},
            io.BytesIO(
                b'{"detail": {"code": "pinned", "message": "Cannot compact pinned messages"}}'
            ),
        ),
    ]

    assert (
        run(
            "context",
            "compact",
            "ses_a",
            summary_file,
            "--cover",
            "msg_1",
        )
        == 1
    )
    assert len(calls) == 3
    assert (
        "Pi refused this (pinned): Cannot compact pinned messages"
        in capsys.readouterr().err
    )


# --- compaction ---


def test_compaction_gets_status(invoke):
    run, calls, _, state, check_headers = invoke
    state["responses"] = [
        {
            "summaryRevision": 3,
            "covered": ["msg_1", "msg_2"],
            "folded": ["msg_1", "msg_2"],
        }
    ]
    assert run("context", "compaction", "ses_a") == 0
    assert len(calls) == 1
    check_headers(0)
    assert calls[0][0].full_url == "http://127.0.0.1:18551/context/ses_a/compaction"
    assert calls[0][0].data is None
