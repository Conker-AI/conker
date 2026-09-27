"""The installed launcher and repository command expose one honest CLI contract."""

from __future__ import annotations

import json
import os
import shutil
import stat
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
COMMANDS = {
    "status",
    "doctor",
    "inspect",
    "apply",
    "tailscale",
    "backup",
    "verify-backup",
    "restore",
    "recovery-status",
    "logs",
    "model",
    "providers",
    "speech",
    "start",
    "stop",
    "restart",
    "update",
    "key",
    "auth",
    "setup",
}


def test_ubuntu_launcher_delegates_instead_of_reimplementing_commands():
    launcher = (ROOT / "deploy/ubuntu/conker").read_text(encoding="utf-8")

    assert "sources/companion/conker" in launcher
    assert "CONKER_LAYOUT=ubuntu" in launcher
    assert "case " not in launcher
    assert "docker compose" not in launcher


def test_authoritative_help_names_the_complete_contract_and_layout_limits():
    command = (ROOT / "conker").read_text(encoding="utf-8")

    for name in COMMANDS:
        assert f"${{BOLD}}{name}${{OFF}}" in command or name in {
            "start",
            "stop",
            "restart",
        }
    assert "[unavailable in this layout]" in command
    assert '"$SOURCE_ROOT/scripts/recovery.py" --root "$ROOT"' in command
    assert "Verified recovery currently supports only" not in command
    assert "separate scoped credentials" in command
    assert "reviewed source export" in command
    assert '. "$ENV_FILE"' not in command
    assert "The Compose environment is data, never shell code" in command
    dispatch = command.rsplit('command="${1:-status}"', maxsplit=1)[1]
    assert dispatch.index("recovery_guard") < dispatch.index("load_layout")


