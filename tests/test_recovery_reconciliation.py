"""Joint offline recovery evidence; does not certify Docker restore or promotion."""

import sqlite3
from contextlib import closing
from pathlib import Path
from uuid import uuid4

import pytest


def backup(source, target):
    with closing(sqlite3.connect(source)) as src, closing(sqlite3.connect(target)) as dst:
        src.backup(dst)


def test_post_backup_deletions_receipts_and_revocation(tmp_path, monkeypatch):
    gates = Path(__file__).resolve().parents[2] / "gates"
    for path in (gates / "pi", gates / "toolgate", gates / "memorygate/services/api"):
        if not path.is_dir():
            pytest.skip("Requires sibling Pi, ToolGate and MemoryGate checkouts")
        monkeypatch.syspath_prepend(str(path))
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[1] / "scripts"))
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    from pi.store import Store
    from pi import forgetting, recovery_deletions
    from toolgate.core import control_plane as cp, execution_journal as journal, recovery_journal
    from app.core.db import Base
    from app.models.memory import Memory
    from app.models.deletion_receipt import DeletionReceipt
    from app.services import deletion_recovery
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from qdrant_client import QdrantClient, models
    import recovery_data

    current, restored = tmp_path / "current", tmp_path / "restored"
    current.mkdir()
    restored.mkdir()
    # One coherent, stopped fixture snapshot predates a deletion and action result.
    with closing(Store(current / "pi.db")) as store:
        deleted = store.create_session(title="forget later")
        kept = store.create_session(title="retained history")
        store.append_message(deleted, "user", "erase this content")
        store.append_message(kept, "user", "keep this content")
    monkeypatch.setattr(cp, "DB_PATH", current / "toolgate.db")
    journal.begin("external-post", "tool", "post", {}, "agent", 1)
    _, key = cp.issue_agent_key("fixture", ["tool:post"])
    engine = create_engine(f"sqlite:///{current / 'memory.db'}")
    Base.metadata.create_all(engine)
    sessions = sessionmaker(engine)
    memory_id = str(uuid4())
    with sessions() as db:
        db.add(Memory(id=memory_id, agent_id="owner", text="erase memory"))
        db.commit()
    for name in ("pi.db", "toolgate.db", "memory.db"):
        backup(current / name, restored / name)
    forgetting.forget(current / "pi.db", deleted,
        forgetting.preview(current / "pi.db", deleted)["confirmation"])
    journal.finish("external-post", {"ok": True, "receipt": "already-posted"})
    with sessions() as db:
        db.delete(db.get(Memory, memory_id))
        db.add(DeletionReceipt(agent_id="owner", object_kind="memory", object_id=memory_id))
        db.commit()
        evidence = deletion_recovery.evidence(db)
    engine.dispose()

    plan = recovery_deletions.preview(current / "pi.db", restored / "pi.db")
    assert recovery_deletions.replay(current / "pi.db", restored / "pi.db", plan["confirmation"])["recoveryHeld"]
    assert recovery_journal.reconcile(current / "toolgate.db", restored / "toolgate.db")["unresolved"] == []
    recovery_data.invalidate_approvals(restored / "toolgate.db")
    engine = create_engine(f"sqlite:///{restored / 'memory.db'}")
    sessions = sessionmaker(engine)
    collections = {kind: kind for kind in ("memory", "entity", "observation")}
    client = QdrantClient(":memory:")
    try:
        for name in collections.values():
            client.create_collection(name, vectors_config=models.VectorParams(size=2, distance=models.Distance.COSINE))
        client.upsert("memory", points=[models.PointStruct(id=memory_id, vector=[1.0, 0.0])])
        deletion_recovery.replay(evidence, sessions)
        assert deletion_recovery.reconcile_indexes(sessions, client, collections)["indexCleanupVerified"]
        with sessions() as db:
            assert db.get(Memory, memory_id) is None
            with pytest.raises(RuntimeError, match="held"):
                deletion_recovery.assert_not_held(db)
        assert client.retrieve("memory", ids=[memory_id]) == []
    finally:
        client.close()
        engine.dispose()
    monkeypatch.setattr(cp, "DB_PATH", restored / "toolgate.db")
    assert cp.authenticate_agent(key) is None
    receipt, dispatched = journal.begin("external-post", "tool", "post", {}, "agent", 1)
    assert not dispatched and receipt["response"]["receipt"] == "already-posted"
    with pytest.raises(journal.ExecutionConflict, match="held"):
        journal.begin("new-effect", "tool", "post", {}, "agent", 1)
    with closing(sqlite3.connect(restored / "pi.db")) as db:
        assert db.execute("SELECT title FROM sessions WHERE id=?", (kept,)).fetchone()[0] == "retained history"
        assert db.execute("SELECT count(*) FROM forgotten_sessions WHERE session_id=?", (deleted,)).fetchone()[0] == 1
    assert b"erase this content" not in (restored / "pi.db").read_bytes()
