"""conker config: every setting from one registry, read and written through its own home.

The registry (dashboard/src/settings/registry/, one file per topic) describes each setting once:
what it is, its type and default, and its home, the service document that stores it. A setting
with no home of its own lives in Pi's owner settings document under its id. Nothing is copied:
`get` reads the home document, `set` changes one field of it and writes it back with the
document's revision, so a concurrent change is refused (HTTP 409) instead of overwritten. Device
settings (theme, text size) live in each browser, and custom ones have their own Settings screen.
"""

from __future__ import annotations

import copy
import json
import re
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

REGISTRY = (
    Path(__file__).resolve().parents[1] / "dashboard" / "src" / "settings" / "registry"
)
# Where a setting lives when its entry names no home of its own.
OWNER_SETTINGS = {
    "service": "pi",
    "path": "/owner/settings",
    "key": "values",
    "flat": True,
}
DATE = re.compile(r"\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])")
MODEL_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}")
CHAT_ID = re.compile(r"[A-Za-z0-9_-]{1,128}")
TIME = re.compile(r"([01]\d|2[0-3]):[0-5]\d")
TRUE, FALSE = {"true", "on", "yes", "1"}, {"false", "off", "no", "0"}


def register(commands):
    config = commands.add_parser(
        "config", help="Read and change settings; each one lives in its own service"
    )
    operations = config.add_subparsers(dest="operation", required=True)
    listing = operations.add_parser("list", help="Settings with current values")
    listing.add_argument(
        "--search", help="Text to find in names, descriptions and keywords"
    )
    listing.add_argument("--scope", choices=["global", "agent", "chat"])
    listing.add_argument("--group", help="Only one topic, such as appearance or inbox")
    listing.add_argument(
        "--modified", action="store_true", help="Only changed from default"
    )
    listing.add_argument("--chat", help="Include this chat's settings")
    get = operations.add_parser(
        "get", help="One setting with its description and value"
    )
    change = operations.add_parser("set", help="Change one setting")
    reset = operations.add_parser("reset", help="Put one setting back to its default")
    for parser in (get, change, reset):
        parser.add_argument("id")
    change.add_argument("value")
    for parser in (get, change, reset):
        parser.add_argument("--chat", help="The chat, for chat settings")


def load_groups(path: Path = REGISTRY) -> list[dict]:
    """The topic files in their screen order."""
    groups = [
        json.loads(item.read_text(encoding="utf-8")) for item in path.glob("*.json")
    ]
    return sorted(groups, key=lambda group: (group["order"], group["id"]))


def load_registry(path: Path = REGISTRY) -> list[dict]:
    """Every setting, each with its group, section and home filled in."""
    settings = []
    for group in load_groups(path):
        for section in group["sections"]:
            for setting in section["settings"]:
                entry = {
                    "keywords": [],
                    "related": [],
                    **setting,
                    "group": group["id"],
                    "section": section["id"],
                }
                if setting["type"] != "custom" and "home" not in setting:
                    entry["home"] = {**OWNER_SETTINGS, "field": setting["id"]}
                settings.append(entry)
    return settings


def values_of(setting: dict) -> list:
    return [option["value"] for option in setting.get("options", [])]


def on_server(setting: dict) -> bool:
    return setting["type"] != "custom" and setting["home"]["service"] != "browser"


def server_only(setting: dict) -> None:
    if setting["type"] == "custom":
        raise ValueError(
            f"{setting['id']} has its own screen: open Settings to change it."
        )
    if setting["home"]["service"] == "browser":
        raise ValueError(
            f"{setting['id']} is kept in each browser: change it in Settings there."
        )


def find(settings: list[dict], identity: str) -> dict:
    for setting in settings:
        if setting["id"] == identity:
            return setting
    raise ValueError(
        f"Unknown setting {identity!r}. List them with: conker config list"
    )


def value_at(document, field: str, flat: bool = False):
    if flat:
        return document.get(field) if isinstance(document, dict) else None
    value = document
    for part in field.split("."):
        if not isinstance(value, dict) or part not in value:
            return None
        value = value[part]
    return value


def with_value(document: dict, field: str, value, flat: bool = False) -> dict:
    changed = copy.deepcopy(document)
    if flat:
        changed[field] = value
        return changed
    target = changed
    *parents, leaf = field.split(".")
    for part in parents:
        if not isinstance(target.get(part), dict):
            raise ValueError(f"The stored document has no {field!r}.")  # noqa: TRY004 - reported to the owner like every CLI input error
        target = target[part]
    target[leaf] = value
    return changed


