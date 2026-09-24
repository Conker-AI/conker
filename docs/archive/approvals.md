# Approvals

The hardest screen in Conker, and the one the whole safety story rests on. This is thinking, not a
spec — where it disagrees with what is built, it says so.

---

## 0. The only failure mode that matters

**The owner stops reading.**

Everything else is secondary. A boundary that is clicked through without being read is worse than no
boundary, because it manufactures confidence that nothing is checking, and it launders
responsibility onto the person who "approved" it.

So the design question is not *"how do we present an approval nicely"*. It is:

> **How does the owner still genuinely read these in month six?**

Every decision below is judged against that. It has an uncomfortable consequence: **most of the work
is in not asking**, and presentation is a distant second. You cannot design your way out of volume.
Habituation is a property of repetition, not of layout. If Conker asks forty times a day, no card is
beautiful enough to survive week two.

---

## 1. What is already built, and is right

Verified in `toolgate/core/control_plane.py`. This part is genuinely well made and should not be
touched:

- The binding covers **subject type, subject id, version, a canonical SHA-256 of the arguments, and
  a nonce**. Approving one action cannot approve a different one.
- `consume_verification` runs in `BEGIN IMMEDIATE`, checks status, checks the **originating agent**,
  checks not-consumed, checks not-expired, compares the digest with `secrets.compare_digest`, and
  marks consumption inside the same transaction. Replay fails closed. Pi has a live test for it.
- **ToolGate authors the approval text; the requesting agent does not.** This matters more than it
  looks. If Pi could write the prompt describing Pi's own request, a confused or manipulated model
  would author both the action *and* its description — the classic confused-deputy setup. ToolGate
  writing it is the correct architecture.

---

## 2. Three findings that need changing

### 2.1 The expiry clock is on the wrong event

```python
expiry_seconds: int = 60
expiry = now + timedelta(seconds=max(15, min(expiry_seconds, 900)))
```

Set at **creation**. Default 60 seconds, hard maximum 15 minutes.

That is the right model for *interactive step-up verification* — "confirm this payment now", where a
short window is itself the security property. It is the wrong model for Conker, because **Conker's
owner is asynchronous**. They are not at the screen. They check in the evening.

Consequence today: essentially every approval expires before it is seen. The action silently never
happens — the exact failure this project already refuses to accept elsewhere.

**Ask what expiry is actually protecting against.** Not stale meaning (that varies by action, and is
better handled by re-digesting). Not a remote phishing window (there is no public internet path).
The real risk is this: **a granted-but-unspent approval is a live capability sitting around waiting
to be fired.** A compromised agent that could bank a stack of them has a stack of blank cheques.

The risk window therefore starts at **approval**, not at **request**. So:

| Clock | Runs from | Length | Why |
|---|---|---|---|
| **Time to decide** | request created | long — hours, or until the owner acts | Nothing is granted yet. A pending request is inert. |
| **Time to spend** | owner approves | short — seconds to minutes | The nonce is live. This is the only dangerous interval. |

This is not a weakening. Today a request approved at second 5 has 55 seconds to spend and one
approved at second 59 has one second — incoherent, and secure only by accident. Two clocks make both
bounds explicit and correct, and they let the owner be a human being with a life.

### 2.2 The prompt says nothing that varies

ToolGate writes the right thing from the right place, but writes:

> **Run Approval Test Echo** — *Owner confirmation is required for this exact immutable tool
> invocation.*

That sentence is identical for every invocation of that tool, forever. The arguments — the only part
that differs, and the only part the owner is actually being asked to judge — are in the payload,
not in what they read.

**The owner is not deciding "is sending email acceptable".** That is the autonomy setting, decided
once, elsewhere. They are deciding **"is *this* the right action, right now, with *these*
arguments"**. The interface must therefore lead with what varies and de-emphasise what does not.

**Tools should declare how to describe themselves** — a render template alongside `name`,
`description` and `inputs`:

```
"Send an email to {to}, subject “{subject}”"
```

ToolGate fills it from the *same* argument object the digest covers. Deterministic, no model in the
loop, and still un-spoofable by the requester. A model-written summary must never be the thing the
owner reads, because a model that is wrong about the action will be wrong about the summary in the
same direction.

### 2.3 Nothing distinguishes one tool's danger from another's

Tools carry `name`, `description`, `inputs`. No sensitivity, no reversibility. So every gated tool
asks with equal weight, and reading a file interrupts as loudly as spending money. That is a direct
cause of fatigue, and it is what [`screens.md`](screens.md) §1 proposes to fix by putting
**sensitivity on the tool**.

Worth stating precisely: **sensitivity is consequence × irreversibility.** `act outward` ranks
highest not because sending is complicated but because it cannot be taken back.

---

## 3. Provenance: the injection detector

Not in any product surveyed, and it may be the most valuable single element.

Conker reads the world — web pages, emails, files. Any of that can contain text aimed at the model.
The approval is the last line of defence, and the owner can only exercise it if they can see
**why this is being asked**.

So an approval shows the originating intent — the owner's own words that started the turn:

> You asked: *"summarise today's emails"*
> Conker wants to: **delete 47 files in /home/alexey**

