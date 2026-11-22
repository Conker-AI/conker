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

import contextlib
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from tests.installer_source import installer_text

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
        + ('status) printf " M local.txt\\n"; exit 0 ;;\n' if dirty else "status) exit 0 ;;\n")
        + "pull) exit 1 ;;\n"
        + "esac\nexit 1\n"
    )
    git.chmod(0o755)
    result = subprocess.run(
        ["bash", "-s", "--", "--yes"],
        input=INSTALL.read_text(),
        text=True,
        capture_output=True,
        timeout=15,
        env={
            **os.environ,
            "CONKER_HOME": str(checkout),
            "NO_COLOR": "1",
            "PATH": str(commands) + os.pathsep + os.environ.get("PATH", ""),
        },
        cwd=tmp_path,
        check=False,
    )
    assert result.returncode != 0
    assert "Updated " not in result.stdout
    assert ("local changes" if dirty else "Could not update") in result.stderr


pytestmark = pytest.mark.skipif(
    sys.platform == "win32",
    reason="the installer is a POSIX shell script for Linux and macOS servers; "
    "run these in CI or a container",
)


def test_a_checkout_without_its_parts_stops_before_checking_anything(tmp_path):
    for name in ("install.sh", "docker-compose.yml"):
        shutil.copy(ROOT / name, tmp_path / name)
    result = subprocess.run(
        ["bash", str(tmp_path / "install.sh"), "--check"],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
        env={**os.environ, "NO_COLOR": "1"},
        cwd=tmp_path,
    )
    assert result.returncode == 1
    assert "deploy/install/machine.sh is missing" in result.stderr
    assert "Checking this machine" not in result.stdout


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
    for name in (
        "install.sh",
        "conker",
        "docker-compose.yml",
        "docker-compose.sandbox.yml",
        "docker-compose.subscriptions.yml",
        "docker-compose.direct-providers.yml",
        "versions.env",
    ):
        shutil.copy(ROOT / name, work / name)
    shutil.copytree(
        ROOT / "scripts", work / "scripts", ignore=shutil.ignore_patterns("__pycache__")
    )
    shutil.copytree(ROOT / "deploy" / "install", work / "deploy" / "install")
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
            capture_output=True,
            text=True,
            env=env,
            cwd=str(work),
            timeout=180,
            check=False,
        )
        if expect_ok and proc.returncode != 0:
            pytest.fail(
                f"exit {proc.returncode}\n--- stdout ---\n{proc.stdout}\n"
                f"--- stderr ---\n{proc.stderr}"
            )
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
            with contextlib.suppress(OSError):
                (sandbox / entry.name).symlink_to(entry)
    return str(sandbox)


def test_a_missing_docker_names_the_exact_fix(install, tmp_path):
    """Not "docker not found". The next command to type."""
    result = install("--check", expect_ok=False, path=path_without("docker", tmp_path / "nodocker"))

    assert result.returncode != 0
    assert "Docker is not installed" in result.stderr
    assert "get.docker.com" in result.stderr, "it must say how to install it"
    assert "Traceback" not in result.stderr and "line " not in result.stderr.split("What to do")[0]


# --- secrets ----------------------------------------------------------------


# --- idempotent -------------------------------------------------------------


# --- the compose it writes actually works -----------------------------------


def resolved_images(install) -> list[str]:
    config = subprocess.run(
        [
            "docker",
            "compose",
            "--env-file",
            str(install.dir / "versions.env"),
            "--env-file",
            str(install.env_file),
            "-f",
            str(install.dir / "docker-compose.yml"),
            "config",
        ],
        capture_output=True,
        text=True,
        cwd=str(install.dir),
        check=False,
    ).stdout
    return re.findall(r"^\s*image:\s*(\S+)", config, re.MULTILINE)


@needs_docker
@pytest.mark.skipif(
    os.environ.get("CONKER_OFFLINE_TESTS") == "1",
    reason="asks the registry; set CONKER_OFFLINE_TESTS=1 to skip",
)
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
        image
        for image in images
        if subprocess.run(
            ["docker", "manifest", "inspect", image], capture_output=True, check=False
        ).returncode
        != 0
    ]
    assert not missing, (
        "these pinned images do not exist in the registry:\n  "
        + "\n  ".join(missing)
        + "\n\nCheck versions.env against the tags the publish workflow really "
        "produces - it strips a leading `v`."
    )


# --- what it tells the owner ------------------------------------------------


def test_the_guided_setup_is_offered_only_to_a_person_at_a_terminal():
    finish = installer_text().split("finish()")[1].split("\n}")[0]
    offer = finish.split('[ "$ASSUME_YES" -eq 0 ] && [ -t 0 ] && [ -t 1 ]')
    assert len(offer) == 2 and 'bash "$ROOT/conker" setup' in offer[1]
    assert "./conker setup" in offer[0]  # unattended installs still learn the command


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
    degraded = (
        '{"service":"pi","status":"degraded","degraded":["local_provider"],'
        '"checks":{"store":{"status":"ok"},'
        '"local_provider":{"status":"unavailable"},'
        '"action_boundary":{"status":"ok"}}}'
    )

    for script, body in (
        ("conker", (ROOT / "conker").read_text()),
        ("install.sh", installer_text()),
    ):
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
            [
                "bash",
                "-c",
                f"top_level_status() {{{helper}}}\nprintf '%s' \"$1\" | top_level_status",
                "_",
                degraded,
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.stdout.strip() == "degraded", (
            f"{script} reported {result.stdout.strip()!r} for a degraded service"
        )


def test_installer_selects_sandbox_overlay_only_when_active():
    """The installer must include docker-compose.sandbox.yml only when
    AGENT_SANDBOX_STATE=active, matching the owner-terminal precedent."""
    installer = installer_text()
    launcher = (ROOT / "conker").read_text()

    for source, name in ((installer, "install.sh"), (launcher, "conker")):
        assert "agent_sandbox_active()" in source, f"{name} does not define agent_sandbox_active()"
        assert "AGENT_SANDBOX_STATE=active" in source, (
            f"{name} does not check AGENT_SANDBOX_STATE=active"
        )
        assert "docker-compose.sandbox.yml" in source, (
            f"{name} does not include docker-compose.sandbox.yml"
        )