def parse(setting: dict, raw: str):
    """Turn command-line text into the setting's typed value, checked against the registry."""
    kind, text = setting["type"], raw.strip()
    server_only(setting)
    if kind == "toggle":
        if text.lower() in TRUE:
            return True
        if text.lower() in FALSE:
            return False
        raise ValueError("Use on or off.")
    if kind in {"number", "slider"}:
        if not re.fullmatch(r"-?\d{1,12}", text):
            raise ValueError("Use a whole number.")
        number = int(text)
        if "min" in setting and number < setting["min"]:
            raise ValueError(f"Use at least {setting['min']}.")
        if "max" in setting and number > setting["max"]:
            raise ValueError(f"Use at most {setting['max']}.")
        return number
    if kind == "select":
        for option in setting["options"]:
            if text in (str(option["value"]), option["label"]):
                return option["value"]
        raise ValueError("Use one of: " + ", ".join(map(str, values_of(setting))))
    if kind == "list":
        chosen = [item.strip() for item in text.split(",") if item.strip()]
        unknown = sorted(set(chosen) - set(values_of(setting)))
        if unknown or len(set(chosen)) != len(chosen):
            raise ValueError(
                "Use distinct values from: " + ", ".join(map(str, values_of(setting)))
            )
        return chosen
    if kind in {"tags", "models"}:
        chosen = [item.strip() for item in text.split(",") if item.strip()]
        limit = setting.get("max_items", 50)
        if len(chosen) > limit or len(set(chosen)) != len(chosen):
            raise ValueError(
                f"Use at most {limit} distinct values, separated by commas."
            )
        if kind == "models" and not all(MODEL_ID.fullmatch(item) for item in chosen):
            raise ValueError("Use model ids as conker models lists them.")
        if any(len(item) > 80 for item in chosen):
            raise ValueError("Keep each value under 80 characters.")
        return chosen
    if kind == "date":
        if text.lower() in {"", "none", "off"}:
            return None
        if not DATE.fullmatch(text):
            raise ValueError("Use a date as YYYY-MM-DD.")
        return text
    if kind == "time":
        if not TIME.fullmatch(text):
            raise ValueError("Use 24-hour HH:MM.")
        return text
    if kind == "timezone":
        try:
            ZoneInfo(text)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("Use a time zone name such as Europe/London.") from None
        return text
    if kind in {"text", "textarea"}:
        if len(text) > setting.get("max_length", 200):
            raise ValueError(
                f"Use at most {setting.get('max_length', 200)} characters."
            )
        if "pattern" in setting and not re.fullmatch(setting["pattern"], text):
            raise ValueError("That value does not have the expected form.")
        return text
    raise ValueError(f"Unsupported setting type {kind!r}.")


def home(setting: dict, chat: str | None) -> str:
    server_only(setting)
    path = setting["home"]["path"]
    if "{chat}" in path:
        if not chat or not CHAT_ID.fullmatch(chat):
            raise ValueError(
                f"{setting['id']} belongs to one chat: add --chat CHAT_ID."
            )
        return path.replace("{chat}", chat)
    if chat:
        raise ValueError(f"{setting['id']} is global: leave out --chat.")
    return path


def read(request, config, setting: dict, chat: str | None):
    """(revision, document) of the setting's home; the document is None when nothing is saved."""
    value = request(config, setting["home"]["service"], home(setting, chat))
    return value.get("revision", 0), value.get(setting["home"]["key"])


def row(setting: dict, document) -> dict:
    flat = setting["home"].get("flat", False)
    current = (
        value_at(document, setting["home"]["field"], flat)
        if document is not None
        else None
    )
    stored = (
        flat and isinstance(document, dict) and setting["home"]["field"] in document
    )
    return {
        "id": setting["id"],
        "title": setting["title"],
        "group": setting["group"],
        "scope": setting["scope"],
        "value": current if not flat or stored else setting["default"],
        "default": setting["default"],
        "modified": (stored and current != setting["default"])
        if flat
        else document is not None and current != setting["default"],
        "effect": setting["effect"],
    }


def matches(setting: dict, text: str) -> bool:
    haystack = " ".join(
        [setting["id"], setting["title"], setting["description"], *setting["keywords"]]
    )
    return text.lower() in haystack.lower()


def config_operation(args, config, request) -> int:
    settings = load_registry()
    chat = getattr(args, "chat", None)
    if args.operation == "list":
        chosen = [
            setting
            for setting in settings
            if (not args.search or matches(setting, args.search))
            and (not args.scope or setting["scope"] == args.scope)
            and (not getattr(args, "group", None) or setting["group"] == args.group)
            and (chat or setting["scope"] == "global")
            and on_server(setting)
        ]
        documents = {}
        rows = []
        for setting in chosen:
            path = home(setting, chat if setting["scope"] == "chat" else None)
            if path not in documents:
                documents[path] = read(
                    request,
                    config,
                    setting,
                    chat if setting["scope"] == "chat" else None,
                )[1]
            rows.append(row(setting, documents[path]))
        if args.modified:
            rows = [item for item in rows if item["modified"]]
        value = {"settings": rows}
    elif args.operation == "get":
        setting = find(settings, args.id)
        value = {**row(setting, read(request, config, setting, chat)[1]), **setting}
    else:
        setting = find(settings, args.id)
        server_only(setting)
        flat = setting["home"].get("flat", False)
        if args.operation == "reset":
            if setting["default"] is None and not flat:
                raise ValueError(
                    f"{setting['id']} has no default; set a value instead."
                )
            new = setting["default"]
        else:
            new = parse(setting, args.value)
        revision, document = read(request, config, setting, chat)
        if document is None:
            # Only budget can start them: a window and reserve have no default to guess.
            raise ValueError(
                "This chat has no context settings yet. Start them with: "
                f"conker context budget {chat} --window TOKENS --reserve TOKENS"
            )
        saved = request(
            config,
            setting["home"]["service"],
            home(setting, chat),
            {
                "expected_revision": revision,
                setting["home"]["key"]: (
                    {
                        key: value
                        for key, value in document.items()
                        if key != setting["home"]["field"]
                    }
                    if flat and args.operation == "reset"
                    else with_value(document, setting["home"]["field"], new, flat)
                ),
            },
        )
        value = {
            "id": setting["id"],
            "value": setting["default"]
            if flat and args.operation == "reset"
            else value_at(
                saved.get(setting["home"]["key"]), setting["home"]["field"], flat
            ),
            "revision": saved.get("revision"),
            "effect": setting["effect"],
        }
    print(json.dumps(value, indent=2, ensure_ascii=False))
    return 0
