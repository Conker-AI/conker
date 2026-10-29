"""Shared test fixtures. ubuntu_cli: the installed Ubuntu launcher against a fake deployment and a
recording Docker, used by the CLI contract tests. The Docker hands conker config's Pi relay to the
script named by FAKE_PI."""

from __future__ import annotations

import os
import shutil
import stat
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


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
    for name in ("provider_secrets.py", "provider_records.py"):
        shutil.copy2(ROOT / "scripts" / name, companion / "scripts" / name)
    shutil.copy2(ROOT / "scripts/speech_config.py", companion / "scripts/speech_config.py")
    shutil.copy2(ROOT / "scripts/setup_wizard.py", companion / "scripts/setup_wizard.py")
    for name in ("conker_config.py", "config_cli.py"):
        shutil.copy2(ROOT / "scripts" / name, companion / "scripts" / name)
    registry = "dashboard/src/settings/registry"
    shutil.copytree(ROOT / registry, companion / registry)
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
        '  *X-Pi-Key*) exec python3 "$FAKE_PI" "$@" ;;\n'
        '  *config*--services*) printf \'%s\\n\' ${FAKE_SERVICES:-pi gateway} ;;\n'
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
            input="",  # never a terminal, so nothing waits on a person
            capture_output=True,
            text=True,
            env=env,
            timeout=30,
        )

    run.docker_log = docker_log
    run.deployment = deployment
    run.environment = env
    return run
