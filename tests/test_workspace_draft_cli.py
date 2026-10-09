"""Owner draft commands preserve intent, optimistic revisions, and replay identity."""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import conker as cli


@pytest.fixture
def invoke(monkeypatch):
    calls = []
    monkeypatch.setattr(cli, "read_config", dict)

    def request(config, service, path, body=None):
        calls.append((service, path, body))
        return {"ok": True}

    monkeypatch.setattr(cli, "request", request)

    def run(*arguments):
        monkeypatch.setattr(sys, "argv", ["conker.py", *map(str, arguments)])
        return cli.cli()

    return run, calls


def write_draft(tmp_path, value):
    path = tmp_path / "draft.json"
    path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
    return path


def test_new_draft_keeps_exact_intent_and_start_identity(invoke, tmp_path):
    run, calls = invoke
    intent = {
        "text": "  שלום 🦔\nA private, unsent thought.  ",
        "model_id": "local-answer",
        "skill_ids": ["review-code"],
        "think": True,
        "research_mode": "off",
        "agent_id": "companion",
        "title": "Personal draft",
        "privacy": {"memoryDisabled": True, "harnessDisabled": False},
    }
    assert (
        run(
            "draft",
            "save",
            "new",
            write_draft(tmp_path, intent),
            "--expected-revision",
            3,
        )
        == 0
    )
    assert calls[-1] == ("pi-owner", "/drafts/new", {**intent, "expected_revision": 3})
    assert run("draft", "show", "new") == 0
    assert calls[-1] == ("pi-owner", "/drafts/new", None)
    request_id = "draft_creation_request_0001"
    assert (
        run("draft", "start", "--request-id", request_id, "--expected-revision", 4) == 0
    )
    original = calls[-1]
    assert original == (
        "pi-owner",
        "/drafts/new/start",
        {"request_id": request_id, "expected_revision": 4},
    )
    assert run("draft", "start-status", request_id) == 0
    assert calls[-1] == ("pi-owner", f"/drafts/new/start/{request_id}", None)
    assert (
        run("draft", "start", "--request-id", request_id, "--expected-revision", 4) == 0
    )
    assert calls[-1] == original, (
        "An exact retry cannot create a different request identity."
    )


def test_task_drafts_use_separate_path_and_clear_is_revision_bound(invoke, tmp_path):
    run, calls = invoke
    path = write_draft(tmp_path, {"text": "Work", "research_mode": "deep"})
    assert (
        run(
            "draft",
            "save",
            "ses_one",
            path,
            "--task",
            "tsk_one",
            "--expected-revision",
            2,
        )
        == 0
    )
    assert calls[-1] == (
        "pi-owner",
        "/drafts/ses_one/tasks/tsk_one",
        {"text": "Work", "research_mode": "deep", "expected_revision": 2},
    )
    assert run("draft", "clear", "ses_one", "--expected-revision", 7) == 0
    assert calls[-1] == (
        "pi-owner",
        "/drafts/ses_one",
        {"text": "", "expected_revision": 7},
    )


def test_chat_replays_the_frozen_draft_revision_and_options(invoke):
    run, calls = invoke
    args = (
        "chat",
        "ses_one",
        "Research",
        "--draft-revision",
        9,
        "--request-id",
        "saved_request_identity_0001",
        "--model",
        "selected-model",
        "--skill",
        "review-code",
        "--think",
        "--research-mode",
        "web",
    )
    assert run(*args) == 0
    body = calls[-1][2]
    assert body == {
        "text": "Research",
        "request_id": "saved_request_identity_0001",
        "draft_revision": 9,
        "model_id": "selected-model",
        "skill_ids": ["review-code"],
        "think": True,
        "research_mode": "web",
    }
    assert run(*args) == 0
    assert calls[-1][2] == body


@pytest.mark.parametrize(
    "args",
    [
        ("draft", "show", "../escape"),
        ("draft", "show", "new", "--task", "tsk_one"),
        ("draft", "clear", "ses_one", "--expected-revision", -1),
        ("draft", "start", "--request-id", "short", "--expected-revision", 1),
        (
            "draft",
            "start",
            "--request-id",
            "valid_request_identity",
            "--expected-revision",
            0,
        ),
        ("draft", "start-status", "../foreign_identity"),
        ("chat", "ses_one", "text", "--draft-revision", 0),
    ],
)
def test_invalid_identity_or_revision_never_reaches_server(invoke, args):
    run, calls = invoke
    assert run(*args) == 1
    assert not calls


@pytest.mark.parametrize(
    "target,value",
    [
        ("new", {"text": "x", "think": "true"}),
        ("new", {"text": "x", "privacy": {"memoryDisabled": 1}}),
        ("new", {"text": "x", "privacy": {"unknown": True}}),
        ("new", {"text": "x", "skill_ids": ["same", "same"]}),
        ("new", {"text": "x", "skill_ids": [{}]}),
        ("new", {"text": "x", "model_id": ""}),
        ("new", {"text": "x", "research_mode": "anything"}),
        ("new", {"text": "x", "agent_id": "../agent"}),
        ("new", {"text": "x", "unexpected": True}),
        ("ses_one", {"text": "x", "privacy": {"memoryDisabled": True}}),
        ("new", {"text": "🦔" * 16001}),
        ("new", {"text": "\x01" * 16000}),
    ],
)
def test_invalid_intent_or_oversized_body_does_not_write(
    invoke, tmp_path, target, value
):
    run, calls = invoke
    assert (
        run(
            "draft",
            "save",
            target,
            write_draft(tmp_path, value),
            "--expected-revision",
            0,
        )
        == 1
    )
    assert not calls


def test_unicode_limit_counts_characters_without_ascii_expansion(invoke, tmp_path):
    run, calls = invoke
    text = "🦔" * 16000
    assert (
        run(
            "draft",
            "save",
            "new",
            write_draft(tmp_path, {"text": text}),
            "--expected-revision",
            0,
        )
        == 0
    )
    assert calls[-1][2]["text"] == text
