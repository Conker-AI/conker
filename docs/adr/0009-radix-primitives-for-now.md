# ADR-0009 — Radix primitives, deliberately, while Base UI is a release candidate

**Status:** Accepted · 2026-09-07

## Context

shadcn/ui is a code distribution platform, not a dependency: components arrive as source in this
repository. But those components are built on a **headless primitive library** that *is* a real
dependency — it owns focus management, keyboard interaction, portalling and the accessibility
semantics of every dialog, menu and popover in the product.

shadcn supports two, selected by one field in `components.json`:

- **Radix** — `radix-ui`, the long-standing choice.
- **Base UI** — from the same authors, a ground-up rewrite.

**In July 2026 shadcn made Base UI the default for new projects**, stating that Radix "remains fully
supported, and all new components will continue to be shipped for both libraries."

That is a strong signal, and it conflicts with what npm says. Checked 2026-09-07:

| Package | Version | Last published |
|---|---|---|
| `@base-ui-components/react` | **`1.0.0-rc.0`** | 2026-07-15 |
| `radix-ui` | `1.6.7` | 2026-07-31 |
| `@radix-ui/react-dialog` | `1.1.23` | 2026-07-31 |

Base UI has been a release candidate for eight weeks with no publish. Radix shipped more recently.
The `new-york-v4` style the registry serves today still lists `radix-ui` as `button`'s dependency,
so Radix is not a legacy path being kept alive out of politeness.

`docs/research/frontend-and-streaming.md` already caught secondary sources confidently claiming Base
UI "reached v1.0 stable in December 2025". npm disagreed then and disagrees now.

## Decision

**Radix, for now, recorded as a decision rather than accepted as a default.**

The choice is one field in `components.json`. Both libraries sit behind the *same* shadcn
abstraction — the token contract, the component anatomy, `cva`/`cn`, `data-slot` and the registry
are identical either way. What differs is a handful of prop names, chiefly `asChild` (Radix) versus
`render` (Base UI).

## Consequences

**Nothing else in the design system depends on this.** That is the point, and it is why the decision
is cheap to revisit rather than something to agonise over now.

**We are off shadcn's default path.** New components are shipped for both, so this costs
attentiveness at upgrade time rather than capability. When a component turns out to be Base-UI-only,
that is the signal to reopen this.

**Revisit when Base UI publishes `1.0.0` final**, not when a blog post says it has. shadcn ships an
official `migrate-radix-to-base` skill (published in shadcn/ui; install it when the migration starts),
which is itself evidence that the migration is expected to be mechanical.

**The rejected alternative was following the default.** Base UI is very likely fine; the objection
is not to its quality but to what an RC means: the API is still allowed to change. This product is
meant to be forked and run by strangers on their own servers for a long time, and this project has
consistently declined that trade — see [ADR-0008](0008-supply-chain-policy.md), which bans `latest`
tags for the same reason. Taking a release candidate as a foundation while explicitly refusing
moving image tags elsewhere would be inconsistent.

**A second rejected alternative was writing our own primitives.** [ADR-0008](0008-supply-chain-policy.md)
already settled the shape of this: own the thin layers, depend where the weight is real. Accessible
focus management is not a thin layer.
