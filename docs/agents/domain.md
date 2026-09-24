# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

**Layout: single-context.** The glossary is in `docs/1-overview.md` ("Words you'll see"); decisions in `docs/adr/`.

## Before exploring, read these

- **`docs/1-overview.md`**: the glossary of domain terms.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill creates them lazily when terms or decisions actually get resolved.

Neither exists yet in this repo. That is expected: the project is still in the charting phase (see `CLAUDE.md`), so the vocabulary is being settled by wayfinder decision tickets, not by a glossary written up front.

## File structure

```
/
├── CONTEXT.md
├── docs/
│   ├── adr/
│   │   ├── 0001-....md
│   │   └── 0002-....md
│   ├── agents/          ← this directory
│   └── concept/         ← vision / features / principles
└── ...
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_

## Relationship to `docs/concept/`

`docs/concept/` is **raw material, not requirements** (see `CLAUDE.md`). It is not a domain model:
it records ideas that have not been decided yet. `CONTEXT.md` and `docs/adr/` record what *has*
been settled. When the two disagree, the resolved decision wins.
