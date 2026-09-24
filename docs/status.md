# Status

**The one place that says what works.** Update this page in the same change that alters it.
Last verified: **23 September 2026** (Ubuntu server acceptance).

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
| Proposals (the "it notices" engine) | **Planned** | No nightly analysis yet, so Inbox proposals are samples |
| Agents, Jobs | **Preview** | Need backend contracts |
| Character Studio | **Preview** | Settings are saved; voice cloning, emotion and 3D are not connected |
| Calls (voice/video) | **Preview** | Browser mic and camera only; no real-time AI voice |
| Streaming replies, cancel, full-history search | **Planned** | |
| Correct or forget a memory from the UI | **Planned** | |

## Infrastructure

| Item | State |
|---|---|
| Ubuntu server, 10 containers, tailnet-only HTTPS | **Live** |
| Cold backup with verified hash | **Done once**; no automatic schedule |
| Restore drill, off-machine backup copy | **Not done** |
| LAN SSH firewall rule removal | **Pending** (needs the owner's sudo) |
| Published images per release (GHCR) | **Unverified**; the server is built from source |
| Root `LICENSE` file | **Missing**; MIT is intended but not declared |

## Pinned versions

See [`versions.env`](../versions.env): Pi 0.4.0, ToolGate 0.3.0, MemoryGate 0.3.0, SystemGate 0.2.3,
Embeddings 0.1.2.

## Evidence

- [Server acceptance, 23 Sep](../deploy/ubuntu/acceptance-2026-09-23.md)
- [Local integration evidence, 22 Sep](archive/local-integration-plan.md)
