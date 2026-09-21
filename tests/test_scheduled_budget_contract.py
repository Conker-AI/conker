"""Offline Pi/ToolGate contract drill; add both checkouts to PYTHONPATH.

No sockets, installed databases, real credentials, or paid providers are used.
"""

import time
from contextlib import closing

import httpx
import pytest
from fastapi.testclient import TestClient

pytest.importorskip("pi.jobs", reason="Add the Pi checkout to PYTHONPATH")
pytest.importorskip(
    "toolgate.api.server", reason="Add the ToolGate checkout to PYTHONPATH"
)
from pi import jobs
from pi.job_execution import PublishedJobs
from pi.job_worker import JobWorker
from pi.store import Store
from pi.toolgate import ToolGateClient
from toolgate.api import server
from toolgate.core import control_plane as cp
from toolgate.core import publications, spending


@pytest.mark.parametrize("lose_receipt", [False, True])
def test_paid_schedule_reserves_once_and_reconciles_without_replay(
    tmp_path, monkeypatch, lose_receipt
):
    monkeypatch.setattr(cp, "DB_PATH", tmp_path / "gate.db")
    monkeypatch.setattr(server.vault, "get_key", lambda _: "synthetic-provider-key")
    cp.create_tool(
        {
            "id": "paid",
            "name": "Paid",
            "authorization": "auto",
            "status": "active",
            "inputs": [],
            "outputs": [],
            "execution": {
                "type": "gemini_generate",
                "model": spending.MODEL,
                "prompt_template": "hello",
                "secret_ref": "GOOGLE_API_KEY",
                "max_tokens": 128,
            },
        }
    )
    publication = publications.publish("tool", "paid", 1)
    agent, key = cp.issue_agent_key("Scheduler", ["tool:paid"])
    spending.configure(True, 20_000_000, 10_000_000)
    spending.set_price(
        spending.MODEL,
        1_000_000,
        2_000_000,
        time.time() + 3600,
        "https://fixture.invalid/pricing",
    )
    provider_calls = []

    def provider(url, **kwargs):
        provider_calls.append(url)
        # Reservation exists before the synthetic provider is reached.
        assert spending.status()["held_microusd"] > 0
        return httpx.Response(
            200,
            request=httpx.Request("POST", url),
            json={
                "candidates": [{"content": {"parts": [{"text": "Synthetic answer"}]}}],
                "usageMetadata": {
                    "promptTokenCount": 42,
                    "candidatesTokenCount": 8,
                    "totalTokenCount": 50,
                },
            },
        )

    monkeypatch.setattr(server.httpx, "post", provider)
    calls = []
    api = TestClient(server.app)

    def bridge(request):
        calls.append((request.method, request.url.path))
        response = api.request(
            request.method,
            request.url.path,
            content=request.content,
            headers=dict(request.headers),
        )
        if lose_receipt and request.method == "POST":
            assert response.status_code == 200, response.text
            raise httpx.ReadTimeout("synthetic acknowledgement loss")
        return httpx.Response(
            response.status_code, stream=httpx.ByteStream(response.content)
        )

    adapter = PublishedJobs(
        {"companion": ToolGateClient("http://gate", key)},
        transport=httpx.MockTransport(bridge),
    )
    with closing(Store(tmp_path / "pi.db")) as store:
        definition = jobs.Definition.model_validate(
            {
                "name": "Paid report",
                "instructions": "Run the publication",
                "agentId": "companion",
                "enabled": True,
                "requireBudget": True,
                "timing": {"kind": "interval", "time": "09:00", "day": 0, "hours": 1},
                "timeZone": "UTC",
                "target": {
                    "kind": "tool",
                    "id": "paid",
                    "publishedVersion": 1,
                    "digest": publication["digest"],
                    "args": {},
                },
            }
        )
        job = jobs.create(store, definition, now=0)
        worker = JobWorker(store, adapter)
        worker.tick(now=3600)
        run = jobs.runs(store, job["id"])[0]
        assert run["status"] == "awaiting_budget" and calls == []
        foreign = spending.create_job("other-actor", "other-root", 10_000_000)
        with pytest.raises(jobs.JobError):
            jobs.bind_budget(
                store,
                run["id"],
                jobs.BudgetBinding(budget_id=foreign["job_id"]),
                adapter,
            )
        budget = spending.create_job(agent["id"], run["id"], 10_000_000)
        jobs.bind_budget(
            store, run["id"], jobs.BudgetBinding(budget_id=budget["job_id"]), adapter
        )
        worker.tick(now=3601)
        state = jobs.runs(store, job["id"])[0]["status"]
        assert state == ("outcome_unknown" if lose_receipt else "completed")
        assert len(provider_calls) == 1
        assert spending.status()["accounted_and_reserved_microusd"] == 58
        if lose_receipt:
            assert jobs.reconcile(store, run["id"], adapter) == "completed"
        assert jobs.dispatch_claim(store, run, adapter) == "completed"
        assert len([call for call in calls if call[0] == "POST"]) == 1
        assert len(provider_calls) == 1
        assert jobs.runs(store, job["id"])[0]["spending_budget_id"] == budget["job_id"]
    api.close()
