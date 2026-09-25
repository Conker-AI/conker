# Status

**The one place that says what works.** Update this page in the same change that alters it.
Last verified: **23 September 2026** (Ubuntu server acceptance); streaming added 24 September.

**Live** means verified end to end with real services. **Preview** means the UI works with sample
data. **Planned** means designed, not built.

## Features

| Area | State | Notes |
|---|---|---|
| Login, sessions, password re-check | **Live** | Anonymous requests are refused, and changes need a fresh password check |
| Chat and conversations | **Live** | Quality depends on the model; the default CPU model (Qwen 2.5 3B) is weak |
| Model selection and settings | **Live** | Manual choice works. Automatic routing is off on the server until there are two or more answer models |
| Memory: save, recall, sources | **Live** | Recall works across conversations with citations |
| Memory: meaning-based search | **Live on server** | Needs Embeddings + Qdrant. The Windows stack falls back to word search |
| Memory ranking (Laya) | **Live** | Optional; reorders results and never drops them |
| Approvals in Inbox | **Live** | Tied to one action, used once, expires after 5 min |
| Workflows (editor, publish, run) | **Live** | Branches, loops, nested workflows, replay-safe. Small models need the exact workflow ID |
| System health | **Live** | Per-service health is live; terminal, files and most telemetry are samples |
| Home, Journal | **Partly live** | Unconnected sections say so |
| Proposals (the "it notices" engine) | **Built, not deployed** | Daily pass over your messages, within your suggestion budget and quiet hours; shown in the live Inbox. Off until a model is assigned to the Proposals role |
| Agents, Jobs | **Preview** | Need backend contracts |
| Character Studio | **Preview** | Settings are saved; voice cloning, emotion and 3D are not connected |
| Calls (voice/video) | **Preview** | Browser mic and camera only; no real-time AI voice |
| Streaming replies and Stop | **Built, not deployed** | Answers appear as they are written; Stop halts generation within a couple of tokens. Needs the Ubuntu stack rebuilt from current sources |
| Chat without a password per message | **Built, not deployed** | Conversation writes are session-bound ([ADR-0010](adr/0010-conversation-writes-are-session-bound.md)) |
| Full-history search | **Planned** | |
| Forget a memory from the UI | **Built, not deployed** | Removes it from memory, history, audit, search and Pi's caches; the source chat is kept. Needs the correction capability configured |
| Correct a memory from the UI | **Planned** | Backend exists (reviewed corrections); no UI yet |

## Infrastructure

### Local polish branch (26 September, not deployed)

`fix/product-polish` in Conker and Pi contains the current polish work. It does not
change the server status above.

- Chat follows new content only when the reader is at the bottom, with a compact
  jump-to-latest control. Desktop streaming and preserved reading position checked.
- Home offers working entry points; demo status remains visible on mobile.
- Memory inspection offers connection retry, clears forgotten records immediately,
  and uses a compact mobile toolbar. Record/content inspection checked in Chrome.
- Pi forgetting removes proposals derived from forgotten conversations, including
  decided proposals and uncited material from the same input window: 32 focused tests.
- Ubuntu preparation wires the separate memory-correction capability. Fresh setup,
  repeat preparation and legacy credential preservation tested in temporary folders.
- CLI adds doctor, logs, model list/use, and private guided provider setup. Seven CLI
  tests pass; catalogue operations were also checked against an isolated Pi database.
  No real API keys were entered and provider authentication remains user-verified.
- Gateway, memory, model-role, chat-adapter and tool-workspace contract checks pass.
  ToolGate draft/publication/execution suite: 21 tests pass. Synthetic Inbox denial
  and proposal acceptance were exercised in Chrome, including mobile layout.

The isolated real HTTPS gateway also passed the existing nested-workflow acceptance:
draft save, publication, owner verification, both branches, loop/calculation output,
replay identity and removal of temporary access grants. It used fresh local data and
no model or external connector calls.

Connected-editor browser acceptance also passed after the owner resolved the local
certificate warning: a step label was saved through owner verification and survived
reload; both completed runs and their step details were accessible. Desktop and
390px mobile screenshots were reviewed, including the mobile step-list view and
scrollable activity dialog. No Conker console errors were captured; one browser
password-manager extension error was present. Execution itself was verified through
the HTTPS API, not by clicking Start in the browser; temporary grants remain removed.

Dashboard build, design checks and the full lint command pass (two existing lint
warnings). Production deployment and real hosted-provider authentication have not
been performed. The lightweight gateway preview does not simulate editor persistence.

| Item | State |
|---|---|
| Ubuntu server, 10 containers, tailnet-only HTTPS | **Live** |
| Cold backup with verified hash | **Done once**; no automatic schedule |
| Restore drill, off-machine backup copy | **Not done** |
| LAN SSH firewall rule removal | **Pending** (needs the owner's sudo) |
| Published images per release (GHCR) | **Unverified**; the server is built from source |

## Pinned versions

See [`versions.env`](../versions.env): Pi 0.4.0, ToolGate 0.3.0, MemoryGate 0.3.0, SystemGate 0.2.3,
Embeddings 0.1.2.

## Evidence

- [Server acceptance, 23 Sep](../deploy/ubuntu/acceptance-2026-09-23.md)
- [Local integration evidence, 22 Sep](archive/local-integration-plan.md)
