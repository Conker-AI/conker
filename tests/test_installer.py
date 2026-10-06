"""What the installer promises, asserted.

Every rule in issue #32 is written here as a test, because a rule nobody checks
is a rule that decays. These run the real script against real Docker — but only
its read-only verbs (`info`, `compose config`), never `pull` or `up`, so the
suite is fast and changes nothing.

The one thing deliberately not mocked is `docker compose config`. It is the
only check that the compose file and the generated .env actually agree, and a
fake would assert nothing.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import stat
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
INSTALL = ROOT / "install.sh"


def test_installer_fetches_the_canonical_repository():
    assert 'readonly REPO_URL="https://github.com/Conker-AI/conker.git"' in INSTALL.read_text()


@pytest.mark.parametrize("dirty", [True, False])
def test_failed_checkout_update_never_reports_success(tmp_path, dirty):
    checkout = tmp_path / "conker"
    (checkout / ".git").mkdir(parents=True)
    commands = tmp_path / "bin"
    commands.mkdir()
    git = commands / "git"
    git.write_text(
        "#!/bin/sh\n"
        'case "$3" in\n'
        + ('status) printf " M local.txt\\n"; exit 0 ;;\n' if dirty else 'status) exit 0 ;;\n')
        + "pull) exit 1 ;;\n"
        + "esac\nexit 1\n"
    )
    git.chmod(0o755)
    result = subprocess.run(
        ["bash", "-s", "--", "--yes"],
        input=INSTALL.read_text(), text=True, capture_output=True, timeout=15,
        env={**os.environ, "CONKER_HOME": str(checkout), "NO_COLOR": "1",
             "PATH": str(commands) + os.pathsep + os.environ.get("PATH", "")},
        cwd=tmp_path, check=False,
    )
    assert result.returncode != 0
    assert "Updated " not in result.stdout
    assert ("local changes" if dirty else "Could not update") in result.stderr

pytestmark = pytest.mark.skipif(
    sys.platform == "win32",
    reason="the installer is a POSIX shell script for Linux and macOS servers; "
           "run these in CI or a container",
)


def has_docker() -> bool:
    if not shutil.which("docker"):
        return False
    return subprocess.run(["docker", "info"], capture_output=True, check=False).returncode == 0


needs_docker = pytest.mark.skipif(not has_docker(), reason="needs a running Docker")


@pytest.fixture()
def install(tmp_path):
    """A throwaway copy of the repo, so a test never touches the real .env."""
    home = tmp_path / "home"
    home.mkdir()
    work = tmp_path / "conker"
    work.mkdir()
    for name in ("install.sh", "conker", "docker-compose.yml", "versions.env"):
        shutil.copy(ROOT / name, work / name)
    shutil.copytree(ROOT / "scripts", work / "scripts", ignore=shutil.ignore_patterns("__pycache__"))
    (work / "install.sh").chmod(0o755)

    def run(*args, expect_ok=True, path=None):
        env = {
            **os.environ,
            "HOME": str(home),
            "NO_COLOR": "1",
            "CONKER_BACKUP_DIR": str(home / "backups"),
        }
        if path is not None:
            env["PATH"] = path
        proc = subprocess.run(
            ["bash", str(work / "install.sh"), *args],
            capture_output=True, text=True, env=env, cwd=str(work), timeout=180,
            check=False,
        )
        if expect_ok and proc.returncode != 0:
            pytest.fail(f"exit {proc.returncode}\n--- stdout ---\n{proc.stdout}\n"
                        f"--- stderr ---\n{proc.stderr}")
        return proc

    run.dir = work
    run.home = home
    run.env_file = work / ".env"
    return run


def env_values(path: Path) -> dict[str, str]:
    out = {}
    for line in path.read_text().splitlines():
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            out[k] = v
    return out


# --- it works, and it says what is wrong when it does not -------------------

@needs_docker
def test_check_passes_on_a_machine_that_can_run_it(install):
    result = install("--check")
    assert "This machine can run Conker" in result.stdout


def path_without(command: str, sandbox: Path) -> str:
    """This machine, minus one command.

    Every other tool stays reachable, so what the script hits is a genuinely
    missing Docker rather than a stripped environment that would have failed
    for some unrelated reason.
    """
    sandbox.mkdir(exist_ok=True)
    for directory in os.environ.get("PATH", "").split(os.pathsep):
        source = Path(directory)
        if not source.is_dir():
            continue
        for entry in source.iterdir():
            if entry.name == command or (sandbox / entry.name).exists():
                continue
            try:
                (sandbox / entry.name).symlink_to(entry)
            except OSError:
                pass
    return str(sandbox)


def test_a_missing_docker_names_the_exact_fix(install, tmp_path):
    """Not "docker not found". The next command to type."""
    result = install("--check", expect_ok=False,
                     path=path_without("docker", tmp_path / "nodocker"))

    assert result.returncode != 0
    assert "Docker is not installed" in result.stderr
    assert "get.docker.com" in result.stderr, "it must say how to install it"
    assert "Traceback" not in result.stderr and "line " not in result.stderr.split("What to do")[0]


# --- secrets ----------------------------------------------------------------

SECRETS = [
    "CONKER_ADMIN_KEY", "TOOLGATE_ADMIN_KEY", "TOOLGATE_VAULT_SALT",
    "TOOLGATE_CALLBACK_SECRET", "MEMORYGATE_ADMIN_KEY", "MEMORYGATE_READ_KEY",
    "MEMORYGATE_DB_PASSWORD", "SYSTEMGATE_ADMIN_KEY", "EMBEDDINGS_KEY",
    "PI_TOOLGATE_KEY",
    "PI_GATEWAY_KEY",
    "GATEWAY_PI_OWNER_KEY",
    "GATEWAY_TOOLGATE_OWNER_KEY",
    "MEMORYGATE_INGEST_KEY",
]


@needs_docker
def test_every_secret_is_generated_and_none_is_requested(install):
    """The rule is 'never ask a person to invent a secret'. Ten services need
    keys; a human should be asked for exactly none of them."""
    result = install("--yes", "--dry-run")
    values = env_values(install.env_file)

    for name in SECRETS:
        assert name in values, f"{name} was never written"
        assert len(values[name]) >= 20, f"{name} is too short to be a key: {values[name]!r}"

    # No two services share a key: one compromise must not be all of them.
    generated = [values[n] for n in SECRETS]
    assert len(set(generated)) == len(generated), "two services were given the same secret"

    lowered = result.stdout.lower()
    assert "paste" not in lowered.split("openrouter")[0]
    assert "enter a key" not in lowered and "choose a password" not in lowered


@needs_docker
def test_the_toolgate_key_has_the_shape_toolgate_demands(install):
    """ToolGate rejects a bootstrap key that is not `tgx_` and >= 20 chars. A
    generic random string here would fail at container start instead."""
    install("--yes", "--dry-run")
    key = env_values(install.env_file)["PI_TOOLGATE_KEY"]
    assert key.startswith("tgx_") and len(key) >= 20


@needs_docker
def test_keys_that_must_have_a_shape_have_it(install):
    """Three services demand a particular shape and refuse anything else, and
    each one was found the same way: not here, but minutes later, as a stack
    trace at container start. All three are now made with the shape."""
    install("--yes", "--dry-run")
    values = env_values(install.env_file)

    assert values["PI_TOOLGATE_KEY"].startswith("tgx_")
    assert len(values["PI_TOOLGATE_KEY"]) >= 20

    assert values["MEMORYGATE_READ_KEY"].startswith("mg_read_")
    assert len(values["MEMORYGATE_READ_KEY"]) >= 24

    # ToolGate reads this with bytes.fromhex to derive the vault key. Random is
    # not enough; it has to be hex.
    salt = values["TOOLGATE_VAULT_SALT"]
    int(salt, 16)
    assert len(salt) >= 32, f"salt is only {len(salt)} hex chars"


@needs_docker
def test_a_wrongly_shaped_key_from_an_older_install_is_replaced(install):
    """Keeping an existing key is right, except when the existing key is the
    bug. A base64 salt written before the hex requirement was known would make
    the vault permanently unreadable."""
    install("--yes", "--dry-run")
    body = install.env_file.read_text()
    install.env_file.write_text(
        body.replace(
            f"TOOLGATE_VAULT_SALT={env_values(install.env_file)['TOOLGATE_VAULT_SALT']}",
            "TOOLGATE_VAULT_SALT=not+hex/at+all==",
        ).replace(
            f"MEMORYGATE_READ_KEY={env_values(install.env_file)['MEMORYGATE_READ_KEY']}",
            "MEMORYGATE_READ_KEY=missing-the-prefix",
        )
    )

    install("--yes", "--dry-run")
    values = env_values(install.env_file)

    int(values["TOOLGATE_VAULT_SALT"], 16)
    assert values["MEMORYGATE_READ_KEY"].startswith("mg_read_")


@needs_docker
def test_the_env_file_is_not_readable_by_anyone_else(install):
    install("--yes", "--dry-run")
    mode = stat.S_IMODE(install.env_file.stat().st_mode)
    assert mode == 0o600, f"expected 600, got {mode:o}"


# --- idempotent -------------------------------------------------------------

@needs_docker
def test_running_twice_repairs_rather_than_duplicates(install):
    """Regenerating keys on a re-run would lock the owner out of their own
    encrypted vault and their own database."""
    install("--yes", "--dry-run")
    first = env_values(install.env_file)
    install("--yes", "--dry-run")
    second = env_values(install.env_file)

    for name in SECRETS:
        assert first[name] == second[name], f"{name} was regenerated on the second run"

    body = install.env_file.read_text()
    for name in SECRETS:
        assert body.count(f"{name}=") == 1, f"{name} was written twice"


@needs_docker
def test_gateway_key_and_owner_credential_survive_installer_rerun(install):
    import hashlib

    install("--yes", "--dry-run")
    first = env_values(install.env_file)
    assert first["PI_GATEWAY_KEY_SHA256"] == hashlib.sha256(
        first["PI_GATEWAY_KEY"].encode()
    ).hexdigest()
    assert first["PI_OWNER_KEY_SHA256"] == hashlib.sha256(
        first["GATEWAY_PI_OWNER_KEY"].encode()
    ).hexdigest()
    assert first["GATEWAY_ORIGIN"] == "https://localhost:8050"
    assert first["TOOLGATE_OWNER_KEY_SHA256"] == hashlib.sha256(
        first["GATEWAY_TOOLGATE_OWNER_KEY"].encode()
    ).hexdigest()
    install("--yes", "--dry-run")
    second = env_values(install.env_file)
    assert second["PI_GATEWAY_KEY"] == first["PI_GATEWAY_KEY"]
    assert second["GATEWAY_PI_OWNER_KEY"] == first["GATEWAY_PI_OWNER_KEY"]
    assert second["GATEWAY_TOOLGATE_OWNER_KEY"] == first["GATEWAY_TOOLGATE_OWNER_KEY"]


@needs_docker
def test_optional_decision_adapter_settings_survive_installer_rerun(install):
    install("--yes", "--dry-run")
    body = install.env_file.read_text()
    body = body.replace("PI_DECISION_URL=", "PI_DECISION_URL=https://decisions.test")
    body = body.replace("PI_DECISION_KEY=", "PI_DECISION_KEY=private-decision-key")
    install.env_file.write_text(body)

    install("--yes", "--dry-run")
    values = env_values(install.env_file)
    assert values["PI_DECISION_URL"] == "https://decisions.test"
    assert values["PI_DECISION_KEY"] == "private-decision-key"


@needs_docker
def test_hosted_provider_settings_survive_installer_rerun(install):
    install("--yes", "--dry-run")
    body = install.env_file.read_text()
    body = body.replace("PI_ALLOW_PAID_MODELS=", "PI_ALLOW_PAID_MODELS=true")
    body += (
        "\nOPENROUTER_KEY=preserved-openrouter-key"
        "\nPI_OPENAI_KEY=preserved-openai-key"
        "\nPI_ANTHROPIC_KEY=preserved-anthropic-key\n"
    )
    install.env_file.write_text(body)

    install("--yes", "--dry-run")
    values = env_values(install.env_file)
    assert values["PI_ALLOW_PAID_MODELS"] == "true"
    assert "OPENROUTER_KEY" not in values
    assert "PI_OPENAI_KEY" not in values
    assert "PI_ANTHROPIC_KEY" not in values
    directory = install.dir / ".conker" / "provider-secrets"
    assert (directory / "openrouter.key").read_text() == "preserved-openrouter-key"
    assert (directory / "openai.key").read_text() == "preserved-openai-key"
    assert (directory / "anthropic.key").read_text() == "preserved-anthropic-key"
    state = json.loads((directory / "state.json").read_text())
    assert all(state["providers"][name]["activeRevision"] for name in ("openrouter", "openai", "anthropic"))


@needs_docker
def test_speech_settings_and_mounted_key_survive_installer_rerun(install):
    install("--yes", "--dry-run")
    body = install.env_file.read_text()
    replacements = {
        "PI_SPEECH_URL=": "PI_SPEECH_URL=https://speech.test/v1",
        "PI_STT_MODEL=": "PI_STT_MODEL=whisper-1",
        "PI_TTS_MODEL=": "PI_TTS_MODEL=kokoro",
        "PI_TTS_VOICE=": "PI_TTS_VOICE=af_heart",
    }
    for before, after in replacements.items():
        body = body.replace(before, after)
    install.env_file.write_text(body)
    key = install.dir / ".conker/speech/speech.key"
    key.write_text("preserved-speech-key", encoding="ascii")

    install("--yes", "--dry-run")

    values = env_values(install.env_file)
    assert values["PI_SPEECH_URL"] == "https://speech.test/v1"
    assert values["PI_STT_MODEL"] == "whisper-1"
    assert values["PI_TTS_MODEL"] == "kokoro"
    assert values["PI_TTS_VOICE"] == "af_heart"
    assert key.read_text(encoding="ascii") == "preserved-speech-key"


@needs_docker
def test_a_damaged_env_is_repaired_without_losing_what_survived(install):
    install("--yes", "--dry-run")
    kept = env_values(install.env_file)["CONKER_ADMIN_KEY"]
    # Someone deletes a line. Re-running should replace only that one.
    body = install.env_file.read_text()
    install.env_file.write_text(
        "\n".join(l for l in body.splitlines() if not l.startswith("EMBEDDINGS_KEY="))
    )

    install("--yes", "--dry-run")
    values = env_values(install.env_file)

    assert values["CONKER_ADMIN_KEY"] == kept, "an untouched key was regenerated"
    assert len(values["EMBEDDINGS_KEY"]) >= 20, "the missing key was not restored"


# --- the compose it writes actually works -----------------------------------

@needs_docker
def test_the_generated_config_validates(install):
    """The only check that the compose file and the generated .env agree."""
    result = install("--yes", "--dry-run")
    assert "validates against your .env" in result.stdout


@needs_docker
def test_every_image_is_pinned(install):
    """Never `latest`, for anything an owner runs — ADR-0008."""
    install("--yes", "--dry-run")
    config = subprocess.run(
        ["docker", "compose", "--env-file", str(install.dir / "versions.env"),
         "--env-file", str(install.env_file), "-f", str(install.dir / "docker-compose.yml"),
         "config"],
        capture_output=True, text=True, cwd=str(install.dir),
        check=False,
    ).stdout

    images = re.findall(r"^\s*image:\s*(\S+)", config, re.MULTILINE)
    assert images, "no images found in the resolved config"
    for image in images:
        assert not image.endswith(":latest"), f"{image} is a moving tag"
        assert "@sha256:" in image or re.search(r":v?\d", image), f"{image} is not pinned"


def resolved_images(install) -> list[str]:
    config = subprocess.run(
        ["docker", "compose", "--env-file", str(install.dir / "versions.env"),
         "--env-file", str(install.env_file), "-f", str(install.dir / "docker-compose.yml"),
         "config"],
        capture_output=True, text=True, cwd=str(install.dir),
        check=False,
    ).stdout
    return re.findall(r"^\s*image:\s*(\S+)", config, re.MULTILINE)


@needs_docker
@pytest.mark.skipif(os.environ.get("CONKER_OFFLINE_TESTS") == "1",
                    reason="asks the registry; set CONKER_OFFLINE_TESTS=1 to skip")
def test_every_pinned_image_actually_exists(install):
    """A pin that resolves to nothing is worse than no pin.

    The git tag is `v0.2.2`; the image tag the publish workflow produces is
    `0.2.2`, because docker/metadata-action strips the prefix. Pinning the `v`
    form passed every other test here - the compose file was valid, nothing was
    `latest`, everything was bound to loopback - and then 404'd on the first
    real install. Local builds tagged by hand had masked it completely.

    So this asks the registry, which is the only thing that actually knows.
    """
    install("--yes", "--dry-run")
    images = resolved_images(install)
    assert images, "no images in the resolved config"

    missing = [
        image for image in images
        if subprocess.run(["docker", "manifest", "inspect", image],
                          capture_output=True, check=False).returncode != 0
    ]
    assert not missing, (
        "these pinned images do not exist in the registry:\n  "
        + "\n  ".join(missing)
        + "\n\nCheck versions.env against the tags the publish workflow really "
          "produces - it strips a leading `v`."
    )


@needs_docker
def test_nothing_is_exposed_beyond_this_machine(install):
    """There is no public-internet path at all, by construction. A bind on
    0.0.0.0 would put someone's whole life on the open internet."""
    install("--yes", "--dry-run")
    config = subprocess.run(
        ["docker", "compose", "--env-file", str(install.dir / "versions.env"),
         "--env-file", str(install.env_file), "-f", str(install.dir / "docker-compose.yml"),
         "config"],
        capture_output=True, text=True, cwd=str(install.dir),
        check=False,
    ).stdout

    published = re.findall(r"published:\s*\"?(\d+)\"?", config)
    hosts = re.findall(r"host_ip:\s*(\S+)", config)
    assert published, "no ports published at all — that cannot be right"
    for host in hosts:
        assert host == "127.0.0.1", f"a port is bound to {host}, not loopback"
    assert len(hosts) == len(published), "a published port has no explicit host_ip"