The mismatch is glaring, and it is glaring *without the owner needing to understand the tool*. When
intent and action match, the request reads as unremarkable and costs no attention. When they do not,
it is obvious to anyone. That asymmetry is exactly what an attention-preserving design needs.

---

## 4. Reversibility: sometimes do not ask at all

A pre-approval prompt spends attention *before* anything happens. An undo window spends none unless
something goes wrong.

For an action that is genuinely reversible and cheap to reverse, **act-then-undo beats
ask-then-act**. Gmail's undo-send is the canonical case: nobody would tolerate confirming every
email, and nobody needs to.

This is not a loophole in the boundary. It is a recognition that the boundary exists to prevent
*irreversible* harm, so where harm is reversible the boundary can be placed after the action instead
of before it — and the owner's attention is preserved for the cases that actually need it.

It also means reversibility is not a separate axis. It is *part of* sensitivity, which is why §2.3
defines sensitivity as consequence × irreversibility.

---

## 5. Denial is evidence

Deny is an answer, not an error. Pi already feeds refusals back to the model as observations, never
retried with the guard removed. Two things should follow that are not built:

- **A denial is recorded as a judgement**, with an optional reason, and is visible in the journal.
- **Repeated denial should stop the question being asked.** If the owner denies the same shape of
  action three times, Conker asking a fourth time is not diligence, it is noise — and noise is what
  destroys reading. The right response is to *offer to make it a rule*: narrow the scope, which is a
  policy change on a screen, visible and revocable.

Which is the same principle as the escape from fatigue in general: **the way out is always a policy
change, never a spent nonce.**

---

## 6. Batches, plans, and retries

**Batches.** Asking eight times for eight actions is fatigue; asking once for "eight things" is a
blank cheque. The honest middle is one request, **itemised**, each item individually legible and
individually deniable, with the binding digest computed over the *whole set* — so approving eight
cannot let nine run. This is the shape the nightly job needs.

**Retries.** A subtle one. Conker asks, the owner approves, the invocation fails on a network error.
The nonce is consumed. Pi must ask again — for a byte-identical action the owner said yes to five
seconds ago. That is honest but insulting.

The fix is not to leave the nonce spendable on failure; a partial failure could then double-send.
The fix is a **fresh request that carries its history**:

> You approved this identical action 5 seconds ago. It failed: `ConnectionTimeout`. Retry?

Once-only semantics intact, the owner's prior judgement acknowledged, one click.

This is the sibling of `acted_no_reply`, which Pi already handles — that is the case where the action
*did* run and the answer did not arrive. This is the case where it did not run at all. Both are
states the record must distinguish, because "it happened" and "it did not" are the two facts an
owner most needs to be true.

---

## 7. Absence, and the thing I cannot solve here

An approval nobody sees is an action that silently never happens. Longer expiry (§2.1) makes the
queue survivable, but it does not make anyone *aware*.

Conker binds to localhost and has no public-internet path, by construction. So notification is
genuinely constrained: a badge in a dashboard nobody has open notifies no one.

For the first checkpoint the honest answer is **the badge, plus a decide-window long enough that a
daily check suffices** — and saying so plainly rather than pretending. Push over Tailscale is the
real answer and it is later work.

---

## 8. The shape of one approval

Everything above, as a single request:

```
Conker wants to send an email                        ← from the tool's template, filled with args

  Because you asked: "reply to mum about Sunday"     ← provenance (§3)

  To       mum@example.com                            ← what varies, leading
  Subject  Re: Sunday
  Body     "Yes, 2pm works for me…"      [show all]

  This cannot be undone.                              ← reversibility (§4)
  Asked because sending email is "act outward",       ← why am I seeing this at all
  and this agent may act up to "act locally".

  [ Deny ]   [ Approve once ]                         ← the decision
  Raise this agent's autonomy instead →               ← the honest escape (§5)

  Decide by 21:40 · spend window 2 min once approved  ← two clocks (§2.1)
  Exact arguments ▾                                   ← the bytes the digest covers
```

**Never:** "always allow". **Never:** a bare tool id with no arguments. **Never:** a model-written
summary as the only thing shown. **Never:** a claim that the action succeeded because the model said
so — the record reports what ToolGate reported.

---

## 9. Open questions

1. **Does `act outward` ever fall inside autonomy?** The safe answer is that it always asks. But an
   owner who has said *"post to my own blog, up to three times a day"* and set a hard limit may be
   ill-served by the fourth prompt. The limit may be the real boundary, and the prompt merely ritual.
2. **How long is "time to decide"?** Hours makes the queue usable. Days makes a forgotten request a
   surprise — the owner approves something whose context has moved. Perhaps it expires on the
   *session* rather than the clock.
3. **Who sets sensitivity?** The tool author is the natural answer, but they are not always the
   owner, and a tool that under-declares its own danger is a hole. Possibly sensitivity is a floor
   declared by the tool that the owner may raise but never lower.
4. **Are Proposals and Approvals one queue?** Both are "Conker wants something, decide". They differ
   in that a proposal has no live nonce. That may be a distinction the owner does not care about.
