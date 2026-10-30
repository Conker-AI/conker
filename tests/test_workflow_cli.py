"""conker workflow: drafting is a tool request in Pi; ToolGate stores and validates; the owner publishes."""

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
import tool_drafts

REQUEST = "creq_" + "a" * 32
TOOL_ID = "workflow:morning-weather:1:" + "c" * 64
DOCUMENT = {
    "id": "morning-weather",
    "name": "Morning weather",
    "description": "",
    "kind": "workflow",
    "nodes": [
        {"id": "start", "type": "input", "label": "Start", "config": {}},
        {
            "id": "fetch",
            "type": "tool_call",
            "label": "Fetch",
            "config": {"tool": "weather-now", "args": {"city": "$input.city"}},
        },
        {"id": "done", "type": "return", "label": "Done", "config": {"value": "$last"}},
    ],
    "edges": [],
    "inputs": [{"name": "city", "type": "string", "required": True}],
    "outputs": [],
    "effect": "read",
    "agentVisible": False,
}
CHAT = {
    "messages": [
        {
            "id": "msg_owner",
            "role": "user",
            "content": " Every morning tell me the weather in Tel Aviv ",
        },
        {"id": "msg_reply", "role": "assistant", "content": "I can draft that."},
        {
            "id": "msg_gone",
            "role": "user",
            "content": None,
            "content_status": "forgotten",
        },
    ]
}


def tool_request(status="ready", **payload):
    return {
        "id": REQUEST,
        "kind": "tool_draft",
        "title": "Add the tool “Morning weather”",
        "payload": {"description": "weather", "status": status, **payload},
        "state": "open",
    }


class Services:
    """ToolGate's editor routes and Pi's routes, recorded."""

    def __init__(self, publications=(), published=None):
        self.publications, self.published = list(publications), published
        self.calls = []

    def __call__(self, config, service, path, body=None, **options):
        self.calls.append((service, path, body, options))
        if path == "/v2/owner/editor-capabilities":
            if options["query"]["kind"] == "workflow":
                return {"items": [], "next_after": None}
            return {
                "items": [{"id": "weather-now", "authorization": "owner_confirmation"}],
                "next_after": None,
            }
        if path.startswith("/sessions/"):
            return CHAT
        if path.endswith("/decline"):
            return {**tool_request(), "state": "declined"}
        if path.endswith("/published"):
            if isinstance(self.published, Exception):
                raise self.published
            return {
                **tool_request(),
                "state": "approved",
                "result": {"published": body},
            }
        if path.endswith("/validation"):
            return {
                "graph_valid": True,
                "issues": [{"message": "x", "node_id": "fetch"}],
            }
        if path.endswith("/publications"):
            return {"items": self.publications}
        if path.endswith("/publish"):
            return {"draft_id": path.split("/")[4], "toolId": TOOL_ID, **body}
        return {"id": "morning-weather", "revision": 2, "document": DOCUMENT}

    def to(self, path):
        return [call for call in self.calls if call[1] == path]


class Pi:
    """Pi's tool-request routes as `conker tool draft` calls them."""

    def __init__(self):
        self.calls = []

    def __call__(self, method, path, body):
        self.calls.append((method, path, body))
        return tool_request("ready", steps=["Fetch the weather"], issues=[])


def waiting(**values):
    return {
        "no_wait": False,
        "request_id": None,
        "timeout": 30,
        "json": False,
        **values,
    }


def test_draft_files_a_tool_request_and_waits_for_it():
    pi, printed = Pi(), []
    args = Namespace(operation="draft", description="Weather in Tel Aviv", **waiting())
    assert workflows.tool_request(args, {}, Services(), pi, emit=printed.append) == 0
    method, path, body = pi.calls[0]
    assert (method, path) == ("POST", "/tool-drafts")
    assert body["description"] == "Weather in Tel Aviv"
    assert tool_drafts.REQUEST_ID.fullmatch(body["request_id"])
    assert "1. Fetch the weather" in printed[0]


def test_from_chat_files_the_owners_own_message():
    pi, services = Pi(), Services()
    args = Namespace(
        operation="from-chat", session="ses_1", message="msg_owner", **waiting()
    )
    assert workflows.tool_request(args, {}, services, pi, emit=lambda _text: None) == 0
    assert (
        pi.calls[0][2]["description"] == "Every morning tell me the weather in Tel Aviv"
    )
    assert services.to("/sessions/ses_1")


@pytest.mark.parametrize(
    "message,error",
    [
        ("msg_reply", "only from your own messages"),
        ("msg_gone", "only from your own messages"),
        ("msg_missing", "not in that chat"),
        ("../x", "ids that show prints"),
    ],
)
def test_only_the_owners_own_messages_become_requests(message, error):
    pi = Pi()
    args = Namespace(
        operation="from-chat", session="ses_1", message=message, **waiting()
    )
    with pytest.raises(ValueError, match=error):
        workflows.tool_request(args, {}, Services(), pi)
    assert pi.calls == []


