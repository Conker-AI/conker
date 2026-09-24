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

## Web executor checkpoint

Web now executes one scoped research.web action through Pi's existing ToolGate
boundary, with a bounded model-generated query and saved-evidence synthesis.
The normal approval, budget, unknown-outcome, cancellation and reply-recovery
paths remain authoritative. Authenticated research receipts project original
source observations and message/action IDs; fetched does not mean cited/verified.
61 focused scripted-service checks pass. No live provider/search proof is claimed.
Deep research remains unavailable pending its iterative planner and execution.

## Deep executor checkpoint

Pi now retains a validated public plan as an intermediate message and permits up
to four adaptive research.web searches (or the lower configured tool limit).
Each follow-up sees previous source results; approval continuation preserves the
plan and existing receipts. Synthesis/reply recovery does not repeat completed
searches. Existing forgetting scrubs the plan. 70 focused tests pass.
Remaining: aggregate provider usage across planning/search selection/synthesis and
integrated regression. Current final-call cost is not whole-research cost. Source
execution is tested with doubles; live search and final UI wiring remain unverified.

## Source-reading inventory refinement

ToolGate also already exposes research.fetch and research.fetch-batch using
server-issued result IDs, with bounded extraction and URL safety. The current Pi
deep executor deliberately uses search snippets only. Reuse these fetch capabilities
for source reading rather than add arbitrary URL fetching. Preserve provenance and
per-turn result-handle validation, shared action limits, approvals and recovery.
This source-reading integration remains open; do not present snippets as read pages.

## Accounting verification

A content-free provider-attempt ledger now sums planning, query selection,
synthesis and reply recovery within bound research turns. Pending/failed/missing
usage stays unknown, including after process interruption. Steering does not double
count attempts. ToolGate service bills and pre-turn context/memory preparation are
separate scopes. Five focused cases pass; integrated Pi regression: 960 passed,
8 skipped, one existing test-client deprecation warning, 295.70 seconds.
Skipped live-service and host-specific checks remain unproven. Page-fetch integration
identified above remains open; accounting is no longer the next research blocker.

## Source-reading implementation checkpoint

Deep Research now offers the existing research.fetch capability when scoped,
requires a result ID from a successful search in the same turn, and bounds reads
to 12000 characters. Searches and reads share the saved action ceiling. Source
observations remain in ordinary action/message receipts; unknown fetch outcomes
reconcile without another read. Foreign handles, URLs and excessive arguments
fail before dispatch. Bounded excerpts may be truncated and are not full-page proof.
32 focused research tests pass; final fetch suite has nine passing cases including
cross-conversation provenance and lost receipts. No external services were called.
