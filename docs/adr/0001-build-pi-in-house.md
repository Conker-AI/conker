# ADR-0001 — Build Pi in-house rather than adopting an existing agent runtime

**Status:** Accepted · 2026-09-03 · [issue #2](https://github.com/alexeybe1kin/conker/issues/2)

## Context

Conker needs a runtime: agent turns, sessions, jobs, model routing, execution history. The master
map calls this **Pi**, and it was designed but never built.

`NousResearch/hermes-agent` (MIT, Python, ~240k stars, pushed daily) already ships almost that exact
ownership block: SQLite/FTS5 sessions attachable from CLI, messaging or cron; 40+ tools across seven
terminal backends; cron as a first-class permission-gated subsystem; provider adapters for several
APIs; and context compression that forks a child session preserving lineage. It accepts any MCP
server, and ToolGate already exposes one.

Research against the code at `77adb80` (v0.21.0) found the obvious objections were wrong:

- Its memory **is** cleanly disableable — `memory_enabled: false` drops the store and its tool;
  skills, session search and compression do not depend on it.
- Its tools **can** be fully withheld — `enabled_toolsets` is strictly exclusive.
- Integration would need **no fork** — providers, hooks, transports and toolsets are out-of-tree.

## Decision

**Build Pi in-house. Do not adopt Hermes as harness, substrate or dependency.**

The deciding factor is the action boundary. `principles.md` §8 requires that the action boundary
acts and nothing else does. Under Hermes that is unachievable:

- Hermes retains final authorization and its own hardline blocklist regardless of any plugin — the
  approval transport is explicitly presentation-only, "no plugin approval policy".
- Its `session` and `always` scopes grant local reuse keyed by pattern, while ToolGate's nonce is
  consumed once server-side. The two planes stack and cannot be reconciled.
- MCP elicitation returns `content={}` on accept (`tools/mcp_tool.py:2649`). It is a yes/no channel
  that can never carry ToolGate's nonce, argument digest or justification.

Secondary: ~159–207 commits/day on `main` with no LTS branch and 38,677 open issues is a target that
moves daily for the lifetime of the product. And ToolGate's MCP bridge already defaults its actor
name to `"Pi MCP"` — the seam was written expecting Pi.

## Consequences

**Accepted cost.** Everything Hermes ships, Pi must build: sessions, cron, model routing, provider
adapters, execution history, compression, delegation. This is the largest single item between
charting and a working system, and it sits on the critical path as C1.

**What it buys.** The action-boundary rule becomes *absolute* rather than negotiated — Pi has no
execution path of its own, so "every action through ToolGate" is enforceable by construction. The
approval round-trip works end to end because MCP elicitation is out of the picture entirely.

**Not the reason.** Hermes's built-in memory and tools were disableable. A from-zero Hermes was
available and was declined, not impossible. Recorded so this is not reopened on a false premise.

Full findings: [`docs/research/hermes-architecture.md`](../archive/research/hermes-architecture.md).
