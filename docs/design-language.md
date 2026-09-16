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

The owner explicitly selected the shadcnstore dashboard template on September 16 as the authority for shared styling. [template-reference.md](template-reference.md) records the pinned source, feature map and permitted Conker adaptations. Use its direct semantic color variables and real component treatments. The previous custom surface-mixing layer is retired.

Conker keeps its content, features, compact composition, custom appbar/sidebar controls, green default accent and complete photo portraits. Presets/imports retain their exact palette values. [dashboard/DESIGN.md](../dashboard/DESIGN.md) governs density and composition; [color-system.md](color-system.md) governs color use.

## What "get shadcn" means for the build

- The **shadcn MCP** is wired to Astra (`codex mcp add shadcn -- npx shadcn@latest mcp`): use it to
  browse/pull real shadcn components and match their standards when building the React app.
- Build in **New York style**. Semantic `background`/`foreground` token pairs; the outline everywhere.
- The accepted live dashboard and shared components are the implementation source of truth. Framer files are design references and must follow the same documented component contracts.

## Screen intents (quick reference)

Interaction placement follows the owner-approved September 16 contract in [dashboard/DESIGN.md](../dashboard/DESIGN.md#interaction-placement-owner-approved-september-16). Focused creation and multi-field edits use centered task dialogs; contextual evidence and history use a right panel; complex configuration stays on dedicated pages. Confirmations name their target and consequences. Save/discard ordering, feedback, responsive record lists, and overlay geometry are shared components, not route-specific decisions. Preserve Conker's current visual identity while making equivalent actions behave consistently.

- **Session list / Chats** — productive. Dense outlined list, find-fast.
- **Inbox list** — productive. Outlined rows, effect badges, glance meta.
- **Inbox detail (approval)** — combined. Serious, structured; the delta and provenance are the point.
- **System / Agents / Tools / Memory / Journal / Jobs** — productive. Outlined cards, tight.
- **Home** — combined. A compact, visually composed workspace overview with linked resource counts, pending requests, agent status, recent activity and conversations, service status, and restrained motion.
- **Companion / conversation** — combined. Productive thread + beautiful companion presence and AI states.
- **Character Studio** — beautiful-leaning. The companion should feel alive (static now, animated later).
- **System** — productive. One sidebar destination with the shared appbar tabs: Overview for machine stats and services, Terminal for the viewport-filling black console and fullscreen, and Files for the directory tree and path copying. Keep Terminal and Files in separate tab bodies, with the offline and sample-data labels intact. Terminal uses graphite chrome; Files uses the shared card palette.

Home summarizes Conker's internal screens using the shared page shell, cards, collection rows and complete padded portraits. New chat and Open companion provide the primary next steps; Connections and System expose service details. One subtle arrival animation gives the overview a quiet entrance and respects reduced motion. Existing theme, density and inset-frame contracts continue to apply.

The separate productivity app owns tasks and calendars and may later connect to Conker through MCP/ToolGate. Home does not duplicate a daily briefing, agenda, news feed or planning starters. Recorded calendar-tool actions can appear in Journal summaries as audit history. Companion keeps its dedicated conversation, voice behavior, daily context and sourced-news status; the Home restructuring does not remove these capabilities.

## Reference

- [libraries.dev](https://libraries.dev/#components) — the target look: dark, outlined, animated AI
  components (Border Beam, Thinking Orbs, Gooey, Liquid Metal). Colours and outlines especially.
- shadcn/ui New York style + theming (`ui.shadcn.com/docs/theming`, `ui.shadcn.com/docs/mcp`).
