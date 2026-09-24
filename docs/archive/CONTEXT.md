# Context

The vocabulary of this project. When your output names a domain concept — an issue title, a
proposal, a test name, a variable — use the term as defined here. If a concept you need is not
here, either you are inventing language the project does not use, or there is a real gap worth
recording.

This is a glossary and nothing else. No implementation detail, no plans.

---

## The system

**Conker** — the product, and the default name of the Companion itself. Both are owner-changeable.
Conker is **the universal layer only**: the companion, the engine, the four services, the dashboard
and the presentation surfaces. It is not a collection of applications.

**Companion** — the single coherent relationship the owner talks to. Specialist agents may work
behind the scenes; the Companion stays the interface. Never plural.

**Owner** — the one person a Conker install serves. Single-tenant per install, distributable to
many installers. Not "user"; not "customer".

**Gate** — a controlled boundary. There are exactly three: MemoryGate, ToolGate, SystemGate. The
suffix means *boundary*, so it is never applied to something that is not one.

**Pi** — the runtime. Agent turns, sessions, jobs, model routing, execution history. Pi passes
*through* the gates and is therefore deliberately not a Gate. It is the only service the browser
talks to.

**Module** — any of the five services (Pi, MemoryGate, ToolGate, SystemGate, the embedding service).
Every module presents identically from outside: same README shape, same `/health`, generated
OpenAPI, same changelog discipline.

---

## The engine

**The engine** — the loop the product exists to run: what the owner does and says → evidence →
pattern recognition → proposal → approval → execution → new evidence. When "the loop" is used
without qualification, this is it.

**Evidence** — an immutable record that something happened, carrying its source. Cheap, complete,
written by Pi after every turn. Evidence is *not* memory.

**Memory** — durable, retrievable, evidence-backed knowledge about the owner: facts, preferences,
decisions, people, patterns. Each carries source, timestamp, confidence, scope and retention.
Memory is **derived** from evidence by an analysis pass. A session becoming memory means it is
**mined**, never **copied**.

**Transcript** — the raw conversation. Owned by Pi, never copied into memory, referenced by stable
id so evidence stays traceable.

**Session** — a durable, append-only conversation with an id, message history and per-turn
metadata. Survives restart. When context runs out a session **forks**: it closes, writes a summary,
and opens a child seeded by it with a pointer to the parent. History is never rewritten in place.

**Proposal** — what Conker suggests automating, optimising or fixing, with the evidence behind it
and a path back to the source. The visible output of the engine. Not "suggestion" in code or UI;
pick one word and this is it.

**Watermark** — the marker of how far a job has read. The nightly pass reads new evidence *since*
its watermark, never the whole corpus.

---

## Acting

**Action boundary** — ToolGate. Every real-world effect passes through it. The rule: *if it touches
anything outside Pi's own store, it goes through ToolGate.*

**Approval** — authorisation for **one exact action, consumed once**, bound to object, version,
argument digest, nonce and expiry. Never a category, never a session, never "from now on". There is
no always-allow in Conker.

**Prepared** — built and staged, **not running and not reachable**. One approval away from
happening. Preparing is free of consequence, not free of resources.

**Action class** — the unit autonomy is configured in: **Observe**, **Prepare**, **Act locally**,
**Act outward**. Autonomy is set per class, never globally.

**Autonomy policy** — the owner's setting for which action classes may proceed without asking. It
decides *whether a class must ask*, never *how long a yes lasts*.

---

## Status and truth

**Truthful status** — the eight states every displayed value carries: `live`, `degraded`,
`offline`, `stale`, `blocked`, `empty`, `planned`, `unknown`. A capability is never `live` because
it was designed. `empty` and `degraded` are different facts and must look different.

**Bounded context package** — what MemoryGate returns to a caller. Agents never read its database
directly.

---

## Building it

**Checkpoint** — a working, usable increment that leaves Conker more *useful* than the last. Eight
of them, C1 to C8. **There are no product versions**; "later" never means "cut".

**Swap contract** — the network interface a replacement implements. There are three: memory, tools,
embedding. The dashboard's contract is Pi's generated OpenAPI.

**Design system** — the single source of colour, type, spacing, components and the status
vocabulary. No module defines its own.

---

## Words this project does not use

- **"User"** for the owner — say *owner*.
- **"Suggestion"** for a proposal — say *proposal*.
- **"Agent"** for the Companion — the Companion is one; agents are the plural machinery behind it.
- **"v1" / "v2"** — superseded by checkpoints. Tickets predating that change say `v1` where they
  mean *the first checkpoints*.
- **"Gate"** for anything that is not one of the three boundaries.
