# Conversation retry contract - implementation requirements

Source: accepted frontend `dashboard/src/lib/api/fixture-adapter.ts` streamReply,
`contextBeforeMessage`, response-family helpers and conversation-workspace retry.
This records implementation requirements; it does not claim backend support.

1. Accept a completed assistant response, a selected eligible model, and a retained
   retry request ID. Preserve original and later conversation messages. Duplicate
   requests inspect the same attempt and never call a provider twice.
2. Retain source turn, source input, response-family identity and target version.
   Snapshot the original context boundary, policy, agent/character instructions,
   attachment references and recalled evidence. Current stricter privacy still wins.
   The chosen model uses an explicitly validated catalogue mapping.
3. Exclude later conversation messages and the answer being replaced from retry
   input. Do not recompute retrieval or compression behind the owner's back. Keep
   exact selected message references for future replay, including response versions.
4. Record a new assistant response version and turn/cost receipt. Do not duplicate
   the source user message or its memory-ingest event. The response family selects
   one version for subsequent context; original evidence remains inspectable.
5. Existing tool outcomes are source evidence. Narration retries may use their
   receipts but must never automatically repeat effects. Unresolved outcomes must
   first be reconciled. A new task/action requires a new explicit request.
6. Preserve real attachment passage citations through original input associations;
   the absence of a newly copied input must not silently strip citations. Forgotten
   sources and attachments remain unavailable. Failed/stopped retries retain their
   receipt and original answer. Queue admission pauses while retry is unresolved.
7. Test original-policy retention after edits, exclusion of later messages, version
   selection for future turns, changed-model routing, no repeated tool effects,
   exact citations, concurrent duplicate IDs, restart, cancellation and forgetting.

This is P9 work within the active backend phase. Browser transport wiring remains
outside the current stopping point. No alternative frontend behavior is approved.
