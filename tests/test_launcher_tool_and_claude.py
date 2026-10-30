"""The installed launcher's `conker tool draft` and `conker providers claude`, against a fake
deployment and a recording Docker (tests/conftest.py, ubuntu_cli)."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]

# Pi's tool-request routes, as the pi container's relay sees them.
FAKE_PI = """
import json, os, sys
from pathlib import Path
state = Path(os.environ["FAKE_PI_STATE"])
calls = json.loads(state.read_text()) if state.exists() else []
method, path = sys.argv[-2:]
body = json.load(sys.stdin) if method == "POST" else None
calls.append([method, path, body])
state.write_text(json.dumps(calls))
status = "drafting" if method == "POST" else "ready"
request = {"id": "creq_" + "b" * 32, "kind": "tool_draft", "title": "Draft a tool: disks",
           "payload": {"description": "disks", "status": status, "steps": ["Read the disks"],
                       "issues": []}, "state": "open"}
if path == "/tool-drafts" and body["description"] == "refuse me":
    sys.stdout.write('409\\n{"detail": {"code": "request_reused", "message": "Already used."}}')
else:
    sys.stdout.write("200\\n" + json.dumps(request))
"""


@pytest.mark.skipif(
    sys.platform == "win32", reason="Python starts the recording Docker, a POSIX script"
)
def test_tool_draft_files_the_request_in_pi_and_waits_for_it(ubuntu_cli, tmp_path):
    scripts = ubuntu_cli.deployment / "sources/companion/scripts"
    for name in ("tool_drafts.py", "tool_draft_cli.py"):
        shutil.copy2(ROOT / "scripts" / name, scripts / name)
    fake, state = tmp_path / "fake_pi.py", tmp_path / "pi-calls.json"
    fake.write_text(FAKE_PI, encoding="utf-8")
    ubuntu_cli.environment.update(FAKE_PI=str(fake), FAKE_PI_STATE=str(state))

    result = ubuntu_cli("tool", "draft", "Show my disks")

    assert result.returncode == 0, result.stderr
    assert "1. Read the disks" in result.stdout
    calls = json.loads(state.read_text(encoding="utf-8"))
    assert [call[:2] for call in calls] == [
        ["POST", "/tool-drafts"],
        ["GET", "/change-requests/creq_" + "b" * 32],
    ]
    assert calls[0][2]["description"] == "Show my disks"
    log = ubuntu_cli.docker_log.read_text(encoding="utf-8")
    assert "exec -T pi python -c" in log and "X-Pi-Key" in log

    refused = ubuntu_cli("tool", "draft", "refuse me")
    assert refused.returncode == 1
    assert "Pi refused it (HTTP 409): Already used." in refused.stderr

    state.unlink()
    filed = ubuntu_cli("tool", "draft", "Show my disks", "--no-wait")
    assert filed.returncode == 0 and "Drafting." in filed.stdout
    assert len(json.loads(state.read_text(encoding="utf-8"))) == 1


def test_tool_draft_checks_its_arguments_before_docker(ubuntu_cli):
    scripts = ubuntu_cli.deployment / "sources/companion/scripts"
    for name in ("tool_drafts.py", "tool_draft_cli.py"):
        shutil.copy2(ROOT / "scripts" / name, scripts / name)
    assert ubuntu_cli("tool").returncode == 2
    assert ubuntu_cli("tool", "draft", "x", "--request-id", "short").returncode == 2
    assert not ubuntu_cli.docker_log.exists()


def test_claude_status_runs_in_the_subscription_runtime(ubuntu_cli):
    ubuntu_cli.environment["FAKE_SERVICES"] = "pi gateway subscriptions"

    result = ubuntu_cli("providers", "claude", "status")

    assert result.returncode == 0, result.stderr
    log = ubuntu_cli.docker_log.read_text(encoding="utf-8")
    assert "exec -T subscriptions python /app/subscription_runtime.py status" in log


def test_claude_login_needs_the_owners_terminal(ubuntu_cli):
    ubuntu_cli.environment["FAKE_SERVICES"] = "pi gateway subscriptions"

    result = ubuntu_cli("providers", "claude", "login")

    assert result.returncode == 2
    assert "paste the sign-in code" in result.stderr
    assert "exec" not in ubuntu_cli.docker_log.read_text(encoding="utf-8")


def test_claude_sign_in_says_when_the_deployment_has_no_runtime(ubuntu_cli):
    result = ubuntu_cli("providers", "claude", "status")

    assert result.returncode == 1
    assert "prepare.py" in result.stderr
    assert "subscriptions" not in ubuntu_cli.docker_log.read_text(encoding="utf-8")


def test_claude_sign_in_rejects_unknown_operations(ubuntu_cli):
    for arguments in (
        ("providers", "claude", "export"),
        ("providers", "claude", "login", "x"),
    ):
        assert ubuntu_cli(*arguments).returncode == 2
    assert not ubuntu_cli.docker_log.exists()


def repository_launcher(
    ubuntu_cli, versions: str | None, env: str = "CONKER_PORT=8050\n"
):
    """The same launcher as a repository installation, against the recording Docker."""
    companion = ubuntu_cli.deployment / "sources/companion"
    (companion / ".env").write_text(env, encoding="utf-8")
    if versions is not None:
        (companion / "versions.env").write_text(versions, encoding="utf-8")
    shell = shutil.which("bash") or shutil.which("sh")
    if sys.platform == "win32":
        git = (
            Path(os.environ.get("ProgramFiles", "C:/Program Files"))
            / "Git/usr/bin/bash.exe"
        )
        shell = str(git) if git.exists() else shell
    if not shell:
        pytest.skip("a POSIX shell is required")

    def run(*arguments: str):
        return subprocess.run(
            [shell, str(companion / "conker"), *arguments],
            check=False,
            input="",
            capture_output=True,
            text=True,
            env={**ubuntu_cli.environment, "CONKER_LAYOUT": "repository"},
            timeout=30,
        )

    return run


def test_the_repository_layout_points_to_the_api_key_path(ubuntu_cli):
    # No manifest, or one where the Claude plan runtime is still deferred.
    for versions in (None, "SUBSCRIPTIONS_STATE=deferred\n"):
        launcher = repository_launcher(ubuntu_cli, versions)
        result = launcher("providers", "claude", "status")
        assert result.returncode == 3
        assert "conker providers set anthropic" in result.stderr
    assert "status|login|logout [not in this release yet]" in launcher("help").stdout
    assert not ubuntu_cli.docker_log.exists()


def test_the_repository_layout_asks_for_the_runtime_before_signing_in(ubuntu_cli):
    launcher = repository_launcher(
        ubuntu_cli, "SUBSCRIPTIONS_STATE=active\n", "CONKER_CLAUDE_PLAN=off\n"
    )

    result = launcher("providers", "claude", "status")

    assert result.returncode == 1
    assert "./install.sh --claude-plan" in result.stderr
    assert (
        "status|login|logout [after ./install.sh --claude-plan]"
        in launcher("help").stdout
    )
    assert not ubuntu_cli.docker_log.exists()


def test_the_repository_layout_signs_in_through_the_overlay(ubuntu_cli):
    launcher = repository_launcher(
        ubuntu_cli,
        "AGENT_SANDBOX_STATE=active\nSUBSCRIPTIONS_STATE=active\n",
        "CONKER_PORT=8050\nCONKER_CLAUDE_PLAN=on\n",
    )

    result = launcher("providers", "claude", "status")

    assert result.returncode == 0, result.stderr
    log = ubuntu_cli.docker_log.read_text(encoding="utf-8")
    assert "docker-compose.sandbox.yml -f " in log
    assert (
        "docker-compose.subscriptions.yml exec -T subscriptions "
        "python /app/subscription_runtime.py status"
    ) in log
    # The sign-in code is pasted in the owner's terminal, never through a pipe.
    assert launcher("providers", "claude", "login").returncode == 2
    assert "status|login|logout\n" in launcher("help").stdout
