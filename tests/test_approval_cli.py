"""conker apply approvals asks for the password only when the gateway says this yes needs it.

The gateway applies the Inbox's rule (a yes at level 3, or at a level it cannot read) and exits 3
having decided nothing. Only then is the password asked, once, and the same decision sent once
more with it on stdin. Any other decision is sent once, as the file says, and asks for nothing.
"""

import getpass
import json
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import approval_cli  # noqa: E402

SECRET = "owner passphrase used only in this test"
DECISION = {"operation": "decide", "id": "req_123", "status": "approved", "note": "Pay it."}
NEEDS = SimpleNamespace(
    returncode=3,
    stdout=b"",
    stderr=b"Gateway did not complete: This yes asks for your password, as the Inbox does.\n",
)
DECIDED = SimpleNamespace(
    returncode=0, stdout=b'{"id": "req_123", "status": "approved"}\n', stderr=b""
)


def gateway(monkeypatch, *answers, password=SECRET):
    calls, asked = [], []
    replies = list(answers)

    def run(argv, **options):
        calls.append((argv, options["input"]))
        return replies.pop(0)

    def ask(prompt):
        asked.append(prompt)
        return password

    monkeypatch.setattr(subprocess, "run", run)
    monkeypatch.setattr(getpass, "getpass", ask)
    return calls, asked


def apply(tmp_path, decision=DECISION):
    path = tmp_path / "approval.json"
    path.write_text(
        decision if isinstance(decision, str) else json.dumps(decision), encoding="utf-8"
    )
    return approval_cli.main(["--root", str(tmp_path), "--layout", "ubuntu", str(path)])


def test_a_yes_that_needs_no_password_is_sent_once_as_the_file_says(monkeypatch, tmp_path, capsys):
    calls, asked = gateway(monkeypatch, DECIDED)
    assert apply(tmp_path) == 0
    [(argv, sent)] = calls
    assert argv[-8:] == ["exec", "-T", "gateway", "python", "-m", "gateway", "apply", "approvals"]
    assert argv[:2] == ["docker", "compose"]
    assert json.loads(sent) == DECISION and asked == []
    assert json.loads(capsys.readouterr().out)["status"] == "approved"


def test_a_yes_the_gateway_asks_the_password_for_is_sent_again_once_with_it(
    monkeypatch, tmp_path, capsys
):
    calls, asked = gateway(monkeypatch, NEEDS, DECIDED)
    assert apply(tmp_path) == 0
    (first, without), (again, with_password) = calls
    assert first == again and first[-6:] == [
        "gateway",
        "python",
        "-m",
        "gateway",
        "apply",
        "approvals",
    ]
    assert json.loads(without) == DECISION
    assert json.loads(with_password) == {**DECISION, "password": SECRET}
    assert asked == [approval_cli.PROMPT]
    assert SECRET not in " ".join(again)
    out = capsys.readouterr()
    assert json.loads(out.out)["status"] == "approved"
    assert "asks for your password" not in out.err and SECRET not in out.out + out.err


def test_a_refused_password_is_reported_and_never_retried(monkeypatch, tmp_path, capsys):
    wrong = SimpleNamespace(
        returncode=1,
        stdout=b"",
        stderr=b"Gateway did not complete: Password not accepted. Nothing was decided.\n",
    )
    calls, _ = gateway(monkeypatch, NEEDS, wrong)
    assert apply(tmp_path) == 1
    assert len(calls) == 2
    err = capsys.readouterr().err
    assert "Password not accepted" in err and SECRET not in err


def test_asking_twice_never_loops(monkeypatch, tmp_path, capsys):
    calls, asked = gateway(monkeypatch, NEEDS, NEEDS)
    assert apply(tmp_path) == 3
    assert len(calls) == 2 and len(asked) == 1


def test_no_password_decides_nothing(monkeypatch, tmp_path, capsys):
    calls, _ = gateway(monkeypatch, NEEDS, password="")
    assert apply(tmp_path) == 1
    assert len(calls) == 1 and "needs your password. Nothing was decided" in capsys.readouterr().err


def test_a_password_in_the_file_is_refused_before_anything_is_sent(monkeypatch, tmp_path, capsys):
    calls, asked = gateway(monkeypatch)
    assert apply(tmp_path, {**DECISION, "password": SECRET}) == 2
    assert calls == [] and asked == []
    assert SECRET not in capsys.readouterr().err


def test_a_malformed_file_is_left_to_the_gateway_and_asks_nothing(monkeypatch, tmp_path, capsys):
    refused = SimpleNamespace(
        returncode=1,
        stdout=b"",
        stderr=b"Gateway did not complete: Apply request is invalid JSON.\n",
    )
    calls, asked = gateway(monkeypatch, refused)
    assert apply(tmp_path, "not json") == 1
    assert [sent for _, sent in calls] == [b"not json"] and asked == []
    assert "invalid JSON" in capsys.readouterr().err


def test_a_gateway_command_that_cannot_start_decided_nothing(monkeypatch, tmp_path, capsys):
    def missing(argv, **options):
        raise FileNotFoundError(2, "No such file or directory", "docker")

    monkeypatch.setattr(subprocess, "run", missing)
    assert apply(tmp_path) == 1
    assert "Nothing was decided" in capsys.readouterr().err