def test_the_development_cli_drafts_through_the_tool_request(monkeypatch, capsys):
    calls = []

    def fake(config, service, path, body=None, **options):
        calls.append((service, options.get("method"), path))
        return tool_request("drafting" if path == "/tool-drafts" else "ready", steps=[])

    monkeypatch.setattr(cli, "read_config", dict)
    monkeypatch.setattr(cli, "request", fake)
    monkeypatch.setattr(tool_drafts.time, "sleep", lambda _seconds: None)
    monkeypatch.setattr(sys, "argv", ["conker.py", "workflow", "draft", "Weather"])
    assert cli.main() == 0
    assert calls == [
        ("pi", "POST", "/tool-drafts"),
        ("pi", "GET", f"/change-requests/{REQUEST}"),
    ]
    assert "No steps were drafted." in capsys.readouterr().out
    for old in (["--all-tools"], ["--id", "x"]):
        monkeypatch.setattr(sys, "argv", ["conker.py", "workflow", "draft", "x", *old])
        with pytest.raises(SystemExit):
            cli.main()
    monkeypatch.setattr(
        sys, "argv", ["conker.py", "workflow", "accept", "wfo_" + "2" * 32]
    )
    with pytest.raises(SystemExit):
        cli.main()


def test_dismiss_declines_a_tool_request():
    services = Services()
    result = workflows.workflow_operation(
        Namespace(operation="dismiss", request=REQUEST), {}, services
    )
    assert result["state"] == "declined"
    assert services.to(f"/change-requests/{REQUEST}/decline")[0][2] == {}
    for old in ("wfp_" + "1" * 32, "wfo_" + "2" * 32, "creq_x"):
        with pytest.raises(ValueError, match="creq_"):
            workflows.workflow_operation(
                Namespace(operation="dismiss", request=old), {}, services
            )


def publish(services, **values):
    args = Namespace(
        **{
            "operation": "publish",
            "id": "morning-weather",
            "expected_revision": 2,
            "authorization": "owner_confirmation",
            "request": None,
            **values,
        }
    )
    return workflows.workflow_operation(args, {}, services)


def test_publish_names_the_reviewed_revision_and_asks_before_runs_by_default():
    services = Services(publications=[{"version": 1}, {"version": 3}])
    assert publish(services) == {
        "draft_id": "morning-weather",
        "toolId": TOOL_ID,
        "expected_revision": 2,
        "expected_publication_version": 3,
        "authorization": "owner_confirmation",
    }
    assert not [call for call in services.calls if call[0] == "pi"]


def test_publishing_for_a_tool_request_tells_pi_the_tool_is_live():
    services = Services()
    result = publish(services, request=REQUEST)
    [(_, _, body, _)] = services.to(f"/change-requests/{REQUEST}/published")
    assert body == {"toolId": TOOL_ID, "name": "Morning weather"}
    assert result["toolRequest"]["state"] == "approved"
    with pytest.raises(ValueError, match="creq_"):
        publish(Services(), request="wfp_" + "1" * 32)


def test_a_publish_stands_even_if_pi_does_not_confirm_the_request():
    result = publish(Services(published=OSError("connection refused")), request=REQUEST)
    assert result["draft_id"] == "morning-weather"
    assert result["toolRequest"] == {
        "note": "Pi did not confirm the tool request. The tool is published."
    }


def test_a_failed_publish_keeps_the_unconfirmed_error():
    def request(config, service, path, body=None, **options):
        if path.endswith("/publications"):
            return {"items": []}
        raise HTTPError("http://x", 502, "bad gateway", {}, io.BytesIO(b"{}"))

    with pytest.raises(HTTPError):
        publish(request)


def test_show_says_which_steps_ask_you_first():
    result = workflows.workflow_operation(
        Namespace(operation="show", id="morning-weather"), {}, Services()
    )
    assert result["steps"] == [
        "Start (input)",
        "Fetch (tool_call) -> tool weather-now, asks you first",
        "Done (return)",
    ]
    assert result["issues"] == ["Step fetch: x"] and result["revision"] == 2


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


def test_validation_issues_name_their_step():
    assert workflows.problem(
        {"message": "Use a valid reference.", "node_id": "fetch"}
    ) == ("Step fetch: Use a valid reference.")
    assert workflows.problem(
        {"message": "Use exactly one Input node.", "node_id": None}
    ) == ("Use exactly one Input node.")


def test_refusals_show_the_services_message():
    def refuse(config, service, path, body=None, **options):
        detail = {"detail": {"code": "decided", "message": "Already decided."}}
        raise HTTPError(
            "http://pi", 409, "x", {}, io.BytesIO(json.dumps(detail).encode())
        )

    with pytest.raises(
        ValueError, match=r"Pi refused this \(decided\): Already decided."
    ):
        workflows.workflow_operation(
            Namespace(operation="dismiss", request=REQUEST), {}, refuse
        )
