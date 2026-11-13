"""Write docs/reference/settings.md from the settings registry, or check that it still matches,
and the settings counts quoted in README.md and docs/status.md with it.

The registry is one JSON file per topic in dashboard/src/settings/registry/. Run from the
repository root: python scripts/settings_docs.py [--check]
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import conker_config  # noqa: E402

OUTPUT = ROOT / "docs" / "reference" / "settings.md"
# Pages that quote how many settings take effect and how many are planned (saved, nothing reads
# them yet); --check fails when a number drifts from the registry.
CLAIMS = ("README.md", "docs/status.md")
CLAIM = re.compile(r"(\d+) settings that take effect \((\d+) more planned\)")
SCOPES = {
    "global": "",
    "device": " (this device)",
    "agent": " (per agent)",
    "chat": " (per chat)",
}
EFFECTS = {
    "live": "applies right away",
    "next-turn": "applies from the next message",
    "restart": "applies after a restart",
    "stored": "saved, not used yet",
}


def shown(setting) -> str:
    value = setting["default"]
    labels = {option["value"]: option["label"] for option in setting.get("options", [])}
    if setting["type"] == "custom":
        return "its own screen"
    if value is None:
        return "none"
    if isinstance(value, bool):
        return "on" if value else "off"
    if isinstance(value, list):
        return ", ".join(str(labels.get(item, item)) for item in value) or "none"
    if value in labels:
        return labels[value]
    unit = f" {setting['unit']}" if setting.get("unit") else ""
    return f"`{value}`{unit}" if value != "" else "empty"


def where(setting) -> str:
    if setting["type"] == "custom":
        return "Settings screen"
    home = setting["home"]
    if home["service"] == "browser":
        return "this browser"
    if home.get("flat"):
        return "owner settings"
    return f"{home['service']} `{home['path']}` `{home['field']}`"


def render() -> str:
    lines = [
        "# Settings",
        "",
        "Generated from `dashboard/src/settings/registry/` by `scripts/settings_docs.py`; do not edit",
        "by hand. Read and change server settings with `conker config get|set|reset ID` (add",
        "`--chat CHAT_ID` for chat settings); `conker config list --search TEXT` finds them, and",
        "`--planned` adds the planned ones, which Settings also hides until you turn on Planned. Each",
        "setting lives in one home: its own service document, the owner settings document, or this",
        'browser. "Saved, not used yet" settings keep your choice until the feature that reads them',
        "is built.",
    ]
    settings = conker_config.load_registry()
    for group in conker_config.load_groups():
        lines += ["", f"## {group['title']}", "", group["description"]]
        for section in group["sections"]:
            lines += [
                "",
                f"### {section['title']}",
                "",
                "| Setting | What it does | Default | Home |",
                "|---|---|---|---|",
            ]
            for entry in section["settings"]:
                setting = next(item for item in settings if item["id"] == entry["id"])
                choices = (
                    " Choices: "
                    + ", ".join(option["label"] for option in setting["options"])
                    + "."
                    if setting.get("options")
                    else ""
                )
                bounds = (
                    f" {setting['min']} to {setting['max']}{' ' + setting['unit'] if setting.get('unit') else ''}."
                    if "min" in setting
                    and "max" in setting
                    and setting["type"] == "number"
                    else ""
                )
                lines.append(
                    f"| **{setting['title']}**{SCOPES[setting['scope']]}<br>`{setting['id']}` "
                    f"| {setting['description']}{choices}{bounds} ({EFFECTS[setting['effect']]}) "
                    f"| {shown(setting)} | {where(setting)} |"
                )
    return "\n".join(lines) + "\n"


def counts() -> tuple[int, int]:
    """(settings that take effect, planned settings) in the registry."""
    settings = conker_config.load_registry()
    planned = sum(1 for setting in settings if conker_config.planned(setting))
    return len(settings) - planned, planned


def claimed(page: str, numbers: tuple[int, int]) -> str:
    """The page with its quoted counts set to the registry's."""
    return CLAIM.sub(
        f"{numbers[0]} settings that take effect ({numbers[1]} more planned)", page
    )


def main() -> int:
    text, numbers = render(), counts()
    pages = {name: (ROOT / name).read_text(encoding="utf-8") for name in CLAIMS}
    missing = [name for name, page in pages.items() if not CLAIM.search(page)]
    if missing:
        print(", ".join(missing) + " no longer quote the settings count")
        return 1
    if "--check" in sys.argv[1:]:
        stale = [
            name for name, page in pages.items() if claimed(page, numbers) != page
        ]
        if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8") != text:
            stale.insert(0, str(OUTPUT.relative_to(ROOT)))
        if not stale:
            return 0
        print(
            ", ".join(stale)
            + " differ from the registry; run python scripts/settings_docs.py"
        )
        return 1
    OUTPUT.write_text(text, encoding="utf-8", newline="\n")
    for name, page in pages.items():
        (ROOT / name).write_text(claimed(page, numbers), encoding="utf-8", newline="\n")
    print(
        f"wrote {OUTPUT.relative_to(ROOT)}: {numbers[0]} settings take effect,"
        f" {numbers[1]} planned"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
