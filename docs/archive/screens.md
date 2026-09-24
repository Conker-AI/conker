# Screens, navigation, and who may do what

The full surface of Conker: how it is divided, how you move through it, and what each screen is
responsible for. [`architecture.md`](architecture.md) §6 names the nine screens; this is the
detail.

**Status: proposed.** Nothing here is settled until it is argued over. The permission model in §1 is
a proposed change to [ADR-0006](../adr/0006-autonomy-is-a-configurable-policy.md) and needs its own ADR
before anything is built on it.

Only a slice ships in C1 — see [`roadmap.md`](roadmap.md). The whole map exists now because
navigation decided for three screens is navigation that breaks at nine.

---

## 1. Permission: three layers, not one dial

Today the model conflates two different questions into one approval prompt. Splitting them is the
change.

| Layer | Question it answers | Belongs to | Set by |
|---|---|---|---|
| **Scope** | May this agent address this tool *at all*? | the execution key | the owner, per agent |
| **Sensitivity** | How consequential is this tool? | **the tool** | whoever defines the tool |
| **Autonomy** | How far may this agent act *without asking*? | **the agent** | the owner, per agent |

The rule is one line:

```
out of scope          → refused outright. Not a question; the agent cannot address it.
sensitivity ≤ autonomy → runs, and is recorded.
sensitivity > autonomy → an approval request bound to that exact invocation.
```

**Sensitivity is the existing ADR-0006 ladder**, moved onto the tool where it belongs:
`observe` → `prepare` → `act locally` → `act outward`. That ADR always described consequence; it
just never said which tool sat where, so in practice everything asked.

### Why two rates rather than one

- They are genuinely different facts. *"What could this do to my life"* is a property of the tool
  and never changes. *"How much do I trust this thing to act alone"* is about the agent and changes
  often.
- **Adding a tool stops re-opening every trust decision.** A new `observe`-class tool is
  immediately usable by an agent already trusted to observe. One dial forces a fresh judgement each
  time, which is how permission systems become noise.
- **It scales to more than one agent** — sub-agents, scheduled jobs, a future team — each with its
  own autonomy over the same tool catalogue. One dial would need the whole catalogue re-configured
  per agent.

### Why this removes the need for "always allow"

Every shipped product surveyed offers one: Higgsfield has *Always allow*, Cofounder has *Decide
all*. They exist because approve-fatigue is real, and they are why
[ADR-0006](../adr/0006-autonomy-is-a-configurable-policy.md) forbids them — a boundary that gets
clicked away has stopped being a boundary.

Two rates give the honest version of the same relief. When a class of action asks too often, the
owner raises **autonomy** — a visible, named, revocable setting on a screen, reviewed whenever they
like. What they must never do is spend a *nonce* that silently widens into a standing permission.

> **The line ADR-0006 draws, unchanged:** raising a level changes *whether a class must ask*, never
> *how long a single yes lasts*. There is still no always-allow for an individual action.

`act outward` keeps its asymmetry: never a toggle, per-capability confirmation, a hard limit, a
permanent indicator. Local mistakes are recoverable; sent messages and spent money are not.

**Open question for the ADR:** whether `act outward` may ever be inside an agent's autonomy at all,
or whether it always asks regardless of the dial. The safe answer is *always asks*; the honest
question is whether an owner who has said "yes, post to my own blog, up to 3 times a day" is being
served by being asked the fourth time.

---

## 2. Navigation

**A persistent left sidebar, three groups, in frequency order.** The grouping is the information
architecture, not decoration: it says which screens are for living with Conker and which are for
governing it.

```
The daily loop     Chat · Inbox
Reference          Memory · Journal
Control            Agents · Tools · Jobs · System
```

**Eight screens, plus first-run setup outside the shell.** Proposals and approvals are one Inbox
with two kinds — both are "Conker wants something from you", and one place to check beats two habits.

- **Chat is the default route.** Opening Conker puts you in conversation, not on a dashboard.
- **The Inbox carries a count** — it is the one thing that makes a claim on your attention, and an
  approval nobody sees is an action that silently never happens.
- **Settings has no top-level entry.** Model spend lives in Agents, backups in System, appearance in
  a menu under the owner's name. A settings screen is where features go when nobody decided where
  they belong.
- **One responsive application.** On narrow screens the sidebar collapses to a sheet; the routes and
  the hierarchy do not change.

### Routes

| Route | Screen | Notes |
|---|---|---|
| `/` | Chat | redirects to the most recent open session |
| `/chat/:sessionId` | Chat | a fork is a different session, and the URL says so |
| `/inbox` · `/inbox/:id` | Inbox | proposals and approval-requests; `:id` deep-links from a notification |
| `/memory` · `/memory/:id` | Memory | `:id` is a memory, with its evidence |
| `/journal` | Journal | filtered by date and actor |
| `/agents` · `/agents/:id` | Agents | autonomy lives here |
| `/tools` · `/tools/:id` | Tools | sensitivity and scope live here |
| `/jobs` · `/jobs/:id` | Jobs | |
| `/system` | System | |
| `/setup` | First run | **outside the app shell** — no sidebar, its own layout |