# --- what it tells the owner ------------------------------------------------

@needs_docker
def test_the_backup_directory_is_named_twice(install):
    """People skim installers. The one thing they must not skim is where their
    only copy lives, so it is said twice on purpose."""
    result = install("--yes", "--dry-run")
    # The dry run stops before the closing summary, so assert on the source of
    # the summary itself rather than on a run that never reaches it.
    finish = (ROOT / "install.sh").read_text().split("finish()")[1].split("\n}")[0]
    assert finish.count("CONKER_BACKUP_DIR") >= 2
    assert "only copy" in finish
    assert result.returncode == 0


def test_help_explains_itself_without_docker(install, tmp_path):
    result = install("--help")
    for flag in ("--yes", "--dry-run", "--check"):
        assert flag in result.stdout


def test_an_unknown_option_says_so_and_stops(install):
    result = install("--wat", expect_ok=False)
    assert result.returncode != 0
    assert "--wat" in result.stderr
    assert "--help" in result.stderr


# --- truthful status ---------------------------------------------------------

def test_the_status_parser_reads_the_service_not_its_last_check():
    """`sed 's/.*"status".../'` looks right and is wrong: `.*` is greedy, so it
    walks to the LAST "status" in the body. A Pi reporting `degraded` because
    its model was unreachable displayed as `ok`, because `action_boundary`
    came last and said so.

    Found by an independent audit. Getting this wrong in the status command is
    the worst possible place for it - the owner is told everything is fine at
    exactly the moment they need to know it is not.
    """
    degraded = ('{"service":"pi","status":"degraded","degraded":["local_provider"],'
                '"checks":{"store":{"status":"ok"},'
                '"local_provider":{"status":"unavailable"},'
                '"action_boundary":{"status":"ok"}}}')

    for script in ("conker", "install.sh"):
        body = (ROOT / script).read_text()
        # Both halves matter: the helper must exist AND be what the status
        # line actually calls. An earlier version of this test asserted only
        # that the helper existed, and stayed green when the call site was
        # reverted to the greedy sed - the same "correct in the part, unwired
        # in the whole" mistake as the bug it guards.
        calls = [line for line in body.splitlines() if "status=$(printf" in line]
        assert calls, f"{script}: no status assignment found"
        for line in calls:
            assert "top_level_status" in line, (
                f"{script} still parses status inline: {line.strip()}"
            )

        helper = body.split("top_level_status() {", 1)[1].split("}", 1)[0]
        result = subprocess.run(
            ["bash", "-c", f"top_level_status() {{{helper}}}\nprintf '%s' \"$1\" | top_level_status",
             "_", degraded],
            capture_output=True, text=True,
            check=False,
        )
        assert result.stdout.strip() == "degraded", (
            f"{script} reported {result.stdout.strip()!r} for a degraded service"
        )
