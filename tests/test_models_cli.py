"""conker models --role: point one model role at one model and its backups, keeping the rest."""

import copy
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import conker_models

ROLE = {
    "enabled": False,
    "eligibleModelIds": [],
    "modelId": None,
    "timeoutMs": 120000,
    "failure": "stop",
    "fallbackModelIds": [],
}
SAVED = {
    "revision": 4,
    "configuration": {
        "providers": [{"id": "ollama", "name": "Local", "enabled": True}],
        "models": [{"id": "local-3b"}, {"id": "strong"}],
        "defaultModelId": "local-3b",
        "roleSettings": {
            "answerMode": "manual",
            "roles": {
                "answer": {
                    **ROLE,
                    "enabled": True,
                    "eligibleModelIds": ["local-3b"],
                    "modelId": "local-3b",
                },
                "drafting": dict(ROLE),
            },
        },
    },
}


class Pi:
    def __init__(self, saved=SAVED):
        self.saved, self.posts = copy.deepcopy(saved), []

    def __call__(self, config, service, path, body=None):
        assert (service, path) == ("pi", "/models/configuration")
        if body is None:
            return copy.deepcopy(self.saved)
        self.posts.append(body)
        return {"revision": body["expected_revision"] + 1, "configuration": body["configuration"]}


def test_a_role_gets_one_model_and_nothing_else_changes():
    saved = copy.deepcopy(SAVED)
    # Old backups outside the new single-model choice would be refused by Pi; they are cleared.
    saved["configuration"]["roleSettings"]["roles"]["drafting"].update(
        eligibleModelIds=["local-3b"], failure="fallback", fallbackModelIds=["local-3b"]
    )
    pi = Pi(saved)
    conker_models.set_role(pi, {}, "drafting", "strong")
    [post] = pi.posts
    assert post["expected_revision"] == 4
    roles = post["configuration"]["roleSettings"]["roles"]
    assert roles["drafting"] == {
        **ROLE,
        "enabled": True,
        "eligibleModelIds": ["strong"],
        "modelId": "strong",
    }
    assert roles["answer"] == SAVED["configuration"]["roleSettings"]["roles"]["answer"]
    assert post["configuration"]["models"] == SAVED["configuration"]["models"]


def test_off_switches_the_role_off_and_keeps_its_choice():
    saved = copy.deepcopy(SAVED)
    saved["configuration"]["roleSettings"]["roles"]["drafting"].update(
        enabled=True, eligibleModelIds=["strong"], modelId="strong"
    )
    pi = Pi(saved)
    conker_models.set_role(pi, {}, "drafting", None)
    drafting = pi.posts[0]["configuration"]["roleSettings"]["roles"]["drafting"]
    assert drafting["enabled"] is False and drafting["modelId"] == "strong"


@pytest.mark.parametrize(
    "role,model,message",
    [
        ("drafts", "strong", "No model role called drafts"),
        ("drafting", "gpt-9", "No model called gpt-9"),
        ("drafting", "strong", "No model called gpt-9"),
    ],
)
def test_unknown_names_change_nothing(role, model, message):
    pi = Pi()
    with pytest.raises(ValueError, match=message):
        conker_models.set_role(pi, {}, role, model, ["gpt-9"] if model == "strong" else [])
    assert pi.posts == []


def test_without_settings_it_asks_for_a_talking_model_first():
    pi = Pi({"revision": 0, "configuration": None})
    with pytest.raises(ValueError, match="talking model first"):
        conker_models.set_role(pi, {}, "drafting", "strong")
    assert pi.posts == []


def test_backups_are_tried_in_the_order_given():
    pi = Pi()
    conker_models.set_role(pi, {}, "drafting", "strong", ["local-3b"])
    drafting = pi.posts[0]["configuration"]["roleSettings"]["roles"]["drafting"]
    assert drafting == {
        **ROLE,
        "enabled": True,
        "eligibleModelIds": ["strong", "local-3b"],
        "modelId": "strong",
        "failure": "fallback",
        "fallbackModelIds": ["local-3b"],
    }
