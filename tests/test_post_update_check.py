"""conker post-update-check (scripts/post_update_check.py): one read-only line per runbook check,
exit 1 when any failed. Every check runs against fakes; nothing reaches Docker, Pi or GitHub."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import config_cli  # noqa: E402
import post_update_check as checks  # noqa: E402

LAST = "0006-notices"
JOB = f"/jobs/{checks.MORNING_CHECK_IN}"
UPKEEP_KINDS = ("exactDuplicates", "nearDuplicates", "contradictions", "expired", "notRecalled")
SERVED = ["GET /health", *checks.NEW_ROUTES]


def answers(**changes):
    """Pi's GET answers on a healthy stack; `changes` replaces whole routes."""
    good = {
        "/health": {"status": "ok", "schema_migration": LAST},
        "/inference/spending": {
            "cap": {"enabled": True, "cents": 500, "tokens": 2_000_000},
            "used": {"costUsd": 0.12, "tokens": 3400},
            "reached": False,
        },
        "/memory/objects": {"results": []},
        "/inbox": {"needsYou": [{"kind": "approval", "title": "Send the report"}]},
        JOB: {"definition": {"name": "Morning check-in", "enabled": True}},
        "/memory/beliefs": {
            "total": 12,
            "counts": {"stated": 5, "concluded": 7, "needsReview": 0},
            "items": [],
            "nextAfter": None,
        },
        "/memory/upkeep": {
            "memoriesChecked": 40,
            "truncated": False,
            **{kind: {"items": [], "total": 0} for kind in UPKEEP_KINDS},
        },
        "/open-loops": {
            "today": "2026-11-15",
            "timeZone": "Europe/Berlin",
            "items": [],
            "nextAfter": None,
        },
    }
    good.update(changes)
    return good


def probe(
    tmp_path,
    *,
    codes=None,
    pi=None,
    newest: str | None = "0.1.0",
    known: str = LAST,
    drill: str | None = "passed",
    served=None,
):
    source = tmp_path / "source"
    source.mkdir(exist_ok=True)
    (source / "versions.env").write_text("CONKER_VERSION=0.1.0\n", encoding="utf-8")
    state = tmp_path / "state"
    if drill:
        journal = state / "backup-schedule" / "journal.jsonl"
        journal.parent.mkdir(parents=True, exist_ok=True)
        lines = [
            {"v": 1, "kind": "drill", "outcome": "refused", "reason": "older"},
            {"v": 1, "kind": "backup", "outcome": "done"},
            {"v": 1, "kind": "drill", "outcome": drill, "snapshot": "snapshot-1", "reason": "bad"},
        ]
        body = b"\n".join(json.dumps(line).encode() for line in lines)
        journal.write_bytes(body + b"\n{torn")
    routes = pi if pi is not None else answers()
    asked: list[tuple[str, dict | None]] = []

    def read(path, query=None):
        asked.append((path, query))
        value = routes[path]
        if isinstance(value, Exception):
            raise value
        return value

    made = checks.Probe(
        run=lambda argv: (codes or {}).get(" ".join(argv), 0),
        pi=read,
        in_pi=lambda line: (
            "\n".join(SERVED if served is None else served)
            if line == checks.ROUTE_TABLE
            else known + "\n"
        ),
        latest=lambda: None if newest is None else {"version": newest},
        source=source,
        state=state,
    )
    return made, asked


def outcomes(results):
    return {item.name: item.outcome for item in results}


def test_a_healthy_stack_passes_every_check(tmp_path):
    made, asked = probe(tmp_path)
    results = checks.run_checks(made)

    assert set(outcomes(results).values()) == {"ok"}
    assert [item.name for item in results] == [
        "health",
        "doctor",
        "update path",
        "Pi migrations",
        "spending cap",
        "memory search",
        "Inbox",
        "self-check",
        "Morning check-in",
        "new routes",
        "memory beliefs",
        "memory care",
        "open loops",
        "backup drill",
        "release page",
    ]
    text = checks.render(results)
    assert "ok    spending cap: on: $5.00 and 2,000,000 tokens a day; today $0.12" in text
    assert "ok    backup drill: the last drill passed (snapshot-1)" in text
    assert ("/memory/objects", {"search": "test", "limit": 1}) in asked
    assert {path for path, _ in asked} <= checks.ROUTES


def unreachable(message="Pi did not answer"):
    return config_cli.NotConfirmed(message)


