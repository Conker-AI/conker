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


# The owner's own counterparts of conker.recall, conker.create_agent and conker.create_team.
RESEARCH = {
    "id": "agent_" + "1" * 32,
    "kind": "agent",
    "archived_at": None,
    "configuration": {"name": "Research partner", "toolIds": ["research.search"]},
}
OLD = {
    "id": "agent_" + "2" * 32,
    "kind": "agent",
    "archived_at": 1.0,
    "configuration": {"name": "Old helper", "toolIds": []},
}
COMPANION = {
    "id": "companion",
    "kind": "companion",
    "archived_at": None,
    "configuration": {"name": "Jev", "toolIds": ["calendar.read", "research.fetch"]},
}


def calls(monkeypatch, capsys, arguments, answers=()):
    sent, pending = [], list(answers)

    class Opener:
        def open(self, request, timeout):
            sent.append(request)
            return io.BytesIO(json.dumps(pending.pop(0) if pending else {"ok": True}).encode())

    monkeypatch.setattr(
        cli,
        "read_config",
        lambda: {"environments": {"pi": {"PI_ADMIN_KEY": "fixture-admin-key"}}},
    )
    monkeypatch.setattr(cli, "build_opener", lambda *handlers: Opener())
    monkeypatch.setattr(sys, "argv", ["conker.py", *arguments])
    code = cli.cli()
    captured = capsys.readouterr()
    return code, sent, captured


def body(request):
    return json.loads(request.data.decode())


def test_memory_search_reads_the_memory_screen_route(monkeypatch, capsys):
    code, sent, out = calls(
        monkeypatch, capsys, ["memory", "search", "  exam & room ", "--limit", "5"]
    )
    assert code == 0 and json.loads(out.out) == {"ok": True}
    url = urlsplit(sent[0].full_url)
    assert url.path == "/memory/objects" and sent[0].get_method() == "GET"
    assert parse_qs(url.query) == {"search": ["exam & room"], "limit": ["5"]}


def test_memory_search_refuses_bad_input_before_calling_pi(monkeypatch, capsys):
    for arguments in (["memory", "search", "   "], ["memory", "search", "x" * 201],
                      ["memory", "search", "exam", "--limit", "51"]):
        code, sent, out = calls(monkeypatch, capsys, arguments)
        assert code == 1 and sent == [] and out.err


def test_agent_create_posts_one_owner_agent(monkeypatch, capsys):
    code, sent, _ = calls(monkeypatch, capsys, [
        "agent", "create", "--name", " Exam coach ", "--role", "Quizzes me",
        "--instructions", "Ask one question at a time.", "--tool", "research.search",
        "--tool", "research.search", "--tool", "calendar.read",
    ])
    assert code == 0 and len(sent) == 1
    assert urlsplit(sent[0].full_url).path == "/agents" and sent[0].get_method() == "POST"
    assert body(sent[0]) == {
        "name": "Exam coach",
        "role": "Quizzes me",
        "instructions": "Ask one question at a time.",
        "modelId": None,
        "toolIds": ["research.search", "calendar.read"],
        "toolAccess": {},
        "memory": {"scope": "conversation", "memoryIds": []},
    }


def test_agent_create_takes_model_and_memory_and_refuses_blank_names(monkeypatch, capsys):
    code, sent, _ = calls(monkeypatch, capsys, [
        "agent", "create", "--name", "Coach", "--role", "r", "--instructions", "i",
        "--model", "openrouter/x", "--memory", "none",
    ])
    assert code == 0
    assert body(sent[0])["modelId"] == "openrouter/x"
    assert body(sent[0])["memory"] == {"scope": "none", "memoryIds": []}
    code, sent, out = calls(monkeypatch, capsys, [
        "agent", "create", "--name", "  ", "--role", "r", "--instructions", "i",
    ])
    assert code == 1 and sent == [] and "--name" in out.err


