"""conker config: every setting from one registry, read and written through its own home.

The registry (settings-registry.json) describes each setting once: what it is, its type and
default, and its home, the service document that stores it. Nothing is copied: `get` reads the
home document, `set` changes one field of it and writes it back with the document's revision, so a
concurrent change is refused (HTTP 409) instead of overwritten.
"""

from __future__ import annotations

import copy
import json
import re
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

REGISTRY = Path(__file__).resolve().parents[1] / "settings-registry.json"
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


def load_registry(path: Path = REGISTRY) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))["settings"]


def find(settings: list[dict], identity: str) -> dict:
    for setting in settings:
        if setting["id"] == identity:
            return setting
    raise ValueError(
        f"Unknown setting {identity!r}. List them with: conker config list"
    )


def value_at(document, field: str):
    value = document
    for part in field.split("."):
        if not isinstance(value, dict) or part not in value:
            return None
        value = value[part]
    return value


def with_value(document: dict, field: str, value) -> dict:
    changed = copy.deepcopy(document)
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
    if kind == "toggle":
        if text.lower() in TRUE:
            return True
        if text.lower() in FALSE:
            return False
        raise ValueError("Use on or off.")
    if kind == "number":
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
            if text == str(option):
                return option
        raise ValueError("Use one of: " + ", ".join(map(str, setting["options"])))
    if kind == "list":
        chosen = [item.strip() for item in text.split(",") if item.strip()]
        unknown = sorted(set(chosen) - set(setting["options"]))
        if unknown or len(set(chosen)) != len(chosen):
            raise ValueError(
                "Use distinct values from: " + ", ".join(setting["options"])
            )
        return chosen
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
    if kind == "text":
        if len(text) > setting.get("max_length", 200):
            raise ValueError(
                f"Use at most {setting.get('max_length', 200)} characters."
            )
        if "pattern" in setting and not re.fullmatch(setting["pattern"], text):
            raise ValueError("That value does not have the expected form.")
        return text
    raise ValueError(f"Unsupported setting type {kind!r}.")


def home(setting: dict, chat: str | None) -> str:
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
    current = (
        value_at(document, setting["home"]["field"]) if document is not None else None
    )
    return {
        "id": setting["id"],
        "title": setting["title"],
        "scope": setting["scope"],
        "value": current,
        "default": setting["default"],
        "modified": document is not None and current != setting["default"],
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
            and (chat or setting["scope"] == "global")
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
        if args.operation == "reset":
            if setting["default"] is None:
                raise ValueError(
                    f"{setting['id']} has no default; set a value instead."
                )
            new = setting["default"]
        else:
            new = parse(setting, args.value)
        revision, document = read(request, config, setting, chat)
        if document is None:
            raise ValueError(
                "This chat has no context settings yet. Start them with: "
                "conker context budget SESSION --window N --reserve N"
            )
        saved = request(
            config,
            setting["home"]["service"],
            home(setting, chat),
            {
                "expected_revision": revision,
                setting["home"]["key"]: with_value(
                    document, setting["home"]["field"], new
                ),
            },
        )
        value = {
            "id": setting["id"],
            "value": value_at(
                saved.get(setting["home"]["key"]), setting["home"]["field"]
            ),
            "revision": saved.get("revision"),
            "effect": setting["effect"],
        }
    print(json.dumps(value, indent=2, ensure_ascii=False))
    return 0
