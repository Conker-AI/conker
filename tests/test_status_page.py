"""The status page's generated blocks (family counts, release table, deferred table) say what
capabilities.json and versions.env say, and the generator refuses a page without its blocks."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from scripts import status_page
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


def capabilities() -> list[dict]:
    return json.loads((ROOT / "capabilities.json").read_text(encoding="utf-8"))["capabilities"]


def test_the_generated_blocks_are_up_to_date():
    """Run python scripts/status_page.py after changing capabilities.json or versions.env."""
    text = STATUS.read_text(encoding="utf-8")
    assert status_page.render(text, capabilities(), parse_env(MANIFEST)) == text


def test_a_new_pin_and_a_deferred_family_change_the_page():
    text = STATUS.read_text(encoding="utf-8")
    pins = {**parse_env(MANIFEST), "PI_VERSION": "9.9.9"}
    items = [*capabilities(), {**capabilities()[0], "name": "Shelved thing", "state": "deferred"}]
    page = status_page.render(text, items, pins)
    assert "| Pi and the Gateway | 9.9.9 |" in page
    assert f"**{len(items)} tracked\ncapability families: {len(items) - 2} active and 2 deferred**" in page
    assert "| Shelved thing | No gap recorded in capabilities.json. |" in page
    assert page.count("<!-- /generated:") == 3  # hand-written text around the blocks is kept


def test_a_page_without_its_blocks_or_a_missing_pin_is_refused():
    text = STATUS.read_text(encoding="utf-8")
    broken = text.replace("<!-- generated:release -->\n", "", 1)
    with pytest.raises(status_page.StatusPageError, match="each generated block once"):
        status_page.render(broken, capabilities(), parse_env(MANIFEST))
    pins = {key: value for key, value in parse_env(MANIFEST).items() if key != "TOOLGATE_VERSION"}
    with pytest.raises(status_page.StatusPageError, match="no TOOLGATE_VERSION"):
        status_page.render(text, capabilities(), pins)
