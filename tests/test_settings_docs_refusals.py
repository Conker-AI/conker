"""Refusals of scripts/settings_docs.py, run in process against a fake registry and a fake root.

test_settings_registry.py runs the real --check as a subprocess; these cover what it refuses:
pages that stopped quoting the count, stale pages and reference, a missing reference, and
registry entries it cannot describe.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import settings_docs as docs  # noqa: E402

QUOTE = "Conker has {} settings that take effect ({} more planned) today."


def setting(**overrides) -> dict:
    base = {
        "id": "chat.level",
        "title": "Level",
        "description": "How plain answers are.",
        "type": "select",
        "scope": "global",
        "effect": "live",
        "default": "normal",
        "options": [{"value": "normal", "label": "Normal"}],
        "home": {"service": "pi", "path": "/owner/settings", "field": "level"},
    }
    return {**base, **overrides}


def groups_for(settings: list[dict]) -> list[dict]:
    return [
        {
            "id": "chat",
            "order": 1,
            "title": "Chat",
            "description": "Chat settings.",
            "sections": [
                {
                    "id": "main",
                    "title": "Main",
                    "settings": [{"id": item["id"]} for item in settings],
                }
            ],
        }
    ]


@pytest.fixture
def fake(tmp_path, monkeypatch):
    """A root with both claim pages and a two-setting registry (one live, one planned)."""
    settings = [
        setting(),
        setting(id="chat.later", effect="stored", type="toggle", default=False, options=[]),
    ]
    monkeypatch.setattr(docs, "ROOT", tmp_path)
    monkeypatch.setattr(docs, "OUTPUT", tmp_path / "docs" / "reference" / "settings.md")
    monkeypatch.setattr(docs.conker_config, "load_registry", lambda: settings)
    monkeypatch.setattr(docs.conker_config, "load_groups", lambda: groups_for(settings))
    (tmp_path / "docs" / "reference").mkdir(parents=True)
    for name in docs.CLAIMS:
        (tmp_path / name).write_text(QUOTE.format(1, 1) + "\n", encoding="utf-8")
    return tmp_path


def run(monkeypatch, *args: str) -> int:
    monkeypatch.setattr(sys, "argv", ["settings_docs.py", *args])
    return docs.main()


# shown(): every default shape


@pytest.mark.parametrize(
    ("overrides", "expected"),
    [
        ({"type": "custom"}, "its own screen"),
        ({"default": None}, "none"),
        ({"default": True}, "on"),
        ({"default": False}, "off"),
        ({"default": ["normal", "raw"]}, "Normal, raw"),
        ({"default": []}, "none"),
        ({"default": "normal"}, "Normal"),
        ({"default": 15, "options": [], "unit": "minutes"}, "`15` minutes"),
        ({"default": 15, "options": []}, "`15`"),
        ({"default": "", "options": []}, "empty"),
    ],
)
def test_shown_describes_every_default_shape(overrides, expected):
    assert docs.shown(setting(**overrides)) == expected


def test_shown_refuses_a_setting_without_a_default():
    item = setting()
    del item["default"]
    with pytest.raises(KeyError, match="default"):
        docs.shown(item)


# where(): every home


@pytest.mark.parametrize(
    ("overrides", "expected"),
    [
        ({"type": "custom", "home": {}}, "Settings screen"),
        ({"home": {"service": "browser"}}, "this browser"),
        ({"home": {"service": "pi", "flat": True}}, "owner settings"),
        ({}, "pi `/owner/settings` `level`"),
    ],
)
def test_where_names_every_home(overrides, expected):
    assert docs.where(setting(**overrides)) == expected


def test_where_refuses_a_service_home_without_a_path():
    with pytest.raises(KeyError, match="path"):
        docs.where(setting(home={"service": "pi", "field": "level"}))


# render(): what it cannot describe


def test_render_refuses_a_section_naming_a_setting_the_registry_lacks(monkeypatch):
    monkeypatch.setattr(docs.conker_config, "load_registry", lambda: [setting()])
    monkeypatch.setattr(
        docs.conker_config, "load_groups", lambda: groups_for([setting(id="chat.ghost")])
    )
    with pytest.raises(StopIteration):
        docs.render()


@pytest.mark.parametrize(
    ("overrides", "missing"), [({"scope": "team"}, "team"), ({"effect": "soon"}, "soon")]
)
def test_render_refuses_an_unknown_scope_or_effect(monkeypatch, overrides, missing):
    item = setting(**overrides)
    monkeypatch.setattr(docs.conker_config, "load_registry", lambda: [item])
    monkeypatch.setattr(docs.conker_config, "load_groups", lambda: groups_for([item]))
    with pytest.raises(KeyError, match=missing):
        docs.render()


def test_render_writes_choices_bounds_and_scope(monkeypatch):
    bounded = setting(
        id="session.idle",
        type="number",
        scope="chat",
        effect="restart",
        default=15,
        options=[],
        min=5,
        max=120,
        unit="minutes",
    )
    unitless = setting(id="session.tries", type="number", default=3, options=[], min=1, max=9)
    # min/max on a non-number is not a bound
    text_bounds = setting(id="session.name", type="text", default="x", options=[], min=1, max=9)
    items = [setting(), bounded, unitless, text_bounds]
    monkeypatch.setattr(docs.conker_config, "load_registry", lambda: items)
    monkeypatch.setattr(docs.conker_config, "load_groups", lambda: groups_for(items))
    text = docs.render()
    assert text.endswith("\n")
    assert "## Chat\n\nChat settings." in text
    assert "### Main" in text
    assert "How plain answers are. Choices: Normal. (applies right away)" in text
    assert "**Level**" in text and "| Normal | pi `/owner/settings` `level` |" in text
    assert "**Level** (per chat)<br>`session.idle`" in text
    assert "5 to 120 minutes. (applies after a restart) | `15` minutes |" in text
    assert "1 to 9. (applies right away) | `3` |" in text
    assert "How plain answers are. (applies right away) | `x` |" in text


# counts() and claimed()


def test_counts_split_live_from_planned(fake):
    assert docs.counts() == (1, 1)


def test_claimed_rewrites_every_quote_and_leaves_other_text():
    page = QUOTE.format(9, 9) + "\n" + QUOTE.format(8, 7) + "\nOther 3 settings.\n"
    assert docs.claimed(page, (2, 1)) == (
        QUOTE.format(2, 1) + "\n" + QUOTE.format(2, 1) + "\nOther 3 settings.\n"
    )


def test_claimed_leaves_a_page_without_the_quote_alone():
    assert docs.claimed("no count here\n", (2, 1)) == "no count here\n"


# main(): refusals


def test_main_refuses_when_pages_no_longer_quote_the_count(fake, monkeypatch, capsys):
    (fake / "README.md").write_text("no count\n", encoding="utf-8")
    (fake / "docs" / "status.md").write_text("also none\n", encoding="utf-8")
    assert run(monkeypatch) == 1
    assert capsys.readouterr().out == (
        "README.md, docs/status.md no longer quote the settings count\n"
    )
    assert not docs.OUTPUT.exists()
    assert (fake / "README.md").read_text(encoding="utf-8") == "no count\n"


def test_check_refuses_too_when_a_quote_is_gone(fake, monkeypatch, capsys):
    (fake / "docs" / "status.md").write_text("gone\n", encoding="utf-8")
    assert run(monkeypatch, "--check") == 1
    assert capsys.readouterr().out == "docs/status.md no longer quote the settings count\n"


def test_main_refuses_when_a_claim_page_is_missing(fake, monkeypatch):
    (fake / "README.md").unlink()
    with pytest.raises(FileNotFoundError):
        run(monkeypatch, "--check")


def test_check_refuses_a_missing_reference(fake, monkeypatch, capsys):
    assert run(monkeypatch, "--check") == 1
    out = capsys.readouterr().out
    reference = str(Path("docs") / "reference" / "settings.md")
    assert out == (f"{reference} differ from the registry; run python scripts/settings_docs.py\n")
    assert not docs.OUTPUT.exists()


def test_check_refuses_a_stale_reference_and_stale_counts(fake, monkeypatch, capsys):
    docs.OUTPUT.write_text("# Settings\nold\n", encoding="utf-8")
    (fake / "README.md").write_text(QUOTE.format(5, 0) + "\n", encoding="utf-8")
    assert run(monkeypatch, "--check") == 1
    reference = str(Path("docs") / "reference" / "settings.md")
    assert capsys.readouterr().out == (
        f"{reference}, README.md differ from the registry; run python scripts/settings_docs.py\n"
    )
    # --check never writes
    assert docs.OUTPUT.read_text(encoding="utf-8") == "# Settings\nold\n"
    assert (fake / "README.md").read_text(encoding="utf-8") == QUOTE.format(5, 0) + "\n"


def test_check_refuses_stale_counts_with_a_current_reference(fake, monkeypatch, capsys):
    docs.OUTPUT.write_text(docs.render(), encoding="utf-8", newline="\n")
    (fake / "docs" / "status.md").write_text(QUOTE.format(1, 4) + "\n", encoding="utf-8")
    assert run(monkeypatch, "--check") == 1
    assert capsys.readouterr().out.startswith("docs/status.md differ from the registry")


def test_write_then_check_passes(fake, monkeypatch, capsys):
    (fake / "README.md").write_text(QUOTE.format(7, 7) + "\n", encoding="utf-8")
    assert run(monkeypatch) == 0
    reference = str(Path("docs") / "reference" / "settings.md")
    assert capsys.readouterr().out == (f"wrote {reference}: 1 settings take effect, 1 planned\n")
    assert (fake / "README.md").read_text(encoding="utf-8") == QUOTE.format(1, 1) + "\n"
    assert b"\r\n" not in docs.OUTPUT.read_bytes()
    assert run(monkeypatch, "--check") == 0
    assert capsys.readouterr().out == ""
