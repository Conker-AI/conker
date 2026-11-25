"""conker quiet: Pi's weekly counts of how often Conker reached for the owner and how much of it
helped (R-M11 / R-E13), from the development CLI and through the installed launcher's relay."""

import io
import json
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import config_cli
from test_owner_cli import Relay, main

from scripts import conker as cli

ZERO = {"raised": 0, "actedOn": 0, "dismissed": 0, "unanswered": 0}


def week(name, asks, approvals, pushed, acted, dismissed, unanswered, useful):
    return {
        "week": name,
        "startsAt": 0.0,
        "endsAt": 0.0,
        "asks": asks,
        "raised": asks - approvals,
        "approvalsAsked": approvals,
        "pushed": pushed,
        "actedOn": acted,
        "dismissed": dismissed,
        "unanswered": unanswered,
        "usefulShare": useful,
        **{source: ZERO for source in ("suggestions", "questions", "changeRequests", "notices")},
    }


PAGE = {
    "schemaVersion": 1,
    "timeZone": "Asia/Jerusalem",
    "weeks": [
        week("2026-W46", 0, 0, 0, 0, 0, 0, None),
        week("2026-W47", 12, 2, 3, 4, 5, 1, 0.5),
        week("2026-W48", 3, 1, 0, 1, 0, 1, 1.0),
    ],
}


def calls(monkeypatch, capsys, arguments, answers=()):
    sent, pending = [], list(answers)

    class Opener:
        def open(self, request, timeout):
            sent.append(request)
            return io.BytesIO(json.dumps(pending.pop(0) if pending else {}).encode())

    monkeypatch.setattr(
        cli,
        "read_config",
        lambda: {"environments": {"pi": {"PI_ADMIN_KEY": "fixture-admin-key"}}},
    )
    monkeypatch.setattr(cli, "build_opener", lambda *handlers: Opener())
    monkeypatch.setattr(sys, "argv", ["conker.py", "quiet", *arguments])
    code = cli.cli()
    return code, sent, capsys.readouterr()


def test_it_reads_the_weeks_and_prints_a_table(monkeypatch, capsys):
    code, sent, out = calls(monkeypatch, capsys, [], [PAGE])
    assert code == 0
    assert urlsplit(sent[0].full_url).path == "/insights/quiet/weeks"
    assert sent[0].get_method() == "GET"
    assert parse_qs(urlsplit(sent[0].full_url).query) == {"weeks": ["8"]}
    assert out.out.splitlines() == [
        "Is Conker getting quieter? The last 3 weeks (Asia/Jerusalem):",
        "Week       Asks  Approvals  Pushed  Acted on  Dismissed  Unanswered  Useful",
        "2026-W46      0          0       0         0          0           0       -",
        "2026-W47     12          2       3         4          5           1     50%",
        "2026-W48*     3          1       0         1          0           1    100%",
        "Last full week: 12 asks, 50% useful (the week before: 0 asks, - useful).",
        "* this week, still running.",
        "Asks: suggestions, questions, change requests and notices Conker raised, plus approvals.",
        "Useful: acted on, of the suggestions, questions and change requests you could act on.",
    ]


def test_one_week_has_nothing_to_compare_and_json_is_pis_reply(monkeypatch, capsys):
    one = {**PAGE, "weeks": PAGE["weeks"][-1:]}
    code, sent, out = calls(monkeypatch, capsys, ["--weeks", "1"], [one])
    assert code == 0 and parse_qs(urlsplit(sent[0].full_url).query) == {"weeks": ["1"]}
    assert "Last full week" not in out.out and "2026-W48*" in out.out
    code, _, out = calls(monkeypatch, capsys, ["--json"], [PAGE])
    assert code == 0 and json.loads(out.out) == PAGE


@pytest.mark.parametrize("weeks", ["0", "27"])
def test_weeks_out_of_range_are_refused_before_calling_pi(monkeypatch, capsys, weeks):
    code, sent, out = calls(monkeypatch, capsys, ["--weeks", weeks])
    assert code != 0 and sent == [] and "--weeks must be from 1 to 26" in out.err


def test_the_installed_launcher_reaches_it_through_the_relay(monkeypatch, capsys):
    relay = Relay(monkeypatch, {("GET", "/insights/quiet/weeks?weeks=4"): (200, PAGE)})
    assert main("quiet", "--weeks", "4") == 0
    assert relay.sent == [("GET", "/insights/quiet/weeks?weeks=4", None)]
    assert "2026-W48*" in capsys.readouterr().out
    with pytest.raises(ValueError, match="cannot be reached"):
        from owner_cli import caller

        monkeypatch.setattr(config_cli.subprocess, "run", lambda *a, **k: pytest.fail("sent"))
        caller(["docker"])(None, "pi", "/insights/quiet/weeks", {"weeks": 1})  # GET only
