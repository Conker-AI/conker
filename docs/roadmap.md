# Roadmap

This document preserves checkpoint ordering and historical plans. For the latest
dated source audit and integration limits, read [current state](current-state.md).
The proposed next frontend milestone is [chat delivery](chat-delivery-plan.md).

**There are no product versions.** Conker ships as a sequence of checkpoints. Each is a working,
usable increment that leaves Conker more *useful* than the last — not merely more built.

The roadmap decides **order, never inclusion**. Nothing here is dropped for being late.

## Ordering criteria, in precedence order

1. **Dependency** — nothing before what it needs.
2. **Security first** — the blocking gate defects are fixed before anything is built on top.
   Building on a service that is open by default and hardening it later means every layer above
   inherits assumptions that were never true.
3. **Make the thesis visible soonest** — the engine, not the chrome.
4. **Risk before polish** — what could prove the design wrong comes early, while course changes
   are still cheap.

Where these conflict, the earlier rule wins. Usefulness never outranks security.

---

## C1 — It talks, and it remembers

> **Tracked as [issue #19](https://github.com/alexeybe1kin/conker/issues/19)** with fifteen work
> tickets as sub-issues, wired with native dependencies. The open, unblocked children are what is
> takeable right now — claim one by assigning yourself before starting. This document is the
> narrative; the tracker is the queue.


**The experience:** one command on a clean server, open a link, enter your name and password, name
and shape your companion, and start talking. It remembers you and previous conversations.

Nothing else. No proposals, no approvals, no nightly analysis.

### Work, in dependency order

1. **The gate repos publish versioned images from CI to GHCR.**
   Today they publish source only, so `docker-compose` has nothing to pin. **Nothing is installable
   until this exists.** First line of work, no exceptions.

2. **Security fixes, upstream in the gate repos.** See [ADR-0005](adr/0005-toolgate-is-the-only-action-path.md)
   and the research in [`research/gate-surfaces.md`](research/gate-surfaces.md).
   - MemoryGate refuses to start with no key configured; CORS stops defaulting to `*`.
   - ToolGate's vault is encrypted at rest.
   - ToolGate's MCP bridge is retitled and documented as local-trusted-only — it bypasses scope.
   - SystemGate's README corrected: the "no shell" claim overstates what the code does, and there
     are eight endpoints, not seven.

3. **The embedding service.** New module, sidecar, HTTP interface.
   Default **Qwen3-Embedding-0.6B**; **EmbeddingGemma-300M** as the low-resource preset. MemoryGate
   calls it; the `hash` mode is deleted. Unreachable embedding means `degraded` plus a lexical
   fallback that says so. See [ADR-0004](adr/0004-multilingual-embeddings-from-a-sidecar.md).
   Re-embed now — existing vectors are noise, so the migration is free today and never again.

4. **Pi.** The largest piece.
   Sessions and persistence · the turn loop · provider adapters with free and local models
   auto-discovered · tool calls through ToolGate's keyed HTTP API · execution history · job
   watermarks. History is **append-only** from the first commit.

5. **Design system foundation.** Tokens for both themes, the status component, core components.

6. **The Chat screen.** One screen, not nine.

7. **Installer and setup.** One command, generated secrets, pinned image tags, honest health
   reporting. The four setup steps of first run. No guided tour yet — that is C3.

### Constraints C1 sets permanently

These are cheap now and expensive at C4. Everything above inherits them:

- **Append-only history.** Current models bind reasoning to the producing model and reject edited
  history.
- **Pi owns transcripts; MemoryGate owns evidence.** See [ADR-0002](adr/0002-transcripts-and-evidence.md).
- **Every action goes through ToolGate.** No local shell in Pi, no file access.
- **Nothing assumes text-only**, or C5 and C6 become rewrites instead of additions.

---

## C2 — It notices ← the thesis closes here

Jobs and cron with watermarks. The nightly pattern-recognition pass. The **Proposals** screen. The
**Approvals** screen. Autonomy policy at its safe defaults.

This is where Conker becomes Conker rather than a chat application with a database, and where the
whole premise meets real life for the first time.

---

## C3 — You can see everything ← publish here

Memory, Journal and System screens. Truthful status rendered everywhere. The guided in-product
tour. Documentation finished for someone who does not write code.

The first point at which the answer to "can I try it?" is yes. **Recommended point to make the
repository public.**

---

## C4 — It acts

Autonomy raised to Act-locally and Act-outward with per-capability limits. Tools, Jobs and Agents
screens. Expanded ToolGate capability.

Conker stops only proposing and starts doing — under a policy the owner set deliberately.
See [ADR-0006](adr/0006-autonomy-is-a-configurable-policy.md).

---

## C5 — It speaks

Voice in and out, read-aloud, voice calls.

## C6 — It has a face

Appearance, 2D emotion pack, 3D model, video calls reading facial and voice expression.

## C7 — It is a team

Teams, grants, Flows, Loops, Workers, agent-group templates.

## C8 — It is in the room

Spatial presence — room sensors, projection, gesture — with the consent and privacy design that
[`Conker Spatial Presence`](../docs/concept/the-idea.md) already demands.

---

## Not on this roadmap

The eight domain products — better.io, CapitalOS, BodyMan, ChefSense, SocialOS, HumanLab, Ripeix,
Guardian — are **not parts of Conker**. They are among the things Conker will be asked to build
once it works, each becoming its own effort at that point.

The architecture must *admit* them: anything Conker builds registers as a tool through ToolGate and
owns its own truth. That is one existing rule, not a body of work here.
