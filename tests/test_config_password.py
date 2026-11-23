"""conker config asks for the password for the settings Settings asks it for (ADR-0010).

Pi refuses a preferences save on the recovery key that would change the sign-out time, a new
chat's access or the daily budgets (403 `password_required`, nothing saved). The CLI keeps no list
of its own: on that refusal it asks for the password once, with echo off, and sends the same save
once more, with it, on stdin, to the gateway's `owner-preferences` command. Any other setting
still saves on the recovery key and asks for nothing.
"""

import getpass
import io
import json
import sys
from pathlib import Path
from types import SimpleNamespace
from urllib.error import HTTPError

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import config_cli  # noqa: E402
import owner_password  # noqa: E402

from scripts import conker as cli  # noqa: E402

SECRET = "owner passphrase used only in this test"
PREFERENCES = {
    "quietHours": {
        "enabled": True,
        "start": "22:00",
        "end": "07:00",
        "timeZone": "Asia/Jerusalem",
        "urgentExceptions": False,
    },
    "urgency": "meaningful",
    "dailyBudget": {"suggestions": 4, "researchMinutes": 30, "costCents": 0},
    "idleTimeoutMinutes": 15,
    "planAlerts": {"enabled": True, "percent": 80},
    "newChatAccess": "default",
    "spendingCap": {"enabled": True, "cents": 500, "tokens": 2_000_000},
}
REFUSED = b'403\n{"detail": {"code": "password_required", "message": "Needs the password."}}'
GATEWAY_ENV = {"GATEWAY_DB_PATH": "/state/gateway/auth.db", "GATEWAY_PI_OWNER_KEY": "fixture"}


class Stack:
    """The installed stack: Pi's relay (`python -c RELAY`) and the gateway's host commands."""

    def __init__(self, monkeypatch, *, pi=REFUSED, gateway=None, password=SECRET):
        self.relay, self.gateway, self.asked = [], [], []
        self.pi, self.answer = pi, gateway

        def run(argv, **options):
            if "-c" in argv:  # the recovery-key relay inside the pi container
                self.relay.append((argv[-2:], options["input"]))
                if argv[-2] == "GET":
                    reply = {"revision": 7, "preferences": PREFERENCES}
                    return SimpleNamespace(
                        returncode=0, stdout=b"200\n" + json.dumps(reply).encode(), stderr=b""
                    )
                return SimpleNamespace(returncode=0, stdout=self.pi, stderr=b"")
            self.gateway.append((argv, options))
            return self.answer or SimpleNamespace(returncode=1, stdout=b"", stderr=b"unexpected")

        def ask(prompt):
            self.asked.append(prompt)
            return password

        monkeypatch.setattr(config_cli.subprocess, "run", run)
        monkeypatch.setattr(getpass, "getpass", ask)


def main(*arguments):
    return config_cli.main(["--root", "/srv/conker", "--layout", "ubuntu", *arguments])


def saved(**changes):
    document = {"revision": 8, "preferences": {**PREFERENCES, **changes}}
    return SimpleNamespace(returncode=0, stdout=json.dumps(document).encode(), stderr=b"")


@pytest.mark.parametrize(
    ("setting", "value", "field", "expected"),
    [
        ("session.idle_timeout_minutes", "60", "idleTimeoutMinutes", 60),
        ("chats.default_access", "full", "newChatAccess", "full"),
        ("companion.daily_budget.cost_cents", "2500", "dailyBudget", {"costCents": 2500}),
    ],
)
def test_a_setting_pi_refuses_for_the_password_asks_for_it_and_goes_to_the_gateway(
    monkeypatch, capsys, setting, value, field, expected
):
    changed = {**PREFERENCES["dailyBudget"], **expected} if field == "dailyBudget" else expected
    stack = Stack(monkeypatch, gateway=saved(**{field: changed}))
    assert main("set", setting, value) == 0
    # Read, refused save on the recovery key, then the same save once with the password.
    [(read, _), (write, refused_body)] = stack.relay
    assert read == ["GET", "/owner/preferences"] and write == ["POST", "/owner/preferences"]
    assert stack.asked == [owner_password.PROMPT]
    [(argv, options)] = stack.gateway
    assert argv[-7:] == ["exec", "-T", "gateway", "python", "-m", "gateway", "owner-preferences"]
    sent = json.loads(options["input"])
    assert sent == {"password": SECRET, **json.loads(refused_body)}
    assert sent["expected_revision"] == 7 and sent["preferences"][field] == changed
    assert SECRET not in " ".join(argv) and "env" not in options
    out = capsys.readouterr()
    assert json.loads(out.out)["value"] == (expected if field != "dailyBudget" else 2500)
    assert SECRET not in out.out + out.err


