"""conker workflow: Pi drafts from words, ToolGate stores and validates, the owner publishes."""

import io
import json
import sys
from argparse import Namespace
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlsplit

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import conker as cli
import conker_workflows as workflows

TOOLS = [
    {
        "id": "weather-now",
        "name": "Weather now",
        "description": "Weather",
        "version": 2,
        "inputs": [{"name": "city", "type": "string", "required": True}, {"name": ""}],
    },
]
DOCUMENT = {
    "id": "morning-weather",
    "name": "Morning weather",
    "description": "",
    "kind": "workflow",
    "nodes": [
        {
            "id": "start",
            "type": "input",
            "label": "Start",
            "position": {"x": 0.0, "y": 0.0},
            "config": {},
        },
        {
            "id": "fetch",
            "type": "tool_call",
            "label": "Fetch",
            "position": {"x": 0.0, "y": 120.0},
            "config": {"tool": "weather-now", "args": {"city": "$input.city"}},
        },
        {
            "id": "done",
            "type": "return",
            "label": "Done",
            "position": {"x": 0.0, "y": 240.0},
            "config": {"value": "$last"},
        },
    ],
    "edges": [
        {"id": "e1", "source": "start", "target": "fetch"},
        {"id": "e2", "source": "fetch", "target": "done"},
    ],
    "inputs": [{"name": "city", "type": "string", "required": True}],
    "outputs": [],
    "credentialRefs": [],
    "effect": "read",
    "agentVisible": False,
    "budgets": {"maxSteps": 50, "maxLoopItems": 20, "timeoutMs": 15000},
}


def ready(document=DOCUMENT, issues=()):
    return {
        "reply": "Reads the weather.",
        "ready": True,
        "document": document,
        "issues": list(issues),
        "modelId": "a",
        "configurationRevision": 1,
    }


def refused(code, detail):
    return HTTPError(
        "http://x",
        code,
        "refused",
        {},
        io.BytesIO(json.dumps({"detail": detail}).encode()),
    )


class Services:
    """ToolGate's editor routes and Pi's draft route, recorded."""

    def __init__(self, drafts, validations=((),), existing=(), publications=()):
        self.drafts, self.validations = list(drafts), list(validations)
        self.saved, self.existing, self.publications = (
            {},
            set(existing),
            list(publications),
        )
        self.calls = []

    def __call__(self, config, service, path, body=None, **options):
        self.calls.append((service, path, body, options))
        if path == "/v2/owner/editor-capabilities":
            kind, after = options["query"]["kind"], options["query"].get("after")
            if kind == "workflow":
                return {"items": [], "next_after": None}
            return (
                {"items": TOOLS[:1], "next_after": "weather-now"}
                if not after
                else {"items": [{**TOOLS[0], "id": "news"}], "next_after": None}
            )
        if path == "/workflow-drafts/draft":
            reply = self.drafts.pop(0)
            if isinstance(reply, Exception):
                raise reply
            return reply
        identity = path.split("/")[4]
        if path.endswith("/validation"):
            issues = self.validations.pop(0)
            return {
                "graph_valid": not issues,
                "issues": [{"message": m} for m in issues],
            }
        if path.endswith("/publications"):
            return {"items": self.publications}
        if path.endswith("/publish"):
            return {"draft_id": identity, **body}
        if body is not None:
            revision = self.saved.get(identity, 0)
            assert body["expected_revision"] == revision
            self.saved[identity] = revision + 1
            return {
                "id": identity,
                "revision": revision + 1,
                "document": body["document"],
            }
        if identity in self.existing or identity in self.saved:
            return {"id": identity, "revision": 1, "document": DOCUMENT}
        raise HTTPError("http://x", 404, "missing", {}, io.BytesIO(b"{}"))

    def to(self, path):
        return [call for call in self.calls if call[1] == path]


def draft(services, answers=(), **values):
    replies = list(answers)
    args = Namespace(
        operation="draft", description="Weather in Tel Aviv", id=None, **values
    )
    return workflows.draft(
        args, {}, services, answer=lambda question: replies.pop(0) if replies else ""
    )


def test_a_question_then_a_valid_draft_is_saved_unpublished():
    services = Services(
        [{"reply": "Which city?", "ready": False, "document": None}, ready()]
    )
    result = draft(services, answers=["Tel Aviv"])
    assert result["saved"] and result["valid"] and result["revision"] == 1
    assert result["steps"] == [
        "Start (input)",
        "Fetch (tool_call) -> tool weather-now",
        "Done (return)",
    ]
    assert (
        result["next"]
        == "Review it, then: conker workflow publish morning-weather --expected-revision 1"
    )
    first, second = (call[2] for call in services.to("/workflow-drafts/draft"))
    assert [item["id"] for item in first["capabilities"]] == ["weather-now", "news"]
    assert first["capabilities"][0]["inputs"] == [
        {"name": "city", "type": "string", "required": True}
    ]
    assert second["conversation"] == [
        {"role": "builder", "content": "Which city?"},
        {"role": "owner", "content": "Tel Aviv"},
    ]
    assert not any(call[1].endswith("/publish") for call in services.calls)


