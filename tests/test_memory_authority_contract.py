"""Actual MemoryGate auth/context handlers reached by Pi's read-only client."""

from contextlib import closing

import pytest

pytest.importorskip("pi", reason="Add Pi checkout to PYTHONPATH")
import httpx  # noqa: E402 - Pi's dependencies, present only with the checkout
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

pytest.importorskip(
    "app.routes.runtime", reason="Add MemoryGate services/api to PYTHONPATH"
)
from app.core import auth
from app.core.db import Base
from app.models.agent_access_key import AgentAccessKey
from app.models.memory import Memory
from app.routes import runtime
from app.services import auth_settings_service as keys
from pi.memory import MemoryClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


def test_namespace_and_revocation_rechecked_on_every_pi_read(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'memory.db'}")
    Base.metadata.create_all(engine)
    sessions = sessionmaker(engine)
    monkeypatch.setattr(auth, "SessionLocal", sessions)
    monkeypatch.setattr(runtime, "SessionLocal", sessions)
    monkeypatch.setattr(keys, "MEMORYGATE_ADMIN_KEY", "synthetic-unused-admin-key")
    monkeypatch.setattr(keys, "_attempt_state", {})

    def forbidden(*args, **kwargs):
        pytest.fail("Selected scope must not invoke model/vector helpers")

    monkeypatch.setattr(runtime, "semantic_status", forbidden)
    monkeypatch.setattr(runtime, "build_briefing", forbidden)
    raw = "mg_read_synthetic_specialist_read_key"
    with sessions() as db:
        key = keys.ensure_bootstrap_agent_access_key(db, raw, "specialist")
        identity = key.id
        db.add_all(
            [
                Memory(
                    id="own",
                    agent_id="specialist",
                    text="Selected own memory",
                    status="active",
                ),
                Memory(
                    id="other",
                    agent_id="specialist",
                    text="Unselected memory",
                    status="active",
                ),
                Memory(
                    id="foreign",
                    agent_id="companion",
                    text="Foreign memory",
                    status="active",
                ),
            ]
        )
        db.commit()
    app = FastAPI()
    app.include_router(runtime.router)
    seen = []
    try:
        with TestClient(app) as api:

            def bridge(request):
                seen.append(request)
                response = api.request(
                    request.method,
                    request.url.path,
                    headers=dict(request.headers),
                    content=request.content,
                )
                return httpx.Response(response.status_code, content=response.content)

            with closing(
                MemoryClient(
                    "http://memory",
                    "",
                    raw,
                    "specialist",
                    transport=httpx.MockTransport(bridge),
                )
            ) as client:
                result = client.retrieve(
                    "question", scope="selected", memory_ids=["own", "foreign"]
                )
                assert [item["id"] for item in result["memories"]] == ["own"]
                assert result["briefing"] == {} and not result["evidence"]
                client.read_headers["X-Agent-Id"] = "companion"
                with pytest.raises(httpx.HTTPStatusError) as denied:
                    client.retrieve(
                        "question", scope="selected", memory_ids=["foreign"]
                    )
                assert denied.value.response.status_code == 401
                client.read_headers["X-Agent-Id"] = "specialist"
                with sessions() as db:
                    db.get(AgentAccessKey, identity).revoked = True
                    db.commit()
                with pytest.raises(httpx.HTTPStatusError) as revoked:
                    client.retrieve("question", scope="selected", memory_ids=["own"])
                assert revoked.value.response.status_code == 401
                with sessions() as db:
                    assert keys.ensure_bootstrap_agent_access_key(
                        db, raw, "specialist"
                    ).revoked
                with pytest.raises(httpx.HTTPStatusError) as restarted:
                    client.retrieve("question", scope="selected", memory_ids=["own"])
                assert restarted.value.response.status_code == 401
        assert len(seen) == 4
        assert all(request.headers["X-MemoryGate-Key"] == raw for request in seen)
        assert all(
            "X-MemoryGate-Conversation-Key" not in request.headers for request in seen
        )
    finally:
        engine.dispose()
