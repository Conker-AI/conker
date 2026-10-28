"""The settings registry: one description per setting, written back only through its home."""

import json
import re
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import conker_config as config

SETTINGS = config.load_registry()
GROUPS = config.load_groups()
TYPES = {
    "toggle",
    "number",
    "slider",
    "select",
    "list",
    "time",
    "date",
    "timezone",
    "text",
    "textarea",
    "tags",
    "models",
    "custom",
}
EFFECTS = {"live", "next-turn", "restart", "stored"}
SCOPES = {"global", "device", "agent", "chat"}
# Components the Settings screen draws for settings with a screen of their own
# (dashboard/src/settings/blocks.tsx).
COMPONENTS = {
    "profile",
    "inbox-buttons",
    "talking-model",
    "thinking-model",
    "ideas",
    "providers",
    "model-roles",
    "reviewer-model",
    "access-delegate",
    "tools-usable",
    "always-ask",
    "browser-sessions",
    "sign-out",
    "character-link",
    "agents-link",
}
CATEGORIES = {"you", "inbox", "talk", "brain", "safety", "system"}
# Words that keep their capital inside a sentence-case title or label.
PROPER = {
    "AI",
    "API",
    "CLI",
    "Claude",
    "ChatGPT",
    "Conker",
    "Conker's",
    "Ctrl+Enter",
    "Ctrl+K",
    "Ctrl+P",
    "Deep",
    "Discord",
    "Dropbox",
    "Enter",
    "Euro",
    "Fast",
    "Fira",
    "Code",
    "GitHub",
    "Google",
    "Drive",
    "Home",
    "Hyperlegible",
    "Atkinson",
    "Inbox",
    "Inter",
    "Israeli",
    "JSON",
    "JetBrains",
    "Jev",
    "Markdown",
    "Mono",
    "Notion",
    "Obsidian",
    "OneDrive",
    "OpenDyslexic",
    "PDF",
    "PyPI",
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Tailscale",
    "Telegram",
    "US",
    "WhatsApp",
    "Word",
    "English",
    "Hebrew",
    "Russian",
    "MB",
    "KB",
    "I'm",
    "IDs",
    "Auto",
    "Auto's",
    "Balanced",
    "Oct",
    "Companion",
    "AI-job",
    "CPUs",
    "Handled",
    "Full",
}


def sentence_case(text: str) -> bool:
    """First letter capital; later words lower case unless they are names or acronyms."""
    words = text.replace("/", " ").split()
    if not words or not (
        words[0][0].isupper() or words[0][0].isdigit() or words[0][0] in '"('
    ):
        return False
    for word in words[1:]:
        bare = word.strip('()",.:;!?')
        if bare and bare[0].isupper() and bare not in PROPER and not bare.isupper():
            return False
    return True


def test_every_topic_file_is_complete_and_ordered():
    assert len({group["id"] for group in GROUPS}) == len(GROUPS)
    assert len({group["order"] for group in GROUPS}) == len(GROUPS)
    for group in GROUPS:
        assert group["schemaVersion"] == 2 and group["category"] in CATEGORIES, group[
            "id"
        ]
        assert group["title"] and sentence_case(group["title"]), group["id"]
        assert group["description"].endswith(".") and len(group["description"]) <= 100
        assert group["sections"] and group["icon"], group["id"]
        titles = [
            s["title"] for section in group["sections"] for s in section["settings"]
        ]
        assert len(titles) == len(set(titles)), (group["id"], "repeated title")
        for section in group["sections"]:
            assert section["settings"] and sentence_case(section["title"]), section[
                "id"
            ]


