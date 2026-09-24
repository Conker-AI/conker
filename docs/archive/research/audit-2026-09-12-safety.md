**I would not enable paid operation yet.** ToolGate’s ledger held in the probes, but Pi can accidentally classify a billed request as free and record zero cost. I also reproduced failures in action status and cross-service forgetting. No files were changed.

The findings below exclude the existing issue log’s general defects, including E3’s direct OpenRouter credential exposure.

1. **Pi accepts unknown or incomplete pricing as free—and can conceal the resulting charge. — High; reproduced with simulated provider responses.**

   In [openrouter.py:44](C:/Users/The1a/dev/gates/pi/pi/openrouter.py:44), missing, null, or empty prices become zero. [The free-model check:40](C:/Users/The1a/dev/gates/pi/pi/openrouter.py:40) considers only prompt and completion prices, ignoring per-request fees.

   With `allow_paid=False`, I supplied a text-model catalogue entry with zero token prices and a `$0.50` request fee. Pi dispatched it. When the simulated response reported `usage.cost=0.5`, Pi recorded `cost_usd=0.0`. Missing pricing also passed. OpenRouter documents that some models charge per request. [OpenRouter pricing explanation](https://openrouter.ai/docs/faq)

   **Owner loses:** money despite choosing free operation, plus truthful accounting. These were controlled fixtures, not a demonstrated charge against a currently listed model.

2. **Pi does not understand ToolGate’s new execution contract. — High; adapter behavior reproduced, integration failure established from code.**

   [toolgate.py:121](C:/Users/The1a/dev/gates/pi/pi/toolgate.py:121) sends neither `action_id` nor `job_id`; [ToolGate now requires an action ID:952](C:/Users/The1a/dev/gates/toolgate/toolgate/api/server.py:952) for outbound execution. Consequently, ordinary outbound invocations—and approval resumptions—are rejected.

   Separately, [Pi’s response parser:147](C:/Users/The1a/dev/gates/pi/pi/toolgate.py:147) defaults missing `ok` to `True`. Real adapter probes returned `ok=True` for HTTP-200 envelopes containing `OUTCOME_UNKNOWN`, `IN_PROGRESS`, and `TOOL_UNAVAILABLE`. [The loop:359](C:/Users/The1a/dev/gates/pi/pi/loop.py:359) then marks the turn as having acted without inspecting that flag.

   **Owner loses:** functioning tools today; honest action status when durable responses reach Pi. Fixing the missing IDs alone leaves the uncertainty-handling defect intact.

3. **Concurrent resume can overwrite a completed action as failed; restart can hide an action needing its reply. — High; reproduced with injected interleaving and in-memory state.**

   Two callers can both read `awaiting_approval`. After one completes, the other’s refusal handler [writes `failed` unconditionally:220](C:/Users/The1a/dev/gates/pi/pi/loop.py:220). [The store update:348](C:/Users/The1a/dev/gates/pi/pi/store.py:348) does not compare the current state. Injecting that schedule produced **`status=failed, acted=1`**.

   A separate restart probe produced **`status=interrupted, acted=1`**, absent from the unreplied-action queue. [Startup recovery:430](C:/Users/The1a/dev/gates/pi/pi/store.py:430) changes running turns to `interrupted`, while [resumption:202](C:/Users/The1a/dev/gates/pi/pi/loop.py:202) rejects that status.

   **Owner loses:** reliable completion status and the supported path to retrieve a missing reply. The `acted` flag survives; the surrounding state machine mishandles it.

4. **Forgetting after an agent-ID change acknowledges deletion in the wrong namespace. — High; reproduced through the actual client, API routes, and database logic.**

   Pi’s [outbox schema:7](C:/Users/The1a/dev/gates/pi/pi/memory_store.py:7) does not preserve the original destination identity. Delivery uses the [currently configured agent ID:22](C:/Users/The1a/dev/gates/pi/pi/memory.py:22), while MemoryGate’s [record identity:30](C:/Users/The1a/dev/gates/memorygate/services/api/app/services/conversation_memory.py:30) includes that ID.

   I ingested a message under one agent ID, changed the configuration, and deleted it. MemoryGate returned a new `deleted` receipt for the new namespace; the original content remained. [Pi accepts the receipt:42](C:/Users/The1a/dev/gates/pi/pi/memory.py:42) because it checks only message ID and state.

   **Owner loses:** real forgetting. Pi considers delivery complete, so it stops trying to remove the surviving original.

5. **MemoryGate reports healthy after a collection-health check fails. — Medium; reproduced by fault injection.**

   If listing Qdrant collections succeeds but inspecting an existing collection fails, [qdrant_store.py:88](C:/Users/The1a/dev/gates/memorygate/services/api/app/services/qdrant_store.py:88) swallows the exception and eventually returns `{"status":"ok"}`.

   Executing the actual health function with that failure produced exactly that result. Collection configuration and compatibility were never verified.

   **Owner loses:** truthful readiness information. Later search failures can report degradation; this finding concerns the false green health check.

6. **A valid long message becomes a permanently retrying memory delivery. — Medium; reproduced end to end against isolated state.**

   [Pi accepts turn text without a maximum length:153](C:/Users/The1a/dev/gates/pi/pi/api.py:153), but [MemoryGate caps ingestion at 16,000 characters:34](C:/Users/The1a/dev/gates/memorygate/services/api/app/routes/conversation.py:34). A 16,001-character message fits through the browser’s request-size limit.

   My probe retained the transcript but received HTTP 422 on memory delivery. [The worker:141](C:/Users/The1a/dev/gates/pi/pi/memory.py:141) scheduled another attempt and advised checking connectivity and credentials. Neither retrying nor repairing credentials can fix that payload.

   **Owner loses:** durable memory of a legitimate message, with misleading repair guidance. This is separate from the known admission-filter coverage problem.

7. **An unavailable hosted catalogue prevents a healthy local fallback. — Medium; reproduced.**

   [Router candidate construction:94](C:/Users/The1a/dev/gates/pi/pi/routing.py:94) selects the hosted route before appending the local fallback. A catalogue exception escapes before either happens. [The loop:103](C:/Users/The1a/dev/gates/pi/pi/loop.py:103) constructs candidates outside its provider-failure handling.

   With an available local provider and a simulated catalogue connection failure, an analysis request failed with `ProviderUnavailable`; local invocation count was **zero**.

   **Owner loses:** available local assistance during a hosted outage.

**The money-path checks also established these limits:**

- ToolGate’s ledger held through same-ID replay, conflicting arguments, competing reservations, injected transaction failure, recovery to unknown outcome, and actual-usage reconciliation. I found no cap overrun or duplicate dispatch in those probes.
- Ambiguous requests retain their full reservation. This prevents overspending, but unresolved reservations can exhaust the usable budget indefinitely; there is no completed owner reconciliation/release path.
- MemoryGate independently calls OpenAI from [ollama_service.py:31](C:/Users/The1a/dev/gates/memorygate/services/api/app/services/ollama_service.py:31), including evidence analysis. Those calls do not use ToolGate’s ledger. This is an additional coverage detail under existing B9, not a second report of “no caps.”
- I found no dedicated card-payment executor. Generic HTTP tools can nevertheless call payment APIs; the inference-cost ledger does not cap the amount transferred by such an API.

**Areas that held:** gateway session revocation rejected the revoked session, and an injected password-reset-during-login race rejected the late login. I found no concrete permanent-lockout defect. Password recovery does not claim to restore missing data or vault keys. Pi’s message/outbox transaction and ordinary forgetting/tombstone structure looked sound; the deletion failure above concerns destination identity.

**Dependency check:** MemoryGate pins [cryptography 46.0.1](C:/Users/The1a/dev/gates/memorygate/services/api/requirements.txt:6). That predates the wheel fix in 48.0.1 for CVE-2026-34180. The advisory applies to bundled OpenSSL in upstream wheels; source builds depend on their linked OpenSSL. I did not demonstrate exploitability in this application. [Maintainer advisory](https://github.com/pyca/cryptography/security/advisories/GHSA-537c-gmf6-5ccf)

MemoryGate’s Starlette 1.3.1 meets the patched versions for the checked [URL-authority advisory](https://github.com/Kludex/starlette/security/advisories/GHSA-jp82-jpqv-5vv3) and [form-limit advisory](https://github.com/Kludex/starlette/security/advisories/GHSA-82w8-qh3p-5jfq). This was a manifest/advisory review, not a deployed-image vulnerability scan.

All reproductions used in-memory state or simulated dependencies. I made no paid requests and did not test actual disk exhaustion, filesystem durability under power loss, or a full Docker recovery.