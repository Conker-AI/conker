"""conker tomorrow: Pi's forecast of what Conker will do on its own (R-U10), from the development
CLI and through the installed launcher's relay. Read only."""

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

# 2026-11-24 08:00 UTC is 10:00 in Jerusalem.
AT = 1795507200.0
RUN = {
    "at": AT,
    "kind": "clock",
    "jobId": "job_" + "a" * 32,
    "name": "Morning\ncheck-in",
    "everyMinutes": None,
    "wouldRun": True,
    "reason": None,
}
PAGE = {
    "schemaVersion": 1,
    "since": AT - 3600,
    "until": AT + 82800,
    "hours": 24,
    "jobs": [],
    "runsPlanned": 2,
    "approvals": [{"sessionId": "chat_1", "toolId": "t_send", "expiresAt": AT}],
    "timeZone": "Asia/Jerusalem",
    "runs": [
        RUN,
        {
            **RUN,
            "at": AT + 14 * 3600,
            "name": "Watch my week",
            "wouldRun": False,
            "reason": "QUIET_HOURS",
        },
        {
            **RUN,
            "at": AT + 15 * 3600,
            "kind": "proposals",
            "jobId": None,
            "name": "Ideas pass",
            "wouldRun": False,
            "reason": "SOMETHING_NEW",
        },
        {**RUN, "at": None, "kind": "watch", "name": "Inbox watch", "everyMinutes": 15},
    ],
}
EMPTY = {**PAGE, "approvals": [], "runs": [], "runsPlanned": 0, "hours": 6}


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
    monkeypatch.setattr(sys, "argv", ["conker.py", "tomorrow", *arguments])
    code = cli.cli()
    return code, sent, capsys.readouterr()


def test_it_reads_the_forecast_and_prints_it_in_plain_words(monkeypatch, capsys):
    code, sent, out = calls(monkeypatch, capsys, [], [PAGE])
    assert code == 0
    assert urlsplit(sent[0].full_url).path == "/insights/tomorrow"
    assert sent[0].get_method() == "GET"
    assert parse_qs(urlsplit(sent[0].full_url).query) == {"hours": ["24"]}
    assert out.out.splitlines() == [
        "The next 24 hours (Asia/Jerusalem):",
        "Tue 10:00  Morning check-in  runs",
        "Wed 00:00  Watch my week  held: your quiet hours",
        "Wed 01:00  Ideas pass  held: held back (SOMETHING_NEW)",
        "watching   Inbox watch, checks every 15 min  runs",
        "1 approval runs out in this time; answer in the Inbox to keep them.",
    ]


def test_an_empty_day_says_so_and_json_is_pis_reply(monkeypatch, capsys):
    code, sent, out = calls(monkeypatch, capsys, ["--hours", "6"], [EMPTY])
    assert code == 0 and parse_qs(urlsplit(sent[0].full_url).query) == {"hours": ["6"]}
    assert out.out.splitlines() == [
        "The next 6 hours (Asia/Jerusalem):",
        "Nothing planned for the next 6 hours.",
    ]
    code, _, out = calls(monkeypatch, capsys, ["--json"], [PAGE])
    assert code == 0 and json.loads(out.out) == PAGE


@pytest.mark.parametrize("hours", ["0", "169"])
def test_hours_out_of_range_are_refused_before_calling_pi(monkeypatch, capsys, hours):
    code, sent, out = calls(monkeypatch, capsys, ["--hours", hours])
    assert code != 0 and sent == [] and "--hours must be from 1 to 168" in out.err


def test_the_installed_launcher_reaches_it_through_the_relay(monkeypatch, capsys):
    relay = Relay(monkeypatch, {("GET", "/insights/tomorrow?hours=12"): (200, EMPTY)})
    assert main("tomorrow", "--hours", "12") == 0
    assert relay.sent == [("GET", "/insights/tomorrow?hours=12", None)]
    assert "Nothing planned for the next 6 hours." in capsys.readouterr().out
    with pytest.raises(ValueError, match="cannot be reached"):
        from owner_cli import caller

        monkeypatch.setattr(config_cli.subprocess, "run", lambda *a, **k: pytest.fail("sent"))
        caller(["docker"])(None, "pi", "/insights/tomorrow", {"hours": 1})  # GET only
