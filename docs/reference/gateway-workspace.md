# Authenticated gateway workspace

This increment connects the dashboard to Pi's existing browser gateway. It is a deliberately narrow live conversation surface; the larger feature workspace remains an explicitly separate preview until its owners provide durable contracts.

## Modes and hosting

- Development defaults to `fixture`; production defaults to `gateway`. `VITE_CONKER_MODE=fixture` or `gateway` explicitly selects a build mode. Unknown values fail closed.
- Gateway mode requires the page's own HTTPS origin. It accepts no arbitrary service URL or browser bearer credential and never falls back to fixtures after a connection failure.
- Pi serves the trusted production build when `GATEWAY_DASHBOARD_DIR` is configured. Pi commits `265134d6` and `13d99366` add bounded asset serving and support the locally bundled KaTeX data font under the UI CSP.
- Preview providers, call hosts and fixture state load only in fixture mode. An import-graph regression protects the gateway path from eager fixture imports. Gateway mode does not load external Google Fonts or analytics.

## What is connected

Owner-password login, session verification, logout and failed-logout locking use the real gateway cookie/CSRF protocol. Password setup and recovery require the host CLI. The password is cleared from the form before the attempt; errors do not echo server bodies or credentials.

The conversation workspace lists up to the latest 200 sessions, searches that loaded list, creates a session, reads saved messages and turn metadata, and submits one text turn. A returned automatic fork selects the actual destination. A receipt is not presented as a completed answer: saved detail is fetched separately. Forgotten and closed history is read-only; forgotten content is suppressed even if an inconsistent response includes it.

Drafts and uncertain mutation locks survive temporary same-session authentication checks in memory. A changed or lost authenticated identity clears that workspace. There is no local-storage transcript cache. Reload restores server history after signing in, not unsent drafts.

## Recovery and boundaries

- Mutations are never automatically retried. Turn submissions now reserve a durable request identity before preparation and atomically bind the effective session, input, turn and optional task.
- Lost or malformed acknowledgements retain the draft and block further sends. The owner checks the saved submission by identity. An explicit retry after a not-found result keeps the original request identity; a known interrupted preparation can restore its saved input without overwriting a newer draft.
- An accepted turn missing from the fetched detail also blocks a new send until reconciled.
- Unfinished turns and recoverable states such as approval waits, budget waits, action-in-progress, unknown effects and acted-without-reply remain blocked even when a turn has an end timestamp.
- Logout is not queued behind a slow turn. Late responses from a different or revoked browser session are discarded. Aborting a browser fetch does not claim cancellation of server work.
- Reads and writes have bounded validated data. Unsupported message content remains explicit instead of being rendered as invented text.

## Verification

`npm run check:gateway` covers mode resolution, same-origin transport, auth rotation/expiry/logout races, runtime DTOs and receipts, guarded sends, retained workspace state, and fixture import isolation. Theme checks cover gateway font isolation; design, TypeScript and production build checks pass.

Browser QA uses the actual Pi HTTPS gateway and cookie/CSRF implementation with a **simulated Pi dependency**, not a model or gate. It exercised invalid and valid login, session creation, saved replies, lost acknowledgement with no duplicate send, history reload, logout, and desktop dark/mobile light layouts. Simulation text identifies itself. This is transport/UI evidence, not an end-to-end live-model acceptance claim.

## Still outstanding

The full preview shell is not a live backend adapter. Durable task metadata and recorded Activity are now connected; see [live-activity.md](live-activity.md). Fresh operation-bound password verification, a server-enforced verified unlock deadline, durable turn identities and exact message associations are connected; see [gateway-verification-recovery.md](gateway-verification-recovery.md) for their limits and newer real-SQLite browser evidence. Polling cannot extend that verified window.

Agents, projects, artifacts, context policies, tools/jobs and memory operations still need owner contracts and integration. Streaming events, cancellation/resume controls, paginated full-history search and ordinary unsent-draft persistence remain separate work. Server deployment and a real effect/approval/recovery/backup exercise remain launch gates.
