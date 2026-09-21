# Research mode runtime contract - source inventory

The accepted fixture supports Off / Web / Deep research as per-turn metadata,
retained by drafts, queue entries, forks and answer retries. It explicitly does
not claim research execution. The backend must retain that distinction.

Existing ToolGate implementation to reuse:
- `toolgate/api/server.py` registers `research.web` and bounded specialist searches.
- `research.scan-pain`, `research.scan-developer`, `research.scan-competition` are
  reusable multi-source profiles, not a general iterative deep-research agent.
- `toolgate/executors/research.py` implements search, source provenance, failure
  reporting and bundle execution. Local SearXNG is already a fallback.
- Tavily is deliberately disabled pending a bounded spending adapter; enabling a
  composer mode must not bypass that restriction or provide new authority.

Remaining implementation:
1. Capture requested mode with submission identity/settings and queue snapshots.
   Never turn a requested mode into a claim that sources were fetched.
2. Map Web to configured, scoped ToolGate capability and normal action receipts.
   Source evidence is untrusted and must carry real provenance/citations.
3. Deep research needs a bounded inspectable plan, progress, source collection and
   synthesis, plus cancellation, restart and partial-failure semantics. A fixed
   bundle alone does not satisfy this behavior.
4. Research off must preserve ordinary tool availability rather than revoke the
   owner's explicitly enabled tools. Privacy and permissions remain independent.
5. Retries narrate saved evidence; a refresh is a new explicit action. Do not rerun
   web requests or research solely because an answer is retried with another model.

This inventory is from current local source, not a live-network provider test.
Do not build a duplicate search engine or silently reactivate paid fallback.

## September 21 implementation checkpoint

Pi now captures off/web/deep in turn requests, immutable submission settings and
receipt identity, queued payload/admission, and revision-bound saved drafts.
Consuming a submitted draft clears its mode only if its revision is still current.
Queue edits/reviews retain the choice. Calls/team-role submissions cannot acquire
research through this ordinary-conversation field. Default off remains compatible.

89 focused Pi tests pass across research, drafts/forgetting, queue execution,
submission identity, reply targets and settings, including authenticated HTTP
forwarding. This is contract foundation only: web/deep currently report durable
research_unavailable before retrieval/model calls. The bounded ToolGate-backed
executor, progress/source/synthesis receipts and recovery remain unfinished.
No search-provider calls or browser/backend wiring were performed.
