"""conker definitions: one list of everything the owner organizes, read from Pi."""

import io
import json
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from scripts import conker as cli

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


USES = {
    "memoryId": "mem_1",
    "since": 1770000000.0,
    "total": 3,
    "chats": 2,
    "items": [
        {
            "sessionId": "ses_a",
            "sessionTitle": "  Training\nplans ",
            "turnId": "turn_2",
            "source": "context",
            "revision": 2,
            "at": 1770003600.0,
        },
        {
            "sessionId": "ses_b",
            "sessionTitle": "",
            "turnId": "turn_1",
            "source": "recall",
            "revision": None,
            "at": 1770000000.0,
        },
    ],
    "nextAfter": "1770000000.0|turn_1|recall",
}


def test_memory_used_flags_map_to_the_path_and_query(monkeypatch, capsys):
    code, sent, out = calls(
        monkeypatch,
        capsys,
        ["memory", "used", "mem_1", "--limit", "7", "--after", "1.5|turn_1|recall", "--json"],
        [USES],
    )
    assert code == 0 and json.loads(out.out) == USES
    url = urlsplit(sent[0].full_url)
    assert url.path == "/memory/mem_1/uses" and sent[0].get_method() == "GET"
    assert parse_qs(url.query) == {"limit": ["7"], "after": ["1.5|turn_1|recall"]}
    code, sent, _ = calls(monkeypatch, capsys, ["memory", "used", "mem_1"], [USES])
    assert parse_qs(urlsplit(sent[0].full_url).query) == {"limit": ["20"]}


def test_memory_used_prints_one_line_per_use_and_the_next_page(monkeypatch, capsys):
    code, _, out = calls(monkeypatch, capsys, ["memory", "used", "mem_1"], [USES])
    assert code == 0
    assert out.out.splitlines() == [
        "mem_1 was used in 3 answers in 2 chats (noted since 2026-02-02 02:40 UTC).",
        "2026-02-02 03:40  context  Training plans  (chat ses_a, turn turn_2 rev 2)",
        "2026-02-02 02:40  recall   (untitled)  (chat ses_b, turn turn_1)",
        "Next page: --after 1770000000.0|turn_1|recall",
    ]


def test_memory_used_says_when_nothing_is_noted(monkeypatch, capsys):
    empty = {**USES, "total": 0, "chats": 0, "items": [], "nextAfter": None}
    code, _, out = calls(monkeypatch, capsys, ["memory", "used", "mem_1"], [empty])
    assert code == 0 and out.out.startswith("No answers are noted as using mem_1 since 2026-02-02")
    never = {**empty, "since": None}
    _, _, out = calls(monkeypatch, capsys, ["memory", "used", "mem_1"], [never])
    assert "Pi has noted no uses yet" in out.out


def test_memory_used_refuses_bad_input_before_calling_pi(monkeypatch, capsys):
    for arguments in (
        ["memory", "used", "bad id"],
        ["memory", "used", "../sessions"],
        ["memory", "used", "x" * 201],
        ["memory", "used", "mem_1", "--limit", "0"],
        ["memory", "used", "mem_1", "--limit", "101"],
        ["memory", "used", "mem_1", "--after", "   "],
    ):
        code, sent, out = calls(monkeypatch, capsys, arguments)
        assert code == 1 and sent == [] and out.err, arguments


def _group(*items, total=None):
    return {"items": list(items), "total": len(items) if total is None else total}


UPKEEP = {
    "agentId": "companion",
    "checkedAt": "2026-11-14T08:00:00+00:00",
    "memoriesChecked": 12,
    "truncated": False,
    "exactDuplicates": _group({"ids": ["m1", "m2"], "reason": "same text", "conflictId": None}),
    "nearDuplicates": _group(),
    "contradictions": _group(
        {"ids": ["m3", "m4"], "reason": "say different things", "conflictId": "c1"}
    ),
    "expired": _group(),
    "notRecalled": _group(
        {"ids": ["m5"], "reason": "never recalled", "conflictId": None}, total=4
    ),
    "memories": {
        "m1": {"text": "Tea at\nfour", "revision": 1},
        "m2": {"text": "Tea at four", "revision": 3},
        "m3": {"text": "Lives in Riga", "revision": 1},
        "m4": {"text": "Lives in Tallinn", "revision": 2},
    },
}


def test_memory_upkeep_flags_map_to_the_query(monkeypatch, capsys):
    code, sent, out = calls(
        monkeypatch,
        capsys,
        ["memory", "upkeep", "--unused-days", "30", "--limit", "5", "--json"],
        [UPKEEP],
    )
    assert code == 0 and json.loads(out.out) == UPKEEP
    url = urlsplit(sent[0].full_url)
    assert url.path == "/memory/upkeep" and sent[0].get_method() == "GET"
    assert parse_qs(url.query) == {"unused_days": ["30"], "limit": ["5"]}
    code, sent, _ = calls(monkeypatch, capsys, ["memory", "upkeep", "--json"], [UPKEEP])
    assert parse_qs(urlsplit(sent[0].full_url).query) == {
        "unused_days": ["90"],
        "limit": ["50"],
    }


def test_memory_upkeep_prints_each_group_with_the_words(monkeypatch, capsys):
    code, _, out = calls(monkeypatch, capsys, ["memory", "upkeep"], [UPKEEP])
    assert code == 0
    assert out.out.splitlines() == [
        "Checked 12 memories.",
        "duplicate  m1,m2  same text",
        "    m1 rev 1  Tea at four",
        "    m2 rev 3  Tea at four",
        "contradiction  m3,m4  say different things",
        "    m3 rev 1  Lives in Riga",
        "    m4 rev 2  Lives in Tallinn",
        "unused  m5  never recalled",
        "unused  ... and 3 more (raise --limit)",
    ]


def test_memory_upkeep_says_when_there_is_nothing(monkeypatch, capsys):
    empty = {**UPKEEP, "truncated": True, "memories": {}}
    for key in ("exactDuplicates", "contradictions", "notRecalled"):
        empty[key] = _group()
    code, _, out = calls(monkeypatch, capsys, ["memory", "upkeep"], [empty])
    assert code == 0
    assert out.out.splitlines() == [
        "Checked 12 memories. Only the newest were checked; run it again after tidying these.",
        "Nothing to tidy.",
    ]


def test_memory_upkeep_refuses_bad_flags_before_calling_pi(monkeypatch, capsys):
    for arguments in (
        ["memory", "upkeep", "--unused-days", "0"],
        ["memory", "upkeep", "--unused-days", "3651"],
        ["memory", "upkeep", "--limit", "0"],
        ["memory", "upkeep", "--limit", "501"],
    ):
        code, sent, out = calls(monkeypatch, capsys, arguments)
        assert code == 1 and sent == [] and out.err
