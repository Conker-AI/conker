"""The status page's release table names the same release versions.env pins."""

from __future__ import annotations

import re
from pathlib import Path

from scripts.release_manifest import parse_env

ROOT = Path(__file__).resolve().parent.parent
STATUS = ROOT / "docs" / "status.md"
MANIFEST = ROOT / "versions.env"

ROWS = {
    "Pi and the Gateway": "PI_VERSION",
    "ToolGate": "TOOLGATE_VERSION",
    "MemoryGate": "MEMORYGATE_VERSION",
    "SystemGate": "SYSTEMGATE_VERSION",
    "Embeddings": "EMBEDDINGS_VERSION",
    "Agent sandbox": "AGENT_SANDBOX_STATE",
    "Owner terminal": "OWNER_TERMINAL_STATE",
}


def release_table() -> dict[str, str]:
    text = STATUS.read_text(encoding="utf-8")
    section = text.split("\n## The current release\n", 1)[1]
    section = re.split(r"^## ", section, maxsplit=1, flags=re.MULTILINE)[0]
    return dict(re.findall(r"^\| ([^|]+?) \| ([^|]+?) \|", section, flags=re.MULTILINE))


def test_status_page_rows_are_present():
    table = release_table()
    missing = [name for name in ROWS if name not in table]
    assert not missing, "missing rows in docs/status.md's release table: " + str(missing)


def test_status_page_pins_match_the_manifest():
    """docs/status.md's "The current release" table says what versions.env pins."""
    table = release_table()
    pinned = parse_env(MANIFEST)
    for name, key in ROWS.items():
        shown = table.get(name)
        assert shown == pinned[key], (
            "row '" + name + "' in docs/status.md says " + repr(shown)
            + " but versions.env pins " + key + "=" + pinned[key]
        )