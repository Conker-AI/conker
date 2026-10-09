"""CLI skill and MCP commands preserve explicit identity, schema and authority."""

import hashlib
import io
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import conker as cli


@pytest.fixture
def invoke(monkeypatch):
    calls = []
    monkeypatch.setattr(cli, "read_config", lambda: {"test": True})

    def request(config, service, path, body=None):
        calls.append((service, path, body))
        return {"ok": True}

    monkeypatch.setattr(cli, "request", request)

    def run(*arguments):
        monkeypatch.setattr(sys, "argv", ["conker.py", *map(str, arguments)])
        return cli.cli()

    return run, calls


def discovery(tmp_path, **overrides):
    schema = {
        "type": "object",
        "properties": {"query": {"type": "string"}},
        "required": ["query"],
    }
    digest = hashlib.sha256(
        json.dumps(
            schema, sort_keys=True, separators=(",", ":"), ensure_ascii=False
        ).encode()
    ).hexdigest()
    value = {
        "server": {"url": "https://mcp.example.test/mcp"},
        "tools": [
            {
                "name": "search",
                "description": "Search documents",
                "inputSchema": schema,
                "schemaHash": digest,
            }
        ],
        **overrides,
    }
    path = tmp_path / "discovery.json"
    path.write_text(json.dumps(value), encoding="utf-8")
    return path, value


def test_thinking_is_explicit_and_recovery_names_saved_identity(invoke):
    run, calls = invoke
    request_id = "request_recovery_0001"
    assert run("chat", "s_one", "Hello", "--request-id", request_id) == 0
    assert "think" not in calls[-1][2]
    assert run("chat", "s_one", "Analyze", "--think", "--request-id", request_id) == 0
    assert calls[-1][2]["think"] is True
    assert run("thinking", "s_one") == 0
    assert calls[-1] == ("pi", "/sessions/s_one/thinking", None)
    assert run("submission", request_id) == 0
    assert calls[-1] == ("pi", f"/turn-submissions/{request_id}", None)
    assert run("stop", request_id) == 0
    assert calls[-1] == ("pi", f"/turn-submissions/{request_id}/cancel", {})
    assert run("resume", "turn_saved") == 0
    assert calls[-1] == ("pi", "/turns/turn_saved/resume", {})


@pytest.mark.parametrize(
    "arguments",
    [("stop", "short"), ("submission", "../outside"), ("resume", "turn/other")],
)
def test_recovery_rejects_invalid_identity_before_network(invoke, arguments):
    run, calls = invoke
    assert run(*arguments) == 1
    assert not calls


def test_skill_import_preserves_exact_source_and_replacement_identity(invoke, tmp_path):
    run, calls = invoke
    path = tmp_path / "SKILL.md"
    markdown = "---\r\nname: review\r\ndescription: Review\r\n---\r\nUse evidence.\r\n"
    path.write_bytes(markdown.encode())
    assert run("skills", "import", path) == 0
    assert calls[-1] == (
        "pi-owner",
        "/skills/import",
        {"markdown": markdown, "expected_revision": 0},
    )
    assert (
        run(
            "skills",
            "import",
            path,
            "--expected-revision",
            2,
            "--expected-id",
            "review",
        )
        == 0
    )
    assert calls[-1][2]["expected_id"] == "review"
    assert calls[-1][2]["expected_revision"] == 2
    count = len(calls)
    assert run("skills", "import", path, "--expected-revision", 2) == 1
    assert len(calls) == count


@pytest.mark.parametrize(
    "content", ["x" * 32001, "🦔" * 32001], ids=["ascii", "unicode"]
)
def test_skill_size_is_counted_in_characters_before_request(invoke, tmp_path, content):
    run, calls = invoke
    path = tmp_path / "SKILL.md"
    path.write_text(content, encoding="utf-8")
    assert run("skills", "import", path) == 1
    assert calls == []


def test_unicode_skill_and_chat_flags_are_preserved(invoke, tmp_path):
    run, calls = invoke
    path = tmp_path / "SKILL.md"
    text = "---\nname: review\ndescription: Review\n---\n" + "🦔" * 20000
    path.write_bytes(text.encode())
    assert run("skills", "import", path) == 0
    assert calls[-1][2]["markdown"] == text
    assert (
        run(
            "chat",
            "ses_123",
            "Review",
            "--skill",
            "review",
            "--skill",
            "verify",
            "--model",
            "local-fast",
            "--request-id",
            "request_identity_0001",
        )
        == 0
    )
    assert calls[-1] == (
        "pi",
        "/sessions/ses_123/turns",
        {
            "text": "Review",
            "request_id": "request_identity_0001",
            "skill_ids": ["review", "verify"],
            "model_id": "local-fast",
        },
    )