def test_a_question_without_an_answer_stops_before_saving():
    services = Services([{"reply": "Which city?", "ready": False, "document": None}])
    with pytest.raises(ValueError, match="The builder asks: Which city?"):
        draft(services)
    assert services.saved == {}


def test_pi_issues_are_repaired_before_anything_is_saved():
    services = Services(
        [
            ready(issues=["Step fetch uses 'bank', which is not an available tool."]),
            ready(),
        ]
    )
    result = draft(services)
    repair = services.to("/workflow-drafts/draft")[1][2]
    assert repair["previous"] == DOCUMENT and repair["draftId"] == "morning-weather"
    assert repair["issues"] == [
        "Step fetch uses 'bank', which is not an available tool."
    ]
    assert result["valid"] and services.saved == {"morning-weather": 1}


def test_validation_issues_are_repaired_on_the_saved_draft():
    services = Services(
        [ready(), ready()], validations=[["Use exactly one Input node."], []]
    )
    result = draft(services)
    assert result["valid"] and result["revision"] == 2
    assert services.to("/workflow-drafts/draft")[1][2]["issues"] == [
        "Use exactly one Input node."
    ]


def test_issues_left_after_repairs_are_reported():
    bad = ["Node is disconnected from Input."]
    services = Services([ready()] * 3, validations=[bad, bad, bad])
    result = draft(services)
    assert result["saved"] and not result["valid"] and result["issues"] == bad
    assert result["next"].startswith("Fix it in the workflow editor")


def test_an_existing_draft_is_never_overwritten():
    services = Services([ready()], existing=["morning-weather"])
    with pytest.raises(ValueError, match="already exists"):
        draft(services)
    assert services.saved == {}


def test_pi_refusals_show_pis_message():
    error = refused(
        503,
        {"code": "not_configured", "message": "Workflow drafts need a talking model."},
    )
    with pytest.raises(
        ValueError, match=r"Pi refused this \(not_configured\): Workflow drafts need"
    ):
        draft(Services([error]))


def test_publish_names_the_reviewed_revision_and_asks_before_runs_by_default():
    services = Services([], publications=[{"version": 1}, {"version": 3}])
    args = Namespace(
        operation="publish",
        id="morning-weather",
        expected_revision=2,
        authorization="owner_confirmation",
    )
    result = workflows.workflow_operation(args, {}, services)
    assert result == {
        "draft_id": "morning-weather",
        "expected_revision": 2,
        "expected_publication_version": 3,
        "authorization": "owner_confirmation",
    }


def test_a_failed_publish_keeps_the_unconfirmed_error():
    def request(config, service, path, body=None, **options):
        if path.endswith("/publications"):
            return {"items": []}
        raise HTTPError("http://x", 502, "bad gateway", {}, io.BytesIO(b"{}"))

    args = Namespace(
        operation="publish", id="flow", expected_revision=1, authorization="auto"
    )
    with pytest.raises(HTTPError):
        workflows.workflow_operation(args, {}, request)


def test_draft_ids_are_checked_before_any_request():
    with pytest.raises(ValueError, match="starts with a letter"):
        workflows.workflow_operation(Namespace(operation="show", id="../x"), {}, None)


def test_the_capability_query_sends_only_known_options(monkeypatch):
    sent = []

    class Opener:
        def open(self, request, timeout):
            sent.append(request)
            return io.BytesIO(b'{"items": []}')

    monkeypatch.setattr(cli, "build_opener", lambda *handlers: Opener())
    config = {
        "environments": {"gateway": {"GATEWAY_TOOLGATE_OWNER_KEY": "fixture-owner-key"}}
    }
    cli.request(
        config,
        "toolgate-owner",
        "/v2/owner/editor-capabilities",
        query={"kind": "tool", "limit": 100, "after": "a", "q": "x"},
    )
    url = urlsplit(sent[0].full_url)
    assert parse_qs(url.query) == {"kind": ["tool"], "limit": ["100"], "after": ["a"]}


def test_output_the_model_mangled_is_retried_once_with_the_reason():
    mangled = {
        "code": "unusable",
        "message": "The draft could not be used: the model did not return JSON.",
    }
    services = Services([refused(502, mangled), ready()])
    result = draft(services)
    retry = services.to("/workflow-drafts/draft")[1][2]
    assert retry["issues"] == [
        "Pi refused this (unusable): The draft could not be used: the model did not return JSON."
    ]
    assert result["valid"]
    with pytest.raises(ValueError, match="unusable"):
        draft(Services([refused(502, mangled), refused(502, mangled)]))
