"""install.sh sources each of its steps from deploy/install/ (the run itself: test_installer.py)."""

from __future__ import annotations

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
