# Architecture

How Conker is shaped. **Why** each choice was made lives in [`adr/`](adr/); this document describes
the system that resulted. Vocabulary is defined in [`../CONTEXT.md`](../CONTEXT.md). Build order is
in [`roadmap.md`](roadmap.md).

**Reading this document:** this is the architectural design, including intended
behavior. It is not a list of live capabilities. For the September 19, 2026 source
audit, fixture boundaries and integration gaps, see [current state](current-state.md).

---

## 1. What Conker is

Conker is a **self-hosted personal AI companion and control plane** for one owner, on one server,
reachable only over a private network.

The premise, from [`concept/the-idea.md`](concept/the-idea.md): AI is a way to reclaim time. Two
things cannot be delegated because they live in the owner physically — **the body** and
**knowledge**. Everything else is overhead, and overhead is automatable.

But "automate everything" is too wide a frame to build on, which is the actual reason for memory:

> **Memory is the record that makes it possible to notice what is repeated, forgotten, or
> automatable.**

So Conker is not a chatbot with a memory feature. It is a loop, and memory is what closes it.

```
what you do and say  →  evidence + memory  →  pattern recognition  →  proposal  →  approval  →  execution
                              ↑                                                                     │
                              └─────────────────── becomes new evidence ────────────────────────────┘
```

Pattern recognition runs **nightly on a schedule** and **live in conversation**. Triggering on every
new memory was considered and rejected on cost.

**Consequence for design:** the screen showing what Conker is *proposing* matters more than the
chat. Chat is how you talk to it; proposals are what it is for.

**Conker is the universal layer and nothing else.** The eight domain products in the idea archive
are not parts of Conker — they are among the things Conker will be asked to build once it works.

---

## 2. Components

Five independent service repositories, a separately isolated gateway packaged
with Pi, and the Conker dashboard. The statuses below describe reviewed source,
not deployed health.

| Component | Owns | Status |
|---|---|---|
| **Pi** | Agent turns, sessions, model routing and execution history. | Implemented source; composed memory configuration pending |
| **Gateway** | HTTPS browser sessions and a separate owner approval credential. | Implemented source; dedicated ToolGate owner channel pending |
| **MemoryGate** | Evidence → analysis → memory, with lineage. PostgreSQL as source of truth, vector index for semantic search. | Implemented source; retrieval depends on sidecar/model/index availability |
| **ToolGate** | Tools, secrets, policy, execution, audit, approvals and bounded automation. | Implemented source; owner gateway contract pending |
| **SystemGate** | Read-only machine truth: health, processes, ports, containers, packages, backups, logs. | Implemented source; deployment health not verified here |
| **Embedding service** | Text → vectors. Sidecar, swappable model. | Implemented source; model availability required |
| **Dashboard** | The owner's conversations, approvals, memory and control workspace. | Interactive frontend using fixtures; service transport pending |

Runtime status uses the eight-state vocabulary from `principles.md` §1. Nothing is
`live` because it was designed. Earlier findings in
[`research/gate-surfaces.md`](research/gate-surfaces.md) are dated research.

```
                    Owner's devices — thin
                              │  Tailscale, private network only
                        ┌─────┴─────┐
                        │ Dashboard │
                        └─────┬─────┘
                              │  HTTPS; integration pending
                    ┌─────────┴─────────┐
                    │   Owner gateway   │── owner approvals → ToolGate
                    └─────────┬─────────┘   (dedicated channel pending)
                              │  worker requests
                    ┌─────────┴─────────┐
                    │   Pi — runtime    │
                    └─────────┬─────────┘
          ┌───────────┬───────┴───────┬─────────────┐
     MemoryGate   ToolGate       SystemGate    what Conker builds
     remembers      acts          observes      (tools, via ToolGate)
          │            │
     Embedding    outside world
```

### The rule that holds it together

**Boundaries do not blur.**

- MemoryGate remembers; it never executes.
- ToolGate acts; it never decides what the owner values.
- SystemGate observes; it is never a shell or an execution path.
- Pi coordinates; it never becomes the database. **No store beyond session state and execution
  history.**

Each is a refusal, and the refusals are what make an always-on system with server access safe to
live with.

### The browser never touches a gate

The intended connected dashboard talks to the HTTPS gateway. The gateway sends
worker requests to Pi and owner decisions through a separate ToolGate owner
channel. Neither the worker nor the browser receives the owner's ToolGate
credential. The current frontend uses fixtures. This separation keeps provider
and service admin credentials and container sockets off the browser; the UI
must not be trusted to enforce authorization.

The current Terminal tab is an offline frontend surface. Earlier concepts treated
it as an observation view. A future owner-operated interactive terminal is proposed
in the [workspace plan](workspace-control-plan.md); it requires an explicit
authenticated execution boundary and does not turn SystemGate into a shell.

---

## 3. How the AI works

Pi runs a deliberately thin turn loop over a provider abstraction. Thin matters: the loop must
behave identically no matter which model answers.

**A turn.** A message arrives. Pi assembles context — recent conversation plus a bounded package
from MemoryGate, never a raw database read. It routes to a model, calls it with the tools ToolGate
currently exposes, executes tool calls back through ToolGate, and appends the result.

**History is append-only.** Current models bind reasoning blocks to the producing model and reject
edited history. Nothing is ever rewritten in place.

**Routing.** A cheap model carries ordinary conversation and escalates on explicit signals — tool
use needed, a failed call needing recovery, analysis rather than conversation, or the owner asking.
Escalation triggers are logged and reviewed, because a cheap model that fails and escalates has cost
both.

**Free by default.** Every free and local model is discovered and configured automatically, so a
fresh install works with no payment and no key. Paid models are the owner's own, added deliberately.
Spend is tracked per turn — model, tokens in and out, cached tokens, cost, latency — precisely
because it is their money.

**Caching before model choice.** Pi's system prompt and tool definitions are stable across turns.
Rendered stable-first, they cache and only the volatile tail is re-billed. Nothing per-request may
leak into that prefix. Lever order: caching → input-token hygiene → effort/model tier → provider.

**When context runs out**, Pi summarises and **forks**: closes the session, writes a summary, opens
a child seeded by it pointing back at the parent. Lineage stays walkable.

**The nightly job** reads new evidence since a watermark, never the corpus, under a hard token
budget. Its output is proposals. It executes nothing.

---

## 4. What Conker may do without asking

Configured by the owner, per action class. See [ADR-0006](adr/0006-autonomy-is-a-configurable-policy.md).

| Class | Default |
|---|---|
| **Observe** — read, analyse, search, draft, propose | Always free. The whole nightly engine lives here. |
| **Prepare** — build, stage, write files that are not executed | Free; can be tightened |
| **Act locally** — run a service, execute a script | Approval required; can be loosened |
| **Act outward** — send, post, spend, external accounts | Approval required; per-capability opt-in with a hard limit |

`principles.md` §10's refusals are never settings. Raising a level changes *whether a class must
ask*, never *how long a yes lasts* — there is no always-allow for an individual action.

---

## 5. Install and first run

**One terminal command.** No web installer. The script checks the machine, asks a few
plain-language questions, generates every secret, writes compose with **pinned image tags**, pulls,
starts, waits for health, and prints one URL.

It never asks for anything it can work out itself, never asks a person to invent a secret, never
reports success for a service it did not reach, and on failure names what broke and the exact next
step. It is idempotent and upgradeable.

**Distribution:** this repository is the umbrella — installer, compose, docs, dashboard, design
system. Every module, **Pi included**, is consumed as a pinned GHCR image from its own repository,
so each stays independently forkable and runnable.

> Pi was originally planned to live inside this repository. It ended up in
> [`alexeybe1kin/pi`](https://github.com/alexeybe1kin/pi) instead, because the moment it had a
> `/health` contract, a changelog and a published image it was a module like any other — and a
> single rule ("every module ships its own image, the umbrella composes them") is easier to hold
> than a rule with one exception in it. The installer treats all five identically as a result.

Two further things the installer settled, both visible in
[`docker-compose.yml`](../docker-compose.yml):

- **One Ollama, shared.** Pi thinks with it and Embeddings vectorises with it. The gates' own
  compose files each ran their own, which downloads and stores every model twice for no benefit.
- **The compose file is committed, not generated.** The installer writes `.env` and nothing else;
  versions live in [`versions.env`](../versions.env) and resolve into the compose file. Pinning is
  therefore one legible diff rather than a file that only exists after a script has run — and what
  a stranger reads in the repository is exactly what runs.

**Tailscale is offered, never assumed.** Default binds to localhost and the local network. There is
no public-internet path at all, and the docs say why.

**First run:** a designed welcome that asks nothing · your name, then a password explained in plain
words · name and shape your companion (`Conker` is only the default; voice and appearance drop into
this step at later checkpoints) · a short honest summary of service state.

Then a **guided tour**: one element highlighted at a time, explained in a small dialog pointing at
the real thing on the real screen. Replayable from help, skippable at every step, never blocking the
product, running on real screens with real data — anything illustrative is labelled as an example.

---

## 6. Screens

> Detail, routing and per-screen responsibilities: [`screens.md`](screens.md).

Nine, ordered by how often they are needed.

**The daily loop** — Chat · **Proposals** · Approvals
**Reference** — Memory · Journal
**Control** — Agents · Tools · Jobs · System

Settings and model spend live inside the screens they belong to.

**Proposals is the most important screen in the product.** Each proposal shows what Conker noticed,
the evidence behind it with a path back to the source, what it suggests, and what would happen if
approved. A proposal that cannot answer *"why are you telling me this?"* is not shown.

**Truthful status is a component**, not a convention — one implementation of the eight states, used
everywhere. No green badge from intended configuration. A stale value shows its age. A failed fetch
shows `unknown`, never a stale value silently reused. `empty` and `degraded` look different, because
"nothing yet" and "it failed" are different facts.

One responsive application, not separate desktop and mobile products.

---

## 7. One product, not five

One **design system** — tokens for both themes, layout, components, iconography, the status
vocabulary — defined once and consumed by the only UI. No module defines its own colour or type.

Every module presents identically from outside:

| Ships | Meaning |
|---|---|
| `README.md` | Same sections, same order: what it is · its boundary · run it · configure it · API · status |
| `GET /health` | Identical shape everywhere, so one dashboard renders any module with no special cases |
| `openapi.json` | Generated, never hand-written. This is what a forker swaps against |
| `docker-compose.yml` | Runs standalone for development, composes into the whole for real use |
| `CHANGELOG.md` | Honest versioning, so replacing a module has visible consequences |
| Config & errors | One style, one shape, documented precedence |

**Enforced in CI**, including a lint rule failing the build on a raw hex value or font-family in
application code. A convention nobody checks decays.

**Naming carries information.** `-Gate` marks a controlled boundary. Pi passes through them and does
not take the suffix.

---

## 8. Stack

Python and FastAPI for every service, matching the gates — one backend language, one toolchain.
React for the dashboard. Pi keeps sessions and history in SQLite with WAL; MemoryGate uses
PostgreSQL and a vector index; ToolGate uses SQLite. Docker Compose composes the set. One Ubuntu
server, running 24/7, devices thin.
