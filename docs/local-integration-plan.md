# Local integration acceptance

Owner authorization: September 21, 2026. Run and verify the existing pieces together
on this Windows machine before any later Ubuntu deployment. Preserve independent
services, existing privacy/approval boundaries, and the accepted dashboard design.

## Sequence

1. Inventory existing runtime/gateway/frontend contracts and local resources.
2. Install a pinned Laya SDK in an isolated environment; measure CPU inference on
   this machine with public synthetic inputs before using owner context.
3. Add a replaceable typed decision transport. Use Laya for bounded decisions,
   never generated answers or permission grants. Keep explicit timeout/fallback
   behavior and do not silently truncate oversized context.
4. Integrate memory relevance and model selection with existing scoped retrieval
   and model roles. Preserve manual selections and no-harness/no-memory settings.
5. Start local services with persistent, isolated development state and secret
   configuration outside Git. Use the authenticated gateway for browser access.
6. Connect the relevant UI controls and display actual status/decision evidence.
   Never label fixture output as live or hide an unavailable dependency.
7. Exercise real browser-to-backend journeys, negative privacy/failure cases,
   restart persistence, focused tests and the dashboard build. Record measured
   outcomes, screenshots and remaining limitations.

## Acceptance evidence

- Pinned SDK/checkpoint, installed CPU environment and dependency lock are in
  `services/decisions`. Measured warm median 315 ms, about 2 GB RSS, 6/8 correct
  routing smoke cases. Three memory cases: two ranked, one retained baseline at
  the 0.2 confidence threshold. Small smoke evidence, not production quality proof.
- Pi commits `1c5e436` and `e7a771d`: configurable typed provider, routing capability
  descriptions/evaluation envelopes, memory reorder receipts, manual/no-harness
  preservation, timeout/busy/oversize/uncertainty fallback. Latest focused set:
  65 passed. Companion service/bootstrap checks: 5 passed.
- Companion `5b39351e`: authenticated decision service and isolated local launcher.
  PostgreSQL, MemoryGate, ToolGate, Pi and Laya are running on loopback. Ollama was
  started separately with its existing qwen3:4b / qwen2.5:3b installations. No model
  answer has yet been exercised through the browser. Local state is `.local-run`.
- Pending: authenticated browser journeys and screenshots.
- Pending: reproducible start/stop instructions and final limitations.

## Next integration checkpoint

The accepted full dashboard still uses the fixture composition. Shared
`src/lib/api/index.ts` no longer instantiates it: `FixtureWorkspace` explicitly
installs the preview client, allowing the accepted shell to be reused without
initializing sample state.
`GatewayEntry` is already authenticated but renders a separate Conversations /
Activity workspace. Preserve the accepted full shell; do not present this smaller
workspace as completion of the dashboard wiring.

The browser gateway now also has an isolated owner-control credential for model
configuration and scoped memory library/exploration. Catalogue writes require
operation-bound verification. The frontend control adapter validates identities,
scope, pagination and public catalogue fields; draft credentials cannot be sent.
Other backend features exist but remain admin-only. Extend explicit contracts for the required owner
operations with operation-bound verification; do not give browser code admin keys,
replace allowlists with a generic proxy, or relax the gateway's boundaries.

Next: connect model configuration and scoped memory exploration to the accepted
UI, integrate persisted conversations, then run actual browser acceptance. Read
the existing gateway transport/auth/verification and Pi browser contracts first.
Gateway TLS/password setup has not been initialized. No fixture data has been
silently promoted to live, and no accepted frontend markup has been changed yet.

### Verified local increment

- Pi `35fa005`: isolated owner-control API and memory inspection projection.
- MemoryGate `3e0ccf2`: searchable, scoped library with keyset pagination.
- Companion `4cc51e0c`: typed browser control adapter and distinct local owner key.
- Live owner library returned HTTP 200, scope `all`, zero records, text search.
  The chat credential was rejected with HTTP 401 from that same owner endpoint.
- Initial local catalogue persisted at revision 1: Qwen 2.5 3B default, Qwen 3 4B
  available, Laya typed routing available but disabled. No paid provider enabled.
- A real Pi turn using Ollama Qwen 2.5 3B returned `Local integration works.` in
  11.2 seconds, with persisted `complete` status and actual provider/model.
  This was an HTTP backend check, **not** a browser-to-backend acceptance claim.
- Eight owner API tests, six MemoryGate explorer tests, bootstrap configuration
  check, browser control boundary check, import-isolation check and TypeScript
  build pass. Full Vite build passes (third-party Zod annotation warnings only).
- Preview memory screen still renders after transport-composition separation.
  Full-shell authenticated UI wiring and browser journeys remain outstanding.

Local gaps: MemoryGate is on real PostgreSQL but lacks Qdrant/embeddings, so lexical
fallback is explicit. ToolGate has no execution scopes, and search is unconfigured.
Memory reranking remains opt-in/off in the local configuration. Laya is English
only. The initial launcher bootstrap issues (key prefixes, salt format and using
PostgreSQL instead of SQLite startup migrations) were corrected and tested.

Existing repositories were clean at the start. Make narrow local commits after
verified increments. No remote push, Ubuntu deployment, paid inference or automatic
permission expansion is part of this goal.