def test_every_setting_is_complete_and_consistent():
    ids = [setting["id"] for setting in SETTINGS]
    assert len(ids) == len(set(ids))
    for setting in SETTINGS:
        name = setting["id"]
        assert setting["type"] in TYPES and setting["effect"] in EFFECTS, name
        assert setting["scope"] in SCOPES and setting["tier"] in {
            "basic",
            "advanced",
        }, name
        home = setting.get("home")
        if setting["type"] == "custom":
            assert setting["component"] in COMPONENTS and setting["effect"] == "live", (
                name
            )
            assert home is None and setting["default"] is None, name
        else:
            assert home["service"] in {"pi", "browser"}, name
            assert (home["service"] == "browser") == (setting["scope"] == "device"), (
                name
            )
            if home["service"] == "pi":
                assert home["path"].startswith("/") and home["key"] and home["field"], (
                    name
                )
                assert ("{chat}" in home["path"]) == (setting["scope"] == "chat"), name
        for other in setting["related"] + [setting.get("dependsOn", {}).get("id")]:
            assert other is None or other in ids, (name, other)
        default, values = setting["default"], config.values_of(setting)
        if setting["type"] == "select":
            assert default in values and len(values) == len(set(values)), name
        if setting["type"] == "list":
            assert set(default) <= set(values) and len(values) == len(set(values)), name
        if setting["type"] in {"number", "slider"} and default is not None:
            assert setting["min"] <= default <= setting["max"], name
        if setting["type"] in {"tags", "models"}:
            assert isinstance(default, list) and setting["max_items"] >= len(default), (
                name
            )
        if setting["type"] == "toggle":
            assert isinstance(default, bool), name
        # Secrets keep their own write-only flow and never enter the registry.
        words = set(re.split(r"[._]", name))
        assert not words & {
            "key",
            "apikey",
            "token",
            "password",
            "secret",
            "credential",
        }, name


def test_every_setting_speaks_the_same_way():
    """One voice everywhere: short sentence-case titles, one plain sentence each."""
    for setting in SETTINGS:
        name, title, description = (
            setting["id"],
            setting["title"],
            setting["description"],
        )
        assert len(title) <= 40 and not title.endswith(".") and sentence_case(title), (
            name
        )
        assert description.endswith(".") and 20 <= len(description) <= 140, name
        assert description[0].isupper() and description.count(". ") == 0, name
        assert not description.lower().startswith(
            ("this setting", "enable", "toggle", "allows")
        ), name
        for option in setting.get("options", []):
            assert len(option["label"]) <= 32 and sentence_case(option["label"]), (
                name,
                option,
            )
        if setting.get("unit"):
            assert setting["unit"] not in title, name


@pytest.mark.parametrize(
    "identity,raw,value",
    [
        ("notifications.quiet_hours.enabled", "off", False),
        ("notifications.quiet_hours.start", "23:30", "23:30"),
        ("notifications.quiet_hours.time_zone", "Europe/London", "Europe/London"),
        ("companion.daily_budget.suggestions", "10", 10),
        ("session.idle_timeout_minutes", "30", 30),
        ("search.sources", "memory, projects", ["memory", "projects"]),
        ("chat.output.language", "en-GB", "en-GB"),
    ],
)
def test_values_are_parsed_into_their_type(identity, raw, value):
    assert config.parse(config.find(SETTINGS, identity), raw) == value


@pytest.mark.parametrize(
    "identity,raw",
    [
        ("notifications.quiet_hours.enabled", "maybe"),
        ("notifications.quiet_hours.start", "25:00"),
        ("notifications.quiet_hours.time_zone", "Mars/Base"),
        ("companion.daily_budget.suggestions", "101"),
        ("session.idle_timeout_minutes", "7"),
        ("search.sources", "memory, memory"),
        ("search.sources", "everything"),
        ("chat.output.language", "English please"),
    ],
)
def test_bad_values_are_refused_before_any_request(identity, raw):
    with pytest.raises(ValueError):
        config.parse(config.find(SETTINGS, identity), raw)


class FakePi:
    def __init__(self, documents):
        self.documents, self.calls = documents, []

    def __call__(self, _config, service, path, body=None):
        self.calls.append((service, path, body))
        key, (revision, document) = self.documents[path]
        if body is None:
            return {"revision": revision, key: document}
        assert body["expected_revision"] == revision
        self.documents[path] = (key, (revision + 1, body[key]))
        return {"revision": revision + 1, key: body[key]}


PREFERENCES = {
    "quietHours": {
        "enabled": True,
        "start": "22:00",
        "end": "07:00",
        "timeZone": "Asia/Jerusalem",
        "urgentExceptions": False,
    },
    "urgency": "meaningful",
    "dailyBudget": {"suggestions": 4, "researchMinutes": 30, "costCents": 0},
    "idleTimeoutMinutes": 15,
    "planAlerts": {"enabled": True, "percent": 80},
}


def pi():
    return FakePi(
        {
            "/owner/settings": ("values", (0, {})),
            "/owner/preferences": (
                "preferences",
                (3, json.loads(json.dumps(PREFERENCES))),
            ),
            "/search/settings": (
                "configuration",
                (
                    0,
                    {
                        "sources": ["memory"],
                        "exactText": True,
                        "semantic": False,
                        "reranking": False,
                    },
                ),
            ),
            "/sessions/ses_1/settings": (
                "settings",
                (
                    1,
                    {
                        "agentId": "companion",
                        "privacy": {"memoryDisabled": False, "harnessDisabled": False},
                        "projectId": "p",
                    },
                ),
            ),
            "/sessions/ses_1/output": (
                "output",
                (0, {"format": "auto", "length": "auto", "language": "auto"}),
            ),
            "/context/ses_1": ("policy", (0, None)),
        }
    )


