"""Refusals of the two local acceptance scripts: the editor workflow check and the memory turn check.

The workflow check is driven through its public `run(request)` with an in-memory stand-in for the
ToolGate editor routes. The memory turn check is driven through `main()` with a throwaway workspace
(a SQLite file and a stubbed MemoryGate answer) in tmp_path, so nothing here needs a running stack.
"""

from __future__ import annotations

import io
import json
import sqlite3
import sys
from contextlib import closing

import pytest

from scripts import check_local_memory_turn, check_local_workflow


class FakeToolGate:
    """The editor-draft routes the workflow check calls, with knobs for each way they can go wrong."""

    def __init__(self, *, code="OK", replay_changes=False, history_extra=0, grant_sticks=False):
        self.code = code
        self.replay_changes = replay_changes
        self.history_extra = history_extra
        self.grant_sticks = grant_sticks
        self.calls: list[tuple[str, dict]] = []
        self.runs: dict[str, dict] = {}

    def __call__(self, path, body: dict | None = None):
        body = body or {}
        self.calls.append((path, body))
        if path.endswith("/publish"):
            return {"version": 1, "digest": "d" * 8, "automation_id": "auto-" + path.split("/")[0]}
        if path.endswith("/access"):
            return {"enabled": True if self.grant_sticks else body["enabled"]}
        if path.endswith("/runs"):
            return self.run_route(body)
        return {}

    def run_route(self, body):
        if not body:
            return {"items": [{}] * (len(self.runs) + self.history_extra)}
        key = body["action_id"]
        if key in self.runs:
            replay = dict(self.runs[key])
            if self.replay_changes:
                replay["code"] = "REPLAYED"
            return replay
        enabled = body["args"]["enabled"]
        outcome = {
            "code": self.code,
            "result": {
                "result": {
                    "items": ["one", "two"],
                    "cost": 6,
                    "decision": "yes" if enabled else "no",
                }
            },
        }
        self.runs[key] = outcome
        return outcome

    def access_changes(self):
        return [(path, body["enabled"]) for path, body in self.calls if path.endswith("/access")]


def test_workflow_check_runs_both_branches_and_removes_its_grants(capsys):
    gate = FakeToolGate()
    check_local_workflow.run(gate)
    report = json.loads(capsys.readouterr().out)
    assert report["temporary_grants_removed"] is True
    assert report["loop_and_calculation"] == "verified"
    assert [item["branch"] for item in report["outcomes"]] == [True, False]
    changes = gate.access_changes()
    assert [enabled for _, enabled in changes] == [True, False, False]
    assert changes[0][0] == report["parent_draft"] + "/access"
    assert {path for path, _ in changes[1:]} == {
        report["parent_draft"] + "/access",
        report["child_draft"] + "/access",
    }


def test_workflow_check_refuses_a_run_that_is_not_ok_and_still_removes_grants():
    gate = FakeToolGate(code="DENIED")
    with pytest.raises(AssertionError) as raised:
        check_local_workflow.run(gate)
    assert str(raised.value) == "DENIED"
    assert [enabled for _, enabled in gate.access_changes()] == [True, False, False]


def test_workflow_check_refuses_a_replay_that_changes_the_recorded_outcome():
    with pytest.raises(AssertionError) as raised:
        check_local_workflow.run(FakeToolGate(replay_changes=True))
    assert str(raised.value) == "Replay changed the recorded outcome"


def test_workflow_check_refuses_a_history_that_is_not_two_actions():
    with pytest.raises(AssertionError) as raised:
        check_local_workflow.run(FakeToolGate(history_extra=1))
    assert str(raised.value) == "Expected exactly two recorded actions"


def test_workflow_check_names_the_drafts_whose_access_could_not_be_removed():
    with pytest.raises(RuntimeError) as raised:
        check_local_workflow.run(FakeToolGate(grant_sticks=True))
    message = str(raised.value)
    assert message.startswith("Remove temporary workflow access for: check-parent-")
    assert ", check-child-" in message


# ---- memory turn check -------------------------------------------------------------------


def memory(identity, session="other-session"):
    return {
        "id": identity,
        "text": "text " + identity,
        "summary": "summary " + identity,
        "source_type": "chat",
        "confidence": 0.9,
        "do_not_generalize": False,
        "citations": [{"session_id": session}],
    }


