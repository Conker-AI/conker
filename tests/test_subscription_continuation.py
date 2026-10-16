"""Exercise the real Pi loop and host projection with deterministic provider I/O.

Set CONKER_TEST_PI_SOURCE when Pi is not checked out beside this repository.
No account credentials, model service or external action is used.
"""

import io
import json
import os
from contextlib import closing
from email.message import Message
from pathlib import Path

import httpx
import pytest

from scripts.chatgpt_provider import RESPONSES_URL, ChatGPTError, inference_events


@pytest.fixture
def runtime(monkeypatch):
    source = Path(
        os.environ.get(
            "CONKER_TEST_PI_SOURCE", Path(__file__).resolve().parents[2] / "conker-pi"
        )
    )
    if not (source / "pi/turns/loop.py").is_file():
        pytest.skip("Set CONKER_TEST_PI_SOURCE for the Pi/host integration suite.")
    monkeypatch.syspath_prepend(str(source))
    from pi.actions.toolgate import ApprovalRequired, Tool, ToolResult
    from pi.conversation.store import Store
    from pi.models.chatgpt import ChatGPTProvider
    from pi.models.routing import Router
    from pi.turns.loop import ActedWithoutReply, Loop

    return (
        ChatGPTProvider,
        ActedWithoutReply,
        Loop,
        Router,
        Store,
        ApprovalRequired,
        Tool,
        ToolResult,
    )


class Credentials:
    def credentials(self):
        return "synthetic-test-token", "synthetic-account"


class Stream(io.BytesIO):
    headers = Message()
    headers["content-type"] = "text/event-stream"

    def geturl(self):
        return RESPONSES_URL


@pytest.mark.parametrize("fail_narration", [False, True])
def test_approved_action_narrates_and_later_turn_preserves_recorded_result(
    runtime, tmp_path, fail_narration
):
    Provider, ActedWithoutReply, Loop, Router, Store, Approval, Tool, Result = runtime
    requests, projected = [], []
    replies = ['{"tool":"test.echo","args":{"text":"hello"}}']
    if fail_narration:
        replies.append(None)
    replies.extend(
        ["The saved action returned hello.", "It was the same recorded result."]
    )

    class Upstream:
        def open(self, request, timeout):
            projected.append(json.loads(request.data))
            reply = replies.pop(0)
            events = [
                {"type": "response.output_text.delta", "delta": reply or "partial"}
            ]
            if reply is not None:
                events.append(
                    {
                        "type": "response.completed",
                        "response": {
                            "status": "completed",
                            "usage": {"input_tokens": 5, "output_tokens": 3},
                        },
                    }
                )
            return Stream(
                b"".join(
                    b"data: " + json.dumps(row).encode() + b"\n\n" for row in events
                )
            )

    def bridge(request):
        value = json.loads(request.content)
        requests.append(value)
        try:
            rows = list(inference_events(Credentials(), value, opener=Upstream()))
        except ChatGPTError as exc:
            rows = [{"type": "error", "code": str(exc)}]
        return httpx.Response(
            200,
            headers={"content-type": "application/x-ndjson"},
            content=b"".join(json.dumps(row).encode() + b"\n" for row in rows),
        )

    class Gate:
        def __init__(self):
            self.approved = False
            self.effects = 0
            self.invocations = []

        def tools(self):
            return [
                Tool(
                    "test.echo",
                    "Echo",
                    "Record one test action",
                    [{"name": "text", "type": "string"}],
                )
            ]

        def invoke(
            self,
            tool_id,
            args,
            approval_request_id=None,
            *,
            action_id=None,
            job_id=None,
        ):
            self.invocations.append((action_id, approval_request_id))
            if not self.approved:
                assert approval_request_id is None
                return Approval(
                    "test-approval", None, "Approve exact action", tool_id, args
                )
            assert approval_request_id == "test-approval" and self.effects == 0
            self.effects += 1
            return Result(
                True, {"echo": args["text"], "source": "saved-fixture"}, tool_id
            )

    provider = Provider("/synthetic/socket", transport=httpx.MockTransport(bridge))
    gate = Gate()
    with closing(Store(tmp_path / "pi.db")) as store:
        loop = Loop(
            store,
            Router(local_provider=provider, local_model="test-model"),
            toolgate=gate,
        )
        session = store.create_session()
        parked = loop.run_turn(session, "Run the approved echo once.")
        assert parked["status"] == "awaiting_approval" and gate.effects == 0
        gate.approved = True
        if fail_narration:
            with pytest.raises(ActedWithoutReply):
                loop.resume_turn(parked["turn_id"])
            assert store.get_turn(parked["turn_id"])["status"] == "acted_no_reply"
            result = loop.recover_reply(
                parked["turn_id"], "subscription-reply-recovery-001"
            )
            before = len(requests)
            assert loop.recover_reply(
                parked["turn_id"], "subscription-reply-recovery-001"
            )["replayed"]
            assert len(requests) == before
        else:
            result = loop.resume_turn(parked["turn_id"])
        assert result["status"] == "complete" and gate.effects == 1
        assert result["message"]["content"] == "The saved action returned hello."
        saved = [row for row in store.messages(session) if row["role"] == "tool"]
        assert len(saved) == 1
        later = loop.run_turn(session, "What did that action return?")
        assert later["message"]["content"] == "It was the same recorded result."
        assert gate.effects == 1 and len(gate.invocations) == 2
        assert gate.invocations[0][0] == gate.invocations[1][0]
        for payload in projected[1:]:
            evidence = [
                json.loads(item["content"][0]["text"])
                for item in payload["input"]
                if item["role"] == "user"
                and '"type": "conker_tool_result"' in item["content"][0]["text"]
            ]
            assert len(evidence) == 1 and evidence[0]["content"] == saved[0]["content"]
            assert saved[0]["content"] not in payload["instructions"]
            assert "tools" not in payload and "tool_choice" not in payload