@pytest.mark.parametrize(
    "arguments",
    [
        ["chat", "ses_123", "x", "--skill", "same", "--skill", "same"],
        [
            "chat",
            "ses_123",
            "x",
            "--skill",
            "a",
            "--skill",
            "b",
            "--skill",
            "c",
            "--skill",
            "d",
        ],
        ["skills", "show", "../private"],
        ["skills", "state", "review", "--enabled", "true", "--expected-revision", "0"],
        ["chat", "../sessions", "x"],
        ["thinking", "ses_123", "--cancel", "../../x"],
        ["mcp", "access", "other.echo"],
        ["mcp", "access", "mcp.echo", "--expected-digest", "b" * 64],
        ["mcp", "access", "mcp.echo", "--enabled", "true"],
    ],
)
def test_invalid_identifiers_and_flags_fail_without_traceback(
    invoke, capsys, arguments
):
    run, calls = invoke
    assert run(*arguments) == 1
    assert calls == []
    assert "Traceback" not in capsys.readouterr().err


def test_mcp_discover_and_import_never_autogrant(invoke, tmp_path):
    run, calls = invoke
    assert (
        run(
            "mcp",
            "discover",
            "https://mcp.example.test/mcp",
            "--secret-ref",
            "MCP_TOKEN",
        )
        == 0
    )
    assert calls[-1] == (
        "toolgate-owner",
        "/v2/owner/mcp/discover",
        {"url": "https://mcp.example.test/mcp", "secret_ref": "MCP_TOKEN"},
    )
    path, value = discovery(tmp_path)
    assert (
        run(
            "mcp",
            "import",
            path,
            "--tool",
            "search",
            "--id",
            "mcp.search",
            "--secret-ref",
            "MCP_TOKEN",
        )
        == 0
    )
    assert len(calls) == 2 and calls[-1][1] == "/v2/owner/mcp/import"
    assert calls[-1][2]["input_schema"] == value["tools"][0]["inputSchema"]
    assert calls[-1][2]["schema_hash"] == value["tools"][0]["schemaHash"]
    assert "enabled" not in calls[-1][2] and "authorization" not in calls[-1][2]


@pytest.mark.parametrize(
    "value",
    [
        {},
        [],
        {"tools": []},
        {"tools": [None], "server": {}},
        {"tools": [{"name": "search"}], "server": {}},
        {"tools": [{"name": "search"}, {"name": "search"}], "server": {}},
    ],
)
def test_malformed_discovery_files_fail_without_traceback(
    invoke, tmp_path, capsys, value
):
    run, calls = invoke
    path = tmp_path / "bad.json"
    path.write_text(json.dumps(value))
    assert run("mcp", "import", path, "--tool", "search", "--id", "mcp.search") == 1
    assert calls == [] and "Traceback" not in capsys.readouterr().err


def test_mcp_import_rejects_changed_schema_hash(invoke, tmp_path):
    run, calls = invoke
    path, value = discovery(tmp_path)
    value["tools"][0]["inputSchema"]["properties"]["injected"] = {"type": "boolean"}
    path.write_text(json.dumps(value))
    assert run("mcp", "import", path, "--tool", "search", "--id", "mcp.search") == 1
    assert calls == []


def test_access_change_binds_exact_digest_and_read_has_no_write(invoke):
    run, calls = invoke
    assert run("mcp", "access", "mcp.search") == 0
    assert calls[-1] == (
        "toolgate-owner",
        "/v2/owner/mcp/tools/mcp.search/access",
        None,
    )
    assert (
        run(
            "mcp",
            "access",
            "mcp.search",
            "--enabled",
            "false",
            "--expected-digest",
            "b" * 64,
        )
        == 0
    )
    assert calls[-1][2] == {"enabled": False, "expected_digest": "b" * 64}


def test_owner_access_transport_uses_both_scoped_keys_and_no_proxy(monkeypatch):
    config = {
        "environments": {
            "gateway": {
                "GATEWAY_TOOLGATE_OWNER_KEY": "owner-key",
                "GATEWAY_TOOLGATE_EXECUTION_KEY": "execution-key",
            }
        }
    }
    captured = []

    class Opener:
        def open(self, request, timeout):
            captured.append(request)
            return io.BytesIO(b'{"ok":true}')

    def opener(*handlers):
        assert handlers[0].proxies == {}
        assert isinstance(handlers[1], cli.NoRedirect)
        return Opener()

    monkeypatch.setattr(cli, "build_opener", opener)
    cli.request(
        config,
        "toolgate-owner",
        "/v2/owner/mcp/tools/mcp.echo/access",
        {"enabled": True, "expected_digest": "b" * 64},
    )
    headers = {name.lower(): value for name, value in captured[0].header_items()}
    assert headers["x-toolgate-owner-key"] == "owner-key"
    assert headers["x-toolgate-execution-key"] == "execution-key"
    assert "x-toolgate-key" not in headers
    assert (
        captured[0].full_url
        == "http://127.0.0.1:18510/v2/owner/mcp/tools/mcp.echo/access"
    )


def test_missing_and_non_utf8_files_fail_without_traceback(invoke, tmp_path, capsys):
    run, calls = invoke
    assert run("skills", "import", tmp_path / "missing.md") == 1
    path = tmp_path / "bad.md"
    path.write_bytes(b"\xff\xfe")
    assert run("skills", "import", path) == 1
    assert calls == [] and "Traceback" not in capsys.readouterr().err
