# Philosophy

What Conker is for, what it must never become, and how to tell whether it is working.

This supersedes Part 1 of [`concept/the-idea.md`](../archive/concept/the-idea.md) as the statement of intent.
That document remains as the origin — this one is what the architecture answers to.

It exists because the original framing had holes big enough to build the wrong product through, and
they are named here rather than quietly patched.

---

## 1. The goal, unchanged

**Reclaim time.**

Two things cannot be delegated, because they live in you physically: **your body** and **your
knowledge**. They can be optimised, never handed off. Everything else is overhead.

So: automate what can be automated, optimise what cannot, and put the returned time into growing
across many domains at once.

That is still the point. What follows is the accounting that was missing under it.

---

## 2. Time is the goal. Attention is the currency.

The original premise assumed automation returns time. Often it does not, because **supervising an
automation is itself work**, and Conker's own design guarantees that work: proposals to read,
approvals to weigh, mistakes to notice.

A system that saves an hour of doing and costs an hour of watching has returned nothing.

So the ledger has two sides:

| | |
|---|---|
| **Returned** | time you did not spend doing the thing |
| **Spent** | time reading proposals, judging approvals, correcting mistakes, wondering what it did |

**Conker is worth running only when the first exceeds the second**, and it must be able to show you
roughly which side it is on. Not precisely — precision here is fake — but honestly enough that you
could decide to switch it off.

### What this makes true

- **Every prompt is a withdrawal.** An approval, a proposal, a notification — each spends the
  scarce thing. The system must be stingy with them by design, not apologetic about them in the UI.
- **A proposal that costs more to evaluate than the work it saves is a bug**, even when it is
  correct.
- **Silence is a feature.** A day where Conker does its work and says nothing is a good day.

> **Rule:** Conker must never be the reason you are busy.

---

## 3. Repetition is detectable. Waste is a judgement.

The original loop said memory makes it possible to notice what is *repeated, forgotten, or
automatable*, and treated that as sufficient. It is not.

Repetition is trivial to find — a log and a query does it, no AI required. The valuable question is
which repetitions are **waste** and which are **ritual you value**. You make coffee every morning:
repeated, automatable, and automating it would make your life worse. Nothing in the data
distinguishes them, because the difference is not in the data.

**Only you can label waste.** So the label is the product's most valuable asset, and collecting it
is a first-class job rather than a side effect.

### The loop, corrected

```
what you do and say
        ↓
   evidence, with lineage
        ↓
   patterns  ──────────────┐
        ↓                  │
   proposals               │
        ↓                  │
   your judgement ─────────┘   ← accept · decline · "never suggest this again"
        ↓                       returns as a PREFERENCE, not just an outcome
   execution
        ↓
   new evidence
```

The edge the original diagram was missing is the one going **back**. A decline is not a failure to
be retried later; it is the most informative thing you ever tell it. A system that proposes the same
declined thing twice has learned nothing and has spent your attention twice.

**Consequence:** Conker should get quieter and more accurate over months. If it does not, the loop
is broken, and that is measurable.

---

## 4. It must know how well it knows you

`principles.md` §1 demands truthful status about *system* state — never a green badge from intended
configuration. That rigour stops at the machine. It has to extend to **what Conker believes about
you**, because being wrong about a container is an incident, and being wrong about you is the
product failing at its only job.

Every belief carries:

| | |
|---|---|
| **Confidence** | said once in passing, or established over months |
| **Age** | when the evidence for it was gathered |
| **Provenance** | which evidence, reachable |
| **Status** | current · stale · **contradicted** · **superseded** |

**People change, so memory must be able to be wrong about you and recover.** New evidence that
disagrees with an old belief does not overwrite it — history stays append-only — it **supersedes**
it, and both remain visible with the change recorded. "You used to prefer X; since March you prefer
Y" is a thing it should be able to say.

And it must be able to say **"I do not know you well enough for this."** A companion that guesses
confidently about your life is worse than one that admits the gap.

---

## 5. Safety is five layers. Approval is the last one, not the only one.

The original model put approval at the centre. That breaks exactly where the product gets good: a
Conker that genuinely runs things takes hundreds of actions, individual approval becomes impossible,
bulk approval is a blank cheque, and so you raise autonomy — at which point the boundary is
decoration.

**A safety model that only works while the product is weak is not a safety model.**

Ordered by when they act:

1. **Capability** — it cannot touch what it has no key for. Scope, per agent. *(built)*
2. **Blast radius** — budgets, rate ceilings, destination allowlists, sandboxes, spend caps. Limits
   *how bad it can get*, never *whether it may*. *(largely missing)*
3. **Reversibility** — prefer actions that can be undone; where undo is cheap, act and offer undo
   instead of asking first. This **spends no attention unless something goes wrong**. *(missing)*
4. **Approval** — for what cannot be undone. Bound to the exact action, consumed once. *(built,
   and well)*
