"""Refusals of conker import and conker config on an installed stack (scripts/import_cli.py,
scripts/config_cli.py): bad arguments, a missing registry or export, a Pi that does not answer or
answers wrongly. Docker is never started: subprocess.run is a fake that records what it was sent."""

import json
import runpy
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import config_cli  # noqa: E402
import conker_config  # noqa: E402
import import_cli  # noqa: E402

EXPORT = json.dumps([{"uuid": "k1", "name": "Essay", "chat_messages": []}]).encode()
PREVIEW = {
    "source": "claude",
    "chats": {"inFile": 1, "new": 1, "updated": 0, "unchanged": 0},
    "messages": {"inFile": 2, "new": 2, "yours": 1, "offeredToMemory": 1},
    "firstAt": 1714557600.0,
    "lastAt": 1730000000.0,
    "sampleTitles": ["Essay"],
    "skipped": {},
    "memory": {"on": True, "reason": None, "configured": True},
}


def answering(monkeypatch, module, stdout=b"", code=0, stderr=b"", error=None):
    """subprocess.run in `module` answers once per call; the calls are returned."""
    calls = []

    def run(command, **options):
        calls.append((command, options))
        if error is not None:
            raise error
        return SimpleNamespace(returncode=code, stdout=stdout, stderr=stderr)

    monkeypatch.setattr(module.subprocess, "run", run)
    return calls


def never_sent(monkeypatch, module):
    monkeypatch.setattr(
        module.subprocess, "run", lambda *a, **k: pytest.fail("a call was sent")
    )


# --- config_cli.reason ------------------------------------------------------


@pytest.mark.parametrize(
    "content",
    [
        b"not json",
        b"[1, 2]",
        b'"a string"',
        b'{"detail": {"code": "x"}}',
        b'{"detail": ""}',
        b'{"detail": 42}',
        b"{}",
    ],
)
def test_reason_gives_nothing_when_the_refusal_has_no_words(content):
    assert config_cli.reason(content) == ""


def test_reason_drops_the_final_full_stop_of_the_services_words():
    assert config_cli.reason(b'{"detail": "Gone."}') == ": Gone"
    assert config_cli.reason(b'{"detail": {"message": "Too deep."}}') == ": Too deep"


# --- config_cli.request -----------------------------------------------------


@pytest.mark.parametrize(
    "error", [OSError("no docker"), subprocess.TimeoutExpired(["docker"], 120)]
)
def test_request_says_pi_did_not_answer_when_docker_cannot_run(monkeypatch, error):
    answering(monkeypatch, config_cli, error=error)
    with pytest.raises(
        config_cli.NotConfirmed, match=r"^Pi did not answer\. Check it with: conker status$"
    ):
        config_cli.request(["docker"], "pi", "/owner/settings")


def test_request_names_toolgate_when_the_gateway_relay_cannot_run(monkeypatch):
    answering(monkeypatch, config_cli, error=OSError("no docker"))
    with pytest.raises(config_cli.NotConfirmed, match=r"^ToolGate did not answer\."):
        config_cli.request(["docker"], "toolgate-owner", "/v2/owner/settings")


def test_request_without_a_status_line_or_stderr_says_only_check_status(monkeypatch):
    answering(monkeypatch, config_cli, stdout=b"Traceback\n", code=0)
    with pytest.raises(
        config_cli.NotConfirmed,
        match=r"^Pi did not answer in its container\. Check it with: conker status$",
    ):
        config_cli.request(["docker"], "pi", "/owner/settings")


def test_request_quotes_only_the_last_stderr_line_cut_to_200_characters(monkeypatch):
    stderr = b"first line\n" + b"x" * 300 + b"\n"
    answering(monkeypatch, config_cli, code=1, stderr=stderr)
    with pytest.raises(config_cli.NotConfirmed) as refused:
        config_cli.request(["docker"], "pi", "/owner/settings")
    assert str(refused.value) == (
        f"Pi did not answer in its container ({'x' * 200}). Check it with: conker status"
    )


def test_request_refuses_a_confirmation_that_is_not_json(monkeypatch):
    answering(monkeypatch, config_cli, stdout=b"200\n<html>")
    with pytest.raises(config_cli.NotConfirmed, match=r"^ToolGate answered with something"):
        config_cli.request(["docker"], "toolgate-owner", "/v2/owner/settings")


