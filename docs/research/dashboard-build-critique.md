# Dashboard build critique — Astra (gpt-6-astra), static pass

Astra's ranked critique of the **built** messenger dashboard (branch `feat/dashboard`), measured
against `dashboard-vision.md`, `approvals.md`, `philosophy.md`, the design system, and the
shipped-app patterns in `research/design-references.md`. Read-only. It ran `npm run check` (passed)
and in-memory adapter probes; it did **not** run the browser or capture screenshots, so its visual
notes are from markup/CSS. Where it flags something as "unverified in browser", Claude verified it
separately: the dark/light toggle switches both ways (probe), the owner menu is reachable after the
sidebar-overflow fix, and 31/31 Playwright invariant tests pass. Paths below are repo-relative.

---

**The approval surface and extensibility promise are both incomplete.** The biggest long-term risk is that the app’s apparent data boundary still depends on fixture-specific knowledge scattered through screens.

Read-only review completed. `npm run check` passed. I also ran in-memory adapter probes. I did not run browser interactions or capture screenshots; visual findings below are based on markup and CSS. Mobbin pages could not be opened, so shipped-app comparisons use your supplied reference document.

1. **Wrong · Approval review omits the information that makes repeated approvals readable.**

   [ApprovalCard](dashboard/src/pages/inbox.tsx:41) and [approval model](dashboard/src/domain/approval-description.ts:1).

   Against [Devin, Cursor and PlanetScale, references §2](docs/research/design-references.md:33):

   - **Delta:** the existing grant is buried in full detail. There is no explicit comparison such as “Can prepare drafts → requesting one send.” “You asked / it wants” compares intent, not authority.
   - **Unchanged information:** every argument receives equal treatment, including the entire email body. There is no changed/unchanged representation or Cursor-style disclosure.
   - **Cost/effect:** `budget`, `grant` and reversibility are display strings. The effect badge comes from a two-tool lookup. There is no structured estimated cost, currency, affected-resource summary or uncertainty. These are fixture strings—not demonstrated model prose—but they still cannot support the PlanetScale pattern.
   - **Provenance:** the comparison exists, but the deletion warning is activated by `item.id === "cleanup"`. Another identical mismatch gets no warning. Its “Original conversation” link actually leads to Journal.
   - **Clocks:** both are displayed, including beside the decision buttons. However, `decideBy` contains prose such as “Today, 21:00”; actionability checks only `decision === "pending"`. Natural expiry is not modeled or exercised; the mock expires through a scenario selector.

   **Fix:** define a validated approval review record containing current authority, requested one-time effect, changed/unchanged fields, structured cost, originating message identity and machine-readable timestamps. Render the delta first. Keep standing-grant changes explicitly separate from approving once. Derive warnings from evidence, never fixture IDs.

2. **Wrong · The registry does not yet satisfy the owner’s hard architectural rule.**

   [Contribution contracts](dashboard/src/platform/contributions.ts:22), [Slot](dashboard/src/platform/slots.tsx:50), [conversation inspector branch](dashboard/src/features/messenger/page.tsx:544).

   Ordinary routes and message commands can be registered successfully. The break appears with the owner’s named next features:

   - Model routing or incognito needs conversation state, policy presentation and an inspector. `ConversationPolicy` only admits local/retained; the inspector literally renders “Local only.”
   - Inspector selection is hard-coded to `inspect=policy`. There is no registered conversation-panel host. Adding another panel requires editing `Conversation`.
   - `inspector.tabs` does not create tabs: every contributed view is dumped into one “Context” tab.
   - Shell layout still depends on `pathname === "/" || pathname.startsWith("/chat")`. A differently named full-height workspace requires a shell edit.
   - **The visibility cap is bypassable.** Commands are capped, but `views.map(...)` renders arbitrary components directly. A feature can contribute permanent composer buttons without entering overflow.
   - Routes and navigation have no capability metadata. `nav.groups` is a DOM label, not a rendered slot.

   This violates [the hard rule](docs/dashboard-vision.md:144) and falls short of Discord’s optional inspector and Teams’ contributed conversation tabs in references §1.

   **Fix:** add registered conversation panels, route layout/capability metadata and a typed feature-state extension mechanism. Separate composer attachments from command controls; the host must own all persistent action placement. Keep authority policy explicit and validated—do not turn it into arbitrary feature flags.

