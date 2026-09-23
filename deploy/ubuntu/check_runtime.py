"""Read-only deployment check, executed inside Pi with existing scoped credentials."""
import json
import os
import httpx

from pi.memory import MemoryClient
from pi.decision_provider import configured
from pi.memory_ranking import ConfiguredMemoryRanker
from pi.store import Store

memory = MemoryClient(os.environ["PI_MEMORYGATE_URL"], os.environ["PI_MEMORYGATE_INGEST_KEY"],
    os.environ["PI_MEMORYGATE_READ_KEY"], os.environ["PI_MEMORYGATE_AGENT_ID"], timeout=30)
package = memory.retrieve("What tea does Test Finch prefer?")
ranking = ConfiguredMemoryRanker(Store(os.environ["PI_DB_PATH"]), configured(os.environ))
ranked = ranking.rank_memories("What tea does Test Finch prefer?", package)
with httpx.Client(timeout=10, trust_env=False) as client:
    health = client.get("http://memorygate:8020/health").json()
    access = client.get("http://toolgate:8010/v2/agent/published-workflows",
        headers={"X-ToolGate-Execution-Key": os.environ["PI_TOOLGATE_KEY"]})
    access.raise_for_status()
print(json.dumps({"memory_health": health, "retrieval": ranked["retrieval"],
    "memory_count": len(ranked["memories"]), "agent_workflows": access.json()}, indent=2))
