# Conker design language

> Implementation authority (2026-09-13): [dashboard/DESIGN.md](../dashboard/DESIGN.md) and the shared code in `dashboard/src/components/design-system` now define exact component, spacing, type and palette contracts. The owner's accepted Chats collection is the reference for Chats, Inbox and other collections. Earlier Framer-source-of-truth language and approximate dimensions below are historical direction; current shared components and the owner's latest instructions take precedence. Standard validation enforces the design contract and rendered review checks visual results.

The owner's design direction, captured so any agent (Astra included) builds to the same standard.
This records the product direction behind the implemented shadcn/React dashboard. Exact implementation rules live in dashboard/DESIGN.md.

## The one-line brief

**A serious, professional tool that reads like shadcn "New York": near-black, tight, defined by thin
outlines and distinct tonal surfaces — clean and never wasteful — with room for a few genuinely beautiful, animated AI moments
on top.** The reference the owner pointed to is **[libraries.dev](https://libraries.dev/#components)**
(dark, outlined, with animated AI components) and **shadcn/ui New York** style.

## Principles

1. **Depth makes hierarchy readable.** Keep **1px outlines** on a near-black ground, with
   distinct graphite panels, brighter active work surfaces, and quieter inset details. The owner's
   September 14 refinement replaces outline-only separation with shared tonal depth and subtle
   shadows. Light mode uses a softly toned canvas beneath white panels. Cards, collections, fields
   and menus inherit the documented surface roles in dashboard/DESIGN.md; avoid independent page
   palettes, heavy shadows or decorative colored boxes. Preserve the compact shadcn New York feel.
2. **Never wasteful.** Every screen earns its space. No boxes-in-boxes, no giant empty margins, no
   spacing for its own sake. If a screen feels roomy without a reason, it's wrong.
3. **Productive vs beautiful — decide per screen.** Some screens exist to *do a job fast*; some exist
   to *feel good*; some are both. Design each to its purpose:
   - **Productive** (e.g. the **session list**): its only job is to *find the session you need*, so
     it must be **super clean** — dense, outlined, scannable, one row per item (title + agent · time),
     hairline dividers, no wasted height.
   - **Beautiful** (e.g. AI thinking states): the *thinking bubbles / orbs* and animated borders from
     libraries.dev — Thinking Orbs, Border Beam. These are the moments allowed to be lush.
   - **Combined**: the conversation (productive thread + a beautiful companion presence).
4. **Calm, not busy.** Restraint. One accent, used sparingly. Quiet by default.

## Color and component authority

The September 15 consistency pass replaces the earlier approximate hex palette and faint-text tier with [role-based color rules](color-system.md). Use [dashboard/DESIGN.md](../dashboard/DESIGN.md) for exact token, typography, density, radius and component contracts. The palette and all derived surfaces follow the existing theme customizer.

Near-black canvas, graphite panels, inset details and neutral floating surfaces provide depth. Green indicates action/selection; semantic success remains independent of the editable brand accent. Warning and destructive colors convey their actual states. Main and secondary text use one shared pair of roles across routes. Do not choose different opacity values for equivalent components.

## What "get shadcn" means for the build

- The **shadcn MCP** is wired to Astra (`codex mcp add shadcn -- npx shadcn@latest mcp`): use it to
  browse/pull real shadcn components and match their standards when building the React app.
- Build in **New York style**. Semantic `background`/`foreground` token pairs; the outline everywhere.
- The accepted live dashboard and shared components are the implementation source of truth. Framer files are design references and must follow the same documented component contracts.

## Screen intents (quick reference)

- **Session list / Chats** — productive. Dense outlined list, find-fast.
- **Inbox list** — productive. Outlined rows, effect badges, glance meta.
- **Inbox detail (approval)** — combined. Serious, structured; the delta and provenance are the point.
- **System / Agents / Tools / Memory / Journal / Jobs** — productive. Outlined cards, tight.
- **Home / conversation** — combined. Productive thread + beautiful companion presence and AI states.
- **Character Studio** — beautiful-leaning. The companion should feel alive (static now, animated later).
- **Terminal** — productive. Outlined shell, honest offline state.

## Reference

- [libraries.dev](https://libraries.dev/#components) — the target look: dark, outlined, animated AI
  components (Border Beam, Thinking Orbs, Gooey, Liquid Metal). Colours and outlines especially.
- shadcn/ui New York style + theming (`ui.shadcn.com/docs/theming`, `ui.shadcn.com/docs/mcp`).
