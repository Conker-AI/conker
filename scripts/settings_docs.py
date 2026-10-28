"""Write docs/reference/settings.md from the settings registry, or check that it still matches.

The registry is one JSON file per topic in dashboard/src/settings/registry/. Run from the
repository root: python scripts/settings_docs.py [--check]
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import conker_config

OUTPUT = ROOT / "docs" / "reference" / "settings.md"
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
        "`--chat CHAT_ID` for chat settings); `conker config list --search TEXT` finds them. Each",
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


def main() -> int:
    text = render()
    if "--check" in sys.argv[1:]:
        if OUTPUT.exists() and OUTPUT.read_text(encoding="utf-8") == text:
            return 0
        print(
            f"{OUTPUT.relative_to(ROOT)} differs from the registry; run python scripts/settings_docs.py"
        )
        return 1
    OUTPUT.write_text(text, encoding="utf-8", newline="\n")
    print(f"wrote {OUTPUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