**Two layouts, not one.** First-run setup has no navigation because there is nowhere else to go yet;
smuggling it into the shell would show a sidebar full of things that do not work.

---

## 3. The screens

Each says what it is *for* — the question a person arrives with — then what it holds. A feature that
does not serve the question belongs on another screen.

### Chat — *"talk to it"*

The default, and the only screen most days.

- The thread: message history, streaming reply, stop.
- **Tool activity renders inline as cards**, not as prose claiming an action happened. Each shows
  the tool, the arguments, the outcome, and expands for detail. This is the
  [Zapier Central](https://mobbin.com/screens/cb65c41e-e7b6-4bd9-af40-cd92d768e90d) pattern and it
  is right: an action is an event in the conversation, not a sentence about one.
- **A parked turn is a card in the thread**, not a modal. It says what is waiting and links to the
  approval. The conversation stays readable while it waits.
- **`acted_no_reply` is visible as itself** — the action ran, the answer did not arrive, and a
  button asks only for the reply. Pi already models this; the UI must not flatten it to "failed".
- Session list, search, fork, and the parent link on a forked session.
- Which model answered, and what the turn cost, available but not shouted.

**Never:** a modal that blocks the conversation to ask something. **Never:** claiming an action
succeeded because the model said so — the card reports what ToolGate reported.

### Proposals — *"what did you notice?"*

The most important screen in the product, and the one that justifies the memory.

- What Conker noticed · the evidence, each item linking back to its source · what it suggests ·
  **what would happen if approved**, concretely.
- Accept, decline, or ask about it — declining is an answer and is remembered as one.
- **A proposal that cannot answer "why are you telling me this?" is not shown.**

### Approvals — *"is this alright?"*

One queue, across every session and every agent.

- Each request: which agent, which tool, the **exact arguments**, why it is being asked (which
  sensitivity, against which autonomy), and when it expires.
- **Show the delta, not just the ask.** [Devin's permission
  screen](https://mobbin.com/screens/7b19cb77-7bc3-4e96-9f3a-9ea0b488211d) is the model — *"was
  read-only"* next to the new grant. What is *changing* is the thing a person can judge.
- Approve, deny, or **raise the agent's autonomy instead** — an honest escape from fatigue that
  lands on the Agents screen as a visible setting rather than a spent nonce.
- Expired and consumed requests stay visible. A replay fails closed and says so.

**Never:** "always allow". **Never:** a bare tool id with no argument detail.

### Memory — *"what do you know about me?"*

- Search by meaning and by word; the honest failure when semantic search is degraded, with the
  lexical fallback labelled as such.
- Every memory shows its **evidence and lineage** — which messages produced it, with a path back.
- Correct it, or forget it. Forgetting is real and is itself recorded.

### Journal — *"what happened?"*

Everything Conker did, in order. Turns, actions, approvals, jobs, forks, failures — filterable by
actor and date. The audit trail as a readable surface rather than a log file.

### Agents — *"how much do I trust it?"*

Where **autonomy** lives.

- Each agent: its autonomy level, its scope, what it has done recently, what it costs.
- Raising autonomy is deliberate: it says plainly which tools that newly covers, and `act outward`
  is never a toggle.
- Model routing and spend, because that is a property of the agent.

### Tools — *"what can it do?"*

Where **sensitivity** and **scope** live. The catalogue as ToolGate sees it — never as Conker
remembers it.

- Each tool: what it does, its arguments, its **sensitivity**, which agents are scoped to it, and
  its recent use.
- Changing sensitivity is a governance act and is journalled.
- Unreachable ToolGate shows `unavailable` here, not an empty list — an empty catalogue and a
  broken connection are different facts.

### Jobs — *"what runs on its own?"*

Scheduled and background work: the nightly analysis, watermarks, last run, next run, what it
produced. Pause and run-now.

### System — *"is the machine alright?"*

Per-service health in the module contract's own vocabulary, host vitals, the backup location
(named, and checkable), image versions and what an update would change.

---

## 4. What is settled here, and what is not

**Settled unless argued down:** the sidebar and its three groups · Chat as the default route ·
setup outside the shell · tool activity inline in the thread · one approvals queue across sessions ·
sensitivity on the tool and autonomy on the agent.

**Resolved 2026-09-12:** Proposals and Approvals are **one Inbox** with two kinds. Journal is **its
own screen**. Autonomy is not a dial — it is **standing grants** with bounds, budget and expiry
(open-issues A7/A12); the Agents screen shows those grants, the Tools screen shows each tool's
sensitivity (A6). `act outward` inside a grant stays open (A3) and is a policy question, not a screen
one.

**Still open:** what the first-run steps ask for, in what order — decided when that screen is built.

Each screen gets an issue for the feature conversation. The issue is where a decision lands; it is
not where the screen gets designed.