3. **Wrong · The fixture seam will force screen rewrites. This is the single biggest maintenance risk.**

   [Adapters](dashboard/src/data/adapters.ts:23), [queries](dashboard/src/data/queries.ts:22), [System](dashboard/src/pages/system.tsx:132).

   I confirmed that the adapters accept:

   - An approval for an unsupported tool with required display fields missing.
   - An empty System record.
   - Capability flags containing string `"false"`, which the capability check treats as enabled.

   The screens then assume those records are complete. An unknown approval tool reaches `toolTemplates[item.tool]` and subsequent property access; System assumes the fourth service is host telemetry. Tool version `2`, policy descriptions, dates and particular IDs are embedded in presentation code.

   This contradicts the promised extensibility and truthful-status contracts. Adding a ToolGate tool should not require updating a dashboard union and renderer before its approval can even be inspected.

   **Fix:** use resource-specific validated adapters, stable identity references, and safe unknown-tool rendering. Move fixture facts into fixture records. The first real integration should complete one conversation → approval → receipt journey through those contracts.

   **Cut/defer:** further Jobs controls, bespoke Git controls, native packaging and live-avatar work. Keep Character Studio’s requested configuration surface, but stop expanding the mock product before proving the real seam. The small registry is not the overbuilding; maintaining a broad fictional backend alongside the real one is.

4. **Wrong · The palette is a searchable developer command list, not the extensibility spine.**

   [CommandSearch](dashboard/src/platform/slots.tsx:149), [responsive hiding](dashboard/src/app/reshape.css:752).

   Against [Vapi, Superhuman and StackAI, references §3](docs/research/design-references.md:52): there are no capability tags, shortcut hints, descriptions, recents, page navigation or arrow-key command selection. Available commands display internal IDs.

   It only mounts inside a conversation, always with session selection; message commands therefore remain unavailable there. Below 1100px, CSS hides its trigger. There is no global keyboard shortcut to recover access.

   **Fix:** mount one global Ctrl/⌘K palette. Generate page entries from routes, provide meaningful command metadata and current selection, and use keyboard-selectable rows. Show capability labels and unavailability reasons. Defer recents until this basic path works.

5. **Wrong · “Quiet” sometimes means “we haven’t loaded the answer.”**

   [Inbox heading](dashboard/src/pages/inbox.tsx:320), [query freshness](dashboard/src/data/queries.ts:13), [ActionStatus](dashboard/src/components/action-record.tsx:35).

   Inbox says “Nothing waiting on you” and “0 decisions” while initial requests are pending or have failed. Missing Inbox IDs also receive the restful empty-queue treatment. The shared `EmptyState` says “Nothing needs your attention” even for a filtered Journal with no matches.

   Meanwhile, a mounted Inbox has no polling or subscription; `staleTime` does not schedule refresh, and window-focus refresh is disabled. A quiet open dashboard can remain unaware of new work.

   Completed actions also manufacture `live` evidence in the renderer using `fixtureLive(receipt)`. Its timestamp is preview startup, not receipt time: a newly completed action after an hour can immediately appear stale.

   This breaks truthful absence and [philosophy §2](docs/philosophy.md:27), rather than achieving Trello/Reddit’s intentional rest states.

   **Fix:** distinguish loading, unavailable, missing record, filtered-empty and verified-empty. Refresh queue evidence through polling or subscription. Put dated receipt evidence in the record; do not manufacture it while rendering.

6. **Wrong · Scroll continuity breaks when leaving the policy inspector.**

   [Conversation restoration effects](dashboard/src/features/messenger/page.tsx:443).

   Opening policy inspection removes the message scroller. Closing it mounts a new scroller, but restoration depends only on session ID, message-data availability and hash—not inspector state. Those dependencies have not changed, so the saved position is not restored.

   Ordinary contact switching has a session-keyed store for draft, reply target and scroll. This specific internal navigation bypasses that mechanism.

   **Fix:** keep the conversation mounted beside an optional inspector, matching Discord’s reference, or restore through the scroller’s mount lifecycle. Verify a nonzero scroll position through conversation → inspector → conversation, including during streaming.

