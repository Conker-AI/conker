# Design references — shipped apps, for the dashboard

Curated from Mobbin (real shipped web apps) and current web/design research (Sept 2026), so the
dashboard is designed against evidence, not invention. This is the bridge the owner asked for
("connect Mobbin to Astra"): the patterns below are what to borrow, each with the shipped app that
proves it and the reason it fits Conker. Feed this to any agent designing or critiquing a screen.

The rule stays: **borrow the pattern, not the chrome.** Everything renders through the design
system's OKLCH tokens and the eight-state Status component — never a screenshot's raw colours.

---

## 1. The messenger spine (left list + open conversation)

The core motion — a left contact list, the open conversation beside it, a right-hand profile/detail
rail that appears on demand.

| App | Mobbin | What to borrow |
|---|---|---|
| **Discord** | [screen](https://mobbin.com/screens/39782151-d068-40d1-a962-1b78a66997a0) | Three-pane: server/nav rail, DM list, conversation, **collapsible right profile rail**. The right rail is the model for our conversation-inspector (session, model, cost, grants). |
| **X (Twitter) DMs** | [screen](https://mobbin.com/screens/e067271f-0051-4cec-8114-6aefabf145a8) | Thin icon nav + message list + thread; **"contact header" with View Profile**; encryption note as a quiet system line — our provenance/mode lines can read the same way. |
| **Microsoft Teams** | [screen](https://mobbin.com/screens/d4a32ff5-c4af-4c97-9d78-66b19d58a3cf) | Conversation header with **inline tabs (Chat · Files · Photos)** — the model for per-conversation tabs (Chat · Runs · Memory) without new routes. |
| **Literal** | [screen](https://mobbin.com/screens/7c74152c-4b87-4918-9485-85f453c9aba7) | The calmest of the set: lots of whitespace, one hairline divider between list and thread, no card chrome. This is closest to the "flatter, more shadcn" target. |
| **Podia** | [screen](https://mobbin.com/screens/4edd0e81-9558-49ff-b90d-e3cbe7475945) | "New conversation" + **search-a-contact dropdown** inline in the list — the model for starting a chat with an agent/group. |
| **Reddit Chats** | [screen](https://mobbin.com/screens/4b1f157c-7fc0-4b5b-9f4e-1409287e0dfa) | Minimal empty/one-thread state that still feels intentional, not broken — matches philosophy §2 (a quiet day looks restful). |

**Takeaway for Conker:** Companion pinned at top of the list; agents and groups below; the open
conversation carries a header (contact + mode) and an on-demand right rail. The right rail is where
"which model, what it cost, which grants are live" lives — quiet, not shouted.

---

## 2. The approval / Inbox card (the hardest surface)

`approvals.md` is confirmed almost line-for-line by shipped apps. Build the card from these.

| App | Mobbin | What to borrow |
|---|---|---|
| **Devin** (permissions) | [screen](https://mobbin.com/screens/7b19cb77-7bc3-4e96-9f3a-9ea0b488211d) | **The delta, stated in words:** "Read and write access to Checks — *Was read-only*". This is the "show what's changing" rule. Put the old grant next to the new one. |
| **Cursor** (permissions) | [screen](https://mobbin.com/screens/19809882-7061-4e39-9b90-23de50e5f368) | **"Show unchanged permissions"** collapses the noise to just the delta; a **"Developer note"** block explains *why you're being asked*. Our "why am I seeing this" line. |
| **Amie** (email access) | [screen](https://mobbin.com/screens/ce30bb11-2a18-42a0-86a0-df83e1a50f51) | **Plain-language consequences as a short bullet list** ("We'll use your email to: draft replies, learn your style…"). Our "what would happen if approved", concretely. |
| **PlanetScale** (deploy request) | [screen](https://mobbin.com/screens/031355e0-f2c0-42a9-8848-f62a580d19e3) | **Estimated cost pinned top-right** + change counts (2 created / 0 altered / 0 dropped). Our **spend clock** and effect summary rendered from structured data, not prose. |
| **Hex** (review) | [screen](https://mobbin.com/screens/b6d30984-785d-4ae1-a740-986428e63945) | Three-way action **Approve / Request changes / Comment** with a note field — richer than yes/no, matches "approve · deny · raise autonomy · ask about it". |

**Takeaway:** glance row (icon + effect badge + one filled template line) → judgement layer (the
varying args, provenance "you asked X / it wants Y", reversible?, why asked) → full detail behind a
disclosure (exact args, digest, which grant, budget remaining, decide-by + spend-window clocks).
Collapse the unchanged by default (Cursor). Show the delta (Devin). Cost is structured (PlanetScale).

---

## 3. The command palette (the extensibility spine, made visible)

The registry pattern the whole architecture rests on, surfaced as ⌘K. This is where a newly
registered feature *appears without a toolbar edit*.

| App | Mobbin | What to borrow |
|---|---|---|
| **Vapi** | [screen](https://mobbin.com/screens/593d7acd-2e16-4365-bcd6-02ce52f48f3b) | **Best-in-class for us:** every command is tagged with its capability — "Metrics — *Observe*", "Integrations — *Build*". That is literally our sensitivity model surfaced in search. Sections: Actions / Recent / All Pages. |
| **Superhuman** | [screen](https://mobbin.com/screens/85dc5994-9360-428d-9092-7425e070ed7f) | Each command shows **its keyboard shortcut inline**, teaching the shortcut while you use the palette. "Learn its shortcut" onboarding line. |
| **StackAI** | [screen](https://mobbin.com/screens/bbcc94bb-f535-4dca-8532-56b135fce5c3) | Command rows with a **one-line description** + a type tag (Tab), and a **footer with nav hints** (↑↓ select · ⏎ open). Good for discoverability. |
| **Fey** | [screen](https://mobbin.com/screens/ff52ac90-4d18-4765-98da-df1e362a5ee1) | Dark palette with per-command shortcut letters on the right; proof the calm-dark palette reads well. |
| **Magnific** | [screen](https://mobbin.com/screens/14ceb943-f04a-460f-b4f5-2ebd78d74aff) | **Recents + Quick actions** split, each with ⌘-shortcuts — the shape for "recently used commands float to the top". |

**Takeaway:** the palette lists whatever is registered; capability tags come free from the same
metadata that gates the buttons; unavailable commands show *why* (as our Slot already does). This is
the single strongest proof that "add a feature = register an entry".

---

## 4. Character Studio (design your companion)

Stepped, calm, with a live preview pane. Do **not** invent — these ship today.

| App | Mobbin | What to borrow |
|---|---|---|
| **PlayAI** (create agent) | [screen](https://mobbin.com/screens/6bed95da-6a62-445c-8330-e31644351bb0) | **Closest to our Studio:** left step list (Identity · Behavior · Knowledge · Actions · Deploy), center form (voice, model, avatar picker, upload), **live Agent Preview pane on the right**. Steal this layout wholesale. |
| **Fin / Intercom** (identity) | [screen](https://mobbin.com/screens/adcc8587-873e-476b-990e-29bd6e4b313e) | **Separate Light and Dark profile portraits** — "if no dark avatar, the light one is used." Directly relevant: our companion face should support a per-theme portrait. |
| **Linktree** (AI persona) | [screen](https://mobbin.com/screens/89eae6af-0f30-427e-bd65-7e798ca9b48c) | **Personality as choose-one cards** (Friendly / Professional / Casual, each with a one-line description) + "shape your responses" + "break the ice". Our speaking-style picker. |
| **Zapier** (chatbot style) | [screen](https://mobbin.com/screens/d6debf17-1cf4-4a0d-9205-d49d58a60906) | Avatar + favicon + shape/size, with a **live chat preview beside the form**. The preview-as-you-edit pattern. |
| **Sana AI** (edit agent) | [screen](https://mobbin.com/screens/b23d6f81-5697-466a-843c-ca1615bed0fc) | **Colour + icon picker with a searchable icon grid** ("find by type, role, expertise") — exactly how an *agent* (not the companion) picks a cheap face without an uploaded portrait. |

**Takeaway:** stepped left rail + form + live preview. Personality = choose-one cards with plain
descriptions. Faces: uploaded portrait (companion, per-theme) OR colour+icon (agents). The renderer
is separate from the profile — static portrait now, avatar later, neutral fallback when missing.

---

## 5. The calm dark home & control aesthetic

The overall feel: spacious, dark-first, AI-home-shaped. Not a trading terminal.

| App | Mobbin | What to borrow |
|---|---|---|
| **Rox** | [screen](https://mobbin.com/screens/ac3c5128-08d9-485f-b264-c034728c61c8) | **"Afternoon, [name] — here's your focus for today"** + Recommended Actions with per-item "Prepare →" + a Today column + "All tasks completed" rest state. The template for a calm Companion Home. |
| **Dropbox Dash** | [screen](https://mobbin.com/screens/691d14bc-0ef1-4170-9a80-69f65fc9d753) | Dark home: a **centered ask box with Ask/Write/Organize chips**, a stacks list left, a calendar right. Close to "Home holds any AI conversation". |
| **Twenty** (CRM) | [screen](https://mobbin.com/screens/c017a665-7d85-4ae7-a659-1dbde26c1882) | Clean dark **data dashboard** — restrained charts, hairline table rows. Reference for System / Jobs without gauge-clutter. |
| **Substack** (home) | [screen](https://mobbin.com/screens/f719cb92-6fd5-4df6-8fa0-c70e0c7582d8) | **Getting-started checklist that greys out completed items** — the onboarding "what's left" pattern, calm not naggy. |
| **Trello** (dark) | [screen](https://mobbin.com/screens/72b03120-c5e1-471d-b088-922cd5af34a1) | Dark notifications rail: **"No unread notifications"** rest state done well. Our empty Inbox. |

---

## 6. Web/design research synthesis (Sept 2026)

**Dark-first is now the baseline, not a toggle-afterthought.** 2026 practice designs the dark theme
first and adapts light from it. AI-output surfaces trend to near-black bases (#0A0A0A–#1A1A2E) with
**translucent/frosted panels** to separate AI output from input without a hard card border — but use
a dark grey (~#121212 class), *not* pure black, for depth and less eye-strain. For us this means:
the OKLCH dark tokens must be genuinely designed, the companion/AI surfaces can use a subtle
translucency, and the toggle must switch cleanly (already an invariant).
Sources: [tech-rz](https://www.tech-rz.com/blog/dark-mode-ui-design-in-2026-user-experience-and-ai-powered-interfaces/),
[groovyweb](https://www.groovyweb.co/blog/ui-ux-design-trends-ai-apps-2026),
[bricx](https://bricxlabs.com/blogs/message-screen-ui-deisgn).

**Libraries to compose on top of the shadcn/Radix base (do not replace it):**
- **Tremor** — Tailwind dashboard/chart primitives; saves weeks on System/Jobs data views. Composes with shadcn.
- **Magic UI** — 150+ animated components (official MCP exists). Use *sparingly* — the emotion bubble, the companion face reveal — never for calm surfaces.
- **Kibo UI** — composable components that extend shadcn for more complex widgets (kanban, editors) if flows/teams need them.
- **shadcn registry + "10000+ themes"** — for palette exploration only; our tokens are the source of truth.
- Rejected as the base: MUI/Ant/DaisyUI/Flowbite — heavier design languages that fight the shadcn/Obsidian-calm direction and the token system.
Sources: [Untitled UI](https://www.untitledui.com/blog/react-component-libraries),
[awesome-shadcn-ui](https://github.com/bytefer/awesome-shadcn-ui),
[shadcndeck](https://www.shadcndeck.com/blog/shadcn-ui-projects-examples-2026).

**Design/UI MCP servers worth wiring to an agent (free):**
- **shadcn MCP** (official registry) — discover/inspect/install real shadcn components straight from the registry. *(Configured for this repo but timed out connecting this session — retry.)*
- **Magic UI MCP** — pull animated components on demand.
- **Framelink Figma MCP** / **Figma Dev Mode MCP** — read frames/tokens/components if a Figma source ever exists (none today; deferred).
- **Playwright MCP** — free; drive the running app for screenshots and interaction tests (useful for our screenshot loop).
Sources: [shadcnstudio](https://shadcnstudio.com/blog/best-mcp-servers/),
[mcp.directory](https://mcp.directory/blog/best-mcp-servers-for-design-2026).

---

## How to use this

1. When designing/critiquing a screen, open the 2–3 references for it above and match the *pattern*.
2. Keep the chrome ours: tokens, Status component, flat-not-nested, calm spacing.
3. The palette (§3) and the delta card (§2) are the two highest-leverage borrows — they carry the
   extensibility rule and the trust model respectively.
