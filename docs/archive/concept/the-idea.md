# The Idea

The idea, and what already exists.

> **Part 1 is superseded by [`../philosophy.md`](../../reference/philosophy.md).**
> It remains here as the origin of the project and is still worth reading as that. But it had holes
> big enough to build the wrong product through — no accounting for the attention automation costs,
> no distinction between repetition and waste, no way for memory to be wrong about you and recover,
> and a safety model that only works while the product is weak. `philosophy.md` names each of those
> and answers them. Where the two disagree, that one is current.

---

# Part 1 — The idea

## 1. Why

AI is an opportunity to reclaim time.

Two things cannot be automated, because they live in the owner physically: **the body**
and **knowledge**. They can be optimized, but not delegated. Everything else is overhead.

So: automate every process that can be automated, optimize every process that can't. The
time that comes back goes into developing across many domains — faster, smarter, easier.

> AI can remove wasted time while keeping the same progress. That is the advantage.

Examples of the split:

| Domain | Automatable | Optimizable |
|---|---|---|
| Finances | an AI business company runs it | — |
| Learning | — | an app that knows how to teach fast |
| Gym | — | training plans, nutrition, stats, decisions |

## 2. Why memory

"Automate and optimize everything" is too wide a frame to build on. It is fragile,
because nobody actually knows what it means in practice.

That is the reason for perfect memory. Memory is the record that makes it possible to
notice what is repeated, forgotten, or automatable.

## 3. The engine

```text
everything the owner does and says
        ↓
   memory (as logs, with evidence)
        ↓
   pattern recognition over those logs
        ↓
   automation and optimization proposals
        ↓
   execution
```

The AI triggers itself to look for automation and optimization patterns. Two triggers:

- **Scheduled** — a cron job that runs daily, reads the memory logs, and recognizes
  patterns.
- **Conversational** — while talking, it notices something and raises the idea live.

Triggering on every new memory was considered and rejected: token cost and inefficiency.

## 4. What "the AI automates a process" means

Everything runs live 24/7 on the owner's own server, so the AI can:

- create products and run them on different ports;
- create cron jobs for different work;
- create scripts;
- suggest buying things that help in a specific way;
- and more.

It has no hard ceiling, because it has a full server, AI, and the open web.

## 5. What the Companion is like

It has memory, and access to every tool through ToolGate. Together that gives it full
context over the owner's life, and that context is what makes it useful.

It should:

- know the schedule;
- know everything about the owner, everything around them, and things they don't know yet;
- notify based on what it remembers;
- say what was forgotten;
- deliver the information needed for today;
- help figure things out;
- raise optimization ideas in the middle of ordinary conversation;
- talk like it lives this life alongside the owner;
- remind, notify, and do the work — so the owner can rest knowing it is under control.

## 6. Where it runs

One self-hosted Ubuntu server. Everything on it, running live 24/7.

```text
Ubuntu server (self-hosted)
├── harness            — connects AI providers to the owner's software
├── AI providers       — free open models, paid models, OpenRouter
├── MemoryGate         — memory
├── ToolGate           — tools, secrets, policy, execution
├── SystemGate         — read-only machine telemetry
├── domain products    — connected as tools via ToolGate
└── dashboard          — served from the box
        ↑
     Tailscale
        ↑
  the owner's devices  (thin — the server does the work)
```

All ports and projects the owner runs connect to the Companion as tools, through ToolGate.

Heavy features run server-side, not on the device: face expression recognition, voice
expression recognition, real-time 3D model animation, voices, and more.

## 7. The dashboard

The dashboard holds the AI and its sessions. There is no plan to use any other AI client,
because this one has every provider the owner uses plus MemoryGate, ToolGate, and the rest.

Every session inside it becomes memory.

It is beautiful UI and functionality, for comfort, available on every device.

### What it contains

- chats
- memory
- tools
- skills
- system info
- terminal access
- safety checks
- agents
- flows
- runtime
- cron jobs
- settings
- **suggestions** — what the AI proposes for automation or optimization
- **agent templates** — skills, allowed tools, `soul.md`, and more
- **agent group templates** — a group of agents with shared skills, tools, and specific
  routing built for one task (for example, a SaaS-builder agent team)
- chat groups

### Agents

Each agent carries its own: personality · appearance · talking style · knowledge · tool
access · 3D model · 2D emotion pack (chibi style preferred) · voice — and more.

### Chat and call features

- **Read aloud** — in the current agent's voice.
- **Voice call** — real-time conversation, hearing the agent's voice.
- **Video call** — the AI reads facial expression and voice expression to understand the
  owner's emotion. The 3D model idles, blinks, breathes, shifts slightly, and talks, with
  body movement and facial expression driven by context. It should feel real.
- **Group calls** — several agents together in one voice or video call, each with their
  own appearance.
- **Models** — free open models, paid models, OpenRouter integration, money and token
  spend tracking.

## 8. Requirements

- Clean, super-performant architecture. Independent, replaceable components.
- Self-hosted, owner-controlled, private network access only.

---

# Part 2 — What already exists

## Built and running

Three services, already built, under `alexeybe1kin`. Private until their blocking security
defects are fixed; public after that.

### MemoryGate

Local-first memory service. FastAPI, PostgreSQL, Qdrant. Last pushed 2026-08-23.

- Layers: **Evidence** (immutable raw input) → **Analysis** (recorded interpretation) →
  **Memory / Entity / Episode** (durable, retrievable), with lineage preserved throughout.
- PostgreSQL is the source of truth. Qdrant is the semantic vector index.
- Embeddings: `sentence-transformers/all-MiniLM-L6-v2`, 384 dimensions. Lexical matching
  supplements vector search so exact names aren't lost to similarity ranking.
- Returns a bounded context package — agents never touch the database directly.
- Separate scoped agent read keys; admin keys hashed PBKDF2-SHA256; listener ingestion
  uses its own secret. LLMs get no write, delete, shell, or tool capability.

```text
memorygate/
├── README.md
├── docker-compose.yml
├── services/
│   ├── api/
│   │   ├── app/
│   │   │   ├── core/
│   │   │   ├── models/
│   │   │   ├── routes/
│   │   │   ├── schemas/
│   │   │   └── services/
│   │   └── tests/
│   ├── cli/
│   └── mcp/
├── dashboard/
│   ├── public/
│   └── src/
│       ├── components/
│       ├── context/
│       ├── lib/
│       └── screens/
├── integrations/
│   ├── agent-skill/
│   └── mcp/
└── docs/
    └── screenshots/
```

### ToolGate

Local single-owner control plane for agent capabilities. Python, FastAPI, SQLite, React +
Vite dashboard. Last pushed 2026-08-23.

- Objects: **Service** (provider identity, secrets, destination policy) · **Tool** (one
  atomic typed operation; tools cannot orchestrate other tools) · **Automation** (versioned
  deterministic workflow) · **Request** (owner-reviewable decision).
- Per-tool policy — approval is required only where configured.
- Rotatable agent execution keys with explicit `tool:*` / `automation:*` scopes. Vault
  values are write-only; there is no API to reveal them.
- Deterministic input validation; rate, cooldown, runtime, destination, and size ceilings.
- Sensitive actions bind approval to exact object, version, argument digest, nonce, and
  expiry; consumed atomically once. Replays fail closed.
- Signed verification callbacks: HMAC-SHA256, 60-second window, per-request nonce.
- Lockdown mode. Redacted audit trail.
- **stdio MCP bridge** exposing active tools as native MCP tools.

```text
toolgate/
├── README.md
├── toolgate/
│   ├── api/         FastAPI owner + agent API, executors, automation runtime
│   ├── core/        SQLite control plane, policy, vault, planner, research adapters
│   ├── cli/         stdlib agent CLI for scoped execution keys
│   ├── mcp/         stdio MCP bridge
│   ├── searxng/
│   ├── scripts/     live verification utilities
│   └── tests/
├── dashboard/
│   ├── public/
│   └── src/
│       ├── components/
│       ├── context/
│       ├── lib/
│       └── screens/
├── integrations/
│   └── mcp/
└── docs/
    └── screenshots/
```

### SystemGate

Read-only local telemetry API. Python. Port 8040, loopback-bound. Last pushed 2026-08-23.

- Endpoints: `/health` `/vitals` `/containers` `/processes` `/logs/errors` `/packages`
  `/backups`
- No write, exec, shell, restart, install, file-edit, or Docker mutation endpoints.
- Admin-key auth on every endpoint except `/health`; PBKDF2 key storage.
- Docker socket, `/proc`, and backup directory all mounted read-only. Bounded outputs.

```text
systemgate/
├── README.md
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── .env.example
├── systemgate/
└── tests/
```

## Documented

### The idea archive

`C:\Users\The1a\Documents\Ideas\` — 24 idea documents plus the master map, and reference
images. 6,754 lines total.

```text
Documents/Ideas/
├── 00 - AgentGate Universal Domain Map.md          1039   master index
│
├── better.io.md                                      59
├── Study Companion and Classroom Memory App.md      317
├── Financial Command Center.md                      412
├── BodyMan Fitness App.md                           302
├── Cooking Skill Intuition Coach.md                 191
├── Smart Social App.md                              289
├── Smart FYP.md                                     258
├── AI Social Manager Wingman and Language Coach.md  184
├── Public Presence and Identity Manager.md          324
├── Human Systems Lab.md                             679
├── Personality Development App.md                   386
├── Ripeix Music App.md                              481
├── Security and Exposure Command Center.md          256
│
├── AgentGate Companion Service Identity.md          318
├── AgentGate Collaborative Calls and People Graph.md 26
├── Conker Spatial Presence.md                       187
├── Personal Behavior and Context Wearable.md        120
├── Opportunity Radar.md                               3
├── Skeptical Ideas.md                               122
│
├── Forge Physical Invention App.md                  165
├── Leisure Recovery and Hobbies Hub.md              261
├── Muse Relaxation and Creative Life App.md           9
├── PolyDub AI Media Localization Business.md        301
├── Wayfinder Travel and Mobility App.md              65
│
└── assets/
    ├── agentgate-focus-presence/
    └── ai-social-companions/
```

### The Universal Domain Map

`00 - AgentGate Universal Domain Map.md` consolidates that archive into eight domain
products:

| Domain | Owns |
|---|---|
| **better.io** | Personal operations and learning |
| **CapitalOS** | Business, money, markets |
| **BodyMan** | Body, health, performance |
| **ChefSense** | Cooking, food, culinary skill |
| **SocialOS** | People, communication, discovery, presence |
| **HumanLab** | Personality, habits, personal experiments |
| **Ripeix** | Music, listening, vocal performance |
| **Guardian** | Security, privacy, exposure |

Each owns its own truth. None edits another's database. They connect to the Companion as
tools via ToolGate.

The map also names universal capabilities that must not become apps — Companion service
identity · native calls and presence · focus and perception · SenseBridge device layer ·
Opportunity Radar · Live Reality Briefing · Journal and attention — and gives a universal
domain contract plus a final ownership rule for classifying new ideas.

### This repository

```text
dev/companion/          (local dir; repo is alexeybe1kin/conker)
├── CLAUDE.md
├── docs/
│   ├── concept/
│   │   ├── the-idea.md        this document
│   │   ├── vision.md          prior concept notes
│   │   ├── features.md        prior concept notes
│   │   └── principles.md      prior concept notes
│   └── agents/
│       ├── issue-tracker.md   GitHub issues, sub-issues, dependencies
│       └── domain.md          single-context
└── .gitignore
```

## Infrastructure

- Self-hosted Ubuntu server, running 24/7.
- Tailscale for device access.
- `github.com/alexeybe1kin/conker` — this repository, private. Renamed from `companion`;
  GitHub redirects the old URL.
- A previous prototype, `agentgate`, kept locally in
  `C:\Users\The1a\agentgate-work`. Abandoned; reference only,
  not carried forward and not published.
