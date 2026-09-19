# Current implementation and integration state

Source audit: September 19, 2026. Reviewed Conker's `feat/dashboard` checkout and the adjacent Pi, ToolGate, MemoryGate, SystemGate and Embeddings sources. This is not a deployment health check, registry-publication test or permission to run migrations.

## Dashboard

The active app is `dashboard/`, a Vite + React + TypeScript frontend using shadcn/Radix components. `dashboard/src/lib/api/index.ts` composes `createFixtureClient()` with browser voice input. It does not select an HTTP client for the backend services.

- Forms, drafts, conversations, job controls and activity disclosures have local behavior. Most fixture data resets on page reload; some appearance preferences are separately persisted.
- Replies are explicitly simulated; costs are not metered. Approval choices do not execute external actions.
- Calls have local browser media/UI behavior. Character TTS, emotion inference, live AI responses and durable call storage are not connected.
- Terminal is offline; the file tree and system status are samples. Displaying them does not expose a working shell.
- The browser's speech-recognition implementation may use an online service. Do not equate a local webpage with guaranteed offline audio processing.

The earlier `design-system/` package is a separate foundation/test surface, not the current product dashboard.

## Backend source and composition

| Component | Observed implementation | Integration qualification |
| --- | --- | --- |
| Pi | Turns, sessions/transcripts, routing, action history, memory delivery support and a separate gateway package. | Current Compose does not provide the MemoryGate connection variables that Pi's memory path expects. |
| Gateway | HTTPS login, browser sessions and a separate owner credential boundary. | Its intended ToolGate owner-request endpoint contract is still missing from the reviewed ToolGate source. |
| ToolGate | Tool registry, credentials, policy, approval handling, bounded deterministic automation, receipts and its own standalone UI. | Its existing admin decision endpoint is not a substitute for a separate browser-owner channel. |
| MemoryGate | Evidence and memory APIs, PostgreSQL storage, Qdrant indexing, embedding-sidecar calls. | Semantic retrieval depends on actual sidecar/model/index availability; it is not universally healthy or universally degraded. |
| SystemGate | Read-only host and service observations. | Shell, process termination and Docker mutations must not be added to this observation boundary by assumption. |
| Embeddings | Separate text-to-vector service backed by Ollama. | Model availability and dimension/configuration compatibility must be checked in deployment. |

The independently versioned module pins currently recorded in [`versions.env`](../versions.env) are Pi 0.4.0, ToolGate 0.3.0, MemoryGate 0.3.0, SystemGate 0.2.3 and Embeddings 0.1.2. That file remains authoritative; this table is a dated observation, not an additional pin source.

## Integration work that must not be hidden by the README

1. **Dashboard transport.** Implement and verify the frontend-to-gateway adapter before marking fixture actions live.
2. **Browser owner approvals.** The gateway expects `GET /v2/owner/requests` and `POST /v2/owner/requests/{id}/decision` with `X-ToolGate-Owner-Key`. The reviewed ToolGate source instead exposes its admin decision route under `/v2/requests/{id}/decision`. Do not pass an admin key to the browser or worker to bypass this gap.
3. **Pi memory configuration.** Pi supports `PI_MEMORYGATE_URL`, `PI_MEMORYGATE_INGEST_KEY` and `PI_MEMORYGATE_READ_KEY`; Conker's current Pi Compose environment does not wire them. Verify both provisioning and the actual ingestion/retrieval round trip before promising that the assembled stack remembers.
4. **Recovery.** Restore intentionally enters a held state. Complete deletion replay and external-action reconciliation remain prerequisites to a safe return to service; see [recovery](recovery.md).
5. **Release verification.** Source inspection and image pins are not proof that the published images, configuration and frontend work together. A release needs a deployment smoke test and boundary checks.
6. **Licensing.** The root documentation historically declares MIT, but no root `LICENSE` is present. Confirm the intended notice and artwork rights before presenting the repository as a fully packaged public release. Preserve existing third-party notices.

## Access, network and authority

Compose publishes service ports on `127.0.0.1`. This constrains inbound connections, not outbound data movement. Hosted providers, downloads and web tools may contact external services. Private network access, browser authentication, owner authorization and outbound data policy solve different problems.

Pi coordinates work. ToolGate governs action execution. The gateway separates owner approval credentials from worker credentials. MemoryGate retains evidence and memory. SystemGate observes. Future owner-terminal and reauthentication proposals are recorded in the [workspace plan](workspace-control-plan.md); the current offline terminal does not implement them.

## What this audit changed

Documentation and screenshots only: no service wiring, credential changes, Docker operations, registry publishing, repository transfers or product feature implementation. The chat delivery milestone remains a plan awaiting the owner's execution goal.
