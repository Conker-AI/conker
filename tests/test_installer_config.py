"""install.sh's generated config: it validates, pins every image and exposes nothing beyond the machine.

Split from test_installer.py, whose fixtures these use."""

from __future__ import annotations

import re
import subprocess

from tests.installer_source import installer_text
from tests.test_installer import (  # noqa: F401
    install,
    needs_docker,
    pytestmark,
)


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

    images = re.findall(r"^\s*image:\s*(\S+)", config, re.MULTILINE)
    assert images, "no images found in the resolved config"
    for image in images:
        assert not image.endswith(":latest"), f"{image} is a moving tag"
        assert "@sha256:" in image or re.search(r":v?\d", image), f"{image} is not pinned"


@needs_docker
def test_nothing_is_exposed_beyond_this_machine(install):
    """There is no public-internet path at all, by construction. A bind on
    0.0.0.0 would put someone's whole life on the open internet."""
    install("--yes", "--dry-run")
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

    published = re.findall(r"published:\s*\"?(\d+)\"?", config)
    hosts = re.findall(r"host_ip:\s*(\S+)", config)
    assert published, "no ports published at all — that cannot be right"
    for host in hosts:
        assert host == "127.0.0.1", f"a port is bound to {host}, not loopback"
    assert len(hosts) == len(published), "a published port has no explicit host_ip"


@needs_docker
def test_the_backup_directory_is_named_twice(install):
    """People skim installers. The one thing they must not skim is where their
    only copy lives, so it is said twice on purpose."""
    result = install("--yes", "--dry-run")
    # The dry run stops before the closing summary, so assert on the source of
    # the summary itself rather than on a run that never reaches it.
    finish = installer_text().split("finish()")[1].split("\n}")[0]
    assert finish.count("CONKER_BACKUP_DIR") >= 2
    assert "only copy" in finish
    assert result.returncode == 0
