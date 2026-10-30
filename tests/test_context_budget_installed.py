"""`conker context budget` on an installed stack: the command the "no context settings" errors
name, reached through the pi container like conker config (scripts/context_cli.py)."""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import config_cli
import context_cli

INSTALLED = ["--root", "/srv/conker", "--layout", "ubuntu"]
BUDGET = ["budget", "ses_1", "--window", "8192", "--reserve", "1024"]


@pytest.fixture
def pi(monkeypatch):
    """Answers each relay call with the next (status, body); records what was sent."""
    calls, answers = [], []

    def run(sent, **options):
        calls.append((sent, options["input"]))
        status, body = answers.pop(0)
        return SimpleNamespace(
            returncode=0, stdout=f"{status}\n{json.dumps(body)}".encode(), stderr=b""
        )

    monkeypatch.setattr(config_cli.subprocess, "run", run)
    return SimpleNamespace(calls=calls, answers=answers)


def test_budget_starts_the_settings_of_a_chat_that_has_none(pi, capsys):
    pi.answers[:] = [(200, {"revision": 0, "policy": None}), (200, {"revision": 1})]

    assert context_cli.main([*INSTALLED, *BUDGET]) == 0

    (read, nothing), (write, sent) = pi.calls
    command = config_cli.compose(Path("/srv/conker"), "ubuntu")
    relay = ["exec", "-T", "pi", "python", "-c", config_cli.RELAY]
    assert read == [*command, *relay, "GET", "/context/ses_1"] and nothing == b""
    assert write == [*command, *relay, "POST", "/context/ses_1"]
    assert json.loads(sent) == {
        "expected_revision": 0,
        "policy": {
            "sessionInstructions": "",
            "messagePolicies": {},
            "budget": {
                "contextWindowTokens": 8192,
                "outputReserveTokens": 1024,
                "otherInputTokens": 0,
            },
        },
    }
    assert json.loads(capsys.readouterr().out) == {"revision": 1}


def test_budget_keeps_the_rest_of_existing_settings(pi, capsys):
    saved = {
        "sessionInstructions": "Be brief",
        "messagePolicies": {"msg_1": "exclude"},
        "budget": {
            "contextWindowTokens": 4096,
            "outputReserveTokens": 512,
            "otherInputTokens": 40,
        },
    }
    pi.answers[:] = [(200, {"revision": 3, "policy": saved}), (200, {"revision": 4})]

    assert context_cli.main([*INSTALLED, *BUDGET]) == 0

    body = json.loads(pi.calls[1][1])
    assert body["expected_revision"] == 3
    assert body["policy"] == {
        **saved,
        "budget": {
            "contextWindowTokens": 8192,
            "outputReserveTokens": 1024,
            "otherInputTokens": 40,
        },
    }
    capsys.readouterr()


def test_bad_input_is_refused_before_anything_reaches_docker(pi, capsys):
    for arguments in (
        ["budget", "ses_1", "--window", "100", "--reserve", "100"],
        ["budget", "../owner/settings", "--window", "8192", "--reserve", "1024"],
    ):
        assert context_cli.main([*INSTALLED, *arguments]) == 2
    error = capsys.readouterr().err
    assert "window of 2-10000000" in error and "valid chat id" in error
    assert pi.calls == []


def test_only_the_budget_is_offered(pi):
    with pytest.raises(SystemExit) as stopped:
        context_cli.main([*INSTALLED, "rule", "ses_1", "msg_1", "pin"])
    assert stopped.value.code == 2
    assert pi.calls == []


def test_a_concurrent_change_saves_nothing_and_says_so(pi, capsys):
    pi.answers[:] = [
        (200, {"revision": 0, "policy": None}),
        (409, {"detail": {"code": "revision_conflict"}}),
    ]

    assert context_cli.main([*INSTALLED, *BUDGET]) == 1
    assert "nothing was saved" in capsys.readouterr().err


def install(ubuntu_cli):
    scripts = ubuntu_cli.deployment / "sources/companion/scripts"
    for name in ("conker_context.py", "conker_inputs.py", "context_cli.py"):
        shutil.copy2(ROOT / "scripts" / name, scripts / name)


def test_the_launcher_checks_the_budget_before_docker(ubuntu_cli):
    install(ubuntu_cli)

    result = ubuntu_cli("context", "budget", "ses_1", "--window", "9", "--reserve", "9")

    assert result.returncode == 2
    assert "window of 2-10000000" in result.stderr
    assert ubuntu_cli("context").returncode == 2
    assert not ubuntu_cli.docker_log.exists()
    assert "context budget CHAT_ID" in ubuntu_cli("help").stdout


# Pi's context route, as the pi container's relay sees it.
FAKE_PI = """
import json, os, sys
from pathlib import Path
state = Path(os.environ["FAKE_PI_STATE"])
calls = json.loads(state.read_text()) if state.exists() else []
method, path = sys.argv[-2:]
body = json.load(sys.stdin) if method == "POST" else None
calls.append([method, path, body])
state.write_text(json.dumps(calls))
sys.stdout.write("200\\n" + json.dumps({"revision": 0, "policy": None} if body is None
                                       else {"revision": 1, "policy": body["policy"]}))
"""


@pytest.mark.skipif(
    sys.platform == "win32", reason="Python starts the recording Docker, a POSIX script"
)
def test_the_launcher_saves_the_budget_in_pi(ubuntu_cli, tmp_path):
    install(ubuntu_cli)
    fake, state = tmp_path / "fake_pi.py", tmp_path / "pi-calls.json"
    fake.write_text(FAKE_PI, encoding="utf-8")
    ubuntu_cli.environment.update(FAKE_PI=str(fake), FAKE_PI_STATE=str(state))

    result = ubuntu_cli("context", *BUDGET)

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["revision"] == 1
    calls = json.loads(state.read_text(encoding="utf-8"))
    assert [call[:2] for call in calls] == [
        ["GET", "/context/ses_1"],
        ["POST", "/context/ses_1"],
    ]
    assert calls[1][2]["policy"]["budget"]["contextWindowTokens"] == 8192
    log = ubuntu_cli.docker_log.read_text(encoding="utf-8")
    assert "exec -T pi python -c" in log and "X-Pi-Key" in log
