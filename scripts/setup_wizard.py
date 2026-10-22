#!/usr/bin/env python3
"""conker setup: a guided first run, one plain question at a time.

The wizard follows Pi's own setup status (`conker setup status`): it asks only what the current
step needs, runs the same `conker setup ...` command a person would type, then reads the status
again. It never guesses that a step worked; Pi decides. Stop at any time with Ctrl+C and run
`conker setup` again to continue where you left off. Scripts use `conker setup run STEP` instead.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

STEPS = {
    "security": "Sign-in password",
    "companion": "Your companion",
    "model": "Answer model",
    "memory": "Memory",
    "capabilities": "Tools",
    "boundaries": "Tool boundaries",
    "protection": "Backups",
    "rehearsal": "First test run",
}
DIGEST = re.compile(r"[0-9a-f]{64}")
TEST_TOOL = "approval.test-echo"  # the rehearsal's harmless tool; it only echoes back
AUTHORIZATION = {
    "owner_confirmation": "asks you first",
    "ai_review": "a reviewer model checks it first",
    "auto": "runs without asking",
}
ROUNDS = 40  # every round runs one command; this bounds a step that never advances


class Stop(Exception):
    """The owner chose to stop, or a step needs work outside the wizard."""


class Launcher:
    """Runs `conker ...` the way a person would, reading JSON where the command prints it."""

    def __init__(self, path: str, *, shell: str = "bash", env: dict | None = None):
        self.command, self.env = [shell, path], env

    def json(self, *args: str) -> dict:
        result = subprocess.run(
            [*self.command, *args],
            capture_output=True,
            text=True,
            check=False,
            env=self.env,
        )
        if result.returncode != 0:
            raise Stop(_reason(result.stderr) or f"conker {' '.join(args)} did not finish.")
        try:
            return json.loads(result.stdout)
        except ValueError:
            raise Stop(f"conker {' '.join(args)} printed something unexpected.") from None

    def interactive(self, *args: str) -> bool:
        """For commands that talk to the owner themselves, such as setting the password."""
        return subprocess.run([*self.command, *args], check=False, env=self.env).returncode == 0


def _reason(text: str) -> str:
    lines = [line.strip() for line in (text or "").splitlines() if line.strip()]
    return lines[-1][:300] if lines else ""


def say(text: str = "") -> None:
    print(text, flush=True)


def ask(question: str, default: str = "") -> str:
    hint = f" [{default}]" if default else ""
    try:
        reply = input(f"  {question}{hint} ").strip()
    except EOFError:
        raise Stop("No more input.") from None
    return reply or default


def confirm(question: str, default: bool = True, asker=ask) -> bool:
    hint = "Y/n" if default else "y/N"
    reply = asker(question, hint).strip().lower()
    if reply == hint.lower():  # Enter keeps the default shown
        return default
    return reply in {"y", "yes"}  # anything unclear is a no


STATES = {"complete": "done", "not_started": "to do", "degraded": "needs attention"}


def overview(status: dict, out=say) -> None:
    for step in status.get("steps", []):
        label = STEPS.get(step["id"], step["id"])
        state = STATES.get(step["state"], step["state"].replace("_", " "))
        optional = "" if step.get("required", True) else " (optional)"
        out(f"    {label:<18} {state}{optional}")


class Wizard:
    def __init__(self, launcher: Launcher, *, asker=ask, out=say):
        self.conker, self.ask, self.say = launcher, asker, out

    def confirm(self, question: str, default: bool = True) -> bool:
        return confirm(question, default, self.ask)

    # --- one handler per operation Pi recommends --------------------------------------------

    def configure_owner_channel(self):
        self.say("  Choose the password you will use to open Conker in the browser.")
        if not self.conker.interactive("auth", "setup"):
            raise Stop("The password was not set. Run conker auth setup, then conker setup.")

    def configure_companion(self):
        self.say("  Conker comes with a companion: a friendly assistant you can rename and")
        self.say("  reshape later in the app. Nothing about you is stored yet.")
        if not self.confirm("Keep the supplied companion for now?"):
            raise Stop(
                "Shape the companion in the app (Companion settings), then run conker setup."
            )
        self.conker.json("setup", "run", "companion", "--accept")

    def configure_model(self):
        options = self.conker.json("setup", "models")
        candidates = [
            item for item in options.get("candidates", []) if item.get("status") != "unavailable"
        ]
        if not candidates:
            raise Stop("No answer model is available yet. Run conker doctor to see why.")
        self.say("  Which model should answer you? Local ones run on this machine.")
        numbered = list(enumerate(candidates, 1))
        default = next((n for n, item in numbered if item.get("selected")), None) or next(
            (
                n
                for n, item in numbered
                if item["execution"] == "local" and item["status"] == "ready"
            ),
            1,
        )
        for number, item in numbered:
            self.say(
                f"    {number}. {item['name']} ({item['providerName']}, {item['execution']}, {item['status']})"
            )
            self.say(f"       {item['dataNotice']} {item['costNotice']}")
        choice = self.ask("Number:", str(default))
        if not choice.isdigit() or not 1 <= int(choice) <= len(candidates):
            raise Stop("Choose one of the listed numbers next time.")
        chosen = candidates[int(choice) - 1]
        self.say(f"  Checking {chosen['name']} with a real answer. This can take a minute.")
        self.conker.json("setup", "run", "model", chosen["id"])

    test_model = configure_model

    def _optional(self, step: str, question: str, explanation: str):
        self.say(explanation)
        include = self.confirm(question)
        self.conker.json("setup", "run", step, "--include" if include else "--skip")

    def configure_memory(self):
        self._optional(
            "memory",
            "Let Conker remember things between chats?",
            "  With memory on, your companion keeps what matters across chats. You can see,\n"
            "  correct and forget every memory later.",
        )

    def configure_capabilities(self):
        self._optional(
            "capabilities",
            "Let Conker use tools, asking you first when it matters?",
            "  Tools let your companion search the web or read this machine's status. Next you\n"
            "  see which tools ask you first, and decide.",
        )

    def review_boundaries(self):
        policy = self.conker.json("inspect", "boundaries")
        digest = policy.get("digest", "")
        if not DIGEST.fullmatch(str(digest)):
            raise Stop("ToolGate did not return a reviewable policy. Run conker doctor.")
        tools = [item for item in policy.get("tools", []) if isinstance(item, dict)]
        self.say(f"  Your companion may use {len(tools)} tool(s):")
        for item in tools[:20]:
            mode = str(item.get("authorization", "unknown"))
            asks = AUTHORIZATION.get(mode, mode.replace("_", " "))
            self.say(f"    - {item.get('name') or item.get('id')} ({asks})")
        if len(tools) > 20:
            self.say(f"    ...and {len(tools) - 20} more.")
        if policy.get("lockdown"):
            self.say("  ToolGate is in lockdown: no tool runs until you release it.")
        self.say("  Every limit: conker inspect boundaries")
        if not self.confirm("Accept these boundaries?"):
            raise Stop("Change tool access in the app, then run conker setup.")
        self.conker.json("setup", "run", "boundaries", "--confirm-digest", digest)

    def verify_protection(self):
        self.say("  Conker backs up to a folder on another drive, so one broken disk cannot take")
        self.say("  your conversations and memories with it (a USB disk or a network share).")
        saved = self.conker.json("setup", "protection")
        destination = self.ask("Backup folder on another drive:", saved.get("destination") or "")
        if not destination.startswith("/"):
            raise Stop("Use the full path of a mounted folder, such as /mnt/backup/conker.")
        retention = self.ask(
            "How many backups to keep (2 to 64):",
            str(saved.get("retentionCopies") or 7),
        )
        if not retention.isdigit() or not 2 <= int(retention) <= 64:
            raise Stop("Keep between 2 and 64 backups.")
        if (destination, int(retention)) != (
            saved.get("destination"),
            saved.get("retentionCopies"),
        ):
            self.conker.json(
                "setup",
                "configure",
                "protection",
                "--destination",
                destination,
                "--retention",
                retention,
            )
        self.say("  Making the first backup and checking it. This can take a few minutes.")
        if not self.conker.interactive("setup", "run", "protection"):
            raise Stop(
                "The first backup did not finish. Its message is above; fix it and run conker setup."
            )

    def run_rehearsal(self):
        status = self.conker.json("setup", "rehearsal")
        if status["conversation"]["state"] != "complete":
            self.say(
                "  Last, a short test. Open Conker in your browser and send your companion any"
            )
            self.say("  message, like 'hello'.")
            self.ask("Press Enter once it has answered.", "")
            return
        if status["memoryReview"]["state"] != "complete":
            self.say("  Confirming your memory choice for the test run.")
            self.conker.json("setup", "run", "rehearsal", "--review-memory")
            return
        approval = status["approval"]["state"]
        if approval == "missing":
            self.say("  Asking for one harmless test action, to show how approvals work.")
            self.conker.json("setup", "run", "rehearsal", "--start-approval")
            return
        if approval == "awaiting_owner":
            self._approve_test(status["approvalRequestId"])
            return
        if status.get("canFinalize"):
            self.conker.json("setup", "run", "rehearsal", "--finalize")
            return
        raise Stop(
            f"The test action is {approval.replace('_', ' ')}. Run conker setup rehearsal for details."
        )

    def _approve_test(self, request_id: str):
        # Only the rehearsal's own harmless tool, and only while ToolGate says it can be approved.
        pending = [
            item
            for item in self.conker.json("inspect", "approvals").get("results", [])
            if item.get("reviewable") is True
            and (item.get("action") or {}).get("subject_type") == "tool"
            and (item.get("action") or {}).get("subject_id") == TEST_TOOL
        ]
        if len(pending) != 1:
            self.say("  Approve the test action in your browser's Inbox.")
            self.ask("Press Enter once it is approved.", "")
        else:
            self.say("  The test action only echoes back; it touches nothing.")
            if not self.confirm("Approve it?"):
                raise Stop("The test needs one approval. Run conker setup when you are ready.")
            decision = {
                "operation": "decide",
                "id": pending[0]["id"],
                "status": "approved",
            }
            with tempfile.NamedTemporaryFile(
                "w", suffix=".json", delete=False, encoding="utf-8"
            ) as stream:
                json.dump(decision, stream)
            try:
                self.conker.json("apply", "approvals", stream.name)
            finally:
                Path(stream.name).unlink(missing_ok=True)
        self.conker.json("setup", "run", "rehearsal", "--finish-approval", request_id)

    # --- the loop -------------------------------------------------------------------------------

    def run(self) -> int:
        self.say("\n  Conker first-run setup. Ctrl+C stops; conker setup continues later.\n")
        last = None
        for _ in range(ROUNDS):
            status = self.conker.json("setup", "status")
            overview(status, self.say)
            if status.get("state") == "complete" or not status.get("currentStep"):
                self.say("\n  Setup is complete. Open Conker and say hello.")
                return 0
            step, operation = (
                status["currentStep"],
                status.get("recommendedNextOperation"),
            )
            self.say(f"\n  Next: {STEPS.get(step, step)}")
            # The test run moves through several phases; any other step that comes straight
            # back did not take, and asking again would not help.
            if (step, operation) == last and operation != "run_rehearsal":
                raise Stop("That step still is not finished. conker setup status shows why.")
            handler = getattr(self, operation or "", None)
            if handler is None:
                raise Stop(
                    f"{STEPS.get(step, step)} needs a repair the wizard cannot do. "
                    "conker doctor shows what is wrong; then run conker setup."
                )
            handler()
            last = (step, operation)
        raise Stop("Setup did not finish. conker setup status shows where it stands.")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--launcher", default=os.environ.get("CONKER_LAUNCHER", ""))
    args = parser.parse_args(argv)
    if not sys.stdin.isatty():
        print(
            "The setup wizard needs a terminal. Scripts use conker setup run STEP.",
            file=sys.stderr,
        )
        return 2
    if not args.launcher:
        print("Run the wizard through conker setup.", file=sys.stderr)
        return 2
    try:
        return Wizard(Launcher(args.launcher)).run()
    except Stop as stop:
        say(f"\n  {stop}")
        return 1
    except KeyboardInterrupt:
        say("\n\n  Stopped. Run conker setup to continue where you left off.")
        return 130


if __name__ == "__main__":
    sys.exit(main())