def test_a_query_is_encoded_after_the_path_is_checked(monkeypatch):
    calls = answering(monkeypatch, config_cli, stdout=b"200\n{}")
    config_cli.request(["docker"], "pi", "/inbox", query={"q": "a b&c=/../x"})
    assert calls[0][0][-2:] == ["GET", "/inbox?q=a+b%26c%3D%2F..%2Fx"]


def test_a_refused_read_does_not_say_nothing_was_saved(monkeypatch):
    answering(monkeypatch, config_cli, stdout=b"503\n")
    with pytest.raises(config_cli.NotConfirmed) as refused:
        config_cli.request(["docker"], "pi", "/owner/settings")
    assert str(refused.value) == "Pi refused it (HTTP 503)."


@pytest.mark.parametrize(
    "path",
    ["", "/", "owner/settings", "/owner/settings/", "/owner/settings?x=1", "/a b"],
)
def test_request_refuses_a_path_that_is_not_a_settings_home(monkeypatch, path):
    never_sent(monkeypatch, config_cli)
    with pytest.raises(ValueError, match="is not a settings home in Pi"):
        config_cli.request(["docker"], "pi", path)


def test_request_refuses_put_on_a_read_before_sending(monkeypatch):
    never_sent(monkeypatch, config_cli)
    with pytest.raises(ValueError, match="only PUT"):
        config_cli.request(["docker"], "toolgate-owner", "/v2/owner/settings", method="PUT")
    with pytest.raises(ValueError, match="only PUT"):
        config_cli.request(["docker"], "pi", "/owner/settings", {"x": 1}, method="POST")


def test_request_refuses_an_unknown_service_before_checking_its_path(monkeypatch):
    never_sent(monkeypatch, config_cli)
    with pytest.raises(config_cli.NotConfirmed, match=r"^Settings kept by browser cannot"):
        config_cli.request(["docker"], "browser", "not a path")


# --- config_cli.main --------------------------------------------------------


def a_pi_toggle() -> dict:
    """A global toggle Pi keeps in its owner settings, taken from the live registry."""
    for setting in conker_config.load_registry():
        home = setting.get("home", {})
        if (
            setting["type"] == "toggle"
            and setting["scope"] == "global"
            and home.get("service") == "pi"
            and home.get("path") == "/owner/settings"
        ):
            return setting
    pytest.skip("the registry has no global Pi toggle")


@pytest.mark.parametrize(
    "argv",
    [
        ["--layout", "ubuntu", "list"],
        ["--root", "/srv/conker", "list"],
        ["--root", "/srv/conker", "--layout", "windows", "list"],
        ["--root", "/srv/conker", "--lay", "ubuntu", "list"],
        ["--root", "/srv/conker", "--layout", "ubuntu"],
        ["--root", "/srv/conker", "--layout", "ubuntu", "remove", "x"],
        ["--root", "/srv/conker", "--layout", "ubuntu", "set", "only-an-id"],
    ],
)
def test_config_main_refuses_bad_arguments_with_usage(monkeypatch, capsys, argv):
    never_sent(monkeypatch, config_cli)
    with pytest.raises(SystemExit) as stopped:
        config_cli.main(argv)
    assert stopped.value.code == 2
    assert "usage:" in capsys.readouterr().err


def test_config_main_refuses_when_the_registry_is_missing(
    monkeypatch, capsys, tmp_path
):
    never_sent(monkeypatch, config_cli)
    monkeypatch.setattr(config_cli, "REGISTRY", tmp_path)
    (tmp_path / "README.md").write_text("no topics here", encoding="utf-8")
    assert config_cli.main(["--root", "/srv", "--layout", "ubuntu", "list"]) == 1
    assert capsys.readouterr().err.strip() == (
        f"The settings registry is missing: {tmp_path}"
    )


def test_config_main_refuses_an_unknown_setting_with_exit_2(monkeypatch, capsys):
    never_sent(monkeypatch, config_cli)
    argv = ["--root", "/srv", "--layout", "ubuntu", "get", "no.such_setting"]
    assert config_cli.main(argv) == 2
    assert "Unknown setting 'no.such_setting'" in capsys.readouterr().err


def test_config_main_refuses_a_bad_toggle_value_before_sending(monkeypatch, capsys):
    never_sent(monkeypatch, config_cli)
    setting = a_pi_toggle()
    argv = ["--root", "/srv", "--layout", "ubuntu", "set", setting["id"], "maybe"]
    assert config_cli.main(argv) == 2
    assert capsys.readouterr().err.strip() == "Use on or off."


