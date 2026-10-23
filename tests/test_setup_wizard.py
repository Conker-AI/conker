"""conker setup: the guided first run follows Pi's setup status and runs the same commands a
person would type, one plain question at a time."""

import io
import json
import os
import shutil
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import setup_wizard as wizard

ORDER = [
    "security",
    "companion",
    "model",
    "memory",
    "capabilities",
    "boundaries",
    "protection",
    "rehearsal",
]
OPERATION = {
    "security": "configure_owner_channel",
    "companion": "configure_companion",
    "model": "configure_model",
    "memory": "configure_memory",
    "capabilities": "configure_capabilities",
    "boundaries": "review_boundaries",
    "protection": "verify_protection",
    "rehearsal": "run_rehearsal",
}


def model(identity, execution, status="ready", **values):
    return {
        "id": identity,
        "providerId": identity,
        "providerName": identity.title(),
        "name": f"{identity} model",
        "route": identity,
        "status": status,
        "selected": False,
        "execution": execution,
        "dataNotice": "Notice.",
        "costNotice": "Cost.",
        **values,
    }


def request(identity, tool, reviewable=True):
    return {
        "id": identity,
        "reviewable": reviewable,
        "action": {"subject_type": "tool", "subject_id": tool},
    }


POLICY = {
    "digest": "0123456789abcdef" * 4,
    "tools": [
        {
            "id": "files.delete",
            "name": "Delete files",
            "authorization": "owner_confirmation",
        },
        {"id": "web.search", "name": "Web search", "authorization": "ai_review"},
        {"id": "system.status", "name": "System status", "authorization": "auto"},
    ],
    "lockdown": False,
}


class Conker:
    """Pi and ToolGate behind the launcher: each command a step needs moves that step on."""

    def __init__(self, done=(), *, approvals=None, sticky=()):
        self.done, self.sticky = set(done), set(sticky)
        self.calls, self.decisions = [], []
        self.models = [
            model("hosted", "hosted"),
            model("local", "local"),
            model("gone", "local", "unavailable"),
        ]
        self.protection = {"destination": None, "retentionCopies": None}
        self.rehearsal = {
            "conversation": "missing",
            "memoryReview": "missing",
            "approval": "missing",
        }
        self.approvals = (
            [
                request("req_other", "web.search"),
                request("req_used", wizard.TEST_TOOL, reviewable=False),
                request("req_test", wizard.TEST_TOOL),
            ]
            if approvals is None
            else approvals
        )
        self.next_operation = None

    def finish(self, step):
        if step not in self.sticky:
            self.done.add(step)

    def status(self):
        current = next((step for step in ORDER if step not in self.done), None)
        return {
            "schemaVersion": 1,
            "state": "complete" if current is None else "blocked",
            "currentStep": current,
            "recommendedNextOperation": self.next_operation or OPERATION.get(current),
            "steps": [
                {
                    "id": step,
                    "state": "complete" if step in self.done else "not_started",
                    "required": step not in {"memory", "capabilities"},
                }
                for step in ORDER
            ],
        }

    def json(self, *args):
        self.calls.append(args)
        match args:
            case ("setup", "status"):
                return self.status()
            case ("setup", "run", "companion", "--accept"):
                self.finish("companion")
            case ("setup", "models"):
                return {"revision": 0, "candidates": self.models}
            case ("setup", "run", "model", _):
                self.finish("model")
            case (
                "setup",
                "run",
                "memory" | "capabilities" as step,
                "--include" | "--skip",
            ):
                self.finish(step)
            case ("inspect", "boundaries"):
                return POLICY
            case ("setup", "run", "boundaries", "--confirm-digest", digest):
                assert digest == POLICY["digest"]
                self.finish("boundaries")
            case ("setup", "protection"):
                return self.protection
            case (
                "setup",
                "configure",
                "protection",
                "--destination",
                where,
                "--retention",
                keep,
            ):
                self.protection = {"destination": where, "retentionCopies": int(keep)}
            case ("setup", "rehearsal"):
                return {
                    **{phase: {"state": state} for phase, state in self.rehearsal.items()},
                    "approvalRequestId": "setup-approval-1",
                    "canFinalize": self.rehearsal["approval"] == "complete",
                }
            case ("setup", "run", "rehearsal", "--review-memory"):
                self.rehearsal["memoryReview"] = "complete"
            case ("setup", "run", "rehearsal", "--start-approval"):
                self.rehearsal["approval"] = "awaiting_owner"
            case ("inspect", "approvals"):
                return {"results": self.approvals, "next_cursor": None}
            case ("apply", "approvals", path):
                self.decisions.append((path, json.loads(Path(path).read_text(encoding="utf-8"))))
            case ("setup", "run", "rehearsal", "--finish-approval", "setup-approval-1"):
                self.rehearsal["approval"] = "complete"
            case ("setup", "run", "rehearsal", "--finalize"):
                self.finish("rehearsal")
            case _:
                raise AssertionError(f"unexpected command: {args}")
        return {}

    def interactive(self, *args):
        self.calls.append(args)
        if args == ("auth", "setup"):
            self.finish("security")
        elif args == ("setup", "run", "protection"):
            self.finish("protection")
        else:
            raise AssertionError(f"unexpected command: {args}")
        return True


