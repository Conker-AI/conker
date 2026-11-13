"""docs/reference/product-map.md names every capability family, settings topic, chat pillar and
Pi package exactly once, and nothing that does not exist."""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MAP = ROOT / "docs" / "reference" / "product-map.md"
PILLARS = {"Prompt", "Context", "Model", "Character", "Access", "Output", "Review", "Interaction"}
# Pi's subpackages (pi/ in the Pi repository); checked against a Pi checkout beside this one.
PI_PACKAGES = {
    "actions", "agents", "api", "calls", "content", "context", "conversation", "core", "host",
    "memory", "models", "owner", "schedule", "setup", "turns",
}
COLUMNS = ["Domain", "Pillars", "Capability families", "Settings topics", "Pi packages"]


def rows(page: Path = MAP) -> list[dict[str, list[str]]]:
    lines = [line for line in page.read_text(encoding="utf-8").splitlines() if line.startswith("| ")]
    assert [cell.strip() for cell in lines[0].strip("|").split("|")] == COLUMNS
    table = []
    for line in lines[1:]:
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        assert len(cells) == len(COLUMNS), line
        table.append(
            {
                name: [item.strip(" `") for item in cell.split(",") if item.strip() != "—"]
                for name, cell in zip(COLUMNS, cells, strict=True)
            }
        )
    return table


def once(column: str, known: set[str], page: Path = MAP) -> None:
    counts = Counter(item for row in rows(page) for item in row[column])
    doubled = sorted(item for item, count in counts.items() if count > 1)
    assert not doubled, f"{column} named twice: {doubled}"
    assert not set(counts) - known, f"unknown {column}: {sorted(set(counts) - known)}"
    assert not known - set(counts), f"{column} missing from the map: {sorted(known - set(counts))}"


def families() -> set[str]:
    capabilities = json.loads((ROOT / "capabilities.json").read_text(encoding="utf-8"))
    return {item["id"] for item in capabilities["capabilities"]}


def topics() -> set[str]:
    return {path.stem for path in (ROOT / "dashboard/src/settings/registry").glob("*.json")}


def test_every_capability_family_is_in_one_domain():
    once("Capability families", families())


def test_every_settings_topic_is_in_one_domain():
    once("Settings topics", topics())


def test_every_pillar_and_pi_package_is_in_one_domain():
    once("Pillars", PILLARS)
    once("Pi packages", PI_PACKAGES)
    domains = [row["Domain"][0] for row in rows()]
    assert len(set(domains)) == len(domains), "a domain is listed twice"


def test_the_pi_package_list_matches_a_pi_checkout():
    candidates = [ROOT.parent / "gates" / "pi" / "pi", ROOT.parent.parent / "gates" / "pi" / "pi"]
    source = next((path for path in candidates if path.is_dir()), None)
    if source is None:
        pytest.skip("no Pi checkout beside this repository")
    assert {path.name for path in source.iterdir() if (path / "__init__.py").is_file()} == PI_PACKAGES


@pytest.mark.parametrize(
    ("change", "message"),
    [
        (("| `account`, `you` |", "| `account`, `you`, `models` |"), "named twice"),
        (("| `account`, `you` |", "| `account`, `you`, `weather` |"), "unknown"),
        (("| `account`, `you` |", "| `account` |"), "missing from the map"),
    ],
)
def test_a_doubled_unknown_or_missing_topic_fails(tmp_path, change, message):
    page = tmp_path / "product-map.md"
    before, after = change
    page.write_text(MAP.read_text(encoding="utf-8").replace(before, after, 1), encoding="utf-8")
    with pytest.raises(AssertionError, match=message):
        once("Settings topics", topics(), page)
