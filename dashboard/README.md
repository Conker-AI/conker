# Conker dashboard

The active Vite + React + TypeScript frontend, built on the shadcn New York shell.
This is an interactive preview using the existing `ConkerClient` fixture adapter.
Backend containers are not required to explore it, and starting them does not
connect the preview automatically.

[Product overview and screenshots](../README.md) · [Design contract](DESIGN.md) ·
[Status](../docs/status.md) · [Contributing](../CONTRIBUTING.md)

## Run locally

Use Node.js 22.12+ or 24+ and npm. From this directory:

```sh
npm ci
npm run dev -- --host localhost --port 5173 --strictPort
```

Open **http://localhost:5173**. The strict port prevents silently starting on 5174
when another process already owns 5173.

For a restricted Windows environment where esbuild reports directory-access
errors, `npm run dev:sandbox` provides an optional launcher on the same port,
with HMR and an ignored cache. Standard development and builds use Vite's config
runner. Do not change unrelated services or terminate an unknown port owner to
start the frontend.

## Screen map

| Route | Screen |
| --- | --- |
| `/` | Home: attention, recent activity and workspace overview. |
| `/companion` | The main companion conversation. |
| `/chat` | Conversation collection with Sessions / Agents views. |
| `/chat/new` | Start a topic conversation. |
| `/chat/:id` | Conversation, message actions, composer, activity and detail rail. |
| `/inbox`, `/inbox/:id` | Requests, proposals, decisions and source context. |
| `/agents` | Agent collection and configuration. |
| `/tools` | Capability registry and scope inspection. |
| `/memory` | Sample evidence, provenance and search. |
| `/journal` | Activity history and source links. |
| `/jobs` | Local job configuration, controls and simulated receipts. |
| `/system` | System overview. `?tab=terminal` and `?tab=files` select its other tabs. |
| `/settings` | Preferences, connections (`?tab=connections`) and models (`?tab=models`). |
| `/settings/companion` | Character Studio: identity, style, appearance, voice and modes. |
| `/login`, `/setup` | Frontend authentication/setup previews. |

The appbar carries page navigation and conversation-wide actions. The composer
owns next-turn controls, message toolbars own message actions, and the right rail
holds requested reference/detail views. The Companion brand opens `/companion`;
Home is an entry screen, not the parent of every sidebar route.

## Preview boundaries

`src/lib/api/index.ts` composes the fixture client with browser voice input.
Keep feature data behind the `ConkerClient` contract when introducing real
transport; do not scatter direct service calls through UI components.

- Conversation responses and activity are simulated and labeled as previews.
  Model selection is catalogue/UI behavior; costs are not metered.
- Most fixture edits survive navigation but reset on reload. Some appearance
  preferences are persisted separately. Export character work you want to keep.
- Inbox decisions never send messages, modify files or grant backend authority.
- Terminal is offline. Files, host telemetry and execution receipts are samples.
- Browser microphone, camera and speech features depend on permissions and browser
  support. Speech recognition may process audio online; a local URL is not an
  offline-audio guarantee.
- Calls are not connected to a realtime AI/TTS service or durable call storage.
  See [Call interface](CALL_INTERFACE.md) for the implemented UI and remaining work.
- Character authoring and previews are documented in [Character Studio](CHARACTER_STUDIO.md).
  Configuration is not proof that voice cloning, emotion inference or 3D rendering runs.

See [status](../docs/status.md) for what is connected.

## Theme, layout and components

Read [DESIGN.md](DESIGN.md) and the shared [design language](../docs/reference/design-language.md)
before changing the interface. Preserve semantic color pairs, shared primitives,
theme fidelity, compact spacing and layouts appropriate to each screen. Strong
visual priority does not require narrowing every page or giving every region a border.

The shell supports theme and layout customization. Verify actual rendered states
when changing geometry, contrast, portraits or responsive behavior; a successful
TypeScript build does not establish visual correctness.

## Verification

```sh
npm run build
npm run design:check:test
npm run check:conversation
```

`build` runs the design guard, TypeScript and the production Vite build. Use the
feature checks relevant to a change:

```sh
npm run check:navigation
npm run check:theme
npm run check:daily-overview
npm run check:character
npm run check:jobs
npm run check:voice
npm run check:calls
npm run lint
```

These commands are available checks, not a claim that every command passed in the
latest documentation-only change. Report any existing lint failures separately
from the files you touched. For visible changes, inspect desktop and narrow
layouts, light/dark themes, keyboard interaction and browser console output.
Keep temporary captures in ignored test output; curated documentation images live
in [`../docs/images/`](../docs/images/).

## Planned work

- [Chat delivery plan](../docs/archive/chat-delivery-plan.md): proposed bounded frontend milestone.
- [Interaction catalogue](../docs/archive/ai-chat-ui-inventory-2026-09-19.md): researched options, not a commitment to ship every pattern.
- [Workspace proposal](../docs/archive/workspace-control-plan.md): future flows, teams, memory exploration and owner controls.

The template's license is retained in [third-party notices](THIRD_PARTY_LICENSES/shadcn-dashboard-template.txt).