def test_a_setting_pi_saves_on_the_recovery_key_asks_for_nothing(monkeypatch, capsys):
    reply = {"revision": 8, "preferences": {**PREFERENCES, "urgency": "off"}}
    stack = Stack(monkeypatch, pi=b"200\n" + json.dumps(reply).encode())
    assert main("set", "companion.proactivity", "off") == 0
    assert len(stack.relay) == 2 and stack.asked == [] and stack.gateway == []
    assert json.loads(capsys.readouterr().out)["value"] == "off"


def test_no_password_sends_nothing_more(monkeypatch, capsys):
    stack = Stack(monkeypatch, password="")
    assert main("set", "session.idle_timeout_minutes", "60") == 2
    assert stack.gateway == [] and "needs your password" in capsys.readouterr().err


def test_a_gateway_refusal_is_its_own_words_without_the_password(monkeypatch, capsys):
    said = b"Gateway did not complete: Password not accepted. Nothing was saved.\x1b[2J\n"
    stack = Stack(monkeypatch, gateway=SimpleNamespace(returncode=1, stdout=b"", stderr=said))
    assert main("set", "chats.default_access", "full") == 1
    assert len(stack.gateway) == 1  # once, never retried
    err = capsys.readouterr().err
    assert "Password not accepted. Nothing was saved." in err and "\x1b" not in err
    assert SECRET not in err


def test_an_older_gateway_without_the_command_changes_nothing(monkeypatch, capsys):
    said = b"gateway: error: argument command: invalid choice: 'owner-preferences'\n"
    Stack(monkeypatch, gateway=SimpleNamespace(returncode=2, stdout=b"", stderr=said))
    assert main("set", "session.idle_timeout_minutes", "60") == 1
    assert "invalid choice" in capsys.readouterr().err


def test_another_refusal_is_not_taken_for_a_password_request(monkeypatch, capsys):
    other = b'403\n{"detail": {"code": "forbidden", "message": "No."}}'
    stack = Stack(monkeypatch, pi=other)
    assert main("set", "session.idle_timeout_minutes", "60") == 1
    assert stack.asked == [] and stack.gateway == []
    assert "HTTP 403" in capsys.readouterr().err


def test_the_development_cli_asks_the_same_way(monkeypatch, capsys):
    sent, launched, asked = [], [], []
    config = {
        "python": "/workspace/pi/python",
        "repositories": {"pi": "/workspace/gates/pi"},
        "environments": {"pi": {"PI_ADMIN_KEY": "fixture-admin-key"}, "gateway": GATEWAY_ENV},
    }

    class Opener:
        def open(self, request, timeout):
            sent.append(request)
            if request.get_method() == "GET":
                body = {"revision": 7, "preferences": PREFERENCES}
                return io.BytesIO(json.dumps(body).encode())
            refusal = io.BytesIO(REFUSED.partition(b"\n")[2])
            raise HTTPError(request.full_url, 403, "Forbidden", None, refusal)  # type: ignore[arg-type]

    def launch(argv, **options):
        launched.append((argv, options))
        return saved(idleTimeoutMinutes=60)

    monkeypatch.setattr(cli, "read_config", lambda: config)
    monkeypatch.setattr(cli, "build_opener", lambda *handlers: Opener())
    monkeypatch.setattr(getpass, "getpass", lambda prompt: asked.append(prompt) or SECRET)
    monkeypatch.setattr(owner_password.subprocess, "run", launch)
    monkeypatch.setenv("PI_ADMIN_KEY", "inherited-recovery-key")
    monkeypatch.setattr(
        sys, "argv", ["conker.py", "config", "set", "session.idle_timeout_minutes", "60"]
    )
    assert cli.cli() == 0
    assert [request.get_method() for request in sent] == ["GET", "POST"]
    assert sent[1].headers["X-pi-key"] == "fixture-admin-key"  # the recovery key, refused
    [(argv, options)] = launched
    assert argv == ["/workspace/pi/python", "-m", "gateway", "owner-preferences"]
    body = json.loads(options["input"])
    assert body["password"] == SECRET and body["preferences"]["idleTimeoutMinutes"] == 60
    environment = options["env"]
    assert environment["PYTHONPATH"] == "/workspace/gates/pi"
    assert {key: environment[key] for key in GATEWAY_ENV} == GATEWAY_ENV
    assert "PI_ADMIN_KEY" not in environment
    assert SECRET not in " ".join(argv) and SECRET not in json.dumps(environment)
    assert len(asked) == 1 and json.loads(capsys.readouterr().out)["value"] == 60