5. **Detection** — patterns over the record: denial spikes, provenance mismatches, dangerous
   requests clustering after untrusted content was read. With teeth — automatic lockdown. *(missing;
   lockdown exists and almost nothing triggers it)*

### The invariant that replaces "ask more"

> **Autonomy and blast radius move in opposite directions.**
> Every increase in what Conker may do unasked must be paid for by a tighter bound on how far wrong
> it can go.

That is what makes high autonomy survivable, and it is why layers 2, 3 and 5 are not nice-to-haves —
they are the *price* of the product ever being genuinely useful.

**Layer 4 remains the only place a human is required**, which is precisely why it must stay rare.

---

## 6. The engine is general. The domains are yours.

The original asserted both "the universal layer" and "built around who I am". Those pull opposite
ways in every decision, and holding both is how a project stops shipping.

The resolution:

| | |
|---|---|
| **General, and the actual product** | the memory loop · the action boundary · truthful status · belief revision · the safety layers · the dashboard |
| **Specific, and yours** | which domains exist, what you care about, your taste, your routines |
| **The seam** | **the domain contract** — how any specialised area of a life plugs in |

Your eight domains — better.io, CapitalOS, BodyMan, ChefSense, SocialOS, HumanLab, Ripeix, Guardian
— are *not* the product. They are the first eight things the product is asked to build. Someone else
forks Conker and has different ones, and **the fork should be easy because the seam is a real
contract**, not because the engine tried to anticipate their life.

This also demotes something. **Machine telemetry is a domain, not a pillar.** SystemGate became one
of four boundaries because it already existed, not because observing CPU is foundational to a life
engine. Reading the machine is a tool, like reading a calendar.

> **The domain contract is the most important interface in the product**, and it barely exists. It
> matters more than any screen: it is what makes Conker a platform for a life rather than an
> application for one person's.

---

## 7. Sovereignty and confidentiality are different promises

The original said "no public internet path at all" and let that carry a privacy claim. It does not.
Binding to localhost is about **who can reach in**. Privacy is about **what goes out** — and the
moment a hosted model answers a turn, that turn has left the machine.

Stated separately and honestly:

**Sovereignty — absolute.** It runs on hardware you own. Nothing can revoke it, price it up, or
discontinue it. Unplug the network and it still works, with local models. Your data is in your
filesystem. This is the promise that holds unconditionally.

**Confidentiality — conditional, and visible.** Local model: nothing leaves. Hosted model: that
conversation goes to that provider. Both are legitimate; the requirement is that **you can always
see which one just happened**, per turn, without going looking.

A companion that quietly routes your private life to a third party because the local model was slow
is the exact failure this product exists to avoid.

---

## 8. What happens when it is wrong about you

Not "if". Nothing in the original addressed this, and for a life engine it is the failure that
matters most.

- **You can audit what it believes.** Memory is browsable, not just retrievable — with confidence,
  age and provenance, so you can see *why* it thinks something.
- **You can correct and forget.** Both are real operations, and both are recorded — a forgetting
  that leaves no trace is its own kind of dishonesty.
- **You can reconstruct any decision.** History is append-only and every action is journalled, so
  "why did it do that in March" always has an answer. **This is the recovery mechanism**: trust is
  rebuilt by being able to check, not by being asked to believe.
- **A bad approval is recoverable where physics allows** — which is another argument for
  reversibility-first (§5.3), and an honest admission that some things are not.

---

## 9. How to tell whether it is working

The product should be able to answer these. If it cannot, it is not honest yet.

1. Is it returning more attention than it costs? *(§2)*
2. Is it getting quieter and more accurate over months? *(§3)*
3. How much of what it believes about you is stale, contradicted, or low-confidence? *(§4)*
4. How often does it ask, and is that trending down as autonomy rises — with blast radius trending
   tighter? *(§5)*
5. What fraction of your conversations left the machine? *(§7)*

**None of these are currently measured.** For a project whose first principle is truthful status,
not measuring itself is the largest inconsistency remaining.

---

## 10. What is promised, and what is not

Two standards were being held at once — *"quality is the deliverable, it outranks speed"* alongside
*"open source, I promise no high quality"*. Split them:

**Promised, non-negotiable** — because forks depend on them: the contracts. `/health`, the domain
contract, the action boundary's guarantees, append-only history, truthful status, and the honesty of
the record. These are the parts someone else builds on, and they are held to the bar.

**Not promised** — completeness, polish, that your particular domains work for anyone else, or that
any of it is finished. It is one person's life engine, built in the open, and forking it is expected
to involve work.

---

## 11. What Conker must never become

- **A reason you are busy.** *(§2)*
- **Confidently wrong about you.** Better to admit the gap. *(§4)*
- **Safe only because it is weak.** *(§5)*
- **A generic agent framework.** The memory of one life is the entire point.
- **Quietly routing your life to a third party.** *(§7)*
- **Something you cannot check.** If the record can be doubted, nothing above survives.