@pytest.mark.parametrize(
    ("changes", "name"),
    [
        ({"codes": {"status --strict": 1}}, "health"),
        ({"codes": {"doctor": 3}}, "doctor"),
        ({"newest": "0.2.0"}, "update path"),
        ({"known": "0007-next"}, "Pi migrations"),
        ({"pi": answers(**{"/health": {"schema_migration": None}})}, "Pi migrations"),
        ({"pi": answers(**{"/inbox": {"needsYou": [{"kind": "memory", "title": "K"}]}})}, "Inbox"),
        (
            {"pi": answers(**{"/inbox": {"needsYou": [{"kind": "health", "title": "Memory"}]}})},
            "self-check",
        ),
        ({"pi": answers(**{JOB: unreachable("Pi refused: not found")})}, "Morning check-in"),
        ({"drill": "failed"}, "backup drill"),
        ({"pi": answers(**{"/inference/spending": {"cap": {}}})}, "spending cap"),
        ({"pi": answers(**{"/memory/objects": unreachable()})}, "memory search"),
        ({"served": ["GET /health"]}, "new routes"),
        ({"pi": answers(**{"/memory/beliefs": unreachable()})}, "memory beliefs"),
        ({"pi": answers(**{"/memory/upkeep": {"memoriesChecked": 1}})}, "memory care"),
        ({"pi": answers(**{"/open-loops": unreachable("Pi refused: not found")})}, "open loops"),
    ],
)
def test_each_failure_fails_only_its_own_check(tmp_path, changes, name):
    made, _ = probe(tmp_path, **changes)
    results = outcomes(checks.run_checks(made))

    assert results.pop(name) == "fail"
    assert "fail" not in results.values()  # the other checks still ran and passed


def test_an_unreachable_pi_fails_every_pi_check_and_the_rest_still_run(tmp_path):
    made, _ = probe(tmp_path, pi={path: unreachable() for path in answers()})
    results = outcomes(checks.run_checks(made))

    for name in (
        "Pi migrations",
        "spending cap",
        "memory search",
        "Inbox",
        "self-check",
        "Morning check-in",
        "memory beliefs",
        "memory care",
        "open loops",
    ):
        assert results[name] == "fail"
    assert results["health"] == results["update path"] == results["backup drill"] == "ok"


def test_what_is_not_a_failure_says_so_and_passes(tmp_path):
    off = answers(**{JOB: {"definition": {"name": "Morning check-in", "enabled": False}}})
    made, _ = probe(tmp_path, pi=off, drill=None)
    results = checks.run_checks(made)
    shown = {item.name: item for item in results}

    assert shown["Morning check-in"].outcome == "ok"
    assert "turned off by the owner" in shown["Morning check-in"].detail
    assert shown["backup drill"].outcome == "skip"
    assert "fail" not in outcomes(results).values()


def test_a_missing_route_is_named_and_the_new_reads_say_what_they_found(tmp_path):
    made, _ = probe(tmp_path, served=["GET /health", "POST /prompts/enhance"])
    shown = {item.name: item for item in checks.run_checks(made)}

    assert "POST /team-runs/from-team/{team_id}" in shown["new routes"].detail
    assert "POST /prompts/enhance" not in shown["new routes"].detail

    healthy, _ = probe(tmp_path)
    ok_shown = {item.name: item for item in checks.run_checks(healthy)}
    assert ok_shown["memory beliefs"].detail == "12 memories listed (5 you stated, 7 concluded)"
    assert "40 memories checked: 0 exactDuplicates" in ok_shown["memory care"].detail
    assert ok_shown["open loops"].detail == "answers for 2026-11-15 (Europe/Berlin)"


def test_a_newer_release_fails_the_update_path_and_skips_the_release_page(tmp_path):
    made, _ = probe(tmp_path, newest="0.2.0")
    shown = {item.name: item for item in checks.run_checks(made)}

    assert shown["update path"].detail == "0.1.0 is installed but 0.2.0 is out"
    assert shown["release page"].outcome == "skip"


def test_no_published_release_fails_the_release_page(tmp_path):
    made, _ = probe(tmp_path, newest=None)
    assert outcomes(checks.run_checks(made))["release page"] == "fail"


def test_the_checks_write_nothing(tmp_path):
    made, _ = probe(tmp_path, drill=None)
    before = sorted(tmp_path.rglob("*"))
    checks.run_checks(made)
    assert sorted(tmp_path.rglob("*")) == before


def test_the_live_probe_reads_pi_with_get_only_and_only_its_routes(tmp_path, monkeypatch):
    calls = []

    def request(command, service, path, body=None, method=None, query=None):
        calls.append((service, path, body, method, query))
        return {}

    monkeypatch.setattr(checks.config_cli, "request", request)
    live = checks.live_probe(tmp_path, "ubuntu", tmp_path, tmp_path / "conker")

    live.pi("/inbox")
    assert calls == [("pi", "/inbox", None, None, None)]  # no body: the relay sends a GET
    with pytest.raises(ValueError, match="cannot be reached"):
        live.pi("/owner/preferences")
    assert live.state == tmp_path / "state"


def test_main_exits_one_when_any_check_fails(tmp_path, monkeypatch, capsys):
    argv = ["--root", str(tmp_path), "--source", str(tmp_path), "--layout", "ubuntu"]
    argv += ["--launcher", "conker"]
    made, _ = probe(tmp_path, codes={"doctor": 1})
    monkeypatch.setattr(checks, "live_probe", lambda *_args: made)

    assert checks.main(argv) == 1
    printed = capsys.readouterr().out
    assert "FAIL  doctor: conker doctor exited 1" in printed
    assert printed.rstrip().endswith(checks.NOT_CHECKED)

    healthy, _ = probe(tmp_path)
    monkeypatch.setattr(checks, "live_probe", lambda *_args: healthy)
    assert checks.main(argv) == 0


def test_the_launcher_routes_the_command():
    launcher = (ROOT / "conker").read_text(encoding="utf-8")
    assert "post-update-check)" in launcher
    assert "scripts/post_update_check.py" in launcher