def test_config_main_reports_pis_refusal_with_exit_1(monkeypatch, capsys, tmp_path):
    calls = answering(
        monkeypatch,
        config_cli,
        stdout=b'403\n{"detail": {"code": "forbidden", "message": "Wrong key."}}',
    )
    setting = a_pi_toggle()
    argv = ["--root", str(tmp_path), "--layout", "repository", "get", setting["id"]]
    assert config_cli.main(argv) == 1
    assert capsys.readouterr().err.strip() == "Pi refused it (HTTP 403): Wrong key."
    ((command, options),) = calls
    assert command[:3] == ["docker", "compose", "--env-file"]
    assert str(tmp_path / "docker-compose.yml") in command
    assert command[-2:] == ["GET", "/owner/settings"] and options["input"] == b""


def test_config_main_reports_a_conflict_on_save_with_exit_1(monkeypatch, capsys):
    setting = a_pi_toggle()
    answers = [
        SimpleNamespace(
            returncode=0, stdout=b'200\n{"revision": 4, "values": {}}', stderr=b""
        ),
        SimpleNamespace(
            returncode=0, stdout=b'409\n{"detail": {"code": "conflict"}}', stderr=b""
        ),
    ]
    sent = []

    def run(command, **options):
        sent.append((command[-2:], options["input"]))
        return answers.pop(0)

    monkeypatch.setattr(config_cli.subprocess, "run", run)
    argv = ["--root", "/srv", "--layout", "ubuntu", "set", setting["id"], "on"]
    assert config_cli.main(argv) == 1
    assert "changed while the command ran, so nothing was saved" in (
        capsys.readouterr().err
    )
    (read, _), (write, body) = sent
    assert read == ["GET", "/owner/settings"] and write == ["POST", "/owner/settings"]
    assert json.loads(body)["expected_revision"] == 4 and not answers


def test_config_cli_run_as_a_script_refuses_without_its_host_arguments(
    monkeypatch, capsys
):
    monkeypatch.setattr(sys, "argv", ["config_cli.py", "list"])
    with pytest.raises(SystemExit) as stopped:
        runpy.run_path(str(ROOT / "scripts" / "config_cli.py"), run_name="__main__")
    assert stopped.value.code == 2
    assert "--root" in capsys.readouterr().err


# --- import_cli.caller ------------------------------------------------------


def a_call():
    return import_cli.caller(["docker", "compose"])


def test_caller_refuses_a_route_before_sending(monkeypatch):
    never_sent(monkeypatch, import_cli)
    call = a_call()
    for method, path in (
        ("PUT", "/imports/claude/preview"),
        ("POST", "/imports/claude/preview/x"),
        ("POST", "/imports/claude/" + "A" * 64),
        ("POST", "/imports/claude/" + "a" * 63),
        ("POST", "/imports/gemini/preview"),
        ("POST", "/imports/claude/preview?x=1"),
    ):
        with pytest.raises(ValueError, match="is not an import call"):
            call(method, path, EXPORT)


def test_caller_says_a_slow_import_can_be_repeated(monkeypatch):
    calls = answering(
        monkeypatch, import_cli, error=subprocess.TimeoutExpired(["docker"], 660)
    )
    with pytest.raises(OSError) as failed:
        a_call()("POST", "/imports/chatgpt/preview", EXPORT)
    assert str(failed.value) == (
        "Pi did not answer in time. Importing the same file again adds nothing twice."
    )
    assert calls[0][1]["timeout"] == 660


@pytest.mark.parametrize(
    ("stdout", "code"),
    [(b"200\n[]", 1), (b"", 0), (b"Traceback (most recent call last)\n", 0)],
)
def test_caller_refuses_an_answer_from_outside_the_relay(monkeypatch, stdout, code):
    answering(monkeypatch, import_cli, stdout=stdout, code=code)
    with pytest.raises(OSError, match=r"^Pi did not answer in its container"):
        a_call()("POST", "/imports/chatgpt/preview", EXPORT)


@pytest.mark.parametrize("status", [b"302", b"500", b"204", b"100"])
def test_caller_refuses_a_status_that_does_not_confirm(monkeypatch, status):
    answering(monkeypatch, import_cli, stdout=status + b"\n{}")
    with pytest.raises(OSError) as failed:
        a_call()("POST", "/imports/chatgpt/preview", EXPORT)
    assert str(failed.value) == f"Pi did not confirm it (HTTP {status.decode()})."
    assert not isinstance(failed.value, import_cli.Refused)


def test_caller_refusal_without_words_gives_only_the_status(monkeypatch):
    answering(monkeypatch, import_cli, stdout=b"404\nnot found")
    with pytest.raises(import_cli.Refused) as refused:
        a_call()("POST", "/imports/chatgpt/preview", EXPORT)
    assert str(refused.value) == "Pi refused it (HTTP 404)."


