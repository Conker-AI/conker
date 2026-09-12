# Dashboard vision

The owner's own words, captured. This reshapes `screens.md`: the sidebar and the eight areas still
stand, but the mental model, the aesthetic, and one hard architectural rule are new.

## The mental model: a messenger, not a chatbot

Conker is shaped like a **DM app** — WhatsApp, Telegram — not a single chat box.

- **The Companion is both a Home and a pinned contact.** Home is the landing view — mainly small
  daily conversations, but it can hold any AI conversation, and those sessions stay reachable. The
  Companion is *also* pinned at the top of the messenger list, so you can jump to those home
  sessions from within the contact list. It is the main relationship, distinct and always first.
- **Chats** is your conversation history — every conversation, most-recent first, with one combined
  **search + filter** control.
- **Agents are contacts.** You have all your agents and your **groups of agents**, like people and
  group chats in a messenger. You open an agent, see its recent conversation, talk, or switch to
  another. Switching conversations is the core motion.
- Later: **agent flows, workflows, and teams** — a group of agents built for one task.

So "Chat" is really: a Companion home, a conversation list, and agents-as-contacts you switch between.

## The feel

Cross-platform, modern, **desktop-first**. Minimal and cool like **Notion or Obsidian** — *not* a
mobile app with big fat buttons stretched to a desktop. **Calm and spacious by default** (closer to
Linear than a trading terminal): generous whitespace, one clear focus per screen, easy on the eyes
for long daily use — with a **density toggle** for power users later. Keyboard-friendly throughout.
"Cute and cool and professional and serious" at once: it reads as an AI app, but it is clearly more
than one.

## Access and platforms

Three requirements, and they pull against each other — this is the design's hardest trade-off.

1. **Any device, nothing to install** — a **web app** reachable over Tailscale. Open a browser on
   a borrowed laptop and you are in.
2. **Time-based Tailscale access** — a way to grant a device temporary, expiring entry to the
   tailnet so you can reach the web app from anywhere without permanently enrolling that device.
   Mechanism is likely Tailscale **ephemeral auth keys** plus a short-lived gateway session on top;
   the pass expires on its own.
3. **Real native apps for laptop and especially mobile** — installable like any other AI app, and
   they must **feel native, not a website in a wrapper.** He explicitly rejects a WebView shell
   (Capacitor/Cordova-style), which is the cheap path and the one that feels wrong on a phone.

**The honest tension, for one maintainer.** (1) is a web app. (3) "native, not a wrapper" rules out
stuffing that same web UI into a shell — a truly native phone UI is a *different* UI layer than the
shadcn/DOM web app, so it is built more than once. The real options and their cost are exactly what
Astra is being asked to weigh in the cross-platform question: a responsive PWA that already runs
everywhere (cheapest, but is a PWA "native enough"?); React Native/Expo (real native widgets, shares
the TypeScript logic but not the shadcn UI — so the messenger is built twice); Tauri v2 (native
shell, but the UI is still a system WebView — may fail the "not a wrapper" test on mobile); Flutter
(most native feel, but a separate Dart stack sharing nothing with the web app). None is free. The
recommendation comes back with Astra's proposal, and the owner decides knowing the cost.

## Decisions locked (2026-09-12/13)

- **Companion entry:** a face button on the **right of the "Conker" sidebar title** (not a corner of
  the app, not mixed into the screen list). One tap to the companion screen. Also pinned at the top
  of the messenger contact list. The 🌱 emoji is a placeholder; a real logo comes later.
- **Look:** flatter and more standard **shadcn** — no boxes nested in boxes for their own sake.
  Whitespace and a thin divider do a card's job without the wasted margins. **Show the dark style.**
- **Calm and spacious** by default; density toggle later.
- **PWA/native: deferred** until the UI is right and the owner is happy. Web app in the browser now.

## The agents model

Three entity types, not four. "Character" is not a type — it is a *mode*.

- **Subagent** — ephemeral. Spawned for a task, no memory, no soul, gone after. A tool, not a person.
- **Agent** — persistent: memory, tools, a role, a `soul.md`. *May* carry a personality and a face.
- **Companion** — the primary agent. Always present; handles everything; owns the companion screen.

**Personality is a lens, decided by context, not a manual toggle.** Open an agent to *talk* (in the
messenger) → personality and face **on**; it is a "character". A job or flow invokes the same agent
to *work* → `personality.md` never enters its context, it runs lean and focused. The owner almost
never toggles this because talking and tasking are already two different things in the UI; a manual
override exists only for the rare case. So: every agent can have a face, and whether you see it
depends on whether you are relating to it or using it. A spawned subagent never becomes a contact to
manage — delegation shows inside the run.

