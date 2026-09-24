# Dashboard UX and structure pass

Branch: `feat/dashboard`. Frontend fixtures only; no backend integration or visual redesign.

## Behavior

- `/chat` is a full-width list. Sessions is the default, ordered by accepted activity with
  the latest Companion session pinned. Agents lists the pinned Companion, agents and groups.
  Search applies inside the selected mode. New conversation is available on the list.
- `/chat/:sessionId` retains the messenger view and has a visible Back to chats link.
  Navigation and contacts collapse independently. Their two boolean preferences are the only
  new browser-persisted data; drafts, imported assets and fixture records still reset on reload.
- `/` and the face beside Conker resolve the remembered Companion session. Character Studio
  stays in the owner menu and Companion conversation header. The tile/config variant is removed.
- `/inbox` lists approval and proposal glance rows. Selection opens `/inbox/:id`; Needs you and
  Decision history remain list filters. Loading, unavailable, missing, filtered-empty and
  verified-empty states are distinct. Queue evidence refreshes periodically.
- Agents, Tools, Memory and Jobs retain their existing list/detail routes, now covered by a
  common navigation regression test.
- Approval origins link to actual fixture messages. Intent warnings consume record evidence;
  unknown tools remain readable and cannot be approved without an understood definition.
  The authority comparison shows the standing grant and requested one-time effect.
- Capabilities require boolean `true`. New receipts carry their own timestamp; undated retained
  receipts report unknown age. Studio clears Saved after edits, clears removed asset mappings,
  and checks available neutral portraits before falling back to the placeholder.

## Preserved invariants

RunCoordinator still owns streams above the conversation component. Draft, reply target and
nonzero scroll survive list-to-conversation switching; streams continue while another session
is open. Policy inspection restores scroll during a run. Duplicate events, interrupted streams,
lost acknowledgements, delegation snapshots and shared Chat/Inbox/Journal action identity remain
covered. Existing invariant tests were adapted, not removed.

## Run and review

Verification on 2026-09-12: all **45 Playwright checks pass**, including the original 31;
all **30 mutation drills are caught by the intended assertion**, with original sources
restored. `npm run build` and `npm run check` pass. The drill improved two test weaknesses:
Reply now has an explicit availability assertion, and asset removal checks the saved
configuration as well as the visible select. Fixture-editing tests resolve Vite's loaded
module URLs so hot reload cannot create a second test database.

From `companion/dashboard`, run `npm run dev` and open `http://127.0.0.1:5173/`.
Build and check with `npm run build` and `npm run check`; run the browser suite with `npm test`
and the mutation drill with `npm run test:mutations`.

On the restricted Windows host, start Vite separately before tests. Playwright reuses it and
avoids the host's process-tree teardown hang. The suite uses one browser worker. The existing
large-bundle warning remains; splitting the bundle is outside this pass.

## Practical limits and clarifications

- Home remembers the last visited Companion session within the running app. Sessions pins the
  latest Companion session by activity. Viewing an older session can make these destinations
  differ intentionally; Home is not a second summary screen.
- Agents, Tools, Memory and Jobs were already list-first. Their implementation did not need a
  rewrite. Seeded session times needed adjustment because fixed fixture times could be ahead
  of the actual clock and defeat recency sorting.
- The fixture approval record did not contain an explicit authority delta; a small comparison
  was added. Full validated approval/adaptor contracts and natural deadline expiry remain later
  work; the existing expiry scenario still tests acknowledgement races.
- Current styling and the existing palette/inspector architecture remain. No template was
  adopted. Terminal remains the existing disconnected workspace; moving its navigation into
  System is separate from this requested pass.
- The solid flows are navigation, local continuity, run recovery, shared decisions and Studio
  configuration. Live rendering, real transport, production authentication, durable records and
  the later visual layer are not implemented by these fixtures.