7. **Wrong · Chats defaults to a directory, and search silently ignores its filter.**

   [ContactList](dashboard/src/features/messenger/page.tsx:63), [submission handler](dashboard/src/mocks/handlers.ts:46).

   The vision says Chats is **every conversation, most-recent first**. The default instead shows a fixed contact list; history requires selecting “Sessions.” Typing a search switches to session results but stops applying Agents/Groups filtering.

   Submission also never updates session `updatedAt`, and the coordinator does not refresh sessions after submission. Even the history mode therefore cannot reflect recent activity correctly. Starting a conversation is hidden inside an existing conversation’s title menu.

   **Fix:** default Chats to recent sessions with Companion pinned; provide a clear contacts mode and list-level new-conversation picker, borrowing Podia. Combine search and filtering in one predicate. Update recency on accepted activity.

8. **Wrong · The title-face shortcut opens settings instead of the Companion.**

   [Sidebar face](dashboard/src/components/shell.tsx:37), [placement CSS](dashboard/src/app/reshape.css:203).

   The locked vision asks for the face beside “Conker” to open the Companion screen. It opens `/companion`, which is Character Studio. Home and the pinned contact correctly resolve to the same remembered conversation; the face introduces a different destination.

   The tile variant removes the locked title-face placement and inserts a 98px portrait with a floating settings button into the contact list. Structurally, it consumes list space like a profile promotion rather than a pinned DM.

   **Fix:** keep the compact title variant and route its face to Home. Keep Studio in the owner menu or an explicit settings action. Drop the tile variant.

   Likewise, a separate terminal service does not require a top-level Terminal navigation item. Put its entry inside System as the vision requests; retain the separate authentication and execution boundary.

9. **Wrong for maintainability; weaker visually · The redesign is an override layer over the previous design.**

   [Original stylesheet](dashboard/src/styles.css:103), [reshape stylesheet](dashboard/src/app/reshape.css:1).

   Roughly 2,500 lines of global CSS retain the old thread/composer styles while overriding sidebar widths, spacing, cards and breakpoints later. New features inherit both generations. That is a direct route to UI rot.

   Remaining unnecessary nesting includes approval disclosure border → padded detail body → padded, filled JSON block, and Journal disclosure → inspector → tabs → action record. Every inspector gets a Context tab whose current contribution is generic fixture commentary.

   Against Literal and the [dark-first reference](docs/research/design-references.md:103), the concrete visual weakness is hierarchy: numerous 0.59–0.65rem labels, permanently visible message actions and implementation commentary compete with the conversation. Calmness is being attempted partly through tiny text.

   **Fix:** remove obsolete CSS and give each surface one style owner. Flatten secondary disclosures; remove the generic Context tab. Move diagnostics/scenario controls out of daily-use chrome and use readable secondary type.

   I found **no raw dashboard hex colors**. Dark tokens have deliberate surface levels and foreground pairs; calling this merely inverted would be unsupported. The single `ThemeProvider` and toggle correctly add/remove `.dark` in source, but **both-direction browser behavior remains unverified here**.

10. **Weaker than the references · Character Studio previews appearance, but not character.**

   [Studio form](dashboard/src/features/character-studio/page.tsx:137), [preview](dashboard/src/features/character-studio/page.tsx:283), [portrait fallback](dashboard/src/features/character-studio/portrait.tsx:14).

   Against [PlayAI, Linktree, Zapier and Fin, references §4](docs/research/design-references.md:71): speaking style is an unstructured textarea, and the preview always says the same sentence. There are no per-theme portraits or controls to add/remove expressions.

   There is also a concrete fallback defect: removing a mapped asset leaves its expression mapping dangling. Portrait lookup then shows the placeholder instead of trying the available neutral asset. “Saved” also remains visible after subsequent edits.

   **Fix:** provide a few described speaking-style choices plus customization, an explicitly illustrative preview, light/dark portrait mappings and dirty-state feedback. Repair mappings on removal and resolve fallback after checking asset availability. Keep live rendering deferred; more setup steps would not fix these problems.

Before showing it to anyone, I would fix these three:

1. **Make one approval genuinely judgeable:** structured delta, trustworthy provenance, cost/effect and functioning clocks.
2. **Complete the registry’s visible promise:** global capability-tagged palette, registered inspector panels and an enforceable action cap.
3. **Remove false certainty:** validated resource contracts, truthful Inbox loading/error states and dated evidence from records.

The one thing to preserve is **application-owned run and action identity**. [RunCoordinator](dashboard/src/data/runs.ts:5) survives conversation unmounts; Home and pinned Companion share a destination; delegation stays inside `Run`; and Chat, Inbox and Journal consume the same action record. Keep that ownership model intact.