@pytest.fixture()
def ubuntu_cli(tmp_path: Path):
    shell = shutil.which("sh")
    if sys.platform == "win32":
        git_sh = (
            Path(os.environ.get("ProgramFiles", "C:/Program Files"))
            / "Git/usr/bin/sh.exe"
        )
        shell = str(git_sh) if git_sh.exists() else None
    if not shell:
        pytest.skip("a POSIX shell is required")
    deployment = tmp_path / "deployment"
    companion = deployment / "sources/companion"
    state = deployment / "state"
    bin_dir = tmp_path / "bin"
    companion.mkdir(parents=True)
    (companion / "scripts").mkdir()
    state.mkdir()
    bin_dir.mkdir()
    (deployment / "compose.json").write_text("{}", encoding="utf-8")
    (state / "gateway.env").write_text(
        "GATEWAY_ORIGIN=https://conker.example.test:8443\n", encoding="utf-8"
    )
    (state / "pi.env").write_text(
        "PI_ADMIN_KEY=synthetic\nPI_SPEECH_URL=\nPI_STT_MODEL=\nPI_TTS_MODEL=\n"
        "PI_TTS_VOICE=\nPI_SPEECH_CHARACTER_VOICE=unsupported\nPI_SPEECH_TIMEOUT_S=30\n",
        encoding="utf-8",
    )
    (state / "speech").mkdir()
    (state / "speech/speech.key").write_bytes(b"")

    cli = companion / "conker"
    shutil.copy2(ROOT / "conker", cli)
    shutil.copy2(ROOT / "scripts/setup.py", companion / "scripts/setup.py")
    (companion / "scripts/recovery.py").write_text(
        "import json, sys\nprint(json.dumps(sys.argv[1:]))\n",
        encoding="utf-8",
    )
    shutil.copy2(
        ROOT / "scripts/provider_secrets.py", companion / "scripts/provider_secrets.py"
    )
    shutil.copy2(ROOT / "scripts/speech_config.py", companion / "scripts/speech_config.py")
    cli.chmod(cli.stat().st_mode | stat.S_IXUSR)
    launcher = ROOT / "deploy/ubuntu/conker"

    docker_log = tmp_path / "docker.log"
    docker = bin_dir / "docker"
    docker.write_text(
        "#!/bin/sh\n"
        'printf \'%s\\n\' "$*" >> "$DOCKER_LOG"\n'
        'case "$*" in\n'
        '  *gateway*python*-m*gateway*doctor*) printf \'%s\\n\' \'{"schemaVersion":1,"status":"ok","generatedAt":"2026-09-26T12:00:00Z","summary":{"attention":0,"ok":1,"optional":0},"findings":[{"id":"runtime","area":"services","label":"Conker runtime","status":"ok","observedStatus":"ok","detail":"Working normally.","recovery":null}]}\' ;;\n'
        '  *gateway*python*-m*gateway*inspect*boundaries*) printf \'%s\\n\' \'{"digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","tools":[]}\' ;;\n'
        '  *gateway*python*-m*gateway*inspect*session-settings:*) printf \'%s\\n\' \'{"revision":3,"settings":{"agentId":"companion","privacy":{"memoryDisabled":false,"harnessDisabled":false}}}\' ;;\n'
        '  *gateway*python*-m*gateway*inspect*approval:*) printf \'%s\\n\' \'{"id":"req_123","status":"pending"}\' ;;\n'
        '  *gateway*python*-m*gateway*inspect*submission:*) printf \'%s\\n\' \'{"request_id":"request_1234567890abcdef","status":"running"}\' ;;\n'
        '  *gateway*python*-m*gateway*inspect*file-listing:*) printf \'%s\\n\' \'{"requestId":"listing_1234567890abcdef","state":"complete"}\' ;;\n'
        '  *gateway*python*-m*gateway*inspect*inventory:*) printf \'%s\\n\' \'{"requestId":"inventory_1234567890abcdef","state":"complete"}\' ;;\n'
        '  *gateway*python*-m*gateway*inspect*call:*) printf \'%s\\n\' \'{"id":"call_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","execution":"typed-and-audio-turns"}\' ;;\n'
        '  *gateway*python*-m*gateway*inspect*active-call:*) printf \'%s\\n\' \'{"id":"call_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","execution":"typed-and-audio-turns"}\' ;;\n'
        '  *gateway*python*-m*gateway*inspect*tool-draft:*) printf \'%s\\n\' \'{"id":"example","revision":1,"document":{"id":"example"}}\' ;;\n'
        '  *gateway*python*-m*gateway*inspect*tool-access:*) printf \'%s\\n\' \'{"automation_id":"editor-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","enabled":true}\' ;;\n'
        '  *gateway*python*-m*gateway*apply*models*) cat >/dev/null; printf \'%s\\n\' \'{"revision":5,"configuration":{"models":[]}}\' ;;\n'
        '  *gateway*python*-m*gateway*apply*agents*) cat >/dev/null; printf \'%s\\n\' \'{"schemaVersion":1,"revision":2}\' ;;\n'
        '  *gateway*python*-m*gateway*apply*projects*) cat >/dev/null; printf \'%s\\n\' \'{"schemaVersion":1,"revision":2}\' ;;\n'
        '  *gateway*python*-m*gateway*apply*teams*) cat >/dev/null; printf \'%s\\n\' \'{"schemaVersion":1,"revision":2}\' ;;\n'
        '  *gateway*python*-m*gateway*apply*jobs*) cat >/dev/null; printf \'%s\\n\' \'{"schemaVersion":1,"status":"ready"}\' ;;\n'
        '  *gateway*python*-m*gateway*apply*memory*) cat >/dev/null; printf \'%s\\n\' \'{"status":"forgotten"}\' ;;\n'
        '  *gateway*python*-m*gateway*apply*proposals*) cat >/dev/null; printf \'%s\\n\' \'{"id":"proposal_123","state":"declined"}\' ;;\n'
        '  *gateway*python*-m*gateway*apply*tasks*) cat >/dev/null; printf \'%s\\n\' \'{"id":"tsk_11111111111111111111111111111111","revision":2}\' ;;\n'
        '  *gateway*python*-m*gateway*apply*artifacts*) cat >/dev/null; printf \'%s\\n\' \'{"id":"artifact_44444444444444444444444444444444","revision":2}\' ;;\n'
        '  *gateway*python*-m*gateway*apply*sessions*) cat >/dev/null; printf \'%s\\n\' \'{"revision":4,"settings":{"agentId":"companion","privacy":{"memoryDisabled":true,"harnessDisabled":true}}}\' ;;\n'
        '  *gateway*python*-m*gateway*apply*approvals*) cat >/dev/null; printf \'%s\\n\' \'{"id":"req_123","status":"approved"}\' ;;\n'
        '  *gateway*python*-m*gateway*apply*turns*) cat >/dev/null; printf \'%s\\n\' \'{"turn_id":"turn_123","status":"complete"}\' ;;\n'
        '  *gateway*python*-m*gateway*apply*files*) cat >/dev/null; printf \'%s\\n\' \'{"requestId":"listing_1234567890abcdef","state":"complete"}\' ;;\n'
        '  *gateway*python*-m*gateway*apply*inventory*) cat >/dev/null; printf \'%s\\n\' \'{"requestId":"inventory_1234567890abcdef","state":"complete"}\' ;;\n'
        '  *gateway*python*-m*gateway*apply*character*) cat >/dev/null; printf \'%s\\n\' \'{"agentId":"companion","revision":2,"profile":null}\' ;;\n'
        '  *gateway*python*-m*gateway*apply*calls*) cat >/dev/null; printf \'%s\\n\' \'{"schemaVersion":1,"audioIncluded":false,"execution":"typed-turn"}\' ;;\n'
        '  *gateway*python*-m*gateway*apply*tools*) cat >/dev/null; printf \'%s\\n\' \'{"id":"example","revision":1}\' ;;\n'
        '  *gateway*python*-m*gateway*review-boundaries*) printf \'%s\\n\' \'{"step":"boundaries","revision":1,"receiptId":"setup-boundaries-test","source":"conker.cli","subject":"toolgate.policy","evidenceDigest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","completedAt":"2026-09-27T00:00:00Z","expiresAt":"2026-10-27T00:00:00Z","recordedAt":"2026-09-27T00:00:01Z","state":"valid"}\' ;;\n'
        '  *gateway*python*-m*gateway*set-setup-choice*) printf \'%s\\n\' \'{"step":"memory","revision":1,"requestId":"setup-choice-memory-test","choice":"skip","recordedAt":"2026-09-27T00:00:00Z"}\' ;;\n'
        '  *gateway*python*-m*gateway*setup-model-options*) printf \'%s\\n\' \'{"revision":0,"candidates":[{"id":"local-answer","providerId":"ollama","providerName":"Local model","name":"qwen3:4b","route":"qwen3:4b","status":"ready","selected":false,"execution":"local","dataNotice":"The setup test stays on this server.","costNotice":"No provider charge."}]}\' ;;\n'
        '  *gateway*python*-m*gateway*set-setup-model*) printf \'%s\\n\' \'{"revision":1,"candidateId":"local-answer","probe":{"schemaVersion":1,"configurationRevision":1,"execution":"local"}}\' ;;\n'
        '  *gateway*python*-m*gateway*set-setup-protection*) cat >/dev/null; printf \'%s\\n\' \'{"schemaVersion":1,"revision":1,"requestId":"setup-protection-test","destinationKind":"mounted_off_machine","destination":"/mnt/conker","retentionCopies":7,"policyDigest":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","recordedAt":"2026-09-27T00:00:00Z"}\' ;;\n'
        '  *gateway*python*-m*gateway*setup-protection*) printf \'%s\\n\' \'{"schemaVersion":1,"revision":1,"requestId":"setup-protection-test","destinationKind":"mounted_off_machine","destination":"/mnt/conker","retentionCopies":7,"policyDigest":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","recordedAt":"2026-09-27T00:00:00Z"}\' ;;\n'
        '  *gateway*python*-m*gateway*setup-rehearsal*status*) printf \'%s\\n\' \'{"schemaVersion":1,"state":"in_progress","conversation":{"state":"complete"},"memoryReview":{"state":"missing"},"approval":{"state":"missing"},"approvalRequestId":null,"canFinalize":false}\' ;;\n'
        '  *gateway*python*-m*gateway*setup-rehearsal*review-memory*) printf \'%s\\n\' \'{"schemaVersion":1,"state":"in_progress","memoryReview":{"state":"complete"},"approvalRequestId":null,"canFinalize":false}\' ;;\n'
        '  *gateway*python*-m*gateway*setup-rehearsal*start-approval*) printf \'%s\\n\' \'{"schemaVersion":1,"state":"in_progress","approval":{"state":"awaiting_owner"},"approvalRequestId":"setup-approval-test","canFinalize":false}\' ;;\n'
        '  *gateway*python*-m*gateway*setup-rehearsal*resume-approval:*) printf \'%s\\n\' \'{"schemaVersion":1,"state":"ready","approval":{"state":"complete"},"approvalRequestId":"setup-approval-test","canFinalize":true}\' ;;\n'
        '  *gateway*python*-m*gateway*setup-rehearsal*finalize*) printf \'%s\\n\' \'{"step":"rehearsal","revision":1,"receiptId":"setup-rehearsal-test","source":"conker.first-run-rehearsal","subject":"owner.daily-workflow","evidenceDigest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","completedAt":"2026-09-27T00:00:00Z","expiresAt":"2026-10-27T00:00:00Z","recordedAt":"2026-09-27T00:00:01Z","state":"valid"}\' ;;\n'
        '  *gateway*python*-m*gateway*record-setup-receipt*) cat >/dev/null; printf \'%s\\n\' \'{"step":"rehearsal","revision":1,"receiptId":"setup-rehearsal-test","source":"conker.release-acceptance","subject":"release","evidenceDigest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","completedAt":"2026-09-27T00:00:00Z","expiresAt":"2026-10-27T00:00:00Z","recordedAt":"2026-09-27T00:00:01Z","state":"valid"}\' ;;\n'
        '  *setup/status*) printf \'%s\\n\' \'{"schemaVersion":1,"workflow":"first-run","state":"blocked","currentStep":"model","recommendedNextOperation":"configure_model","generatedAt":"2026-09-26T12:00:00Z","steps":[]}\' ;;\n'
        '  *setup/receipts*) body=$(cat); receipt=$(printf \'%s\' "$body" | sed -n \'s/.*"receiptId":"\\([^"]*\\)".*/\\1/p\'); digest=$(printf \'%s\' "$body" | sed -n \'s/.*"evidenceDigest":"\\([^"]*\\)".*/\\1/p\'); printf \'{"step":"rehearsal","revision":1,"receiptId":"%s","evidenceDigest":"%s"}\\n\' "$receipt" "$digest" ;;\n'
        '  *provider_credentials*) printf \'%s\\n\' configured ;;\n'
        '  *checks*speech*input*) printf \'%s\\n\' "${SPEECH_RUNTIME_RESULT:-confirmed}" ;;\n'
        '  *) printf \'%s\\n\' \'{"status":"ok","checks":{}}\' ;;\n'
        "esac\n",
        encoding="utf-8",
    )
    docker.chmod(docker.stat().st_mode | stat.S_IXUSR)
    python = bin_dir / "python3"
    python.write_text(
        f"#!/bin/sh\nexec '{Path(sys.executable).as_posix()}' \"$@\"\n",
        encoding="utf-8",
    )
    python.chmod(python.stat().st_mode | stat.S_IXUSR)
    sleep = bin_dir / "sleep"
    sleep.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    sleep.chmod(sleep.stat().st_mode | stat.S_IXUSR)

    path = str(bin_dir) + os.pathsep + os.environ.get("PATH", "")
    if sys.platform == "win32":
        drive, tail = bin_dir.drive.rstrip(":"), bin_dir.as_posix()[2:]
        path = f"/{drive.lower()}{tail}:/usr/bin:/bin"
    env = {
        **os.environ,
        "CONKER_DEPLOY_DIR": str(deployment),
        "DOCKER_LOG": str(docker_log),
        "NO_COLOR": "1",
        "PATH": path,
    }

    def run(*args: str):
        return subprocess.run(
            [shell, str(launcher), *args],
            check=False,
            capture_output=True,
            text=True,
            env=env,
            timeout=30,
        )

    run.docker_log = docker_log
    run.deployment = deployment
    run.environment = env
    return run


