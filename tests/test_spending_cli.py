"""conker spending: the daily cap meter and changing the cap, through Pi."""

import io
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import conker as cli

CAP = {"enabled": True, "cents": 500, "tokens": 2_000_000}
PREFERENCES = {
    "revision": 4,
    "preferences": {"urgency": "meaningful", "spendingCap": CAP},
}
METER = {
    "day": "2026-11-12",
    "cap": CAP,
    "used": {"costUsd": 0.5, "tokens": 10},
    "reached": [],
}


def run(monkeypatch, capsys, *arguments, answers=None):
    sent = []
    replies = list(answers or [METER])

    class Opener:
        def open(self, request, timeout):
            sent.append(request)
            return io.BytesIO(json.dumps(replies.pop(0)).encode())

    monkeypatch.setattr(
        cli,
        "read_config",
        lambda: {"environments": {"pi": {"PI_ADMIN_KEY": "fixture-admin-key"}}},
    )
    monkeypatch.setattr(cli, "build_opener", lambda *handlers: Opener())
    monkeypatch.setattr(sys, "argv", ["conker.py", "spending", *arguments])
    code = cli.cli()
    return code, sent, capsys.readouterr()


def test_the_meter_reads_pi(monkeypatch, capsys):
    code, sent, out = run(monkeypatch, capsys)
    assert code == 0 and json.loads(out.out) == METER
    assert (
        sent[0].full_url.endswith("/inference/spending")
        and sent[0].get_method() == "GET"
    )


def test_changing_the_cap_keeps_every_other_preference_and_sends_the_revision(
    monkeypatch, capsys
):
    saved = {"revision": 5, "preferences": {**PREFERENCES["preferences"]}}
    saved["preferences"]["spendingCap"] = {
        "enabled": False,
        "cents": 1250,
        "tokens": 500,
    }
    code, sent, out = run(
        monkeypatch,
        capsys,
        "cap",
        "--dollars",
        "12.5",
        "--tokens",
        "500",
        "--off",
        answers=[PREFERENCES, saved],
    )
    assert code == 0
    body = json.loads(sent[1].data)
    assert (
        sent[1].full_url.endswith("/owner/preferences")
        and sent[1].get_method() == "POST"
    )
    assert body == {
        "expected_revision": 4,
        "preferences": {
            "urgency": "meaningful",
            "spendingCap": {"enabled": False, "cents": 1250, "tokens": 500},
        },
    }
    assert json.loads(out.out) == {
        "revision": 5,
        "spendingCap": saved["preferences"]["spendingCap"],
    }


@pytest.mark.parametrize(
    "arguments",
    [
        ["cap"],
        ["cap", "--on", "--off"],
        ["cap", "--dollars", "1001"],
        ["cap", "--dollars", "nan"],
        ["cap", "--tokens", "-1"],
    ],
)
def test_a_bad_cap_is_refused_before_anything_is_sent(monkeypatch, capsys, arguments):
    code, sent, _ = run(monkeypatch, capsys, *arguments)
    assert code != 0 and sent == []
