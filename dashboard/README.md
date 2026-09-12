# Conker messenger preview

Frontend only. The browser owns an explicitly fictional MSW database. No gate, model,
shell, external service, or secret is involved. This prototype always starts interception
before mounting the application, including in production builds. There is no real transport
fallback. Resource requests are confined to `/__fixture/v1/` and require a fixture response
marker. Reloading resets the mock records, imported assets, drafts, and running work.

## Run

Use Node 22.12 or newer. From `companion/dashboard`:

```sh
npm --prefix ../design-system install
npm install
npm run dev
```

Open **http://127.0.0.1:5173/**. The predev script copies the installed MSW worker into
`public/`; it is generated dependency code, not a handwritten worker. Use localhost with
service workers enabled. Do not enter real secrets or personal records in this preview.

```sh
npm run build
npm run preview
```

The production preview is **http://127.0.0.1:4173/**. It still uses MSW fixtures. A deployed
static host must serve `index.html` for client routes and allow service workers. PWA
installation, offline data, and native packaging are deliberately deferred.

Chats opens the full list with Sessions / Agents modes. Select a row to converse, or start
with New conversation. Home and the face beside Conker open the remembered Companion
conversation. Character Studio is in the owner menu. Hide navigation and Hide contacts
are independent; only these two boolean preferences persist across reloads.

## Architecture

- `domain/`: Companion, agent identity, contact, group, session, message, run, action,
  approval, citation, character profile and effective conversation policy are distinct.
  A run snapshots participants/group revision and policy. Delegation is inside a run.
- `data/`: identity-based TanStack Query keys, response adapters, mutations, and an
  application-owned stream coordinator. Components never own stream subscriptions.
  Query freshness is separate from dated status evidence.
- `mocks/`: stateful MSW handlers below the data model. Submissions have stable IDs;
  acceptance is delayed. Streams carry event IDs, cursor replay, and atomic snapshots.
  Approval decisions are revision-bound and distinct from execution receipts.
- `platform/`: commands, capability checks, constrained slots, and a small session-keyed
  interaction store for drafts, reply target, scroll position, and expanded details.
- `app/features.ts`: the only composition list. Features are ordinary bundled TypeScript,
  with separate command definitions, placements, routes, navigation and view contributions.
- `features/`: messenger, management inspectors, Character Studio, terminal, Reply and
  emotion. Core action/approval renderers are not replaceable contribution points.

The host permits two direct message actions plus overflow. Composer commands use one tools
menu. Capability diagnostics distinguish shipped code, supported transport, owner authority,
and applicability. This is presentation, never backend authorisation or a plugin sandbox.

Chat, Inbox and Journal use the same `actions/<id>` and `approvals/<id>` queries. Journal
stores links to those records, not a second opinion about whether an action happened.
Unknown outcomes offer **check existing action**, not another dispatch. Confirmed actions
with a missing response offer **ask only for the reply**.

Replacing the fixture transport requires implementing the documented domain adapter against
the authenticated owner gateway and agreeing real service contracts. It must not require
rewriting screens, and must not forward owner authority through Pi. The mock endpoints are
prototype contracts, not claims about existing gateway endpoints.

## Journeys to review

1. `/` opens the remembered Companion conversation. Back to chats opens the full list.
   Switch Sessions / Agents, search within the selected mode, or use New conversation.
   Select Workshop or Study room, then return through the list. Hide/show navigation and
   contacts independently; their boolean preferences survive reloads.
2. Write different drafts in different sessions. Use Reply, switch away, and return.
   Send a message, switch contacts while it streams, then come back.
3. Composer **Preview scenario** offers delayed acceptance, duplicated events, interrupted
   streaming, and a lost acceptance response. The latter checks the existing submission.
4. `/inbox` shows glance rows; select one to open `/inbox/:id`. `/inbox/coach` keeps the “you asked / it wants to” judgement layer. Approve and watch
   pending → accepted → receipt. Preview alternatives include expired authority, a changed
   request revision, and outcome unknown after dispatch.
5. Preview a deleted citation in Chat. The source becomes a tombstone. `/chat/server`
   demonstrates reply-only recovery; `/chat/exam` shows group snapshots and delegation.
6. `/companion` edits a character and maps a 2D emotion pack. PNG/JPEG/WebP images are read
   locally. Future 2D/3D model imports retain file names only. No model loader executes.
   Missing expressions/renderers fall back to neutral. Personality changes no permissions.
7. `/terminal` is a disconnected, disabled owner workspace. Its connection state is separate
   from read-only System telemetry. Git context is fixture text; no Git operations exist.

Agents, Tools, Memory, Jobs and Journal share `ObjectInspector` and `DetailFields`. Memory
search intentionally demonstrates the degraded word-search path. Setup is three short
steps; the full Character Studio can wait until after the first conversation.

## Extensibility proof

Commit `5774a42` adds Reply and emotion after the messenger foundation. Its entire footprint
is `src/features/reply/index.tsx`, `src/features/emotion/index.tsx`, and `src/app/features.ts`.
The shell and slot renderer were byte-for-byte unchanged. The behavioural tests exercise
both additions and the visibility cap; removing either contribution is a mutation target.

This supports additions within the existing interaction families. A fundamentally new
interaction can legitimately require a new typed contribution point. There is no arbitrary
“insert anything anywhere” API or runtime extension store.

## Checks and current verification status

```sh
npm run check
npm run build
npx playwright install chromium
npm test
npm run test:mutations
```

Pure model checks can run without starting the app:

```sh
npx playwright test --config playwright.unit.config.ts
node scripts/mutation-drill.mjs --unit
```

The mutation drill first requires a passing baseline, then requires the intended behavioural
assertion to fail. A compiler/startup error is not a caught mutant. It saves a recovery journal
before each mutation and restores the source in `finally`; an interrupted drill restores on
its next invocation, refusing to overwrite a concurrent edit.

The UX/structure pass passes the production build, boundary/type checks and all 45
Playwright checks (the original 31 are retained and adapted). The mutation drill covers
existing run/action invariants plus list-first navigation, remembered Home, independent
chrome preferences, recency, status evidence and Studio state. See
`../docs/dashboard-ux-pass.md` for the completed drill result and remaining limitations.

On this restricted Windows host, Playwright's automatic Vite process-tree teardown can
hang after the tests finish. Start `npm run dev` in a separate terminal first; Playwright
reuses that server, including for `npm run test:mutations`. One browser worker is configured
to limit memory use. Chromium is already installed here; a new checkout may need the install
command above. Vite still reports the existing large-bundle warning; this pass adds no
code-splitting or visual redesign.

## Decisions clarified while building

Home resolves the remembered Companion session, while the Sessions list pins the latest
Companion session by accepted activity. Those can differ intentionally after viewing an
older conversation. Agents mode pins the Companion contact and opens its remembered session.
Agents, Tools, Memory and Jobs already had separate list and detail routes; this pass adds
regression coverage rather than rewriting those screens. Seeded session timestamps are
relative to preview startup so new activity cannot sort behind a future-dated fixture.

The existing Terminal workspace remains disconnected. Its separate execution boundary does
not require a top-level navigation entry; moving that entry into System is outside this pass.
Live rendering, native apps and installation remain deferred. Visual tokens and component
styles are retained; CSS changes are limited to list width, collapse/phone layout, overflow,
and removal of the discarded tile variant.

There is also a necessary stream detail beyond “stable event IDs”: the snapshot's text and
cursor must be captured together. Otherwise loading a snapshot and replaying from an earlier
cursor duplicates text even if the event handler itself deduplicates perfectly. This mock
uses atomic snapshots and per-message cursors, including when several runs share a session.
