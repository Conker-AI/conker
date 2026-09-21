"""Read-only acceptance check for a real local MemoryGate -> Laya -> Pi turn.

Run after a browser recall turn with at least two admitted memories. Never prints
credentials or message contents. Local configuration and database are fixed to the
isolated launcher workspace. Does not submit turns, seed data, or call a model.
"""
import argparse
import json
from pathlib import Path
import sqlite3
import urllib.request

ROOT = Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--turn-id", required=True)
    args = parser.parse_args()
    config = json.loads((ROOT / ".local-run/configuration.json").read_text())
    env = config["environments"]["pi"]
    db_path = ROOT / ".local-run/pi/pi.db"
    with sqlite3.connect(db_path.resolve().as_uri() + "?mode=ro", uri=True) as db:
        db.row_factory = sqlite3.Row
        turn = db.execute("SELECT * FROM turns WHERE id=?", (args.turn_id,)).fetchone()
        assert turn and turn["status"] == "complete", "Choose a completed real recall turn"
        saved = db.execute("SELECT * FROM memory_contexts WHERE turn_id=?", (args.turn_id,)).fetchone()
        assert saved and saved["package"], "No saved memory context"
        package = json.loads(saved["package"])
        records = package["memories"]
        assert 2 <= len(records) <= 8, "At least two real retrieved memories are needed"
        receipt = package["retrieval"]["reranking"]
        assert receipt["status"] == "ranked", "Ranking did not complete; inspect fallback"
        assert receipt["order"] == [r["id"] for r in records]
        snapshot = db.execute("SELECT prefix FROM turn_context_inputs WHERE turn_id=?", (args.turn_id,)).fetchone()
        assert snapshot and all(r["id"] in snapshot[0] for r in records), "Answer context is missing retrieved records"
    payload = {"query": package["query"], "scope": "selected", "memory_ids": [r["id"] for r in records], "max_items": 8}
    request = urllib.request.Request("http://127.0.0.1:8020/runtime/context",
        data=json.dumps(payload).encode(), headers={"Content-Type": "application/json",
        "X-MemoryGate-Key": env["PI_MEMORYGATE_READ_KEY"], "X-Agent-Id": env["PI_MEMORYGATE_AGENT_ID"]})
    with urllib.request.urlopen(request, timeout=10) as response:
        live = json.load(response)
    assert live["scope"] == "selected"
    current = {r["id"]: r for r in live["memories"]}
    assert set(current) == {r["id"] for r in records}
    for record in records:
        for field in ("text", "summary", "source_type", "confidence", "do_not_generalize", "citations"):
            assert current[record["id"]][field] == record[field], "Retrieved source content changed"
        assert record.get("citations"), "Missing source citation"
        assert all(c["session_id"] != turn["session_id"] for c in record["citations"]), "Use a separate recall session"
    print(json.dumps({"turn_id": args.turn_id, "database": "live PostgreSQL via MemoryGate",
        "record_count": len(records), "saved_status": saved["status"],
        "ranking": receipt, "source_content_preserved": True,
        "records_in_answer_context": True}, indent=2))

if __name__ == "__main__":
    main()