@pytest.fixture()
def workspace(tmp_path, monkeypatch):
    """A fake .local-run; the returned function saves one turn and its memory context."""
    state = tmp_path / ".local-run"
    (state / "pi").mkdir(parents=True)
    config = {
        "environments": {
            "pi": {"PI_MEMORYGATE_READ_KEY": "read-key", "PI_MEMORYGATE_AGENT_ID": "agent"}
        },
        "ports": {"memorygate": 8999},
    }
    (state / "configuration.json").write_text(json.dumps(config), encoding="utf-8")
    monkeypatch.setattr(check_local_memory_turn, "ROOT", tmp_path)

    def save(
        *, status="complete", saved=True, memories=None, status_of_ranking="ranked", prefix=None
    ):
        records = memories if memories is not None else [memory("m1"), memory("m2")]
        package = {
            "query": "what do I like",
            "memories": records,
            "retrieval": {
                "reranking": {"status": status_of_ranking, "order": ["m1", "m2"]}
                if status_of_ranking == "ranked"
                else {"status": status_of_ranking}
            },
        }
        with closing(sqlite3.connect(state / "pi/pi.db")) as db:
            db.execute("CREATE TABLE turns (id TEXT, status TEXT, session_id TEXT)")
            db.execute("CREATE TABLE memory_contexts (turn_id TEXT, status TEXT, package TEXT)")
            db.execute("CREATE TABLE turn_context_inputs (turn_id TEXT, prefix TEXT)")
            db.execute("INSERT INTO turns VALUES ('t1', ?, 'recall-session')", (status,))
            if saved:
                db.execute(
                    "INSERT INTO memory_contexts VALUES ('t1', 'used', ?)", (json.dumps(package),)
                )
            shown = prefix if prefix is not None else " ".join(r["id"] for r in records)
            db.execute("INSERT INTO turn_context_inputs VALUES ('t1', ?)", (shown,))
            db.commit()
        return records

    return save


def serve_live(monkeypatch, records):
    seen = {}

    def urlopen(request, timeout):
        seen["url"] = request.full_url
        seen["headers"] = {k.lower(): v for k, v in request.header_items()}
        return io.StringIO(json.dumps({"scope": "selected", "memories": records}))

    monkeypatch.setattr(check_local_memory_turn.urllib.request, "urlopen", urlopen)
    return seen


def run_main(monkeypatch, *argv):
    monkeypatch.setattr(sys, "argv", ["check_local_memory_turn.py", *argv])
    check_local_memory_turn.main()


def test_memory_check_passes_and_asks_the_workspace_port(workspace, monkeypatch, capsys):
    seen = serve_live(monkeypatch, workspace())
    run_main(monkeypatch, "--turn-id", "t1")
    report = json.loads(capsys.readouterr().out)
    assert report["record_count"] == 2
    assert report["source_content_preserved"] is True
    assert seen["url"] == "http://127.0.0.1:8999/runtime/context"
    assert seen["headers"]["x-memorygate-key"] == "read-key"
    assert seen["headers"]["x-agent-id"] == "agent"


def test_memory_check_accepts_the_fallback_ranking_when_it_is_expected(
    workspace, monkeypatch, capsys
):
    serve_live(monkeypatch, workspace(status_of_ranking="fallback"))
    run_main(monkeypatch, "--turn-id", "t1", "--expected-ranking", "fallback")
    assert json.loads(capsys.readouterr().out)["ranking"] == {"status": "fallback"}


@pytest.mark.parametrize(
    ("options", "message"),
    [
        ({"status": "running"}, "Choose a completed real recall turn"),
        ({"saved": False}, "No saved memory context"),
        ({"memories": [memory("m1")]}, "At least two real retrieved memories are needed"),
        (
            {"memories": [memory("m2"), memory("m1")]},
            "",  # the ranking order assertion carries no message
        ),
        ({"prefix": "nothing relevant"}, "Answer context is missing retrieved records"),
    ],
)
def test_memory_check_refuses_a_turn_that_does_not_qualify(
    workspace, monkeypatch, options, message
):
    workspace(**options)
    with pytest.raises(AssertionError) as raised:
        run_main(monkeypatch, "--turn-id", "t1")
    assert str(raised.value) == message


def test_memory_check_refuses_an_unexpected_ranking_outcome(workspace, monkeypatch):
    workspace()
    with pytest.raises(AssertionError) as raised:
        run_main(monkeypatch, "--turn-id", "t1", "--expected-ranking", "fallback")
    assert str(raised.value) == "Unexpected ranking outcome"


def test_memory_check_refuses_source_content_that_changed(workspace, monkeypatch):
    records = workspace()
    serve_live(monkeypatch, [dict(r, text="edited") for r in records])
    with pytest.raises(AssertionError) as raised:
        run_main(monkeypatch, "--turn-id", "t1")
    assert str(raised.value) == "Retrieved source content changed"


def test_memory_check_refuses_citations_from_the_answering_session(workspace, monkeypatch):
    serve_live(
        monkeypatch,
        workspace(memories=[memory("m1", "recall-session"), memory("m2", "recall-session")]),
    )
    with pytest.raises(AssertionError) as raised:
        run_main(monkeypatch, "--turn-id", "t1")
    assert str(raised.value) == "Use a separate recall session"


def test_memory_check_refuses_records_without_a_citation(workspace, monkeypatch):
    bare = [dict(memory("m1"), citations=[]), dict(memory("m2"), citations=[])]
    serve_live(monkeypatch, workspace(memories=bare))
    with pytest.raises(AssertionError) as raised:
        run_main(monkeypatch, "--turn-id", "t1")
    assert str(raised.value) == "Missing source citation"


def test_memory_check_needs_a_turn_id(monkeypatch, capsys):
    with pytest.raises(SystemExit) as raised:
        run_main(monkeypatch)
    assert raised.value.code == 2
    assert "--turn-id" in capsys.readouterr().err
