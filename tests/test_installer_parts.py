"""install.sh sources its steps from deploy/install/, and refuses a checkout that lacks one."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys

import pytest

from tests.installer_source import PARTS, ROOT


def test_every_part_is_sourced_and_every_sourced_file_is_a_part():
    on_disk = sorted(path.stem for path in (ROOT / "deploy" / "install").glob("*.sh"))
    assert on_disk == sorted(PARTS)
    installer = (ROOT / "install.sh").read_text(encoding="utf-8")
    assert f"for part in {' '.join(PARTS)}; do" in installer
    for part in PARTS:
        assert f'. "$ROOT/deploy/install/{part}.sh"\n' in installer
        assert f"# shellcheck source=deploy/install/{part}.sh\n" in installer
        text = (ROOT / "deploy" / "install" / f"{part}.sh").read_text(encoding="utf-8")
        assert text.startswith("# shellcheck shell=bash\n")
        assert len(text.splitlines()) <= 600


@pytest.mark.skipif(sys.platform == "win32", reason="the installer runs on Linux and macOS")
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
