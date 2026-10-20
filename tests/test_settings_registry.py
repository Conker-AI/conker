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
TYPES = {"toggle", "number", "select", "list", "time", "timezone", "text"}
EFFECTS = {"live", "next-turn", "restart", "stored"}


def test_every_entry_is_complete_and_consistent():
    ids = [setting["id"] for setting in SETTINGS]
    assert len(ids) == len(set(ids))
    for setting in SETTINGS:
        assert setting["type"] in TYPES and setting["effect"] in EFFECTS, setting["id"]
        assert setting["scope"] in {"global", "agent", "chat"} and setting["tier"] in {
            "basic",
            "advanced",
        }
        assert setting["title"] and setting["description"].endswith("."), setting["id"]
        home = setting["home"]
        assert home["service"] == "pi" and home["path"].startswith("/") and home["key"]
        assert ("{chat}" in home["path"]) == (setting["scope"] == "chat"), setting["id"]
        for other in setting["related"] + [setting.get("dependsOn", {}).get("id")]:
            assert other is None or other in ids, (setting["id"], other)
        default = setting["default"]
        if setting["type"] == "select":
            assert default in setting["options"]
        if setting["type"] == "list":
            assert set(default) <= set(setting["options"])
        if setting["type"] == "number" and default is not None:
            assert setting.get("min", default) <= default <= setting.get("max", default)
        # Secrets keep their own write-only flow and never enter the registry.
        words = set(re.split(r"[._]", setting["id"]))
        assert not words & {
            "key",
            "apikey",
            "token",
            "password",
            "secret",
            "credential",
        }


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
}


def pi():
    return FakePi(
        {
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
    assert [path for _, path, _ in fake.calls] == [
        "/owner/preferences",
        "/search/settings",
    ]
    changed = run(fake, capsys, "list", modified=True)["settings"]
    assert [row["id"] for row in changed] == ["search.sources"]
    found = run(pi(), capsys, "list", search="quiet")["settings"]
    assert found and all("quiet" in row["id"] for row in found)


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


def test_the_settings_reference_matches_the_registry():
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "settings_docs.py"), "--check"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout
