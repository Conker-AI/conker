# ADR-0002 — Pi owns transcripts, MemoryGate owns evidence

**Status:** Accepted · 2026-09-03 · [issue #16](https://github.com/alexeybe1kin/conker/issues/16),
[issue #8](https://github.com/alexeybe1kin/conker/issues/8)

## Context

The concept documents contradict each other on what memory holds.

`the-idea.md` §7: *"Every session inside it becomes memory."*
`features.md` A2: memory is explicitly **not** *"a dump of every conversation."*

Both cannot be literally true, and the difference is not cosmetic — it decides how much data
accumulates, what the nightly job reads, and whether memory stays useful as it grows.

## Decision

**Pi owns transcripts. MemoryGate owns evidence. A session becoming memory means it is *mined*, not
*copied*.**

Raw conversation is Pi's session state and stays in Pi. What crosses into MemoryGate is **derived**:
facts, decisions, preferences, people, patterns — each carrying source, timestamp, confidence, scope
and retention, as A2 requires.

Two write paths, following MemoryGate's own Evidence → Analysis → Memory layering:

1. **Pi writes evidence asynchronously after each turn.** One record per turn — what was asked, what
   was answered in substance, which tools ran, what came back, and a **stable reference to the full
   transcript in Pi**. Never the raw messages. A turn never waits on this write.
2. **A scheduled analysis pass promotes evidence to memory.** Interpretation happens deliberately,
   never inline in a turn.

## Consequences

Evidence is cheap and complete; memory is considered and small. That separation is what stops memory
degenerating into a transcript dump that nothing can search usefully.

**A deliberate coupling:** MemoryGate's lineage points into Pi's transcripts by id. Transcript ids
must therefore be **stable and never reused**, and deleting a transcript must *invalidate* rather
than orphan the evidence citing it.

**Deletion propagates down the lineage.** Deleting a memory must also mark the evidence it derived
from, or the next analysis pass cheerfully recreates it. `principles.md` §9 requires the deletion
path to actually work, and this is what "actually" means here.

**This is the line most likely to be tested** as the system grows. It is written down precisely so
that moving it later is a visible decision rather than a drift.

## Amendment 2026-11-12: the owner's own statements are admitted at once (issue #45)

The owner asked for automatic memory on 2026-11-01: no "Want me to remember?", facts about him
saved on their own with a quiet "Remembered" and Undo, still listed and forgettable in Memory.
The code already does this, and it departs from the decision above in two places, so this
amendment records it instead of leaving it as drift.

- **What crosses, word for word.** One kind of record leaves Pi with its words intact: a single
  message the owner typed, sent as `owner_statement` evidence with its message and session ids.
  Assistant answers, tool output and whole turns stay in Pi as before.
- **Promotion inline, for those statements only.** MemoryGate scores each statement when it
  arrives. One the owner asked it to keep, or one that scores high enough, becomes a memory in the
  same transaction: evidence, then analysis, then memory, linked. The memory is a quote: attributed
  to the owner, `do_not_generalize`, medium confidence, with no inference. Lower-scoring statements
  stay evidence only, and a "don't remember" is honoured. Anything that infers, generalises or
  combines statements still waits for the scheduled analysis pass.
- **Unchanged.** Deletion propagates down the lineage. Forgetting a chat removes its evidence and
  memories. Forgetting a memory marks the evidence it came from, so the next pass does not recreate
  it (this is enforced in MemoryGate's forget path).

Fable's 2026-11-10 review item R-A1 (that MemoryGate stores the owner's messages word for word) is
answered by this amendment: that is now the decision, limited to the owner's own statements.