def test_ubuntu_status_uses_service_health_not_container_presence(ubuntu_cli):
    result = ubuntu_cli("status")

    assert result.returncode == 0, result.stderr
    assert "Everything is working." in result.stdout
    assert "https://conker.example.test:8443" in result.stdout
    calls = ubuntu_cli.docker_log.read_text(encoding="utf-8").splitlines()
    assert len(calls) == 5
    assert all(" exec -T " in f" {call} " for call in calls)
    assert not any(call.endswith(" ps") for call in calls)
    assert any("gateway python -m gateway health" in call for call in calls)


def test_doctor_uses_the_gateway_diagnostic_contract(ubuntu_cli):
    result = ubuntu_cli("doctor")

    assert result.returncode == 0, result.stderr
    report = json.loads(result.stdout)
    assert report["schemaVersion"] == 1
    assert report["findings"][0]["id"] == "runtime"
    assert report["findings"][0]["recovery"] is None
    assert "gateway python -m gateway doctor" in ubuntu_cli.docker_log.read_text()


def test_inspect_uses_the_fixed_gateway_control_plane_command(ubuntu_cli):
    result = ubuntu_cli("inspect", "agents")

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == {"status": "ok", "checks": {}}
    call = ubuntu_cli.docker_log.read_text(encoding="utf-8")
    assert "exec -T gateway python -m gateway inspect agents" in call


