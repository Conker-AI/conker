"""conker team run / next / show / finish: the owner's own explicit steps over Pi's /team-runs."""

import io
import json
import sys
from email.message import Message
from pathlib import Path
from urllib.parse import urlsplit

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from scripts import conker as cli

TEAM = "team_" + "a" * 32
RUN = "teamrun_" + "b" * 32
CHAT = "ses_" + "c" * 16
DEFINITION = {
    "roles": [
        {"id": "role1", "name": "Fact checker"},
        {"id": "role2", "name": "Editor"},
    ],
    "handoffs": [{"id": "handoff1", "fromRoleId": "role1", "toRoleId": "role2"}],
}


def run_view(steps=(), state="ready", revision=1):
    return {
        "id": RUN,
        "teamId": TEAM,
        "revision": revision,
        "state": state,
        "snapshot": {"definition": DEFINITION},
        "steps": [
            {"role_id": role, "state": "complete", "session_id": f"ses_{n:016x}"}
            for n, role in enumerate(steps, 1)
        ],
    }


def calls(monkeypatch, capsys, arguments, answers=()):
    sent, pending = [], list(answers)

    class Opener:
        def open(self, request, timeout):
            sent.append(request)
            return io.BytesIO(json.dumps(pending.pop(0)).encode())

    monkeypatch.setattr(
        cli, "read_config", lambda: {"environments": {"pi": {"PI_ADMIN_KEY": "fixture-key"}}}
    )
    monkeypatch.setattr(cli, "build_opener", lambda *handlers: Opener())
    monkeypatch.setattr(sys, "argv", ["conker.py", *arguments])
    code = cli.cli()
    return code, sent, capsys.readouterr()


def body(request):
    return json.loads(request.data.decode())


def paths(sent):
    return [(r.get_method(), urlsplit(r.full_url).path) for r in sent]


def test_run_starts_the_team_and_runs_only_its_first_role(monkeypatch, capsys):
    code, sent, out = calls(
        monkeypatch,
        capsys,
        ["team", "run", TEAM, "--chat", CHAT, "--task", "  Check this essay  "],
        answers=[
            {"revision": 3, "definition": DEFINITION},
            run_view(),
            run_view(steps=["role1"], revision=2),
        ],
    )
    assert code == 0
    assert paths(sent) == [
        ("GET", f"/collaboration/teams/{TEAM}"),
        ("POST", f"/team-runs/from-team/{TEAM}"),
        ("POST", f"/team-runs/{RUN}/steps"),
    ]
    start, step = body(sent[1]), body(sent[2])
    assert start["expected_revision"] == 3 and start["source_session_id"] == CHAT
    assert start["text"] == "Check this essay" and start["budgetMode"] == "observed-stop"
    assert start["acknowledgeCurrentCallMayOvershoot"] is True
    assert step["roleId"] == "role1" and step["expected_revision"] == 1
    assert step.get("handoffId") is None and "conditionReviewed" not in step
    assert start["request_id"] != step["request_id"]
    assert "Fact checker: complete" in out.out and f"conker team next {RUN} --reviewed" in out.out


def test_run_refuses_bad_ids_and_empty_tasks_before_sending(monkeypatch, capsys):
    for arguments, words in (
        (["team", "run", "team_short", "--chat", CHAT, "--task", "x"], "the team"),
        (["team", "run", TEAM, "--chat", "chat", "--task", "x"], "--chat"),
        (["team", "run", TEAM, "--chat", CHAT, "--task", "   "], "--task"),
        (["team", "run", TEAM, "--chat", CHAT, "--task", "x" * 8001], "--task"),
    ):
        code, sent, out = calls(monkeypatch, capsys, arguments)
        assert code == 1 and sent == [] and words in out.err


def test_a_refusal_from_pi_is_shown_and_nothing_else_is_sent(monkeypatch, capsys):
    import urllib.error

    class Refusing:
        def open(self, request, timeout):
            raise urllib.error.HTTPError(
                request.full_url,
                409,
                "conflict",
                Message(),
                io.BytesIO(
                    json.dumps(
                        {"detail": {"code": "spending_cap_off", "message": "The daily spending cap is off."}}
                    ).encode()
                ),
            )

    monkeypatch.setattr(
        cli, "read_config", lambda: {"environments": {"pi": {"PI_ADMIN_KEY": "fixture-key"}}}
    )
    monkeypatch.setattr(cli, "build_opener", lambda *handlers: Refusing())
    monkeypatch.setattr(sys, "argv", ["conker.py", "team", "run", TEAM, "--chat", CHAT, "--task", "x"])
    assert cli.cli() == 1
    assert "daily spending cap is off" in capsys.readouterr().err


