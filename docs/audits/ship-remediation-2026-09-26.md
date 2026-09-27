# Ship remediation ledger

This ledger tracks implementation against the 26 September pre-ship audit. A
change is complete here only after its focused tests pass; release readiness
still requires the assembled pinned-image acceptance run.

| Work unit | State | Evidence or next boundary |
|---|---|---|
| Authoritative release compatibility manifest | Implemented | `versions.env`, validator, tests and CI check; promote only after all component releases exist |
| SystemGate host authority | Implemented | Docker socket and host-root removed in service and both deployment paths; degraded telemetry remains explicit |
| Rejected-password recovery | Implemented | Sign-in stays mounted, preserves input, focuses the retry and uses a bounded login-specific error |
| ToolGate concurrent usage limits | Implemented | Capacity reservation is atomic with the durable dispatch journal; full suite passed |
| MemoryGate stranded processing jobs | Implemented | Durable renewable claims, restart recovery and stale-owner fencing pass the full service suite |
| MemoryGate encryption-key persistence | Implemented | Root and Ubuntu layouts persist `/data`; recovery inventories it and retains old-snapshot compatibility |
| Verified setup status | Implemented | Pi owner projection, `conker setup status` and connected `/setup` UI share typed prerequisites, reason codes, evidence and one bounded next operation; deployment provisions a distinct hashed owner channel |
| Root and Ubuntu CLI contract | Implemented | One command implementation adapts both layouts; status reads health and unsupported operations fail explicitly |
| Credential-bearing HTTP clients ignore ambient proxies | Implemented | Gateway, Pi, ToolGate, MemoryGate, Embeddings, CLI and MCP clients ignore ambient proxies and redirects; hostile-proxy and static-policy suites pass in each owning repository |
| PostgreSQL/Qdrant atomicity | Implemented | Transactional desired-state outbox, stable-id replay, delete supersession, backup coverage and real PostgreSQL migration/backfill checks pass with the full MemoryGate suite |
| Recovery return-to-service | Implemented | Durable held/reviewed/service-ready states bind an expiring operator review to the exact snapshot; readiness revalidates isolation, images, keys and unfinished work, while interruption and abort preserve ownership boundaries |
| Update rollback | Implemented | Candidate code and exact image digests are staged, accepted and receipted; failure restores recorded Git, image and running state or leaves a durable hold |
| Assembled release CI | Implemented, live run pending | Deterministic tests pass; release/manual CI pulls the exact manifest matrix and records install, TLS auth, setup, conversation, backup, held restore and teardown evidence on a clean dedicated runner |
| Source/component reachability | Implemented | Unused feature fragments, primitives and packages were removed; CI now fails when a source module is disconnected from the real application entry point (351/351 connected) |
| One connected product shell | Implemented | Production and default development use the connected gateway shell; one typed registry now owns its route resolution, sidebar and page search, every advertised destination resolves to a connected workspace, invalid supported-section URLs fall back safely, and legacy fixtures require an explicit separate dev build |

## UI walkthrough finding

Resolved on 27 September. The default development preview now renders the same
connected shell as production through an in-memory gateway, and the old fixture
product is available only through the explicit legacy command. The authenticated
sidebar and page search consume one connected-route registry; legacy-only Journal,
login and `/chat/new` destinations are not advertised. Direct detail routes retain
strict identities, trailing slashes resolve consistently, and unknown System or
Agents section values return to a connected default instead of an empty shell.

First-run setup enters through that shell and uses the real control client. The
production bundle check continues to prove that no fixture chunk is shipped.