def test_inspect_requires_exactly_one_resource_before_compose(ubuntu_cli):
    result = ubuntu_cli("inspect")

    assert result.returncode == 2
    assert not ubuntu_cli.docker_log.exists()


def test_inspect_session_settings_passes_one_validated_compound_resource(ubuntu_cli):
    result = ubuntu_cli("inspect", "session-settings", "ses_1234567890abcdef")

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["revision"] == 3
    call = ubuntu_cli.docker_log.read_text(encoding="utf-8")
    assert "gateway python -m gateway inspect session-settings:ses_1234567890abcdef" in call


def test_inspect_approval_passes_one_validated_compound_resource(ubuntu_cli):
    result = ubuntu_cli("inspect", "approval", "req_123")

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == {"id": "req_123", "status": "pending"}
    call = ubuntu_cli.docker_log.read_text(encoding="utf-8")
    assert "gateway python -m gateway inspect approval:req_123" in call


def test_inspect_submission_passes_one_validated_compound_resource(ubuntu_cli):
    result = ubuntu_cli("inspect", "submission", "request_1234567890abcdef")

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["status"] == "running"
    call = ubuntu_cli.docker_log.read_text(encoding="utf-8")
    assert (
        "gateway python -m gateway inspect submission:request_1234567890abcdef"
        in call
    )


@pytest.mark.parametrize(
    ("kind", "identity"),
    [
        ("file-listing", "listing_1234567890abcdef"),
        ("inventory", "inventory_1234567890abcdef"),
    ],
)
def test_inspect_system_observation_passes_validated_compound_resource(
    ubuntu_cli, kind, identity
):
    result = ubuntu_cli("inspect", kind, identity)

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["state"] == "complete"
    call = ubuntu_cli.docker_log.read_text(encoding="utf-8")
    assert f"gateway python -m gateway inspect {kind}:{identity}" in call


@pytest.mark.parametrize(
    ("kind", "identity"),
    [
        ("call", "call_" + "a" * 32),
        ("active-call", "ses_source_123"),
    ],
)
def test_inspect_call_passes_validated_compound_resource(ubuntu_cli, kind, identity):
    result = ubuntu_cli("inspect", kind, identity)

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["execution"] == "typed-and-audio-turns"
    call = ubuntu_cli.docker_log.read_text(encoding="utf-8")
    assert f"gateway python -m gateway inspect {kind}:{identity}" in call


def test_inspect_tool_draft_passes_validated_compound_resource(ubuntu_cli):
    result = ubuntu_cli("inspect", "tool-draft", "example")

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["id"] == "example"
    assert "gateway python -m gateway inspect tool-draft:example" in ubuntu_cli.docker_log.read_text()


def test_inspect_tool_access_binds_exact_publication_target(ubuntu_cli):
    digest = "b" * 64
    result = ubuntu_cli("inspect", "tool-access", "example", "2", digest)

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["enabled"] is True
    assert (
        f"gateway python -m gateway inspect tool-access:example:2:{digest}"
        in ubuntu_cli.docker_log.read_text()
    )


def test_apply_models_streams_file_to_the_fixed_gateway_operation(ubuntu_cli, tmp_path):
    configuration = tmp_path / "models.json"
    configuration.write_text(
        json.dumps({"expected_revision": 4, "configuration": {"models": []}}),
        encoding="utf-8",
    )

    result = ubuntu_cli("apply", "models", str(configuration))

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["revision"] == 5
    call = ubuntu_cli.docker_log.read_text(encoding="utf-8")
    assert "exec -T gateway python -m gateway apply models" in call
    assert str(configuration) not in call