def run(fake, capsys, operation, **arguments):
    args = SimpleNamespace(
        operation=operation,
        chat=None,
        search=None,
        scope=None,
        modified=False,
        id=None,
        value=None,
    )
    for key, value in arguments.items():
        setattr(args, key, value)
    assert config.config_operation(args, {}, fake) == 0
    return json.loads(capsys.readouterr().out)


def test_set_changes_one_field_and_keeps_the_rest(capsys):
    fake = pi()
    saved = run(
        fake, capsys, "set", id="notifications.quiet_hours.start", value="23:00"
    )
    assert saved == {
        "id": "notifications.quiet_hours.start",
        "value": "23:00",
        "revision": 4,
        "effect": "live",
    }
    written = fake.calls[-1][2]["preferences"]
    assert written["quietHours"] == {**PREFERENCES["quietHours"], "start": "23:00"}
    assert {k: v for k, v in written.items() if k != "quietHours"} == {
        k: v for k, v in PREFERENCES.items() if k != "quietHours"
    }

    chat = run(
        fake, capsys, "set", id="chat.privacy.memory_off", value="on", chat="ses_1"
    )
    assert chat["value"] is True
    assert fake.calls[-1][2]["settings"]["projectId"] == "p"


def test_list_reads_each_home_once_and_shows_what_changed(capsys):
    fake = pi()
    rows = run(fake, capsys, "list")["settings"]
    assert {row["scope"] for row in rows} == {"global"}
    assert not any(
        row["id"] == "appearance.theme" for row in rows
    )  # kept in each browser
    paths = [path for _, path, _ in fake.calls]
    assert sorted(paths) == [
        "/owner/preferences",
        "/owner/settings",
        "/search/settings",
    ]
    changed = run(fake, capsys, "list", modified=True)["settings"]
    assert [row["id"] for row in changed] == ["search.sources"]
    found = run(pi(), capsys, "list", search="quiet")["settings"]
    assert found and any("quiet_hours" in row["id"] for row in found)


def test_reset_get_and_the_errors_the_owner_sees(capsys):
    fake = pi()
    run(fake, capsys, "set", id="companion.proactivity", value="off")
    assert (
        run(fake, capsys, "reset", id="companion.proactivity")["value"] == "meaningful"
    )
    got = run(fake, capsys, "get", id="chat.output.length", chat="ses_1")
    assert got["value"] == "auto" and got["description"]
    with pytest.raises(ValueError, match="--chat"):
        run(fake, capsys, "get", id="chat.output.length")
    with pytest.raises(ValueError, match="global"):
        run(fake, capsys, "get", id="search.semantic", chat="ses_1")
    with pytest.raises(ValueError, match="context budget"):
        run(
            fake,
            capsys,
            "set",
            id="chat.context.instructions",
            value="Be brief",
            chat="ses_1",
        )
    with pytest.raises(ValueError, match="no default"):
        run(fake, capsys, "reset", id="chat.context.window_tokens", chat="ses_1")
    with pytest.raises(ValueError, match="Unknown setting"):
        run(fake, capsys, "get", id="no.such.setting")


def test_settings_without_a_home_live_in_the_owner_settings_document(capsys):
    fake = pi()
    saved = run(fake, capsys, "set", id="appearance.accent", value="Blue")
    assert saved["value"] == "blue" and fake.calls[-1][2]["values"] == {
        "appearance.accent": "blue"
    }
    got = run(fake, capsys, "get", id="appearance.accent")
    assert got["value"] == "blue" and got["modified"] is True
    reset = run(fake, capsys, "reset", id="appearance.accent")
    assert reset["value"] == "neutral" and fake.calls[-1][2]["values"] == {}
    run(fake, capsys, "set", id="access.trusted_people", value="Mom, Dani")
    assert fake.calls[-1][2]["values"]["access.trusted_people"] == ["Mom", "Dani"]
    for identity in ("appearance.theme", "models.providers"):
        with pytest.raises(ValueError, match="Settings"):
            run(fake, capsys, "set", id=identity, value="dark")


def test_the_settings_reference_matches_the_registry():
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "settings_docs.py"), "--check"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout
