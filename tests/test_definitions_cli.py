"""conker definitions: one list of everything the owner organizes, read from Pi."""

import io
import json
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import conker as cli

LISTING = {
    "schemaVersion": 1,
    "results": [{"kind": "agent", "id": "companion", "name": "Jev"}],
}


def run(monkeypatch, capsys, *arguments):
    sent = []

    class Opener:
        def open(self, request, timeout):
            sent.append(request)
            return io.BytesIO(json.dumps(LISTING).encode())

    monkeypatch.setattr(
        cli,
        "read_config",
        lambda: {"environments": {"pi": {"PI_ADMIN_KEY": "fixture-admin-key"}}},
    )
    monkeypatch.setattr(cli, "build_opener", lambda *handlers: Opener())
    monkeypatch.setattr(sys, "argv", ["conker.py", "definitions", *arguments])
    assert cli.cli() == 0
    return sent, json.loads(capsys.readouterr().out)


def test_lists_everything_with_the_admin_key(monkeypatch, capsys):
    sent, value = run(monkeypatch, capsys)
    url = urlsplit(sent[0].full_url)
    assert url.path == "/definitions" and parse_qs(url.query) == {"archived": ["false"]}
    assert sent[0].get_method() == "GET"
    assert dict(sent[0].header_items()).get("X-pi-key") == "fixture-admin-key"
    assert value == LISTING


def test_kind_search_and_archived_reach_pi_encoded(monkeypatch, capsys):
    sent, _ = run(
        monkeypatch,
        capsys,
        "--kind",
        "template",
        "--search",
        "research & review",
        "--archived",
    )
    assert parse_qs(urlsplit(sent[0].full_url).query) == {
        "archived": ["true"],
        "kind": ["template"],
        "search": ["research & review"],
    }
