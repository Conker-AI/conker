# Conker dashboard

The active Vite + React + TypeScript frontend, built on the shadcn New York shell.
Development renders the connected product shell against an in-memory gateway;
production uses the same shell against Pi's authenticated browser gateway.

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

The older fixture-rich workspace is available only for component archaeology:

```sh
npm run dev:legacy-fixtures
```

It is a separate development build, not a switch exposed in the product UI.

## Screen map

The sidebar follows the owner-approved structure: **Overview** (Home, Inbox, Chats),
**Workspace** (Projects, Memory, Agents, Tools, Cron jobs) and **System** (Server, Settings).
[`src/components/gateway/navigation.ts`](src/components/gateway/navigation.ts) is its one
source of truth; every other place is one search away (Ctrl/Cmd+K).

| Route | Screen |
| --- | --- |
| `/`, `/overview` | Home: what needs you, plan allowance, what is coming up. |
| `/inbox` | One card per approval, request, idea and AI-job note. |
| `/chats`, `/chat` | The chat list and one conversation. |
| `/projects` | Projects and their sources. |
| `/memory` | Memories, the memory map, sources, corrections and forgetting. |
| `/agents` | Agents, teams and skills. |
| `/tools` | Tools, workflow drafts, MCP servers and which tools Conker may use. |
| `/jobs` | Cron jobs and their runs. |
| `/system` | Server: health, processes, ports, containers, terminal, native sessions, files. |
| `/settings` | Every setting by topic (`?group=TOPIC`). |
| `/settings/companion` | Character Studio: identity, style, appearance, voice and modes. |
| `/activity` | Tasks, runs and the activity log. |
| `/artifacts` | Saved content and its versions. |
| `/setup` | Verified first-run progress and the next step. |

The appbar carries page navigation and conversation-wide actions. The composer owns next-turn
controls, message toolbars own message actions, and the right rail holds requested reference and
detail views.

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

The template's license is retained in [third-party notices](THIRD_PARTY_LICENSES/shadcn-dashboard-template.txt).
