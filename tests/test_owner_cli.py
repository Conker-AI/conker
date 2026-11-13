"""The installed launcher's owner commands (scripts/owner_cli.py), and the rule that every command
of the development CLI either has a launcher route or is named here as development-only."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import config_cli  # noqa: E402
import owner_cli  # noqa: E402
from conker_parser import build_parser  # noqa: E402

# Development CLI commands an installed stack does not route, and why. Route a command (and drop it
# here) rather than add to this list; a new command must land in one or the other.
DEV_ONLY = {
    "api": "a raw call to any service route: development only",
    "auth": "the launcher's `conker auth` is the gateway's sign-in, another command",
    "chat": "chats are held in the dashboard",
    "definitions": "read in the dashboard",
    "draft": "drafts are made in the dashboard",
    "files": "files are opened in the dashboard",
    "limits": "plan usage is shown in the dashboard",
    "mcp": "MCP tools are managed in the dashboard",
    "memory-delivery": "a development probe of memory delivery",
    "memory-edit": "memory is corrected in the dashboard",
    "memory-forget-pending": "a development probe of the forget queue",
    "message": "message rules are set in the dashboard",
    "models": "`conker model` and Settings > Models",
    "native": "native sessions are read in the dashboard",
    "native-sessions": "native sessions are read in the dashboard",
    "new": "chats are held in the dashboard",
    "output": "chat output is set in the dashboard",
    "profiles": "read in the dashboard",
    "resume": "chats are held in the dashboard",
    "sessions": "chats are held in the dashboard",
    "show": "chats are held in the dashboard",
    "skills": "skills are managed in the dashboard",
    "stop": "the launcher's `conker stop` stops the stack, another command",
    "submission": "chats are held in the dashboard",
    "suggest": "chats are held in the dashboard",
    "thinking": "chats are held in the dashboard",
    "title": "chats are held in the dashboard",
    "tool-access": "`conker inspect tool-access`",
    "tool-card": "tools are reviewed in the dashboard",
    "usage": "chats are held in the dashboard",
    "workflow": "workflows are made in the dashboard",
}
# Development commands whose name the launcher uses for something else.
ANOTHER_COMMAND = {"auth", "stop"}


def parser_verbs() -> set[str]:
    action = next(a for a in build_parser("conker")._actions if a.dest == "command")
    return set(action.choices or ())


def launcher_verbs() -> set[str]:
    """Every name a `case "$command" in` block of the launcher routes."""
    text = (ROOT / "conker").read_text(encoding="utf-8")
    routed = set()
    for block in re.findall(r'^case "\$command" in\n(.*?)^esac', text, re.M | re.S):
        for labels in re.findall(r"^    ([a-z|-]+)\)", block, re.M):
            routed.update(labels.split("|"))
    return routed


def test_every_development_command_has_a_launcher_route_or_says_why_not():
    verbs, routed = parser_verbs(), launcher_verbs()
    missing = verbs - routed - set(DEV_ONLY)
    assert not missing, f"route these in ./conker or name them in DEV_ONLY: {sorted(missing)}"
    assert set(DEV_ONLY) <= verbs, "DEV_ONLY names a command the CLI no longer has"
    assert set(DEV_ONLY) & routed == ANOTHER_COMMAND


def test_the_owner_commands_are_routed_to_the_owner_cli():
    assert set(owner_cli.COMMANDS) <= launcher_verbs()
    assert "cmd_owner" in (ROOT / "conker").read_text(encoding="utf-8")


# --- the relay: only the routes these commands use ---------------------------------------------


@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("/owner/settings", None),
        ("/sessions", None),
        ("/memory/objects", {"forget": True}),  # GET only
        ("/agents/companion", None),
        ("/inference/spending", {}),
    ],
)
def test_nothing_outside_the_commands_routes_is_reached(monkeypatch, path, body):
    monkeypatch.setattr(config_cli.subprocess, "run", lambda *a, **k: pytest.fail("sent"))
    call = owner_cli.caller(["docker", "compose"])
    with pytest.raises(ValueError, match="cannot be reached from this command"):
        call(None, "pi", path, body)
    with pytest.raises(ValueError, match="cannot be reached from this command"):
        call(None, "toolgate-owner", "/inbox")


class Relay:
    """Pi in its container: answers each relayed call from `answers` by (method, path)."""

    def __init__(self, monkeypatch, answers):
        self.answers, self.sent = answers, []
        monkeypatch.setattr(config_cli.subprocess, "run", self.run)

    def run(self, argv, **options):
        method, path = argv[-2:]
        body = json.loads(options["input"]) if options["input"] else None
        self.sent.append((method, path, body))
        status, value = self.answers[(method, path)]
        stdout = f"{status}\n".encode() + json.dumps(value).encode()
        return SimpleNamespace(returncode=0, stdout=stdout, stderr=b"")


def main(*argv: str) -> int:
    return owner_cli.main(["--root", "/srv/conker", "--layout", "ubuntu", *argv])


def test_memory_search_sends_its_words_as_a_query(monkeypatch, capsys):
    relay = Relay(
        monkeypatch,
        {("GET", "/memory/objects?search=coffee+%26+tea&limit=5"): (200, {"results": []})},
    )
    assert main("memory", "search", "coffee & tea", "--limit", "5") == 0
    assert relay.sent == [("GET", "/memory/objects?search=coffee+%26+tea&limit=5", None)]
    assert json.loads(capsys.readouterr().out) == {"results": []}


def test_a_query_cannot_change_the_checked_path(monkeypatch):
    relay = Relay(monkeypatch, {("GET", "/inbox?a=%2F..%2Fsessions"): (200, {})})
    config_cli.request(["docker"], "pi", "/inbox", query={"a": "/../sessions"})
    assert relay.sent == [("GET", "/inbox?a=%2F..%2Fsessions", None)]
    with pytest.raises(ValueError, match="not a settings home"):
        config_cli.request(["docker"], "pi", "/inbox?a=1")


def test_agent_create_posts_the_agent(monkeypatch, capsys):
    relay = Relay(monkeypatch, {("POST", "/agents"): (200, {"id": "agent_" + "a" * 32})})
    arguments = ["--name", "Scout", "--role", "Finds things", "--instructions", "Look."]
    assert main("agent", "create", *arguments) == 0
    [(method, path, body)] = relay.sent
    assert (method, path, body["name"]) == ("POST", "/agents", "Scout")
    assert json.loads(capsys.readouterr().out)["id"].startswith("agent_")


def test_the_inbox_is_printed(monkeypatch, capsys):
    Relay(monkeypatch, {("GET", "/inbox"): (200, {"needsYou": [], "handled": []})})
    assert main("inbox", "--json") == 0
    assert json.loads(capsys.readouterr().out) == {"needsYou": [], "handled": []}


def test_a_spending_cap_change_saves_only_the_cap_at_the_read_revision(monkeypatch, capsys):
    cap = {"enabled": True, "cents": 500, "tokens": 2_000_000}
    preferences = {"spendingCap": cap, "other": 1}
    saved = {"revision": 8, "preferences": {**preferences, "spendingCap": {**cap, "cents": 300}}}
    relay = Relay(
        monkeypatch,
        {
            ("GET", "/owner/preferences"): (200, {"revision": 7, "preferences": preferences}),
            ("POST", "/owner/preferences"): (200, saved),
        },
    )
    assert main("spending", "cap", "--dollars", "3") == 0
    read, write = relay.sent
    assert read == ("GET", "/owner/preferences", None)
    assert write[2] == {
        "expected_revision": 7,
        "preferences": {"spendingCap": {**cap, "cents": 300}, "other": 1},
    }
    assert json.loads(capsys.readouterr().out)["spendingCap"]["cents"] == 300


def test_a_refusal_says_pis_words_and_exits_1(monkeypatch, capsys):
    refused = {"detail": "Team names are unique"}
    Relay(monkeypatch, {("GET", "/inference/spending"): (409, refused)})
    assert main("spending") == 1
    assert "changed while the command ran" in capsys.readouterr().err
    Relay(monkeypatch, {("GET", "/inbox"): (503, refused)})
    assert main("inbox") == 1
    assert "refused it (HTTP 503): Team names are unique." in capsys.readouterr().err


def test_bad_input_is_refused_before_anything_is_sent(monkeypatch, capsys):
    monkeypatch.setattr(config_cli.subprocess, "run", lambda *a, **k: pytest.fail("sent"))
    assert main("spending", "cap") == 2
    assert "Say what to change" in capsys.readouterr().err


# --- the launcher --------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "argv",
    [["memory", "search", "coffee"], ["inbox", "--json"], ["spending"], ["team", "create"]],
)
def test_the_launcher_forwards_the_owner_commands(ubuntu_cli, argv):
    script = ubuntu_cli.deployment / "sources/companion/scripts/owner_cli.py"
    script.write_text("import json, sys\nprint(json.dumps(sys.argv[1:]))\n", encoding="utf-8")

    result = ubuntu_cli(*argv)

    assert result.returncode == 0, result.stderr
    forwarded = json.loads(result.stdout.strip().splitlines()[-1])
    assert forwarded == ["--root", str(ubuntu_cli.deployment), "--layout", "ubuntu", *argv]
