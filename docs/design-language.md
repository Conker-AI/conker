# Conker design language

The owner's design direction, captured so any agent (Astra included) builds to the same standard.
This governs both the Framer mockup and the eventual shadcn/React build.

## The one-line brief

**A serious, professional tool that reads like shadcn "New York": near-black, tight, defined by thin
outlines — clean and never wasteful — with room for a few genuinely beautiful, animated AI moments
on top.** The reference the owner pointed to is **[libraries.dev](https://libraries.dev/#components)**
(dark, outlined, with animated AI components) and **shadcn/ui New York** style.

## Principles

1. **Outlines are the backbone.** The thin border is what makes it feel professional. Define
   surfaces with a **1px outline** — `border: white @ ~10% alpha` on a near-black ground — not with
   heavy fills or drop shadows. Cards, list containers, inputs, segmented controls, badges: all
   outlined. This is the shadcn New York look (1px, no offset, less rounding, less padding), the
   OpenAI/Vercel register. Outlines also let you drop in beautiful things (animated borders, thinking
   orbs) without losing the serious-tool feel.
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

## Tokens (dark, shadcn-derived)

| Token | Value | Use |
|---|---|---|
| Ground | `#0A0A0A` | app background (shadcn `oklch(0.145 0 0)`) |
| Sidebar | `#0C0C0C` | sidebar surface, separated by an outline not a fill jump |
| Surface | `#171717` | filled inputs, active nav, bubbles, segmented track |
| Elevated | `#212121` | active segment, badges |
| **Border** | **`rgba(255,255,255,0.10)`** | **the outline — the defining element** |
| Foreground | `#FAFAFA` | primary text/icons |
| Muted | `#A1A1A1` | secondary text (shadcn `muted-foreground oklch(0.708)`) |
| Faint | `#6E6E6E` | tertiary text, meta, placeholders |
| Accent | `#7DD8A0` | the one accent (calm green) — active nav, Live pill, send button only |
| Accent surface | `#14231A` | green-tinted chip background |
| Amber / Amber surface | `#E6B15E` / `#241E12` | degraded status |

**Radius:** ~10px cards/inputs, ~8px segments, ~6px small pills (New York = less rounding).
**Type:** Inter (placeholder; a more characterful face is welcome later). Tabular numbers for data.
**Spacing:** tight. Nav rows ~9px vertical, list rows ~11px, card padding 14–18px.

## What "get shadcn" means for the build

- The **shadcn MCP** is wired to Astra (`codex mcp add shadcn -- npx shadcn@latest mcp`): use it to
  browse/pull real shadcn components and match their standards when building the React app.
- Build in **New York style**. Semantic `background`/`foreground` token pairs; the outline everywhere.
- The Framer project is the visual source of truth for look; the code implements it with shadcn.

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