## Add-ons, not extensions

**Decided (2026-09-13): no plugin store.** A public marketplace of third-party UI plugins was
considered and rejected — it makes the app feel commercial and adds a lot of complexity and security
surface for little the owner actually wants. Conker is not a platform for strangers' code to run
inside; it is one person's companion. What stays is the ability to *add functionality* — cleanly,
two ways, both already safe:

- **A new capability (what the AI can do) is a tool through ToolGate.** This is the add-on mechanism
  for capability, and it is already safe: every tool is scoped to an agent and approved per its
  sensitivity, so anything added this way can do nothing a tool could not already do. A shared
  tool/skill registry the owner can pull from is possible later — but it is a catalogue of scoped,
  approved tools, not a marketplace of code that runs with the dashboard's trust. Build this first.
- **A new piece of UI is a bundled feature-module.** Panels, actions, views, chat features — each is
  ordinary TypeScript that registers into a slot/command/route and is composed at one root, added by
  PR or fork and shipped in the build. There is no runtime third-party plugin host, no iframe
  sandbox, no message API — that is the complexity and risk the owner turned down. The
  register-a-feature core (see "The one hard architectural rule") is the whole story: it is how *the
  owner* adds features without rebuilding the shell, and how a contributor proposes one.

So "add-ons" here means *scoped tools* and *contributed feature-modules* — never a stranger's code
executing live inside the dashboard next to the approval flow, session tokens or memory.

## Character Studio

A setup/settings screen where you design your companion: **appearance, personality, how they talk,
a 3D model, a 2D model, a 2D emotion pack.** Build the studio — the forms, the config, the emotion
set management — now. The **live 3D/avatar rendering is deferred** (no GPU yet, agreed earlier); the
studio must slot it in later without a redesign. Nothing assumes text-only.

## Onboarding, in two phases

1. **Environment setup** (mostly the installer): the gates, the Ubuntu server, the dashboard get
   stood up.
2. **In the dashboard**: a login, then "who is your companion" and the other requirements filled in
   so the system is usable — the same shape as any app's first-run. Then follow-up screens.
3. **Inline coaching, not a separate tutorial**: small dialogs that point at the real screen and
   button and say what to do, in place. Replayable, skippable, never blocking.

## System access — includes a terminal

Inside the System area, the owner wants a **terminal** to the Ubuntu server, reached over Tailscale,
for when he is away from home with no other access. Plus branch/commit/notes-style controls.

> **Boundary note, for the backend later — build the UI now, wire it carefully.** SystemGate is the
> *read-only observation boundary*; `principles.md` §8 says it is "never a shell or an execution
> path". A terminal is a shell, so it **cannot live inside SystemGate**. When wired, it is a
> separate, owner-only, gateway-authenticated shell service (or a ToolGate action), not a widening
> of the observation boundary. The UI can mock it now; the security design is its own decision.

## Approvals (Inbox)

A **list of tickets**. Click one and read it in layers: the short summary, then the full detail —
times, the agent, the skills, the tools it used inside, the arguments. Easy to skim, deep on demand.
This matches the approval card in `approvals.md`.

## Chat features already on the roadmap

The owner will add **many** more, and named these to start: **emotion bubble · fork · reply ·
incognito-with-memory · UI toggles · deep search · model routing.** Treat this as the beginning of a
long list, not the end of it.

## The one hard architectural rule

> **The UI must survive new features without being rebuilt.** The owner will add a lot of screens,
> buttons, toggles and chat features over time and does not want to rebuild a toolbar because of one
> new button.

Concretely, this means the frontend is built around **extension points, not hard-coded layouts**:

- A **command / action registry** — chat actions, message actions, toolbar buttons are registered
  entries with an id, an icon, a where-it-appears, and a handler. Adding one is adding an entry, not
  editing a toolbar component. Toolbars render whatever is registered for their slot and overflow
  gracefully.
- **Slot-based composition** — named regions (message toolbar, composer actions, sidebar sections,
  screen headers, the right panel) that features contribute into, rather than monolithic components
  that must be edited per feature.
- **Feature flags / capability gating** — a feature that is not ready, or a capability the backend
  does not yet expose, hides itself cleanly; the layout does not break around it.
- **Routing that scales** — a route registry so a new screen is a registered route, and the sidebar
  is generated from a nav registry, not hand-maintained.
- **Per-conversation UI state** (incognito, memory on/off, model choice, deep-search) modeled as
  composable toggles on a conversation, not bespoke wiring each.

Every new feature the owner names later should be *"register an entry"*, never *"restructure the
shell"*. Modularity here is the deliverable, equal to how it looks.
