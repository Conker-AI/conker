"""Fresh model roles reflect the installation instead of guessed availability."""

import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
SPEC = importlib.util.spec_from_file_location(
    "workspace_models", SCRIPTS / "workspace_models.py"
)
models = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(models)
ROLES = (
    "answer",
    "thinking",
    "routing",
    "context-selection",
    "summarization",
    "memory-ranking",
    "search-ranking",
    "proposals",
)


def test_missing_model_is_not_replaced_by_another_local_model():
    value = models.configuration_for("my-model", {"qwen3:4b"}, ROLES)
    assert value["defaultModelId"] is None
    assert not any(item["enabled"] for item in value["models"])
    assert not any(role["enabled"] for role in value["roleSettings"]["roles"].values())


def test_custom_installed_model_is_primary_and_summarizes():
    value = models.configuration_for("my-model", {"my-model:latest"}, ROLES)
    assert value["models"][0]["route"] == "my-model"
    roles = value["roleSettings"]["roles"]
    assert roles["answer"]["eligibleModelIds"] == ["local-answer"]
    assert roles["summarization"]["modelId"] == "local-answer"
    assert roles["summarization"]["enabled"]
    assert roles["thinking"]["modelId"] == "local-answer"


def test_optional_analysis_model_is_installed_and_never_replaces_primary():
    value = models.configuration_for(
        "qwen2.5:3b", {"qwen2.5:3b", "qwen3:4b", "unrelated"}, ROLES
    )
    roles = value["roleSettings"]["roles"]
    assert roles["answer"]["modelId"] == "local-answer"
    assert roles["answer"]["eligibleModelIds"] == ["local-answer", "local-thinking"]
    assert roles["thinking"]["modelId"] == "local-thinking"
    assert len(value["models"]) == 3


def test_selected_analysis_model_is_not_duplicated():
    value = models.configuration_for("qwen3:4b", {"qwen3:4b"}, ROLES)
    assert len(value["models"]) == 2
    assert value["roleSettings"]["roles"]["answer"]["eligibleModelIds"] == [
        "local-answer"
    ]


@pytest.mark.parametrize(
    "url",
    [
        "http://example.com",
        "http://user@localhost",
        "http://localhost?token=x",
        "http://localhost/other",
        "https://localhost",
    ],
)
def test_inventory_refuses_remote_or_credential_bearing_base(url):
    with pytest.raises(ValueError, match="loopback"):
        models.installed_models(url)
