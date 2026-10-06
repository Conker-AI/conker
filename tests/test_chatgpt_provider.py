import io
import json
from email.message import Message

import pytest

from scripts.chatgpt_provider import (
    DEVICE_URL,
    METHODS,
    RESPONSES_URL,
    ChatGPTControl,
    ChatGPTError,
    CodexAccounts,
    NoRedirect,
    inference_events,
    responses_payload,
)


class Accounts:
    def __init__(self):
        self.notifications = []
        self.calls = []
        self.account = None

    def call(self, method, params=None):
        self.calls.append((method, params))
        if method == "account/read":
            return {"account": self.account}
        if method == "account/login/start":
            return {
                "loginId": "test-login",
                "userCode": "TEST-1234",
                "verificationUrl": DEVICE_URL,
            }
        if method == "account/logout":
            self.account = None
        if method == "model/list":
            return {
                "data": [
                    {"model": "test-model", "displayName": "Test", "hidden": False}
                ],
                "nextCursor": None,
            }
        return {}

    def close(self):
        pass


def test_sign_in_code_returned_once_no_credentials_in_projection(tmp_path):
    accounts = Accounts()
    control = ChatGPTControl(tmp_path, None, rpc=accounts)
    started = control.apply({"operation": "login"})
    assert started["deviceCode"]["userCode"] == "TEST-1234"
    assert "deviceCode" not in control.status()
    assert "TEST-1234" not in json.dumps(control.status())
    with pytest.raises(ChatGPTError):
        control.apply({"operation": "login"})
    with pytest.raises(ChatGPTError):
        control.apply({"operation": "cancel", "loginId": "another-login"})
    control.apply({"operation": "cancel", "loginId": "test-login"})
    assert control.status()["loginState"] == "canceled"


def test_connected_catalogue_and_revision_bound_disconnect(tmp_path):
    accounts = Accounts()
    control = ChatGPTControl(tmp_path, None, rpc=accounts)
    control.apply({"operation": "login"})
    accounts.account = {
        "type": "chatgpt",
        "planType": "plus",
        "email": "PRIVATE@example.test",
    }
    accounts.notifications.append(
        {"loginId": "test-login", "success": True, "error": None}
    )
    value = control.status()
    assert value["connected"] and value["loginState"] == "complete"
    assert "PRIVATE" not in json.dumps(value)
    assert not value["models"]
    control.apply({"operation": "models"})
    assert control.status()["models"] == [{"id": "test-model", "name": "Test"}]
    with pytest.raises(ChatGPTError):
        control.apply({"operation": "logout", "connectionId": "stale"})
    assert accounts.account is not None
    control.apply({"operation": "logout", "connectionId": value["connectionId"]})
    assert not control.status()["connected"]
    assert not control.status()["models"]


def test_unavailable_runtime_cannot_accept_auth(tmp_path):
    control = ChatGPTControl(tmp_path, tmp_path / "missing")
    assert not control.status()["available"]
    with pytest.raises(ChatGPTError):
        control.apply({"operation": "login"})


@pytest.mark.parametrize(
    "problem", ["runtime_unavailable", "provider_operation_failed"]
)
def test_failed_account_read_hides_stale_identity_without_erasing_auth(
    tmp_path, problem
):
    accounts = Accounts()
    accounts.account = {"type": "chatgpt", "planType": "plus"}
    control = ChatGPTControl(tmp_path, None, rpc=accounts)
    connected = control.apply({"operation": "models"})
    original_call = accounts.call

    def failed(*_args, **_kwargs):
        raise ChatGPTError(problem)

    accounts.call = failed
    unavailable = control.status()
    assert not unavailable["available"] and not unavailable["connected"]
    assert unavailable["connectionId"] is None and unavailable["plan"] is None
    assert unavailable["models"] == [] and not unavailable["catalogueComplete"]
    assert unavailable["problem"] == problem
    with pytest.raises(ChatGPTError, match="runtime_unavailable"):
        control.apply({"operation": "login"})
    assert accounts.account is not None
    accounts.call = original_call
    recovered = control.status()
    assert recovered["connected"] and recovered["problem"] is None
    assert recovered["connectionId"] == connected["connectionId"]
    assert recovered["models"] == connected["models"]
    assert not any(method == "account/logout" for method, _params in accounts.calls)


def test_codex_cannot_run_agent_or_tools(tmp_path):
    rpc = CodexAccounts(tmp_path / "missing", tmp_path / "private")
    assert not METHODS & {"thread/start", "turn/start", "command/exec", "config/write"}
    with pytest.raises(ChatGPTError):
        rpc.call("turn/start", {"tools": []})
    assert NoRedirect().redirect_request(None, None, None, None, None, None) is None


def payload():
    return {
        "model": "test-model",
        "messages": [
            {"role": "system", "content": "Conker instructions"},
            {"role": "user", "content": "hello"},
        ],
        "timeout": 10,
    }


@pytest.mark.parametrize(
    "patch",
    [
        {"url": "https://evil.test"},
        {"model": "--help"},
        {"timeout": True},
        {"messages": [{"role": "tool", "content": "x"}]},
    ],
)
def test_inference_contract_rejects_arbitrary_operations(patch):
    with pytest.raises(ChatGPTError):
        responses_payload({**payload(), **patch})


class Stream(io.BytesIO):
    headers = Message()
    headers["content-type"] = "text/event-stream"

    def geturl(self):
        return RESPONSES_URL


class Opener:
    def __init__(self, events):
        self.content = b"".join(
            b"data: " + json.dumps(event).encode() + b"\n\n" for event in events
        )
        self.request = None

    def open(self, request, timeout):
        self.request = request
        return Stream(self.content)


class Credentials:
    def credentials(self):
        return "synthetic_private_token", "synthetic_account"


def test_real_responses_mapping_streaming_and_reasoning_redaction():
    opener = Opener(
        [
            {"type": "response.reasoning_text.delta", "delta": "PRIVATE_REASONING"},
            {"type": "response.output_text.delta", "delta": "Hello"},
            {
                "type": "response.completed",
                "response": {
                    "status": "completed",
                    "usage": {"input_tokens": 10, "output_tokens": 2},
                },
            },
        ]
    )
    events = list(inference_events(Credentials(), payload(), opener=opener))
    assert events[0] == {"type": "text", "delta": "Hello"}
    assert events[1]["inputTokens"] == 10
    assert "PRIVATE" not in json.dumps(events)
    sent = json.loads(opener.request.data)
    assert sent["store"] is False and sent["stream"] is True
    assert sent["instructions"] == "Conker instructions"
    assert "tools" not in sent and "temperature" not in sent


def test_incomplete_stream_never_becomes_completed_answer():
    with pytest.raises(ChatGPTError, match="incomplete_response"):
        list(
            inference_events(
                Credentials(),
                payload(),
                opener=Opener(
                    [{"type": "response.output_text.delta", "delta": "partial"}]
                ),
            )
        )


def test_cancel_closes_upstream():
    opener = Opener([{"type": "response.output_text.delta", "delta": "first"}])
    stream = Stream(opener.content)
    opener.open = lambda *args, **kwargs: stream
    events = inference_events(Credentials(), payload(), opener=opener)
    next(events)
    events.close()
    assert stream.closed
