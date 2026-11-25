"""`conker providers spending on|off|recover` asks for the owner's password, as Settings does.

The browser's `paid-policy` and `recover-paid-policy` need a password proof at the gateway. The host
command used to write the policy and restart Pi with no password. It now asks for it (echo off) and
changes nothing until the gateway's `check-password` host command accepts it; the password goes
only to that command's stdin, never into argv or anything else the command runs.
"""

import json
import subprocess
import sys

import pytest

from scripts import provider_paid_policy as module

PASSWORD = "correct horse battery staple"
CHECKED = b'{"checked": true}\n'


@pytest.fixture
def host(tmp_path, monkeypatch):
    """An installed layout whose compose runs are recorded; `answer` is the gateway's check."""
    state = tmp_path / "state"
    state.mkdir()
    environment = state / "pi.env"
    environment.write_text("PI_ALLOW_PAID_MODELS=false\nUNCHANGED=kept\n")
    seen, answer = [], {"check": lambda: subprocess.CompletedProcess([], 0, CHECKED, b"")}

    def runner(command, **options):
        seen.append((command, options.get("input")))
        if command[-1] == "check-password":
            return answer["check"]()
        if command[-2:] == ["config", "--services"]:
            return subprocess.CompletedProcess(command, 0, stdout=b"pi\n")
        allowed = "PI_ALLOW_PAID_MODELS=true" in environment.read_text()
        return subprocess.CompletedProcess(command, 0, stdout=b"on" if allowed else b"off")

    real = module.PaidPolicy
    monkeypatch.setattr(
        module, "PaidPolicy", lambda root, layout: real(root, layout, runner=runner)
    )
    typed = {"password": PASSWORD}

    def getpass(prompt):
        assert "password" in prompt
        if typed["password"] is EOFError:
            raise EOFError
        return typed["password"]

    monkeypatch.setattr("getpass.getpass", getpass)
    return tmp_path, environment, seen, answer, typed


def run(monkeypatch, root, action):
    monkeypatch.setattr(
        sys, "argv", ["provider_paid_policy", "--root", str(root), "--layout", "ubuntu", action]
    )
    module.main()


def checks(seen):
    return [entry for entry in seen if entry[0][-1] == "check-password"]


@pytest.mark.parametrize("action", ["on", "off", "recover"])
@pytest.mark.parametrize("typed", ["", EOFError], ids=["empty", "no-terminal"])
def test_without_a_password_nothing_runs_and_nothing_changes(host, monkeypatch, action, typed):
    root, environment, seen, _, typing = host
    typing["password"] = typed
    before = environment.read_text()
    with pytest.raises(SystemExit, match=r"needs your password. Nothing was changed."):
        run(monkeypatch, root, action)
    assert environment.read_text() == before and seen == []


def test_a_password_the_gateway_refuses_changes_nothing(host, monkeypatch, capsys):
    root, environment, seen, answer, typing = host
    typing["password"] = "wrong password, nearly right"
    said = b"Gateway did not complete: Password not accepted. Retry. Nothing was changed.\n"
    answer["check"] = lambda: subprocess.CompletedProcess([], 1, b"", said)
    with pytest.raises(SystemExit) as stopped:
        run(monkeypatch, root, "on")
    assert "Password not accepted" in str(stopped.value.code)
    assert "nearly right" not in str(stopped.value.code) + capsys.readouterr().out
    assert "PI_ALLOW_PAID_MODELS=false" in environment.read_text()
    [(command, sent)] = seen  # the check, and nothing after it
    assert command[-7:] == ["exec", "-T", "gateway", "python", "-m", "gateway", "check-password"]
    assert json.loads(sent) == {"password": "wrong password, nearly right"}


def test_the_right_password_is_checked_once_then_the_policy_changes(host, monkeypatch, capsys):
    root, environment, seen, _, _ = host
    run(monkeypatch, root, "on")
    assert json.loads(capsys.readouterr().out)["paidAllowed"] is True
    assert "PI_ALLOW_PAID_MODELS=true" in environment.read_text()
    assert "UNCHANGED=kept" in environment.read_text()
    assert seen[0] == checks(seen)[0] and len(checks(seen)) == 1  # checked first, once
    for command, sent in seen:
        assert not any(PASSWORD in part for part in command)
        assert sent is None or command[-1] == "check-password"


@pytest.mark.parametrize(
    ("answer", "said"),
    [
        (OSError("docker is missing"), "could not check the password"),
        (subprocess.TimeoutExpired("docker", 120), "could not check the password"),
        (subprocess.CompletedProcess([], 2, b"", b"usage: invalid choice\n"), "update Conker"),
        (subprocess.CompletedProcess([], 0, b"not json", b""), "did not accept"),
        (subprocess.CompletedProcess([], 0, b'{"checked": false}', b""), "did not accept"),
        (subprocess.CompletedProcess([], 1, b"", b""), "did not accept"),
    ],
    ids=["no-docker", "timeout", "older-gateway", "unreadable", "not-checked", "silent"],
)
def test_a_check_that_does_not_pass_changes_nothing(host, monkeypatch, answer, said):
    root, environment, seen, gateway, _ = host

    def check():
        if isinstance(answer, Exception):
            raise answer
        return answer

    gateway["check"] = check
    with pytest.raises(SystemExit, match=said):
        run(monkeypatch, root, "on")
    assert "PI_ALLOW_PAID_MODELS=false" in environment.read_text()
    assert len(seen) == 1


def test_status_needs_no_password(host, monkeypatch, capsys):
    root, _, seen, _, typing = host
    typing["password"] = EOFError
    run(monkeypatch, root, "status")
    assert json.loads(capsys.readouterr().out)["paidAllowed"] is False
    assert seen == []


def test_settings_path_is_unchanged_and_asks_nothing_here(tmp_path):
    """The provider UI calls `apply` after the gateway checked the password: no second check."""
    state = tmp_path / "state"
    state.mkdir()
    (state / "pi.env").write_text("PI_ALLOW_PAID_MODELS=false\n")
    seen = []

    def runner(command, **options):
        seen.append(command)
        if command[-2:] == ["config", "--services"]:
            return subprocess.CompletedProcess(command, 0, stdout=b"pi\n")
        allowed = "PI_ALLOW_PAID_MODELS=true" in (state / "pi.env").read_text()
        return subprocess.CompletedProcess(command, 0, stdout=b"on" if allowed else b"off")

    policy = module.PaidPolicy(tmp_path, "ubuntu", runner=runner)
    assert policy.apply(True, False)["paidAllowed"] is True
    assert not [command for command in seen if command[-1] == "check-password"]