def test_next_runs_the_role_over_the_declared_handoff_as_reviewed(monkeypatch, capsys):
    code, sent, out = calls(
        monkeypatch,
        capsys,
        ["team", "next", RUN, "--reviewed"],
        answers=[run_view(steps=["role1"], revision=2), run_view(steps=["role1", "role2"], revision=3)],
    )
    assert code == 0
    assert paths(sent) == [("GET", f"/team-runs/{RUN}"), ("POST", f"/team-runs/{RUN}/steps")]
    step = body(sent[1])
    assert step["roleId"] == "role2" and step["handoffId"] == "handoff1"
    assert step["conditionReviewed"] is True and step["expected_revision"] == 2
    assert "Editor: complete" in out.out


def test_next_without_saying_reviewed_sends_nothing(monkeypatch, capsys):
    with pytest.raises(SystemExit) as refused:
        calls(monkeypatch, capsys, ["team", "next", RUN])
    assert refused.value.code == 2


def test_next_on_a_run_with_no_role_run_or_no_handoff_left_sends_no_step(monkeypatch, capsys):
    code, sent, out = calls(
        monkeypatch, capsys, ["team", "next", RUN, "--reviewed"], answers=[run_view()]
    )
    assert code == 1 and len(sent) == 1 and "run has run no role" in out.err
    code, sent, out = calls(
        monkeypatch,
        capsys,
        ["team", "next", RUN, "--reviewed"],
        answers=[run_view(steps=["role1", "role2"], revision=3)],
    )
    assert code == 1 and len(sent) == 1 and "No handoff leads on" in out.err


def test_show_and_finish(monkeypatch, capsys):
    code, sent, out = calls(
        monkeypatch, capsys, ["team", "show", RUN], answers=[run_view(steps=["role1"], revision=2)]
    )
    assert code == 0 and paths(sent) == [("GET", f"/team-runs/{RUN}")]
    assert f"Run {RUN}: ready" in out.out
    done = run_view(steps=["role1"], state="completed", revision=3)
    code, sent, out = calls(
        monkeypatch,
        capsys,
        ["team", "finish", RUN],
        answers=[run_view(steps=["role1"], revision=2), done],
    )
    assert code == 0 and paths(sent)[1] == ("POST", f"/team-runs/{RUN}/finish")
    assert body(sent[1]) == {"expected_revision": 2, "state": "completed"}
    code, sent, out = calls(
        monkeypatch,
        capsys,
        ["team", "finish", RUN, "--cancel"],
        answers=[run_view(revision=1), run_view(state="cancelled", revision=2)],
    )
    assert body(sent[1])["state"] == "cancelled" and "is cancelled" in out.out


def test_the_installed_launcher_relays_exactly_the_team_run_routes(monkeypatch):
    import config_cli
    import owner_cli

    sent = []
    monkeypatch.setattr(
        config_cli, "request", lambda command, service, path, body, query=None: sent.append(path)
    )
    call = owner_cli.caller(["team", "run"])
    for path, body in (
        (f"/collaboration/teams/{TEAM}", None),
        (f"/team-runs/from-team/{TEAM}", {}),
        (f"/team-runs/{RUN}", None),
        (f"/team-runs/{RUN}/steps", {}),
        (f"/team-runs/{RUN}/finish", {}),
    ):
        call({}, "pi", path, body)
    assert len(sent) == 5
    for path, body in (
        (f"/team-runs/{RUN}/reconcile", {}),  # not offered from the CLI
        (f"/team-runs/{RUN}", {}),  # a GET route cannot be posted to
        (f"/team-runs/from-team/{TEAM}", None),
        ("/team-runs/teamrun_short", None),
    ):
        with pytest.raises(ValueError, match="cannot be reached"):
            call({}, "pi", path, body)
    assert len(sent) == 5