def test_apply_rejects_unknown_resource_or_missing_file_before_compose(ubuntu_cli, tmp_path):
    unknown = ubuntu_cli("apply", "payments", str(tmp_path / "missing.json"))
    missing = ubuntu_cli("apply", "models", str(tmp_path / "missing.json"))

    assert unknown.returncode == 2 and "supports: agents, approvals, artifacts, calls, character, files, inventory, jobs, memory, models, projects, proposals, sessions, tasks, teams, tools, turns" in unknown.stderr
    assert missing.returncode == 2 and "file not found" in missing.stderr.lower()
    assert not ubuntu_cli.docker_log.exists()


def test_apply_agents_uses_the_same_bounded_gateway_entrypoint(ubuntu_cli, tmp_path):
    document = tmp_path / "agent.json"
    document.write_text(
        json.dumps(
            {
                "operation": "archive",
                "id": "agent_" + "a" * 32,
                "expected_revision": 1,
                "archived": True,
            }
        ),
        encoding="utf-8",
    )

    result = ubuntu_cli("apply", "agents", str(document))

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["revision"] == 2
    assert "gateway python -m gateway apply agents" in ubuntu_cli.docker_log.read_text()


def test_apply_projects_uses_the_same_bounded_gateway_entrypoint(ubuntu_cli, tmp_path):
    document = tmp_path / "project.json"
    document.write_text(
        json.dumps(
            {
                "operation": "archive",
                "id": "project_" + "b" * 32,
                "expected_revision": 1,
                "archived": True,
            }
        ),
        encoding="utf-8",
    )

    result = ubuntu_cli("apply", "projects", str(document))

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["revision"] == 2
    assert "gateway python -m gateway apply projects" in ubuntu_cli.docker_log.read_text()


def test_apply_teams_uses_the_same_bounded_gateway_entrypoint(ubuntu_cli, tmp_path):
    document = tmp_path / "team.json"
    document.write_text(
        json.dumps(
            {
                "operation": "restore",
                "id": "team_" + "e" * 32,
                "expected_revision": 1,
            }
        ),
        encoding="utf-8",
    )

    result = ubuntu_cli("apply", "teams", str(document))

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["revision"] == 2
    assert "gateway python -m gateway apply teams" in ubuntu_cli.docker_log.read_text()


def test_apply_jobs_uses_the_same_bounded_gateway_entrypoint(ubuntu_cli, tmp_path):
    document = tmp_path / "job.json"
    document.write_text(
        json.dumps(
            {
                "operation": "run",
                "id": "job_" + "f" * 32,
                "request_id": "cli:1234567890abcdef",
            }
        ),
        encoding="utf-8",
    )

    result = ubuntu_cli("apply", "jobs", str(document))

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["status"] == "ready"
    assert "gateway python -m gateway apply jobs" in ubuntu_cli.docker_log.read_text()


def test_apply_memory_uses_the_same_bounded_gateway_entrypoint(ubuntu_cli, tmp_path):
    document = tmp_path / "forget.json"
    document.write_text(
        json.dumps(
            {
                "operation": "forget",
                "request_id": "forget_1234567890abcdef",
                "memory_id": "memory.important:1",
                "expected_revision": 8,
            }
        ),
        encoding="utf-8",
    )

    result = ubuntu_cli("apply", "memory", str(document))

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["status"] == "forgotten"
    assert "gateway python -m gateway apply memory" in ubuntu_cli.docker_log.read_text()


def test_apply_proposals_uses_the_same_bounded_gateway_entrypoint(ubuntu_cli, tmp_path):
    document = tmp_path / "proposal.json"
    document.write_text(
        json.dumps(
            {"operation": "decide", "id": "proposal_123", "decision": "decline"}
        ),
        encoding="utf-8",
    )

    result = ubuntu_cli("apply", "proposals", str(document))

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["state"] == "declined"
    assert "gateway python -m gateway apply proposals" in ubuntu_cli.docker_log.read_text()


def test_apply_tasks_uses_the_same_bounded_gateway_entrypoint(ubuntu_cli, tmp_path):
    document = tmp_path / "task.json"
    document.write_text(
        json.dumps(
            {
                "operation": "archive",
                "id": "tsk_" + "1" * 32,
                "expected_revision": 1,
                "archived": True,
            }
        ),
        encoding="utf-8",
    )

    result = ubuntu_cli("apply", "tasks", str(document))

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["revision"] == 2
    assert "gateway python -m gateway apply tasks" in ubuntu_cli.docker_log.read_text()


def test_apply_artifacts_uses_the_same_bounded_gateway_entrypoint(ubuntu_cli, tmp_path):
    document = tmp_path / "artifact.json"
    document.write_text(
        json.dumps(
            {
                "operation": "archive",
                "id": "artifact_" + "4" * 32,
                "expected_revision": 1,
                "archived": True,
            }
        ),
        encoding="utf-8",
    )

    result = ubuntu_cli("apply", "artifacts", str(document))

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["revision"] == 2
    assert "gateway python -m gateway apply artifacts" in ubuntu_cli.docker_log.read_text()