def test_caller_refuses_a_confirmation_that_is_not_json(monkeypatch):
    answering(monkeypatch, import_cli, stdout=b"200\n<html>")
    with pytest.raises(OSError, match=r"^Pi answered with something other than JSON"):
        a_call()("POST", "/imports/chatgpt/preview", EXPORT)


# --- import_cli.main --------------------------------------------------------


def import_argv(root, *rest, layout="ubuntu"):
    return ["--root", str(root), "--layout", layout, *rest]


@pytest.mark.parametrize(
    "rest",
    [
        [],
        ["gemini", "export.zip"],
        ["chatgpt"],
        ["chatgpt", "export.zip", "--yes", "--preview"],
    ],
)
def test_import_main_refuses_bad_arguments_with_usage(
    monkeypatch, capsys, tmp_path, rest
):
    never_sent(monkeypatch, import_cli)
    with pytest.raises(SystemExit) as stopped:
        import_cli.main(import_argv(tmp_path, *rest))
    assert stopped.value.code == 2
    assert "usage:" in capsys.readouterr().err


def test_import_main_refuses_a_bad_layout(monkeypatch, capsys, tmp_path):
    never_sent(monkeypatch, import_cli)
    with pytest.raises(SystemExit) as stopped:
        import_cli.main(import_argv(tmp_path, "chatgpt", "x", layout="docker"))
    assert stopped.value.code == 2
    assert "invalid choice" in capsys.readouterr().err


def test_import_main_refuses_a_missing_export_with_exit_2(
    monkeypatch, capsys, tmp_path
):
    never_sent(monkeypatch, import_cli)
    missing = tmp_path / "nothing.zip"
    assert import_cli.main(import_argv(tmp_path, "claude", str(missing))) == 2
    assert capsys.readouterr().err.strip() == f"There is no file at {missing}."


def test_import_main_refuses_a_folder_without_the_export(
    monkeypatch, capsys, tmp_path
):
    never_sent(monkeypatch, import_cli)
    assert import_cli.main(import_argv(tmp_path, "chatgpt", str(tmp_path))) == 2
    assert "There is no conversations.json in that folder." in capsys.readouterr().err


@pytest.mark.parametrize(
    ("stdout", "code", "message"),
    [
        (b"", 1, "Pi did not answer in its container. Check it with: conker status"),
        (
            b'422\n{"detail": {"message": "The file is not valid JSON."}}',
            0,
            "Pi refused it (HTTP 422): The file is not valid JSON.",
        ),
        (b"502\n", 0, "Pi did not confirm it (HTTP 502)."),
    ],
)
def test_import_main_reports_pis_failure_with_exit_1(
    monkeypatch, capsys, tmp_path, stdout, code, message
):
    export = tmp_path / "conversations.json"
    export.write_bytes(EXPORT)
    calls = answering(monkeypatch, import_cli, stdout=stdout, code=code)
    assert import_cli.main(import_argv(tmp_path, "chatgpt", str(export))) == 1
    assert capsys.readouterr().err.strip() == message
    ((command, options),) = calls
    assert command[-2:] == ["POST", "/imports/chatgpt/preview"]
    assert options["input"] == EXPORT


def test_import_main_prints_pis_answer_as_json_on_the_repository_layout(
    monkeypatch, capsys, tmp_path
):
    export = tmp_path / "conversations.json"
    export.write_bytes(EXPORT)
    calls = answering(monkeypatch, import_cli, stdout=b"200\n" + json.dumps(PREVIEW).encode())
    argv = import_argv(tmp_path, "claude", str(tmp_path), "--json", layout="repository")
    assert import_cli.main(argv) == 0
    assert json.loads(capsys.readouterr().out) == PREVIEW
    ((command, _),) = calls
    assert command[:3] == ["docker", "compose", "--env-file"]
    assert str(tmp_path / "docker-compose.yml") in command
    assert command[-2:] == ["POST", "/imports/claude/preview"]


def test_import_cli_run_as_a_script_refuses_without_its_host_arguments(
    monkeypatch, capsys
):
    monkeypatch.setattr(sys, "argv", ["import_cli.py", "chatgpt", "x"])
    with pytest.raises(SystemExit) as stopped:
        runpy.run_path(str(ROOT / "scripts" / "import_cli.py"), run_name="__main__")
    assert stopped.value.code == 2
    assert "--root" in capsys.readouterr().err
