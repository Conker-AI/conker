"""Pi's workflow drafts are ToolGate editor documents (cross-gate: needs Pi and ToolGate on the path).

Pi shapes the model's draft; ToolGate stores it under its own strict model, validates the graph
and refuses credentials on publish. A shape change on either side fails here first.
"""

import pytest

pytest.importorskip(
    "pi.agents.workflow_drafts", reason="Add the Pi checkout to PYTHONPATH"
)
pytest.importorskip(
    "toolgate.core.editor_drafts", reason="Add the ToolGate checkout to PYTHONPATH"
)
from pi.agents import workflow_drafts
from toolgate.core.editor_drafts import EditorDocument, SaveDraft
from toolgate.core.editor_graph import validate_graph
from toolgate.core.editor_publication import document_from_block

CAPABILITIES = [
    workflow_drafts.Capability(id="weather-now", kind="tool", name="Weather now"),
    workflow_drafts.Capability(
        id="editor-0123abcd", kind="workflow", name="Brief", version=4
    ),
]
# What a model might return: every step type, both condition branches, and fields Pi overrides.
MODEL_DRAFT = {
    "name": "Rain alert",
    "description": "Warns when rain is likely.",
    "inputs": [
        {"name": "city", "type": "string", "required": True, "description": "Where"}
    ],
    "outputs": [{"name": "message", "type": "string", "required": True}],
    "nodes": [
        {"id": "start", "type": "input", "label": "Start", "config": {}},
        {
            "id": "fetch",
            "type": "tool_call",
            "label": "Weather",
            "config": {"tool": "weather-now", "args": {"city": "$input.city"}},
        },
        {
            "id": "chance",
            "type": "calculation",
            "label": "Percent",
            "config": {
                "operator": "multiply",
                "left": "$steps.fetch.rain",
                "right": 100,
            },
        },
        {
            "id": "likely",
            "type": "condition",
            "label": "Likely?",
            "config": {"operator": "greater", "left": "$last", "right": 50},
        },
        {
            "id": "brief",
            "type": "workflow_call",
            "label": "Brief",
            "config": {"toolId": "editor-0123abcd", "version": 1, "args": {}},
        },
        {
            "id": "names",
            "type": "loop",
            "label": "Tidy",
            "config": {"items": ["a "], "limit": 5, "operation": "trim"},
        },
        {
            "id": "warn",
            "type": "return",
            "label": "Warn",
            "config": {"value": "Take an umbrella"},
        },
        {
            "id": "quiet",
            "type": "set",
            "label": "Quiet",
            "config": {"value": "No rain"},
        },
        {"id": "calm", "type": "return", "label": "Calm", "config": {"value": "$last"}},
    ],
    "edges": [
        {"id": "e1", "source": "start", "target": "fetch"},
        {"id": "e2", "source": "fetch", "target": "chance"},
        {"id": "e3", "source": "chance", "target": "likely"},
        {"id": "e4", "source": "likely", "target": "brief", "branch": "true"},
        {"id": "e5", "source": "brief", "target": "names"},
        {"id": "e6", "source": "names", "target": "warn"},
        {"source": "likely", "target": "quiet", "branch": "false"},
        {"source": "quiet", "target": "calm"},
    ],
    "effect": "notify",
    "credentialRefs": ["connection:mail"],
    "agentVisible": True,
    "budgets": {"maxSteps": 3, "maxLoopItems": 99, "timeoutMs": "fast"},
}


def test_a_drafted_workflow_is_a_valid_editor_document_toolgate_can_publish():
    document, issues = workflow_drafts.normalize(MODEL_DRAFT, CAPABILITIES, None)
    assert issues == []
    SaveDraft.model_validate({"expected_revision": 0, "document": document})
    parsed = EditorDocument.model_validate(document)
    assert validate_graph(parsed) == []
    # The publish path rebuilds the document and refuses credential bindings.
    document_from_block({"type": "editor_graph", "document": document})
    assert document["effect"] == "write" and document["budgets"]["maxLoopItems"] == 20
    assert document["nodes"][4]["config"]["version"] == 4


@pytest.mark.parametrize("name", ["Rain alert", "7 day plan", "???", "x" * 200])
def test_draft_ids_made_from_names_are_editor_identities(name):
    document, _ = workflow_drafts.normalize(
        {**MODEL_DRAFT, "name": name[:100]}, CAPABILITIES, None
    )
    EditorDocument.model_validate(document)