class Owner:
    """Answers by the first words of each question; anything unlisted is Enter."""

    def __init__(self, conker, **answers):
        self.conker, self.answers, self.asked, self.lines = conker, answers, [], []

    def ask(self, question, default=""):
        self.asked.append(question)
        if question.startswith("Press Enter once it has answered"):
            self.conker.rehearsal["conversation"] = "complete"  # they chatted in the browser
        for start, reply in self.answers.items():
            if question.startswith(start):
                return reply
        return default

    def wizard(self):
        return wizard.Wizard(self.conker, asker=self.ask, out=self.lines.append)

    @property
    def text(self):
        return "\n".join(self.lines)


def test_a_fresh_install_is_walked_through_to_the_end():
    conker = Conker()
    owner = Owner(conker, **{"Backup folder": "/mnt/usb/conker"})
    assert owner.wizard().run() == 0
    assert conker.done == set(ORDER)
    commands = [call for call in conker.calls if call[:2] != ("setup", "status")]
    assert commands[:3] == [
        ("auth", "setup"),
        ("setup", "run", "companion", "--accept"),
        ("setup", "models"),
    ]
    # The local model that is ready is offered first; an unavailable one is not listed.
    assert ("setup", "run", "model", "local") in commands
    assert "gone model" not in owner.text
    assert ("setup", "run", "memory", "--include") in commands
    assert ("setup", "run", "boundaries", "--confirm-digest", POLICY["digest"]) in commands
    assert (
        "setup",
        "configure",
        "protection",
        "--destination",
        "/mnt/usb/conker",
        "--retention",
        "7",
    ) in commands
    # Only the rehearsal's own harmless request is approved, and its file is cleaned up.
    [(path, decision)] = conker.decisions
    assert decision == {"operation": "decide", "id": "req_test", "status": "approved"}
    assert not Path(path).exists()
    assert commands[-1] == ("setup", "run", "rehearsal", "--finalize")
    assert "Setup is complete" in owner.text


@pytest.mark.parametrize("reply", ["n", "no", "nope", "later"])
def test_anything_but_yes_stops_before_the_companion_is_kept(reply):
    conker = Conker(done={"security"})
    owner = Owner(conker, **{"Keep the supplied companion": reply})
    with pytest.raises(wizard.Stop, match="Companion settings"):
        owner.wizard().run()
    assert not any(call[:3] == ("setup", "run", "companion") for call in conker.calls)


def test_the_selected_model_is_the_default_and_a_bad_number_changes_nothing():
    conker = Conker(done={"security", "companion"})
    conker.models[0]["selected"] = True
    owner = Owner(conker, Number="9")
    with pytest.raises(wizard.Stop, match="listed numbers"):
        owner.wizard().configure_model()
    assert not any(call[:3] == ("setup", "run", "model") for call in conker.calls)
    default = Owner(Conker(done={"security", "companion"}))
    default.conker.models[0]["selected"] = True
    default.wizard().configure_model()
    assert ("setup", "run", "model", "hosted") in default.conker.calls


def test_the_owner_sees_how_each_tool_is_authorized_before_accepting():
    conker = Conker()
    owner = Owner(conker, **{"Accept these boundaries": "n"})
    with pytest.raises(wizard.Stop):
        owner.wizard().review_boundaries()
    assert "Delete files (asks you first)" in owner.text
    # ai_review waits for the owner too: ToolGate has no reviewer model.
    assert "Web search (asks you first)" in owner.text
    assert "System status (runs without asking)" in owner.text
    assert not any(call[:3] == ("setup", "run", "boundaries") for call in conker.calls)