def test_apply_sessions_uses_the_same_bounded_gateway_entrypoint(ubuntu_cli, tmp_path):
    document = tmp_path / "session.json"
    document.write_text(
        json.dumps(
            {
                "operation": "update",
                "id": "ses_1234567890abcdef",
                "expected_revision": 3,
                "settings": {
                    "agentId": "companion",
                    "privacy": {"memoryDisabled": True, "harnessDisabled": True},
                    "projectId": None,
                    "projectSources": [],
                    "presentationMode": "focus",
                },
            }
        ),
        encoding="utf-8",
    )

    result = ubuntu_cli("apply", "sessions", str(document))

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["revision"] == 4
    assert "gateway python -m gateway apply sessions" in ubuntu_cli.docker_log.read_text()


def test_apply_approvals_uses_the_same_bounded_gateway_entrypoint(ubuntu_cli, tmp_path):
    document = tmp_path / "approval.json"
    document.write_text(
        json.dumps(
            {
                "operation": "decide",
                "id": "req_123",
                "status": "approved",
                "note": "Reviewed.",
            }
        ),
        encoding="utf-8",
    )

    result = ubuntu_cli("apply", "approvals", str(document))

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["status"] == "approved"
    assert "gateway python -m gateway apply approvals" in ubuntu_cli.docker_log.read_text()


def test_apply_turns_uses_the_same_bounded_gateway_entrypoint(ubuntu_cli, tmp_path):
    document = tmp_path / "turn.json"
    document.write_text(
        json.dumps({"operation": "resume", "id": "turn_123"}), encoding="utf-8"
    )

    result = ubuntu_cli("apply", "turns", str(document))

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["status"] == "complete"
    assert "gateway python -m gateway apply turns" in ubuntu_cli.docker_log.read_text()


@pytest.mark.parametrize(
    ("resource", "payload"),
    [
        (
            "files",
            {
                "operation": "request",
                "request_id": "listing_1234567890abcdef",
                "root_id": "project",
                "path": "docs",
                "limit": 50,
            },
        ),
        (
            "inventory",
            {
                "operation": "request",
                "request_id": "inventory_1234567890abcdef",
                "limit": 100,
            },
        ),
    ],
)
def test_apply_system_observation_uses_bounded_gateway_entrypoint(
    ubuntu_cli, tmp_path, resource, payload
):
    document = tmp_path / f"{resource}.json"
    document.write_text(json.dumps(payload), encoding="utf-8")

    result = ubuntu_cli("apply", resource, str(document))

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["state"] == "complete"
    assert f"gateway python -m gateway apply {resource}" in ubuntu_cli.docker_log.read_text()


def test_apply_character_streams_package_to_isolated_gateway_operation(
    ubuntu_cli, tmp_path
):
    document = tmp_path / "character.json"
    document.write_text(
        json.dumps(
            {"operation": "restore", "expected_revision": 1, "revision": 1}
        ),
        encoding="utf-8",
    )

    result = ubuntu_cli("apply", "character", str(document))

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["agentId"] == "companion"
    call = ubuntu_cli.docker_log.read_text(encoding="utf-8")
    assert "gateway python -m gateway apply character" in call
    assert str(document) not in call


def test_apply_calls_uses_typed_only_gateway_operation(ubuntu_cli, tmp_path):
    document = tmp_path / "call.json"
    document.write_text(
        json.dumps(
            {
                "operation": "turn",
                "id": "call_" + "a" * 32,
                "request_id": "call_turn_123456789",
                "text": "Think this through.",
            }
        ),
        encoding="utf-8",
    )

    result = ubuntu_cli("apply", "calls", str(document))

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["audioIncluded"] is False
    assert "gateway python -m gateway apply calls" in ubuntu_cli.docker_log.read_text()


def test_apply_tools_uses_scoped_gateway_editor_operation(ubuntu_cli, tmp_path):
    document = tmp_path / "tool.json"
    document.write_text(
        json.dumps(
            {
                "operation": "publish",
                "id": "example",
                "expected_revision": 1,
                "expected_publication_version": 0,
                "authorization": "owner_confirmation",
            }
        ),
        encoding="utf-8",
    )

    result = ubuntu_cli("apply", "tools", str(document))

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["id"] == "example"
    assert "gateway python -m gateway apply tools" in ubuntu_cli.docker_log.read_text()


@pytest.mark.parametrize("command", ["update", "key"])
def test_ubuntu_unsupported_commands_fail_explicitly(ubuntu_cli, command):
    result = ubuntu_cli(command)

    assert result.returncode == 3
    assert f"conker {command} is unavailable" in result.stderr
    assert not ubuntu_cli.docker_log.exists()


@pytest.mark.parametrize(
    "arguments",
    [
        ("backup", "--destination", "backup-target"),
        ("verify-backup", "backup-target/snapshot-1"),
        ("restore", "backup-target/snapshot-1", "--into", "recovery-target"),
        ("recovery-status", "recovery-target"),
    ],
)
def test_ubuntu_recovery_commands_use_authoritative_host_engine(ubuntu_cli, arguments):
    result = ubuntu_cli(*arguments)

    assert result.returncode == 0, result.stderr
    forwarded = json.loads(result.stdout)
    assert forwarded[:2] == ["--root", str(ubuntu_cli.deployment)]
    assert forwarded[2:] == list(arguments)
    assert not ubuntu_cli.docker_log.exists()


