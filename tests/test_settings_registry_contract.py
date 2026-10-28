"""The settings registry agrees with Pi's own document models (cross-gate: needs Pi on the path).

For every setting Pi keeps: the field exists in its home document, the registry default and every
option pass Pi's validation, and the registry's bounds are Pi's bounds (one step outside is refused).
Settings in the owner settings document only need an id and values Pi's shape check accepts.
"""

import copy
import sys
from pathlib import Path

import pytest

pytest.importorskip("pi.owner.preferences", reason="Add the Pi checkout to PYTHONPATH")
from pi.context import controls, universal_search
from pi.conversation import output_settings
from pi.conversation import settings as chat_settings
from pi.owner import preferences
from pi.owner import settings as owner_settings
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import conker_config as config

HOMES = {
    "/owner/preferences": (preferences.OwnerPreferences, preferences.DEFAULT),
    "/search/settings": (
        universal_search.Settings,
        universal_search.Settings().model_dump(),
    ),
    "/sessions/{chat}/settings": (chat_settings.Settings, chat_settings.DEFAULT),
    "/sessions/{chat}/output": (
        output_settings.Output,
        output_settings.Output().model_dump(),
    ),
    "/context/{chat}": (
        controls.Policy,
        {
            "sessionInstructions": "",
            "messagePolicies": {},
            "budget": {
                "contextWindowTokens": 8000,
                "outputReserveTokens": 1,
                "otherInputTokens": 0,
            },
        },
    ),
}


def accepts(setting, value):
    if setting["home"].get("flat"):
        try:
            owner_settings.check({setting["id"]: value})
        except ValueError:
            return False
        return True
    model, document = HOMES[setting["home"]["path"]]
    changed = config.with_value(
        copy.deepcopy(document), setting["home"]["field"], value
    )
    if (
        setting["home"]["path"] == "/owner/preferences"
        and setting["home"]["field"] == "quietHours.start"
    ):
        changed["quietHours"]["end"] = "06:00" if value != "06:00" else "07:00"
    try:
        model.model_validate(changed)
    except ValidationError:
        return False
    return True


@pytest.mark.parametrize(
    "setting",
    [item for item in config.load_registry() if item.get("home", {}).get("service") == "pi"],
    ids=lambda setting: setting["id"],
)
def test_registry_matches_pi(setting):
    if setting["home"].get("flat"):
        assert setting["home"]["path"] == "/owner/settings"
        assert owner_settings.SETTING_ID.fullmatch(setting["id"]), "Pi refuses this id"
    else:
        assert setting["home"]["path"] in HOMES, "Add the home's Pi model to this test."
        _, document = HOMES[setting["home"]["path"]]
        assert config.value_at(document, setting["home"]["field"]) is not None or setting[
            "default"
        ] in (None, ""), "field missing from the home document"
    if setting["default"] is not None:
        assert accepts(setting, setting["default"])
    if setting["type"] == "select":
        for option in config.values_of(setting):
            assert accepts(setting, option), option
    if setting["type"] == "list":
        assert accepts(setting, config.values_of(setting))
    if setting["type"] == "number":
        for bound, outside in (("min", -1), ("max", 1)):
            if bound in setting:
                assert accepts(setting, setting[bound])
                # The owner settings document checks shape only; the screen and the CLI keep
                # the bounds, and the feature that reads the value clamps it.
                assert setting["home"].get("flat") or not accepts(
                    setting, setting[bound] + outside
                ), f"Pi allows beyond {bound}"
