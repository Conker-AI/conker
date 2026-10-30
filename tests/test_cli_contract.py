"""The installed launcher and repository command expose one honest CLI contract."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
COMMANDS = {
    "status",
    "doctor",
    "inspect",
    "apply",
    "config",
    "tool",
    "ops",
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


# Pi's owner settings document for conker config, as the pi container's relay sees it.
FAKE_PI = """
import json, os, sys
from pathlib import Path
state = Path(os.environ["FAKE_PI_STATE"])
saved = json.loads(state.read_text()) if state.exists() else {"revision": 0, "values": {}}
method, path = sys.argv[-2:]
if path != "/owner/settings":
    sys.stdout.write('404\\n{"detail": "Not Found"}')
    raise SystemExit
if method == "POST":
    body = json.load(sys.stdin)
    assert body["expected_revision"] == saved["revision"]
    saved = {"revision": saved["revision"] + 1, "values": body["values"]}
    state.write_text(json.dumps(saved))
sys.stdout.write("200\\n" + json.dumps({"schemaVersion": 1, **saved}))
"""


@pytest.mark.skipif(
    sys.platform == "win32", reason="Python starts the recording Docker, a POSIX script"
)
def test_config_changes_settings_through_pi_inside_its_container(ubuntu_cli, tmp_path):
    fake, state = tmp_path / "fake_pi.py", tmp_path / "pi-settings.json"
    fake.write_text(FAKE_PI, encoding="utf-8")
    ubuntu_cli.environment.update(FAKE_PI=str(fake), FAKE_PI_STATE=str(state))

    saved = ubuntu_cli("config", "set", "appearance.accent", "purple")
    assert saved.returncode == 0, saved.stderr
    assert json.loads(saved.stdout)["value"] == "purple"
    got = json.loads(ubuntu_cli("config", "get", "appearance.accent").stdout)
    assert got["value"] == "purple" and got["modified"] is True
    listed = ubuntu_cli("config", "list", "--group", "appearance")
    rows = {row["id"]: row for row in json.loads(listed.stdout)["settings"]}
    assert rows["appearance.accent"]["value"] == "purple"
    assert "appearance.theme" not in rows  # kept in each browser
    reset = ubuntu_cli("config", "reset", "appearance.accent")
    assert json.loads(reset.stdout)["value"] == "neutral"
    assert json.loads(state.read_text(encoding="utf-8"))["values"] == {}
    log = ubuntu_cli.docker_log.read_text(encoding="utf-8")
    calls = [line for line in log.splitlines() if line.startswith("compose ")]
    assert len(calls) == 6  # set and reset read, then write; get and list read once
    assert all(
        "compose --project-directory" in call and "exec -T pi python -c" in call
        for call in calls
    )
    assert log.count("\n GET /owner/settings\n") == 4
    assert log.count("\n POST /owner/settings\n") == 2

    ubuntu_cli.docker_log.unlink()
    bad = ubuntu_cli("config", "set", "appearance.accent", "green")
    assert bad.returncode == 2 and "Use one of: neutral, blue" in bad.stderr
    browser = ubuntu_cli("config", "set", "appearance.theme", "light")
    assert browser.returncode == 2 and "kept in each browser" in browser.stderr
    assert ubuntu_cli("config").returncode == 2
    assert not ubuntu_cli.docker_log.exists()
