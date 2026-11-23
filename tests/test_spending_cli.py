"""conker spending: the daily cap meter through Pi, and changing the cap with the password."""

import getpass
import io
import json
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from scripts import conker as cli
from scripts.cli import conker_spending

CAP = {"enabled": True, "cents": 500, "tokens": 2_000_000}
METER = {
    "day": "2026-11-12",
    "cap": CAP,
    "used": {"costUsd": 0.5, "tokens": 10},
    "reached": [],
}
SECRET = "owner passphrase used only in this test"
GATEWAY = {"GATEWAY_DB_PATH": "/state/gateway/auth.db", "GATEWAY_PI_OWNER_KEY": "fixture-owner"}
CONFIG = {
    "python": "/workspace/pi/python",
    "repositories": {"pi": "/workspace/gates/pi"},
    "environments": {"pi": {"PI_ADMIN_KEY": "fixture-admin-key"}, "gateway": GATEWAY},
}


def run(monkeypatch, capsys, *arguments, password=SECRET, gateway=None):
    sent, asked, launched = [], [], []
    replies = [METER]

    class Opener:
        def open(self, request, timeout):
            sent.append(request)
            return io.BytesIO(json.dumps(replies.pop(0)).encode())

    def ask(prompt):
        asked.append(prompt)
        return password

    def launch(argv, **options):
        launched.append((argv, options))
        return gateway or SimpleNamespace(returncode=1, stdout=b"", stderr=b"not expected")

    monkeypatch.setattr(cli, "read_config", lambda: CONFIG)
    monkeypatch.setattr(cli, "build_opener", lambda *handlers: Opener())
    monkeypatch.setattr(getpass, "getpass", ask)
    monkeypatch.setattr(subprocess, "run", launch)
    monkeypatch.setenv("PI_ADMIN_KEY", "inherited-recovery-key")
    monkeypatch.setattr(sys, "argv", ["conker.py", "spending", *arguments])
    code = cli.cli()
    return code, sent, asked, launched, capsys.readouterr()


def test_the_meter_reads_pi_and_asks_for_no_password(monkeypatch, capsys):
    code, sent, asked, launched, out = run(monkeypatch, capsys)
    assert code == 0 and json.loads(out.out) == METER
    assert sent[0].full_url.endswith("/inference/spending") and sent[0].get_method() == "GET"
    assert asked == [] and launched == []


def test_changing_the_cap_asks_for_the_password_and_never_uses_the_recovery_key(
    monkeypatch, capsys
):
    saved = {"revision": 5, "spendingCap": {"enabled": False, "cents": 1250, "tokens": 500}}
    answer = SimpleNamespace(returncode=0, stdout=json.dumps(saved).encode(), stderr=b"")
    code, sent, asked, launched, out = run(
        monkeypatch,
        capsys,
        *("cap", "--dollars", "12.5", "--tokens", "500", "--off"),
        gateway=answer,
    )
    assert code == 0, out.err
    assert sent == []  # nothing went to Pi on the recovery key
    assert asked == [conker_spending.PROMPT]
    [(argv, options)] = launched
    assert argv == ["/workspace/pi/python", "-m", "gateway", "spending-cap"]
    assert json.loads(options["input"]) == {
        "password": SECRET,
        "changes": {"enabled": False, "cents": 1250, "tokens": 500},
    }
    environment = options["env"]
    assert environment["PYTHONPATH"] == "/workspace/gates/pi"
    assert {key: environment[key] for key in GATEWAY} == GATEWAY
    assert "PI_ADMIN_KEY" not in environment
    assert SECRET not in " ".join(argv) and SECRET not in json.dumps(environment)
    assert json.loads(out.out) == saved and SECRET not in out.out + out.err


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
def test_a_bad_cap_is_refused_before_the_password_or_anything_is_sent(
    monkeypatch, capsys, arguments
):
    code, sent, asked, launched, _ = run(monkeypatch, capsys, *arguments)
    assert code != 0 and sent == [] and asked == [] and launched == []


def test_no_password_changes_nothing(monkeypatch, capsys):
    code, sent, asked, launched, out = run(monkeypatch, capsys, "cap", "--off", password="")
    assert code == 1 and sent == [] and launched == [] and len(asked) == 1
    assert "needs your password" in out.err


def test_a_refused_password_is_reported_without_it(monkeypatch, capsys):
    said = b"Gateway did not complete: Password not accepted. Nothing was saved.\n"
    answer = SimpleNamespace(returncode=1, stdout=b"", stderr=said)
    code, sent, _, launched, out = run(monkeypatch, capsys, "cap", "--on", gateway=answer)
    assert code == 1 and sent == [] and len(launched) == 1
    assert "Password not accepted" in out.err and SECRET not in out.err + out.out
