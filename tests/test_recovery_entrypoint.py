"""The recovery command runs as a plain script from any working directory."""

import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "recovery.py"


def test_recovery_script_imports_its_modules_from_any_directory(tmp_path):
    # `python scripts/recovery.py` puts only scripts/ on sys.path; its modules must import flat.
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--help"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert "backup" in result.stdout and "restore" in result.stdout
