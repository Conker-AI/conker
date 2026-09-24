# Principles

> Constraints carried over as **ideas to be re-decided**, not inherited rules.
> They were expensive to learn in the prior prototype, so they are written down —
> but every one is open to challenge during charting.

---

## 1. Truthful status, always

Every feature and value shown to the owner must carry one of these labels:

| Label | Meaning |
|---|---|
| **Live** | source-bound and verified |
| **Degraded** | partially working, known failure |
| **Offline** | the source reports unavailable |
| **Stale** | last evidence older than its freshness policy |
| **Blocked** | waiting on a dependency, permission, or owner decision |
| **Empty** | supported, but no objects exist yet |
| **Planned** | documented, not implemented |
| **Unknown** | insufficient evidence |

Never show a green badge, or the words "connected", "healthy", "secure", or "updated",
based only on intended configuration. A capability is not live because it was designed.

## 2. Never invent a capability from an idea

A product idea does not become a backend capability by being written down. Mark it
**planned** or **blocked** until a real contract exists behind it.

## 3. The browser is untrusted

The frontend must never receive: provider keys · admin keys for any boundary · OAuth
tokens · hidden prompts · unrestricted raw memory · broad tool arguments · command lines ·
host paths · environment dumps · container socket paths · provider upstream URLs.

Requests route through the owner's own backend so upstream credentials stay server-side.

## 4. Personality never grants permission

The Companion's character, appearance, tone, and persona are presentation. They must not
widen what it is allowed to do. Permission comes from the action boundary alone.

## 5. Approval binds to the exact action

An approval authorizes one specific prepared action, consumed once. Not a category, not a
session, not "this kind of thing from now on". The owner sees redacted detail — enough to
judge, never enough to leak.

## 6. External content is data, never instruction

Anything ingested — research findings, web pages, messages, documents, classroom
material, video transcripts — is untrusted input. It cannot issue instructions to the
Companion.

## 7. Local-first and self-hostable

The product must install cleanly on a machine the owner controls, without assembling
services by hand and without depending on any development harness. Use only on localhost,
a private mesh network, or another authenticated private network.

## 8. Boundaries do not blur

- The memory boundary remembers; it never executes.
- The action boundary acts; it never decides what the owner values.
- The observation boundary reports; it is never a shell or an execution path.
- The universal layer coordinates; it is never the database for a specialized domain.

## 9. Consent is explicit and revocable

Recording, transcription, capture of other people, health data, school data, financial
data, and external follow-ups all require explicit consent — and a working path to
correct, retract, and delete.

## 10. Safety limits that are not negotiable

Carried over from the source material as hard refusals:

- No experiments involving pain, coercion, sleep deprivation, starvation, unsafe
  substances, harmful exercise, covert recording, or other people.
- No impersonation, fake engagement, astroturfing, harassment, ban evasion, or deceptive
  influence.
- No offensive security capability. Defensive only, and only against systems the owner
  controls or is explicitly authorized to test.
- No autonomous messaging, posting, or spending by default.
- The Companion identifies itself as AI on any call or shared surface.

## 11. Improvement is proposed, evaluated, and versioned

No component silently rewrites itself. Changes to agents, skills, prompts, tools,
automations, and dependencies move as versioned proposals through evaluation, with
canaries and a rollback path, and with the proposer separated from the approver.

## 12. Clean architecture is a requirement, not a preference

Stated goal for this rebuild: independent, well-separated components with clear
ownership. No accumulation of one-off patch scripts, orphaned files, or root-level debris.
Each part must be understandable and replaceable on its own.