def test_ubuntu_help_exposes_supported_and_unavailable_commands(ubuntu_cli):
    result = ubuntu_cli("help")

    assert result.returncode == 0
    for command in COMMANDS:
        assert command in result.stdout
    assert "[unavailable in this layout]" in result.stdout
    assert "Layout: source-built Ubuntu installation" in result.stdout
    assert not ubuntu_cli.docker_log.exists()


def test_ubuntu_safe_operations_use_the_generated_compose_layout(ubuntu_cli):
    assert ubuntu_cli("logs", "pi", "25").returncode == 0
    assert ubuntu_cli("model", "qwen3:4b").returncode == 0
    assert ubuntu_cli("auth", "health").returncode == 0
    calls = ubuntu_cli.docker_log.read_text(encoding="utf-8").splitlines()

    assert all("compose --project-directory" in call and "-f" in call for call in calls)
    assert any("logs --tail 25 pi" in call for call in calls)
    assert any("exec -T ollama ollama pull qwen3:4b" in call for call in calls)
    assert any(
        "run --rm --no-deps -T gateway python -m gateway health" in call
        for call in calls
    )


def test_provider_status_is_host_only_and_contains_no_secrets(ubuntu_cli):
    result = ubuntu_cli("providers", "status", "--json")

    assert result.returncode == 0, result.stderr
    value = json.loads(result.stdout)
    assert value["schemaVersion"] == 1
    assert value["secretsIncluded"] is False
    assert [item["id"] for item in value["providers"]] == [
        "openrouter",
        "openai",
        "anthropic",
    ]
    assert not ubuntu_cli.docker_log.exists()


def test_verified_provider_activation_recreates_pi_and_commits_revision(ubuntu_cli):
    from scripts.provider_secrets import SecretStore

    store = SecretStore(ubuntu_cli.deployment / "state" / "provider-secrets")
    staged = store.stage("openai", b"synthetic-provider-key")
    store.verify("openai", lambda provider, secret: ("verified", "synthetic_check"))

    result = ubuntu_cli("providers", "activate", "openai", staged["stagedRevision"])

    assert result.returncode == 0, result.stderr
    status = store.status()["providers"][1]
    assert status["activeRevision"] == staged["stagedRevision"]
    assert status["activationPending"] is False
    log = ubuntu_cli.docker_log.read_text(encoding="utf-8")
    assert "up -d --no-deps --force-recreate pi" in log
    assert "provider_credentials" in log


def test_speech_status_and_activation_are_host_owned_and_secret_free(ubuntu_cli):
    initial = ubuntu_cli("speech", "status", "--json")
    configured = ubuntu_cli(
        "speech", "configure", "--url", "https://speech.example.test/v1",
        "--stt-model", "whisper-1", "--tts-model", "kokoro", "--voice", "af_heart",
    )

    assert initial.returncode == 0, initial.stderr
    assert json.loads(initial.stdout)["secretsIncluded"] is False
    assert configured.returncode == 0, configured.stderr
    value = next(
        json.loads(line)
        for line in configured.stdout.splitlines()
        if '"speechInput"' in line
    )
    assert value["speechInput"] == "configured"
    assert value["speechOutput"] == "configured"
    assert value["secretsIncluded"] is False
    assert "speech.example.test" in (ubuntu_cli.deployment / "state/pi.env").read_text()
    log = ubuntu_cli.docker_log.read_text(encoding="utf-8")
    assert "up -d --no-deps --force-recreate pi" in log
    assert "checks" in log and "speech" in log


def test_failed_speech_runtime_confirmation_restores_previous_host_files(ubuntu_cli):
    env_file = ubuntu_cli.deployment / "state/pi.env"
    key_file = ubuntu_cli.deployment / "state/speech/speech.key"
    before_env = env_file.read_bytes()
    key_file.write_bytes(b"previous-speech-key")
    ubuntu_cli.environment["SPEECH_RUNTIME_RESULT"] = "waiting"

    result = ubuntu_cli(
        "speech", "configure", "--url", "https://speech.example.test/v1",
        "--stt-model", "whisper-1",
    )

    assert result.returncode == 1
    assert "previous host configuration was restored" in result.stderr
    assert env_file.read_bytes() == before_env
    assert key_file.read_bytes() == b"previous-speech-key"


def test_setup_status_uses_the_owner_channel_inside_gateway(ubuntu_cli):
    result = ubuntu_cli("setup", "status")

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["schemaVersion"] == 1
    assert payload["currentStep"] == "model"
    call = ubuntu_cli.docker_log.read_text(encoding="utf-8")
    assert "exec -T gateway python -c" in call
    assert "/setup/status" in call
    assert "GATEWAY_PI_OWNER_KEY" in call
    assert "ProxyHandler({})" in call


def test_setup_model_is_an_explicit_bounded_command(ubuntu_cli):
    options = ubuntu_cli("setup", "models")
    result = ubuntu_cli("setup", "run", "model", "local-answer")

    assert options.returncode == 0, options.stderr
    assert json.loads(options.stdout)["candidates"][0]["id"] == "local-answer"
    assert result.returncode == 0, result.stderr
    log = ubuntu_cli.docker_log.read_text(encoding="utf-8")
    assert "setup-model-options" in log
    assert "set-setup-model local-answer" in log


