# Vision

> **Status: early concept notes, partly superseded.**
> Written before [`the-idea.md`](the-idea.md), which is now the primary source. Where the two
> disagree, `the-idea.md` wins, and resolved decision tickets win over both.
>
> Two things on this page were wrong and are corrected below: the product **is** named
> (**Conker**), and MemoryGate / ToolGate / SystemGate **are** carried forward as the built
> foundation. The clean-slate rule applies to the abandoned `agentgate` prototype only.

---

## The idea in one sentence

**Conker** is a **self-hosted personal AI companion and control plane** that connects one person to
their digital life: applications, agents, tools, memories, and ongoing work.

Forkable, customizable, installable by other people on their own machines — especially
clean Ubuntu servers. Not a chatbot, not a dashboard, not a memory database, not a pile
of disconnected agents.

**Single-tenant per install, distributable to many installers.** These are not in tension, and
earlier notes read as if they were. One Conker serves one owner. Anyone may run their own.
The repository is meant to be public, forkable and pleasant to use — see the quality bar on
the map.

`Conker` is also the default name of the Companion itself. Both are owner-changeable.

## The experience

The owner talks to **one Companion**. Specialist agents may work behind the scenes, but
the Companion stays the coherent relationship and interface. The owner should never have
to operate twenty independent AI tools.

The Companion can understand goals and priorities, remember context with evidence,
ask specialist apps for authoritative answers, coordinate work, notice important events,
reach out when something deserves attention, prepare actions and drafts, ask approval
before anything risky, and explain what happened and what source supports it.

```text
Owner
  ↓
Companion
  ↓
Context, priorities, routing, attention, approvals
  ↓
Domain apps + agents + services
  ↓
Memory / Action / Observation boundaries + external connectors
```

## The four human-facing questions

The whole architecture reduces to four:

| Human need | System responsibility |
|---|---|
| **Know me** | Memory boundary — scoped, evidence-backed context |
| **Help me act** | Action boundary — approval, execution, audit |
| **Understand my environment** | Observation boundary — read-only truth about machines |
| **Talk to me and coordinate everything** | Companion + runtime |

The product should mostly *feel* like one Companion. These boundaries are architecture and
security concepts, not products the owner manages.

> **Corrected.** An earlier draft said these names were "not carried forward". That was wrong.
> **MemoryGate, ToolGate and SystemGate are built, running, public, and are Conker's foundation.**
> They are inherited as working assets but **not frozen**: where a real architectural problem is
> found, fixing or replacing the component is in scope. A fourth component, **Pi**, is being built
> in-house to run agent turns, sessions, jobs and model routing.

## The ownership rule

> The universal layer owns the relationship and coordination. Each domain app owns its
> own specialized truth. The memory boundary controls what is remembered. The action
> boundary controls what can happen. The observation boundary reports what is observed.

The universal layer must **not** become the database for every specialized product. A
fitness app owns fitness truth. A study app owns course truth. A music app owns listening
data. The Companion asks them for scoped information and coordinates their work.

## What the universal layer owns

Owner identity and Companion relationship · conversations and continuity · goals,
priorities, constraints, attention policy · registry of agents, teams, skills, flows, apps ·
context assembly and cross-domain routing · Focus Sessions · jobs, notifications,
escalation · approval presentation · cross-app decisions · Companion journal and proactive
briefings · audit access and truthful status · presentation adapters (text, desktop,
mobile, calls, future avatar).

## Capability vs. mode vs. app

```text
Capability = something the Companion can do anywhere
Mode       = how it helps right now
Domain app = specialized knowledge and data
```

"Help me study while looking at a browser" is a Focus Session plus a teaching skill — not
proof that the core needs a study-only screen. A domain app earns its place when it owns
specialized records and workflows.