def test_team_create_builds_a_linear_team_from_existing_agents(monkeypatch, capsys):
    code, sent, _ = calls(monkeypatch, capsys, [
        "team", "create", "--name", "Essay review", "--objective", "Check then edit.",
        "--role", "Fact checker", "research partner", "Check every date.",
        "--role", "Editor", "companion", "Tighten the writing.",
    ], answers=[{"schemaVersion": 1, "results": [COMPANION, RESEARCH, OLD]}])
    assert code == 0 and [urlsplit(r.full_url).path for r in sent] == [
        "/agents", "/collaboration/teams"
    ]
    team = body(sent[1])
    assert [(role["id"], role["name"], role["agentId"], role["toolIds"]) for role in team["roles"]] == [
        ("role1", "Fact checker", RESEARCH["id"], ["research.search"]),
        ("role2", "Editor", "companion", ["calendar.read", "research.fetch"]),
    ]
    assert all(role["memory"] == {"scope": "none", "memoryIds": []} for role in team["roles"])
    assert team["handoffs"] == [{
        "id": "handoff1", "fromRoleId": "role1", "toRoleId": "role2",
        "condition": "The owner reviewed the result of Fact checker.",
        "payload": "result_only", "maxTransfers": 1,
    }]
    assert team["budget"] == {"maxTurns": 4, "maxTokens": 100000, "maxCostCents": 50, "maxHandoffs": 1}


def test_team_create_refuses_unknown_and_archived_agents(monkeypatch, capsys):
    for agent, words in (("Nobody", "no agent"), ("Old helper", "archived")):
        code, sent, out = calls(monkeypatch, capsys, [
            "team", "create", "--name", "T", "--objective", "O",
            "--role", "One", agent, "Do it.",
        ], answers=[{"schemaVersion": 1, "results": [RESEARCH, OLD]}])
        assert code == 1 and len(sent) == 1 and words in out.err


BELIEFS = {
    "agentId": "companion",
    "total": 2,
    "counts": {"stated": 1, "concluded": 1, "needsReview": 1},
    "items": [
        {
            "id": "m1",
            "revision": 2,
            "text": "I prefer green tea\nin the afternoon",
            "origin": "stated",
            "confidence": "medium",
            "evidence": {"supporting": 0, "withdrawn": 0},
        },
        {
            "id": "m2",
            "revision": 1,
            "text": "Studies on Sundays",
            "origin": "concluded",
            "confidence": None,
            "evidence": {"supporting": 3, "withdrawn": 1},
        },
    ],
    "nextAfter": "eyJ4IjogMX0",
}


def test_memory_beliefs_flags_map_to_the_query(monkeypatch, capsys):
    code, sent, out = calls(
        monkeypatch,
        capsys,
        ["memory", "beliefs", "--concluded", "--review", "--type", "fact", "--limit", "7",
         "--after", "eyJ4IjogMX0", "--json"],
        [BELIEFS],
    )
    assert code == 0 and json.loads(out.out) == BELIEFS
    url = urlsplit(sent[0].full_url)
    assert url.path == "/memory/beliefs" and sent[0].get_method() == "GET"
    assert parse_qs(url.query) == {
        "origin": ["concluded"],
        "state": ["needs_review"],
        "memory_type": ["fact"],
        "limit": ["7"],
        "after": ["eyJ4IjogMX0"],
    }
    code, sent, _ = calls(monkeypatch, capsys, ["memory", "beliefs", "--stated"], [BELIEFS])
    assert parse_qs(urlsplit(sent[0].full_url).query) == {"origin": ["stated"], "limit": ["50"]}


def test_memory_beliefs_prints_one_line_per_belief_and_the_next_page(monkeypatch, capsys):
    code, _, out = calls(monkeypatch, capsys, ["memory", "beliefs"], [BELIEFS])
    assert code == 0
    assert out.out.splitlines() == [
        "Conker believes 2 things about you: 1 you told it, 1 it concluded, 1 waiting for review.",
        "stated     medium  backed-by-0  I prefer green tea in the afternoon  (m1 rev 2)",
        "concluded  -       backed-by-3  Studies on Sundays  (m2 rev 1)",
        "Next page: --after eyJ4IjogMX0",
    ]


def test_memory_beliefs_refuses_bad_flags_before_calling_pi(monkeypatch, capsys):
    for arguments in (
        ["memory", "beliefs", "--limit", "0"],
        ["memory", "beliefs", "--limit", "101"],
        ["memory", "beliefs", "--after", "   "],
    ):
        code, sent, out = calls(monkeypatch, capsys, arguments)
        assert code == 1 and sent == [] and out.err