def test_setup_model_requires_a_server_candidate_without_compose(ubuntu_cli):
    result = ubuntu_cli("setup", "run", "model")

    assert result.returncode == 2
    assert "setup models" in result.stderr
    assert not ubuntu_cli.docker_log.exists()


def test_setup_optional_choices_are_explicit_bounded_commands(ubuntu_cli):
    companion = ubuntu_cli("setup", "run", "companion", "--accept")
    skipped = ubuntu_cli("setup", "run", "memory", "--skip")
    included = ubuntu_cli("setup", "run", "capabilities", "--include")

    assert companion.returncode == 0, companion.stderr
    assert skipped.returncode == 0, skipped.stderr
    assert included.returncode == 0, included.stderr
    log = ubuntu_cli.docker_log.read_text(encoding="utf-8")
    assert "set-setup-choice companion:accept" in log
    assert "set-setup-choice memory:skip" in log
    assert "set-setup-choice capabilities:include" in log


@pytest.mark.parametrize("argument", ["skip", "--later", "--skip:all"])
def test_setup_optional_choices_reject_unknown_arguments_without_compose(
    ubuntu_cli, argument
):
    result = ubuntu_cli("setup", "run", "memory", argument)

    assert result.returncode == 2
    assert "--skip|--include" in result.stderr


def test_setup_companion_accept_rejects_unknown_argument_without_compose(ubuntu_cli):
    result = ubuntu_cli("setup", "run", "companion", "--skip")

    assert result.returncode == 2
    assert "companion --accept" in result.stderr
    assert not ubuntu_cli.docker_log.exists()


def test_ubuntu_protection_reaches_policy_bound_host_verifier(ubuntu_cli):
    result = ubuntu_cli("setup", "run", "protection")

    assert result.returncode == 1
    assert "unavailable" not in result.stderr
    assert "Setup evidence failed" in result.stderr
    assert "setup-protection" in ubuntu_cli.docker_log.read_text(encoding="utf-8")


def test_protection_policy_is_shared_by_cli_and_ui_control_plane(ubuntu_cli):
    shown = ubuntu_cli("setup", "protection")
    saved = ubuntu_cli(
        "setup",
        "configure",
        "protection",
        "--destination",
        "/mnt/conker",
        "--retention",
        "7",
    )

    assert shown.returncode == 0, shown.stderr
    assert saved.returncode == 0, saved.stderr
    assert json.loads(shown.stdout)["destination"] == "/mnt/conker"
    assert json.loads(saved.stdout)["retentionCopies"] == 7
    calls = ubuntu_cli.docker_log.read_text(encoding="utf-8")
    assert "setup-protection" in calls
    assert "set-setup-protection" in calls


def test_setup_rehearsal_cli_uses_the_same_server_owned_workflow(ubuntu_cli):
    status = ubuntu_cli("setup", "rehearsal")
    memory = ubuntu_cli("setup", "run", "rehearsal", "--review-memory")
    started = ubuntu_cli("setup", "run", "rehearsal", "--start-approval")
    resumed = ubuntu_cli(
        "setup", "run", "rehearsal", "--finish-approval", "setup-approval-test"
    )
    finished = ubuntu_cli("setup", "run", "rehearsal", "--finalize")

    for result in (status, memory, started, resumed, finished):
        assert result.returncode == 0, result.stderr
    assert json.loads(status.stdout)["conversation"]["state"] == "complete"
    assert json.loads(started.stdout)["approvalRequestId"] == "setup-approval-test"
    assert json.loads(finished.stdout)["source"] == "conker.first-run-rehearsal"
    calls = ubuntu_cli.docker_log.read_text(encoding="utf-8")
    for operation in (
        "setup-rehearsal status",
        "setup-rehearsal review-memory",
        "setup-rehearsal start-approval",
        "setup-rehearsal resume-approval:setup-approval-test",
        "setup-rehearsal finalize",
    ):
        assert operation in calls
    assert "record-setup-receipt rehearsal" not in calls


def test_boundary_review_uses_exact_inspected_digest(ubuntu_cli):
    digest = "a" * 64

    inspected = ubuntu_cli("inspect", "boundaries")
    assert json.loads(inspected.stdout)["digest"] == digest
    recorded = ubuntu_cli(
        "setup", "run", "boundaries", "--confirm-digest", digest
    )

    assert recorded.returncode == 0, recorded.stderr
    assert json.loads(recorded.stdout)["evidenceDigest"] == digest
    calls = ubuntu_cli.docker_log.read_text(encoding="utf-8")
    assert "gateway python -m gateway inspect boundaries" in calls
    assert f"gateway python -m gateway review-boundaries {digest}" in calls


def test_invalid_rehearsal_action_never_reaches_compose(ubuntu_cli):
    result = ubuntu_cli("setup", "run", "rehearsal", "summary.json")

    assert result.returncode == 2
    assert "--review-memory" in result.stderr
    assert not ubuntu_cli.docker_log.exists()


def test_ubuntu_recovery_hold_blocks_writer_commands_before_compose(ubuntu_cli):
    (ubuntu_cli.deployment / ".conker-recovery.json").write_text("{}", encoding="utf-8")

    result = ubuntu_cli("start")

    assert result.returncode == 1
    assert "Recovery is held" in result.stderr
    assert not ubuntu_cli.docker_log.exists()
