"""Exercise Pi's durable context path against a running decision service.

Retrieval uses explicitly synthetic records, never the owner's MemoryGate namespace.
The decision HTTP call and Pi SQLite persistence are real. This is a pipeline
check, not an end-to-end MemoryGate retrieval or model-quality benchmark.
"""
import json
import os
from pathlib import Path
import tempfile

from pi.decision_provider import DecisionProvider
from pi.memory import Memory
from pi.memory_store import context
from pi.store import Store


def main():
    records = [
        {"id": "food", "summary": "Alex prefers vegetarian meals.", "source": "synthetic-food"},
        {"id": "work", "summary": "Alex is building a personal AI dashboard.", "source": "synthetic-work"},
        {"id": "sport", "summary": "Alex trains judo on Tuesday and Thursday.", "source": "synthetic-sport"},
    ]
    package = {"memories": records, "retrieval": {"mode": "lexical", "semantic": {"status": "degraded"}}}

    class SyntheticRetrieval:
        def retrieve(self, query):
            return json.loads(json.dumps(package))

    ranker = DecisionProvider(os.environ["PI_DECISION_URL"], os.environ["PI_DECISION_KEY"])
    with tempfile.TemporaryDirectory(prefix="conker-memory-pipeline-") as directory:
        store = Store(Path(directory) / "pi.db")
        try:
            session = store.create_session()
            turn = store.start_turn(session)
            Memory(store, SyntheticRetrieval(), ranker=ranker).prepare(turn, "When does Alex train judo?")
            saved = context(store, turn)
            receipt = saved["package"]["retrieval"]["reranking"]
            assert saved["status"] == "degraded", "Reranking must not mask unavailable vector search"
            assert {item["id"]: item for item in saved["package"]["memories"]} == {item["id"]: item for item in records}
            assert receipt["status"] in {"ranked", "fallback"}
            print(json.dumps({"retrieval": "synthetic", "decision_transport": "live HTTP",
                "persistence": "temporary SQLite", "all_records_preserved": True,
                "search_status": saved["status"], "receipt": receipt}, indent=2))
        finally:
            store.close()


if __name__ == "__main__":
    main()