def test_a_policy_without_a_digest_is_not_accepted():
    conker = Conker()
    conker.json = lambda *args: {"tools": []}
    with pytest.raises(wizard.Stop, match="reviewable policy"):
        Owner(conker).wizard().review_boundaries()


def test_an_unclear_approval_is_left_to_the_browser_inbox():
    approvals = [request("req_a", wizard.TEST_TOOL), request("req_b", wizard.TEST_TOOL)]
    conker = Conker(done=set(ORDER) - {"rehearsal"}, approvals=approvals)
    conker.rehearsal = {
        "conversation": "complete",
        "memoryReview": "complete",
        "approval": "awaiting_owner",
    }
    owner = Owner(conker)
    owner.wizard().run_rehearsal()
    assert conker.decisions == []
    assert any(question.startswith("Press Enter once it is approved") for question in owner.asked)
    assert conker.calls[-1] == (
        "setup",
        "run",
        "rehearsal",
        "--finish-approval",
        "setup-approval-1",
    )


def test_a_saved_backup_folder_is_kept_without_rewriting_it():
    conker = Conker(done={"security"})
    conker.protection = {"destination": "/mnt/usb/conker", "retentionCopies": 5}
    Owner(conker).wizard().verify_protection()
    assert not any(call[:3] == ("setup", "configure", "protection") for call in conker.calls)
    assert conker.calls[-1] == ("setup", "run", "protection")


def test_a_backup_folder_must_be_a_full_path():
    conker = Conker(done={"security"})
    with pytest.raises(wizard.Stop, match="full path"):
        Owner(conker, **{"Backup folder": "usb"}).wizard().verify_protection()
    assert conker.calls == [("setup", "protection")]


def test_a_step_that_does_not_advance_stops_instead_of_asking_again():
    conker = Conker(done={"security", "companion"}, sticky={"model"})
    with pytest.raises(wizard.Stop, match="still is not finished"):
        Owner(conker).wizard().run()
    assert sum(call[:3] == ("setup", "run", "model") for call in conker.calls) == 1


def test_repairs_are_left_to_conker_doctor():
    conker = Conker(done={"security"})
    conker.next_operation = "repair_toolgate"
    with pytest.raises(wizard.Stop, match="conker doctor"):
        Owner(conker).wizard().run()
    assert conker.calls == [("setup", "status")]


def test_scripts_are_pointed_at_the_step_commands(monkeypatch, capsys):
    monkeypatch.setattr(sys, "stdin", io.StringIO(""))
    assert wizard.main(["--launcher", "conker"]) == 2
    assert "conker setup run STEP" in capsys.readouterr().err


def bash():
    if sys.platform != "win32":
        return shutil.which("bash")
    found = Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Git/usr/bin/bash.exe"
    return str(found) if found.exists() else None


def test_the_launcher_starts_the_wizard_only_in_a_terminal(ubuntu_cli):
    result = ubuntu_cli("setup")
    assert result.returncode == 2
    assert "needs a terminal" in result.stderr
    assert not ubuntu_cli.docker_log.exists()


def test_the_wizard_drives_the_real_launcher_commands(ubuntu_cli):
    shell = bash()
    if not shell:
        pytest.skip("bash is required")
    launcher = wizard.Launcher(
        str(ubuntu_cli.deployment / "sources/companion/conker"),
        shell=shell,
        env={**ubuntu_cli.environment, "CONKER_LAYOUT": "ubuntu"},
    )
    owner = Owner(Conker())
    steps = wizard.Wizard(launcher, asker=owner.ask, out=owner.lines.append)
    steps.configure_companion()
    steps.configure_model()
    steps.configure_memory()
    steps.review_boundaries()
    steps.run_rehearsal()
    log = ubuntu_cli.docker_log.read_text(encoding="utf-8")
    for command in (
        "set-setup-choice companion:accept",
        "set-setup-model local-answer",
        "set-setup-choice memory:include",
        "review-boundaries " + "a" * 64,
        "setup-rehearsal review-memory",
    ):
        assert command in log


def test_enter_keeps_the_default_and_closed_input_stops(monkeypatch):
    replies = iter(["", "yes", "maybe"])
    monkeypatch.setattr("builtins.input", lambda prompt: next(replies))
    assert wizard.confirm("Go?", default=False) is False
    assert wizard.confirm("Go?", default=False) is True
    assert wizard.confirm("Go?") is False

    def closed(prompt):
        raise EOFError

    monkeypatch.setattr("builtins.input", closed)
    with pytest.raises(wizard.Stop):
        wizard.ask("Number:", "1")
