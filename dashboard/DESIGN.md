# Conker dashboard design system

## Shell and places (24 October)

The owner-approved structure (prototype v7, conker-ui brief): a floating sidebar with **Ask Conker**
(new chat) and the light/dark switch on top, then places only, in three groups: Overview (Home,
Inbox, Chats), Workspace (Projects, Memory, Agents, Tools, Cron jobs) and Server (Server, which
folds open to its sections, and Settings). **Search** (Ctrl/Cmd+K) sits in the top bar. No chat
history, profile badge, help or status links in the sidebar; Sign out and the Appearance settings
live in Settings, unfinished setup shows at the top of Home.
`/` opens Home, the glance-and-go screen. Tasks, Runs, the activity log, Artifacts, Skills, Native
sessions and Setup stay reachable from search and from the pages that own them. One main view: the
open-views tab strip is gone. On a phone the top bar has the menu button (carrying the Inbox count),
the page name, Search and Ask Conker; the menu opens the same places. Desktop collapses the sidebar
to icons with tooltips. Source of truth: `src/components/gateway/navigation.ts`.

## Home (24 October)

Glance and go (prototype v7): a greeting, unfinished setup if any, then an asymmetric bento where
tile size follows priority. **Needs you** (largest: at most three decisions, then ideas, with the
true total and a link to Inbox), **Plan allowance** (one meter per Claude and ChatGPT window from
Pi's `/plans/usage`: "% used" with the reset time, amber from 80% used, Pi's default alert level,
always next to the number; "Checked 13:05", or "may be out of date" after an hour; "No readings
yet" when nothing was read; "Not connected yet" on a server older than the route), **Coming up** (next enabled cron jobs), **Conker’s work** (runs today and a
14-day bar chart; it says when only the latest 100 runs were counted), **Completed**, **Decided by
you** (today) and **Quick actions**. Six columns on wide screens, two on tablets, one on phones (no
holes). Every tile has its own loading, failure ("Not loaded" + Try again) and render-error state; a
failed source never shows as empty. The Inbox count everywhere is decisions plus open ideas, the
same things Home counts. Model: `home-model.ts`, checked by `check:gateway` (check-gateway-today).

**Jump back in** (12 November) sits above the bento: one card per unfinished or recent thing (an
unpublished tool or workflow draft, an unsent message, the last chats opened, a task in progress or
blocked), newest first, at most six, each with its `IdentityMark`, title, kind and age, opening it
where the owner left it. Two across (three when Home is wider than 1000 px), a swipe row on phones; "All chats" and "All
drafts" lead to the full lists. Hidden when empty; a source that did not load says so with Try
again. Pi keeps no "last opened" time, so this browser remembers opened chat ids (never titles) and
shows a chat only while Pi still lists it. Model: `home-resume-model.ts` (check-gateway-resume).

## Inbox (25 October)

Willow-style, as the owner asked: one `InboxCard` per item (never rows inside one box), every kind
in the same layout (`src/components/inbox/inbox-card.tsx`). Folded, a card is one glance: the mark,
a short title, a muted "source · subject" line, the one answer that settles it and an X for "not
now". Tapping it opens the item in place: the main thing first, then every answer, then an
"Advanced ›" fold with the record (who asked, when, which chat, IDs, exact arguments). The server's
approval level decides the proof: a level 2 yes first asks "Are you sure?" with where it goes, and
a level 3 action has no folded yes, only Review, and asks for the password. X moves the item to
**Later** in this browser with Undo; Later only reorders, nothing is decided. Filter chips (All,
Decisions, Ideas, and From AI jobs when there are notes) on top; no text box. An uncertain decision
shows the warning style with Check again and never retries by itself. Failed loads show
`InlineError`s and the summary says so, never "All clear". Handled keeps what was decided.

## Lists in cards (25 October)

Long lists follow the approved prototype (v4): a narrow page with one card that holds its own search
on top, one line per item (icon, a title that says what it is, a muted sub-line, a time) and a
footer for paging and end-of-list notes. The shared pieces are `ListCard` and `ListLine` in the
design system (`src/components/design-system/list-card.tsx`); Chats, Cron jobs, Projects,
Artifacts, Agents, Teams, Skills, Tools, MCP tools, Memory's List, Activity's Tasks and native
sessions use them. Filters are `FilterChip`s with counts under the search (Cron jobs: All / Enabled
/ Paused; Inbox the same way); Archived chips appear only once something is archived, so an empty
filter never shows. While a list loads it shows `ListSkeleton`; if it fails, `InlineError` takes
the card's place and refreshes itself when the server answers again. Activity's Runs and Activity
log are `DataTable`s, whose search sits in the top bar through `WorkspaceSearch`.

## Details open in place (25 October)

No side windows (owner, 24 October). Choosing an item opens `InlineDetails` directly under it in
the list (Tools, Skills, MCP tools, Server services and backups, native and Codex sessions); data
tables (Activity) open it in the page flow above the table. The heading takes focus, Escape, the
close button or choosing the item again closes it, and focus returns to the item. `InlineDetails`
takes `open` / `onOpenChange`. Dialogs remain for focused creation and confirmation
(TaskDialogContent, ConfirmationDialog). The chat's views (Context, Thinking, Logs) open the same way, directly under the chat bar, on every
screen size.
On a phone the page's main action (`keepVisible`, e.g. New task) stays in the top bar and replaces the
generic Ask Conker button; every other page action sits in the "…" menu, so the bar keeps one line.

## Server actions (30 October)

Server > Services and Server > Backups run the host helper's operations (ADR-0014) through the
gateway: reads with the session, actions with the password bound to the exact id, operation and
arguments. Both use the one template: rows with a state mark open their details in place, where the
action sits after the facts. The password dialog names the effect ("Restart Memory. Conker can't
recall or save memories until it is back.") and its button is named after the action. Each action
shows the helper's receipt in the shared state words (Working with its step, Done only on the
receipt, Failed with the helper's reason, Unknown with a Check that only reads); a lost answer is
Unknown and is checked by its id. One action at a time: buttons wait while one runs, a backup lock
or a held recovery shows why, and a 409 from the helper says "Didn't start: ... Nothing ran." The
Backups page always says where the backups are and what that place does not protect against
("Same computer: lost if this PC dies", from `separateDisk`); with no folder saved it gives the
`conker setup configure protection` command. A 503 says the server helper isn't running and lists
the commands that still work. Overview lists recent server actions, live first, then Unknown and
Failed. Preview every state with `?preview-host=` (see `src/dev/fake-gateway-host.ts`);
`scripts/server-actions-shots.cjs` takes the screenshots.

## Chat-first companion — 9 October

The owner chose a full product redesign around a reliable daily companion.

`gatewayDestinations` and `gatewayPageNavigation` in `src/components/gateway/navigation.ts` own
the labels and sections used by the sidebar, global search and header. Setup status
comes from the setup service; an idle conversation says nothing about provider
or tool readiness.

The setup card at the top of Home and the Setup page share one authenticated, client-scoped read.
Opening Setup refreshes its evidence; visible focus, reconnect and visibility
events trigger at most one automatic read per 30 seconds, without a timer loop.
Explicit refresh and saved setup choices can refresh immediately. A failed read
shows status unavailable even after prior completion; retained page evidence is
labeled as the last verified result. Leaving the authenticated workspace clears
the shared cache and cancels pending reads. Setup counts describe first-run
choices and evidence, separately from a chat's current ability to answer.

Providers' Connections list distinguishes a current response from a check in
progress or an unavailable read. During refresh and failure, retained provider
and model names are explicitly last-checked evidence; they never retain a Ready
label. Reads have a 15-second deadline, an explicit retry, and owner-identity
fences. Its refresh leaves the model editor and its unsaved choices
alone. Runtime health evidence is separate from the subscription connection
card's cached status. Catalogue reads cannot overwrite a newer
model-settings save, and authentication changes discard both kinds of evidence.

Subscription cards distinguish checking, verified current status, owner verification,
provider work and an unconfirmed outcome. Status reads time out after 15 seconds;
provider-operation deadlines start only after owner verification, allowing 75 seconds
for the host's bounded provider call. An unconfirmed operation is never replayed.
Check status reads current evidence while retaining the earlier uncertainty notice.
Only pending sign-ins poll: one read at a time, three seconds after completion, at
most 20 reads while visible and online, then an explicit Check status. Same-login
device codes and controls stay in place during reads and visibility pauses, labeled
as last checked. Failed reads, changed login identity, authentication changes and
teardown clear private sign-in content. Busy controls retain keyboard focus without
accepting duplicate operations. Subscription status does not prove inference readiness.

The chat's views (Context, Thinking, Logs) open on request in `InlineDetails` under the chat bar,
on every screen size. Their source reads run only while a view is open.

The chat workspace and Chats share one recent chat list in the
authenticated workspace. A visible, online workspace checks it
every 15 seconds and on focus or reconnection. Background reads retain collection
rows, search and keyboard focus; a failed read labels the retained list and offers
Try again. Hidden/offline workspaces pause reads. Authentication changes and
workspace resets discard the list and reject late responses. These reads never
send messages, change drafts or resolve uncertain actions.

Recent discovery contains at most 200 chats. Absence from that window never means
deletion or forgetting. Explicit forgotten records cross the
shared privacy boundary before any list consumer can display them.

Chats browses a separate compact directory, in pages of up to 50 records, so
older conversations remain reachable. Search matches full stored titles and
summaries before paging; displayed previews mark truncation. The count describes
loaded chats, never the total history. Load older (or Load more results) appends
the next page. Refresh chats replaces the loaded page chain with a fresh first
page. Each page reflects its last read; the interface states this explicitly.
Shared recent discovery can signal newer chats but never silently rewrites older
pages. When the earlier discovery evidence is unknown, the notice asks to check
for newer chats rather than claiming a new chat was found.

Search remains mounted while results load, fail or become empty. Changing the
query clears the previous results and cursor. Refresh failures preserve only
the same query's results, with their stale-state explanation. Invalid cursors
retire continuation and offer an explicit refresh. A page containing only
forgotten records still exposes Load older when another page exists. Known
forgotten records are masked immediately; authentication and workspace changes
clear the directory and reject late replies. `ListCard`'s optional
emptyContent slot lets these states retain the shared search and toolbar.

Use the existing theme and typeface, `--sidebar` for the navigation surface and
`--background` for the work surface. Corners follow `--radius-md` / `--radius-sm`;
custom themes and radius remain functional. The header retains the shared appbar
geometry; when its search slot is empty the conversation title and actions use the
available width (`src/styles/connected-workspace.css`).

The mobile sidebar restores focus to its actual opener after dismissal, including
keyboard shortcuts and its internal close control. Choosing a destination moves
focus to the main content instead. Closing must not steal focus from another open
dialog, a newer sidebar opening, or an authenticated workspace that has unmounted.

This shell change preserves source-owned async, verification, permission and
privacy contracts. Background thinking is an explicit per-message opt-in;
automatic model choice belongs to the talking model. Composer behavior is owned
by the runtime workspace rather than by navigation.

Cancel thinking belongs to the specific background request. A newer Think
request never inherits an earlier cancellation's pending state or error. Each
cancellation and confirmation read has a 15-second deadline; an unconfirmed
outcome offers Check thinking status, which only reads and never retries the
cancellation. Talking and its draft remain independent. Authentication changes,
workspace resets, selection changes, forgetting and teardown reject late replies.
Another Think request replaces unfinished analysis; ordinary talking preserves it.

Composer drafts save privately on the Conker server, separately from messages,
model input and memory. A quiet status beneath either composer distinguishes
loading, saving, saved, unsaved, offline and unconfirmed saves. Browser storage
contains no draft text or options. Only an interrupted new-chat start's request
identity, revision and browser-session identity may survive in session storage.
Logout clears in-memory editors and that recovery identity; server drafts remain
available after sign-in. Forgetting a chat clears its draft and pending content.

Every draft has a server revision. Concurrent changes preserve the local editor
and expose both versions with their model, skills, Think, research and new-chat
privacy choices. Use saved version and Keep my edits require the shared
`ConfirmationDialog`, bound to the exact versions shown. A newer change stops
the choice. Unconfirmed saves are read back before another write; offline edits
remain in memory with a leave-page warning until saved. Saved drafts do not
trigger that warning by themselves.

New chat remains an unsent draft until Send atomically promotes it to a chat.
An interrupted creation recovers the same chat and leaves sending explicit.
The uninterrupted first send requires the exact promoted draft; another tab's
replacement never becomes an automatic message. Each send freezes its draft
revision and options. Same-request retries reuse that snapshot, and consuming
an older submitted revision preserves newer edits. Task requests keep their
separate review and scope. Submission recovery is visible beside the composer,
independent of draft-save status. Long recovery content scrolls within a bounded
composer region on small screens.

Chat code loads in its own module while the workspace remains mounted across
navigation, retaining streams and recovery state. The production entry-size
guard remains unchanged.

Calls & usage is a shared, initially closed disclosure in chat Details,
the chat's Logs view and recorded run details. Its component and authenticated
read load only while opened on a visible surface. Closing, changing routes or
forgetting the source cancels the read; authenticated session changes reject
old responses. Usage is never retained in browser storage.

Conversation and Background thinking have separate call lists and summaries.
Complete metrics use the server's totals; incomplete metrics show a labeled
known subtotal only when some calls reported that field. Otherwise they say
Not reported. Empty lanes say No recorded calls. Older partial coverage and
truncated call lists are explicit. Configured model, requested adapter route and
provider-reported identity are distinct. Summed call time can include overlapping
work and is never presented as elapsed turn time. Costs come only from reported
measurements; the UI neither estimates subscription costs nor treats missing
cost as zero. Model-selection reasons keep their existing separate disclosure.

Saved user messages have a quiet, persistent memory receipt beneath their text,
separate from hover-only message actions. Remembered (with Undo) means a verified
MemoryGate acknowledgement; chat persistence, model prose and scoring never
create that claim. Filtered and excluded outcomes explicitly keep the chat.
Original message privacy governs exclusion, and later forgetting masks earlier
admission. The Remember starter only fills a request and never enables memory.

Receipt reads are separate from transcript and submission recovery. Only the
visible authenticated chat checks recent metadata, at most six reads in a
bounded backoff cycle. Hidden pages, route changes, logout and forgetting cancel
that cycle. Pending checks then pause with an explicit Check memory status
action. Older messages use that action to read one exact receipt, without a
request per historical message or reloading the transcript. Receipt state stays
in memory; no text or receipts enter browser storage. Errors and explanations
use fixed copy, with no delivery exception text or admission scores.

Saved turn outcomes stay visible in the transcript after a reload. The latest
failed, interrupted or stopped attempt has a compact outcome panel; older
terminal attempts remain in Details after later work succeeds. Every still
unresolved action remains visible. These panels use saved turn identity, never
guess a message association from nearby text or timestamps. They distinguish
no recorded tool action, recorded action and unconfirmed effects.

Checking history only reads persisted state. Reply-only recovery is explicit
and restricted to an acknowledged acted-without-reply state; approval
continuation retains the existing review flow. Other uncertain outcomes link
to the saved action and do not offer an unsafe generic Retry. Every callback
rechecks current turn state, source privacy, selected chat, auth and operation
locks. No outcome panel remains visible after source forgetting. Failure copy
uses known public cases or a safe generic explanation, never provider errors.

This is the implementation contract for the active dashboard. The owner's accepted Chats layout is the reference for collections throughout the app: use the same components, not copied markup or a similar collection of classes. Product direction remains in [design-language.md](../docs/reference/design-language.md).

## Structural workspace rules (4 October)

The active gateway workspace translates SiYuan's organization and Asri's quiet
finish into Conker's existing semantic theme, not their literal styling.
Corresponding tasks share components; specialized canvases and consequential
decisions retain their own anatomy. Review each component against the owner's
six questions: primary task and competition; navigation/toolbar/content/inspector
placement; duplication and grouping; surface meaning; friction versus visible
consequences; and whether it directs the user toward their intended action.

| Component family | Shared rule | Active consumers |
| --- | --- | --- |
| Find a record | A list searches inside its own `ListCard`; the appbar keeps Search (Ctrl/Cmd+K). A `DataTable` puts its query in the appbar through `WorkspaceSearch`, whose scope menu offers Search all Conker with the same query. No second page-search field. | Chats, Projects, Agents, Cron jobs, Artifacts, Tools, Skills, Memory List; Activity's tables |
| Browse records | `ListCard` + `ListLine`; one quiet card per list. Grouped rows use `CollectionSection` + `CollectionRow` (64px minimum row). | The record libraries; Server Services and Backups |
| Compare structured records | `DataTable` uses `CollectionToolbar` and `collection-surface`, preserving sorting, columns, keyboard opening and pagination. Native tables use the shared table primitives, not separately styled HTML. | Activity's Runs and Activity log |
| Edit related fields | `WorkspaceSection` owns the 16px semibold heading, readable description, 16px within-group gap and 24px separation. `StudioSection` delegates to it. | Settings > Providers, Server pages, Character Studio |
| Inspect a selection | `ReferenceSection` is a quiet topic divider inside the already framed inspector, never another card or toolbar slab. Option sets use a named select rather than a row of pseudo-command buttons. | Memory and tool-step inspectors; details opened in place |
| Loading / empty | `ListSkeleton` / `CollectionLoading` reflect the rows, not decorative dashboard cards. Empty feedback names the state and provides the appropriate creation or filter recovery action. | Collection libraries, lazy workspaces, Activity |
| Status / priority | Align status at the row end, explanation beneath the record label. Reserve raised card tone and elevation for actual priority decisions, composer, and floating overlays. | Server, Home, Inbox, Chat |

Keep the main shell flat and the shared appbar geometry consistent. Meaningful
record headings remain; duplicate route headings do not. Search has one visible
page entry point, with its current scope named by the field and scope menu.
Guidance about permission, expiry, model
processing, provenance and recovery stays visible at the relevant action.
Search/list hints can follow results; they do not compete with the find controls.
The appbar responds to workspace width, not just viewport width: below 900px of
available workspace its search entry becomes an icon. Route actions measure
their assigned column, keep the primary command visible, and disclose secondary
commands when narrow or when there are more than two. Mobile result counts stay
available to assistive technology without consuming a separate visual row.
Inspectors present preview, explicitly requested
content and relationships before destructive commands; the consequence stays
beside that command.

Shared UI does not mean shared authority or transport state: keep source-owned
abort/revision/draft hooks in their existing modules. Centralize presentation
and composition only. Use the shared tokens, native controls, dark arrowless
tooltips and unclipped/reduced-motion icon behavior already in the system.

Settings > Providers reuses `WorkspaceSection` and native controls; don't invent a
new provider palette or card grid. Show pending authorization, cancel, failure and
disconnect consequences in place. Never retain OAuth codes in browser storage or
present connection as proof of model access.
Design guards enforce shared slot ownership and semantic tokens; the workspace
primitive render checks cover grouping, list semantics and empty/loading states.

`WorkspaceSearch` keeps query/filter state owned by its source and portals only
the control into the appbar. While it is mounted it replaces the universal-search
trigger there; pages without one keep that universal entry. On narrow workspaces the
same control opens a focused, viewport-bounded search popover. Search all Conker
opens the universal search with the current query. `CollectionSearch` remains
an inline field only for task-specific pickers inside forms/dialogs, not another
page query. Review necessity and scope before component styling, not afterward.

## Ownership and imports

| Need | Use | Owner |
| --- | --- | --- |
| Connected shell: sidebar, appbar and work area | `ConnectedWorkspaceShell` over `LayoutFrame variant="canvas"` | `src/components/gateway/workspace-shell.tsx`, `src/components/layouts/layout-frame.tsx` |
| Appbar: page name, Search, actions and section links | `GatewayHeader` over `WorkspaceAppbar` | `src/components/gateway/header.tsx`, `src/components/design-system/workspace-chrome.tsx` |
| Scrolling page body with page gutters | `GatewayPageFrame` | `src/components/gateway/page-frame.tsx` |
| Page actions in the appbar | `PageHeader actionsOnly` with `WorkspaceAction` (`keepVisible` for the phone's main action) | `src/components/design-system/primitives.tsx`, `src/components/design-system/workspace-chrome.tsx` |
| Route sections | `routeSections`; the appbar's `AppbarSections` renders them as `?tab=` links | `src/components/gateway/navigation.ts`, `src/components/appbar-navigation.tsx` |
| Long list with its own search, filters, sort and selection | `ListCard`, `ListLine`, `FilterChip` | `src/components/design-system/list-card.tsx` |
| Details under an item | `InlineDetails` | `src/components/design-system/overlays.tsx` |
| Compare structured records | `DataTable`, with `RecordItem` rows below 1280px | `src/components/data-table.tsx` |
| Collection or table filters | `CollectionToolbar`; a table's search moves to the appbar | `src/components/design-system/primitives.tsx` |
| Task-specific option search | `CollectionSearch` inside the picker | Same design-system module |
| Group heading and divided rows | `CollectionSection` + `CollectionRow` | Same design-system module |
| No results / no items | `CollectionEmpty` | Same design-system module |
| Related form fields / section heading | `WorkspaceSection`; Studio delegates through `StudioSection` | Same design-system module; `src/components/character-studio/fields.tsx` |
| Topic within a reference panel | Quiet `ReferenceSection` divider | `src/components/reference-section.tsx` |
| Inspect a canvas selection without blocking further selection | `WorkspaceInspector` with `OverlayBody` and `ReferenceSection` | `src/components/design-system/overlays.tsx` |
| Loading and failure | `ListSkeleton`, `InlineError`, `ConnectionBanner` and the error fallbacks | `src/components/resilience/` |
| General buttons, fields, cards, badges, dialogs | Existing `@/components/ui/*` and `StatusBadge` | coss ui primitives plus application status composition |
| Dimensions and density | CSS tokens | `src/styles/design-system.css` |
| Colors and radius | Semantic CSS variables and `ThemeRuntime` | `src/index.css`, `src/components/theme-customizer/runtime.tsx` |

Import the shared application patterns from `@/components/design-system`. Their exported TypeScript props are the API. Route code supplies content, destinations and state; these components own matching dimensions, insets, typography, dividers and hover/focus treatment.

Declare a route's sections in `routeSections` in `src/components/gateway/navigation.ts`. The shared appbar owns their links and selected state. Route content must not add another navigation strip below its title. Memory is an explicit exception for local workflow modes: its Map/Tree/List select belongs to the workspace toolbar and uses the `view` URL parameter. The appbar remains application navigation.

For working collection examples, read `src/components/gateway/chats-workspace.tsx` and `src/components/gateway/projects-workspace.tsx`. Both use the same `ListCard` pattern. Their content differs while corresponding UI elements match.

`WorkspaceSearch` takes a required accessible `label` and normal input props (`value`, `onChange`, `placeholder`), plus optional `onSubmit` for server retrieval. It owns appbar placement, scope, compact presentation and accessible focus behavior. `CollectionSearch` is its field primitive and the inline task-picker alternative. `CollectionRow` takes `to`, `title`, `description` and optional `descriptionTitle`, `leading` and `trailing` slots.

`DataTable` uses `WorkspaceSearch`. It retains columns, sorting, filters, selection and pagination where structured comparison needs them. Do not replace a useful data table with a collection merely to make every screen identical.

## Interaction placement (owner-approved, September 16)

Choose the surface from the user's task, then reuse the same pattern wherever that task occurs. This is a frontend contract; it does not imply a connected executor or permission to add backend behavior.

There are two overlay kinds (owner, 7 November): the centered `Dialog` for create, edit, confirm and connect, and the Ctrl+K palette (`src/components/gateway/universal-search-dialog.tsx`). A view the owner keeps open while working is an inline panel in the page (`InlineDetails`, including the chat's views), never an overlay. There are no side sheets. The only edge sheet left is the phone sidebar, which is navigation.

| User intent | Surface / shared pattern | Examples |
| --- | --- | --- |
| Create an item or change several related fields | Centered `TaskDialogContent` inside the shared `Dialog`; `size="wide"` when the content needs room | New AI job, New agent, Add a memory, Hand off this chat, Import character |
| Configure multiple sections with previews or long-lived navigation | Dedicated page with appbar sections | Settings, Character Studio, Setup |
| Inspect a record while preserving list position | `InlineDetails` under the item, with `OverlayBody` and `ReferenceSection` topics | Tools, Skills, MCP tools, Server services, native sessions |
| Inspect successive canvas points without a modal interruption | Shared nonmodal `WorkspaceInspector`, docked right on desktop and below the canvas on mobile | Memory records, tool steps |
| Make a small immediate preference change | Labeled inline control, with state feedback | Light/dark switch, Incognito |
| Review a consequential request with evidence | The Inbox card opened in place, its answers beside the request; the server's level decides any extra confirmation | Inbox approvals and Conker's requests; do not add a second generic confirmation |
| Delete an item | `ConfirmationDialog`, naming the target and consequence; Cancel receives initial focus | Delete chats forever, forget a memory, delete an imported chat |
| Submit a draft | `FormActions`: feedback at the left, secondary action before primary at the right | Save/discard in Character Studio, Cancel/Create in dialogs |

Import application patterns from `@/components/design-system`. `TaskDialogContent` owns header spacing, close-control clearance, viewport bounds, scroll-body composition and corner clipping. Compose its children with `OverlayBody` and `FormActions`; a specialized form may own its scrollable fieldset. Use a 16px minimum outer dialog gutter, a viewport-bounded height, 20px internal insets, and 32px close controls inset 12px from the corner. Dialogs keep theme-derived corners; Call mode is a wide bounded dialog too.

Creation and substantial editing never share a generic details drawer. Completing creation returns to the collection with visible feedback; editing from an inspector returns to that inspector. Preserve validation, prevent accidental outside-click dismissal of draft forms, disable submission while pending, and restore useful keyboard focus when closing or moving between surfaces. Keep existing drafts, Incognito behavior and conversation feature ownership intact.

Common actions remain visible, and source links stay beside evidence. Use named buttons; reserve icon-only controls for familiar actions with accessible labels/tooltips. Secondary actions belong in a menu. Avoid duplicate page-navigation strips: the sidebar chooses roots, the appbar owns route sections and context, and the page header may own creation actions.

Activity's Runs and Activity log use `DataTable`. Supply `renderItem` using `RecordItem` below 1280px; desktop keeps the table for comparison. One table instance owns search, filters, sorting and pagination across both representations. Mobile sorting remains available. Row titles open details using real buttons; visible actions remain separate. Keep column definitions stable when selection changes so a closing inspector can restore focus to its initiating control. Tables use wrapping content and one quiet structural surface, not an elevated card. Empty states explain the next action; filtered empties offer a clear action, and creation empties link to the working creation flow.

Bounded forms scroll a normal `div` around their fieldset, with `min-height: 0` throughout the flex chain. Do not make the fieldset itself the flex scroll region: browser fieldset sizing can allow its content to overlap the footer on short screens. The action footer stays outside that scroll region. Validate this visually at a short mobile viewport, not only a tall desktop window.

Do not relocate a correctly placed feature just to touch every screen. Home remains an overview; Chats preserves message/appbar/composer ownership; Server keeps its sections separate.

## Density and layout contract

### Technical workspace chrome

Connected workspaces share `WorkspaceAppbar` (through `GatewayHeader`): a 56px primary row, a bounded 420px central universal-search entry, and right-hand
route actions. The sidebar opener appears only when navigation is hidden; its
artwork aligns to the title inset. Chat and Memory retain ownership of their
stateful controls but use this frame. `PageHeader actionsOnly` portals actions
into the mounted appbar without leaving an empty content band. Specialized
editors retain meaningful record names, not repeated route titles.

Local collection filters remain labeled separately from universal search.
Secondary sections and graph controls occupy a quiet, unfilled secondary row.
Main shells have no elevation. Inner decision surfaces and composers retain
their semantic shadow tokens; floating overlays retain their stronger depth.

Route commands use `WorkspaceRouteActions`: on phones keep the primary command
reachable and disclose secondary commands in the named workspace-actions menu.
Character editor sections are unframed; genuinely framed previews remain raised.

### Universal search contract

The command dialog progressively groups pages, authenticated metadata, retained
literal text and explicitly enabled semantic retrieval. Match labels survive
optional AI ranking. Local filters are not universal search. Opening a result
navigates to its actual source; search never executes work or changes authority.
Abort obsolete queries, debounce typing and retain literal results when providers
fail. Expose partial, unavailable and degraded coverage rather than inventing hits.

Global search belongs to the authenticated workspace. Authentication or workspace
identity changes close it and clear query and results. A shared forget notification
immediately clears all record results and cancels earlier reads, then repeats the
open query without moving focus. Known forgotten conversation identities and
session-linked result URLs remain masked even in a newer stale source response.
Opaque derived records expose no session identity; their renewed eligibility is
owned by the source's privacy check, not inferred by the browser. Page commands
remain usable when record reads fail. Settings, stage and pagination reads have
deadlines; explicit retry keeps recovery available without an automatic retry loop.
Whitespace-only changes preserve the current request and its results.

Settings use verified writes with revision checks. Metadata and literal text need
no provider; semantic retrieval and bounded `search-ranking` are opt-in. The model
role owns its model, timeout and fallback. Conversation metadata matches retained
titles and summaries before the cap of 200 eligible results; other metadata
adapters still use bounded scans. Memory library text is limited to retained previews, and only
MemoryGate supplies a semantic index. Other sources have no semantic capability
until their source-owned index adapters exist. Do not describe this as complete
cross-source indexing. Private and forgotten origins remain excluded. No raw
activity payloads, protected tool inputs, credentials or filesystem crawling.

| Role / token | Default contract |
| --- | --- |
| Default button / input / select: `--control-height` | 40px / `2.5rem` |
| Compact control: `--control-height-sm` | 32px / `2rem` |
| Large control: `--control-height-lg` | 44px / `2.75rem` |
| Collection search: `--collection-search-height` | 40px / `2.5rem`, full available width |
| Collection row: `--collection-row-height` | Minimum 64px / `4rem` |
| Collection portrait: `--collection-portrait-size` | 32px / `2rem` |
| Page sections: `--page-section-gap` | 24px / `1.5rem` |
| Related collection controls/results: `--collection-section-gap` | 16px / `1rem` |
| Appbar section navigation | 40px links in a horizontally scrollable row below the 56px appbar toolbar |
| Standard page title | 30px type / 36px line height, semibold weight |
| Compact page title (`PageHeader density="compact"`) | 20px type / 28px line height, semibold weight |
| Page description | 14px type / 24px line height |
| Compact description | 14px type / 20px line height; 4px after its title |
| Page insets (`GatewayPageFrame`) | 16px mobile / 24px desktop on every side |
| Width | Full available width; no centered route-wide maximum |
| Corners | Derive from editable `--radius` |

Dimensions describe roles. A small inline action can use the compact variant; collection search uses one shared 40px pattern across lists and tables. Avoid overriding equivalent roles with page-owned `h-*`, `px-*`, font, radius or palette classes. If a new role is needed, add an explicit shared variant and document it here.

### Priority, grouping and screen purpose

Consistency means equivalent controls behave and look alike; it does not mean every screen repeats the same stack of cards. Define the first useful action or piece of information before choosing a composition. The selected theme owns color, type family, tracking, corners and elevation; the screen owns reading order and emphasis.

- **Collections** (Chats, Agents, Tools, Cron jobs): use `GatewayPageFrame` with a `ListCard`. Keep heading/help, search and results close, with 16px between related regions. Keep the 64px minimum row and usable controls; reclaim overhead before shrinking content. At 1280×720, aim to begin an ordinary unfiltered list in the upper third to two-fifths of the viewport, allowing real content to wrap. Tabs stay in the appbar.
- **Forms and settings**: retain the standard heading, 24px between meaningful sections and existing task-specific editors. Bound long prose inside the full-width page when it aids reading; do not cap the whole route.
- **Conversations and tools**: preserve their viewport-filling variants and existing control ownership. They do not need collection headings to be consistent. Memory uses the canvas role with its own workflow toolbar, including when showing its List view.

Use 4–8px within a label/detail group, 16px between related controls or list regions, and 24px between distinct sections. A container must communicate a boundary, state or priority. Do not enclose every heading or supporting group just to fill space. Borders define structure, muted foreground carries supporting detail, and primary color identifies actions/selection rather than decorating every heading. Keep the surface's foreground for essential information; use size and weight before adding colors.

Review the complete vertical stack, not each component in isolation. Desktop and narrow screenshots must show the leading task, readable supporting content, intact corners and reachable actions. Shared token compliance is a baseline, not a substitute for this review.

Page section links remain in one scrollable appbar row on narrow screens; the current section scrolls into view. The light/dark switch sits beside Ask Conker at the top of the sidebar; Sign out lives in Settings. Conversation appbar controls use the compact 32px control role.

`LayoutFrame` owns the viewport-height frame. The connected shell uses its `canvas` variant, so the appbar stays outside each page's own scroll region (`GatewayPageFrame`). The inset clips its children to the theme-derived radius. On mobile the sidebar opens as a sheet. Conversations keep their own transcript scroll region.

Memory and the tool editor fill the space below the appbar with their own toolbar, canvas and nonmodal inspector. Maximize temporarily fills the viewport with that workspace; Restore returns to the shared application frame. This is a canvas role, not a new default page layout.

Use minimum row height instead of a fixed clipping box. Long content, translated text, browser zoom and responsive wrapping must remain usable. Keep title/preview truncation deliberate and retain accessible names. Collection navigation should use actual links, not divs that only respond to mouse clicks.

Photo avatars use the shared neutral outlined frame. The complete image uses `size-3/4 object-contain`, leaving one eighth of the inner frame on each side. Preserve the full artwork and its aspect ratio without zoom transforms or an inner crop. No green tint behind photo portraits. Apply this proportional padding across brand, appbar, thread, collections, and studio; larger studio previews do not change collection density.

Scrollbars share `--scrollbar-size` (10px) and theme-derived thumb tokens in `src/styles/design-system.css`. Native scroll containers and the `ScrollArea` primitive use a rounded thumb inset by 2px, a transparent track, brighter hover, and the primary accent while dragging. Firefox uses its native thin scrollbar with the same resting colors. Preserve native wheel, keyboard, and touch scrolling; forced-colors mode retains system colors. Do not hide overflowing content's scrollbar or add route-specific scrollbar skins.

## Palette and theming

**coss ui is the shared styling authority (owner decision, 24 October 2026; it replaced the shadcnstore template).** Read [template-reference.md](../docs/reference/template-reference.md) for the pinned source, component map and rules. [color-system.md](../docs/reference/color-system.md) defines the color usage contract. The September 16 instruction supersedes the previous mixed-surface system.

Use the template's semantic pairs directly: background/foreground, card/card-foreground, popover/popover-foreground, primary/primary-foreground, secondary/secondary-foreground, muted/muted-foreground, accent/accent-foreground, and sidebar-specific pairs. Border, input, ring and chart tokens retain their standard meanings. A custom card value must render as that exact color, without an added foreground mix.

Keep standard button, field, menu, tab, tooltip, dialog and selection treatments from coss ui. Their approved opacity recipes belong to the owning primitive, recorded in `scripts/template-foundation.json`. Do not ban legitimate upstream recipes or recreate them differently in each route. Application code consumes shared components and ordinary semantic utilities; a new visual role requires a documented owner.

Conker's default look is neutral and quiet (owner decision, September 25, modelled on Kimi's layout; palette may change later): the live shell uses the floating sidebar on a soft backdrop with the main area as a white (dark: charcoal) canvas, the system font stack, black (dark: white) for primary actions, a floating composer (`shadow-composer` token, 24px radius, round send), and pill-shaped starters. Use Conker's own name, mark and wording; never another product's logo, assets or copy. Conker keeps compact density, custom navigation and controls, complete photo portraits, native scrollbars and black terminal region. Existing secondary-text/destructive-foreground contrast adjustments and labeled success/warning statuses remain explicit extensions. Custom themes, imports and radius must still work. Do not add `--surface-*` remapping, route-specific palettes, another theme provider or `!important` color overrides.

Collections own one card container. The composer, plans and requests use card roles. Tool details and reference headings use muted. Appbar and dialogs use background; sidebar navigation keeps sidebar roles. Shared field styling comes from Input/Select/Textarea, including collection searches.

The guard checks direct color mappings and upstream recipe ownership in addition to shared heading, search and navigation rules. Rendered review remains required: preset/import correctness, contrast, focus and component behavior cannot be inferred solely from token names.

## Intentional exceptions

Exceptions have a concrete UI role and narrow ownership. They do not permit an unrelated search, tab or palette implementation in the same file.

- `src/components/design-system/primitives.tsx`: owns raw shared heading/search markup (including the hidden `h1` that `PageHeader actionsOnly` adds for each page) and primitive tab composition. Other route code consumes it.
- `src/components/ui/*`: foundational primitives retain their raw implementation APIs. Product routes must use the shared application pattern where one exists.
- `src/config/theme-data.ts`, `src/config/theme-customizer-constants.ts`, `src/utils/tweakcn-theme-presets.ts`, `src/utils/shadcn-ui-theme-presets.ts`: theme definition/swatch files may contain actual color values. They must not become a place to hide route styling.
- Page-level navigation uses the shared appbar's `?tab=` section links.
- Memory owns its URL-backed Map/Tree/List view in its toolbar and the shared `WorkspaceInspector` for immediate nonmodal inspection. Its graph uses chart-derived category colors (`--memory-category-*` in `src/app/memory/memory-graph.css`) with local lightness bounds for light and dark themes; this data-visualization role does not establish a separate application palette or replace shared collection search and form controls.
- The terminal's neutral surface variables in `src/index.css` (`.terminal-surface`) keep a black command area and readable text in both themes; its info control opens the terminal's access details. These variables do not establish a separate general application palette.

Server is one sidebar place whose sections (Overview, Services, Backups, Processes, Ports, Terminal, Native sessions, Files; Containers opens from Services) are `?tab=` links under `/system`. The sidebar lists them under Server; the appbar repeats them only while a collapsed sidebar hides them. Do not embed Files in Terminal.

Modules that `src/App.tsx` does not import are outside the guard. Do not broaden exceptions just to make a new finding disappear; choose the shared component or document and narrowly implement a real new role.

## Validation and maintenance

### Gateway conversation presentation

The connected/preview gateway chat uses `ChatComposerFrame` for both the initial request and subsequent replies. It owns the input's growing height, focus-within border, unified surface and wrapping toolbar; the gateway owns model/agent/privacy controls and mutation eligibility. `conversationColumn` supplies identical transcript and reply-composer gutters. Do not duplicate those dimensions in the route.

Saved conversation headers keep the compact title, call and secondary menu. Next-turn agent/model selection, privacy and voice typing stay in the composer.

The composer bar keeps the text box, Mode and Agent (the two outlined controls), voice typing and Send. Every other control (model, template, skills, output, Think, the chat's access, Incognito, media) is a composer item registered with `composerItem` in `src/components/chat/composer-items.ts`: it stands on the bar while there is room and folds into the "…" menu when the bar gets narrow, in the fixed order of `FOLD_BELOW`, and a folded item still reports its value so its choice stays named. Starters are worded pills that fill the box and never send.

The composer's first control is the mode (Auto, Fast, Balanced, Deep). Modes are presets over complexity, Think and research; Auto takes them from the routing model's proposal for the typed draft and shows each value with its reason before sending. Any change shows Custom; sending uses the values on screen. Think and research live in the draft; complexity travels with the turn (Hard = Pi's analysis hint). Auto never invents values: without helpers or a routing model it says so and leaves the settings to the owner.

Conversation views (Context, Thinking, Logs) sit in the shell actions as one soft grouped strip of plain icons (`ConversationViewStrip`); the open view is pressed inside the strip. Each opens in `InlineDetails` under the chat bar, one view at a time, closed by default; the same icon or the close button shuts it. Phones fold the strip into the chat's "…" menu and open the view the same way. Views read saved Pi records only (turns, thinking results, memory status, usage): no timers, no invented steps. When navigation is hidden, the sidebar opener remains visible on both new and saved chat, including mobile. On a phone a chat's header has a back arrow to Chats, and a swipe right on the history does the same. `ConversationHistory` follows changing content only while near the bottom; reading older content exposes a latest-message control and linked-message navigation retains its target.

Message actions reveal on hover/focus for pointer users and remain visible on touch. A reply's action row ends with its saved turn facts after the time (model · seconds · cost, or "free"), read from the turn Pi linked to the message; a running or forgotten turn shows none. Keep user-message actions outside the bubble's layout height, avoid empty feedback rows, and retain full timestamps in accessible labels/tooltips. Runtime memory/tool evidence and approval/recovery controls remain sourced from saved turns: never turn prose into executable proposals or imply unsupported attachments/video calls.

Run `npm run design:check` for the TypeScript AST guard. It follows local static imports, exports and literal dynamic imports from `src/App.tsx`. This covers every module the app reaches while leaving unused files out.

The guard rejects standard raw `h1` headings, direct primitive-tab imports from active route modules, raw `Input`/native search fields, and hard-coded Tailwind palette/literal-color classes in reachable application code. It recognizes aliased inputs and search placeholders such as `searchPlaceholder`. It does not ban arbitrary layout dimensions or normal form fields.

`npm run lint` and `npm run build` both run the guard before their usual checks. `npm run design:check:test` proves invalid fixtures fail, valid shared patterns pass, exceptions stay narrow and inactive demos remain excluded. No additional test framework is required.

Static checks cover recognizable source patterns, not every possible runtime-generated style. Render the affected screens before finishing visual work. Compare Chats/Inbox search, tabs, rows, portraits and titles at desktop and narrow mobile widths. Check light/dark themes, a radius or preset change, keyboard focus, empty states, long content and navigation. For shared primitive changes, inspect a representative form, table and detail page as well. Record screenshots and any untested limitations.

Update the shared component and its contract first; migrate consumers together. A new page should compose these patterns from the start. Shared implementation, automated checks and rendered review are the mechanism for keeping screens consistent.


## Appbar routing

`src/components/gateway/navigation.ts` owns route paths, page sections and the sidebar groups. The router, sidebar and command search use those paths.

Every sidebar destination is an independent navigation root. Home is the entry page at `/` (and `/overview`); it is never a breadcrumb ancestor. The appbar shows the page's icon and name. Do not add back links or section tabs under page titles or in conversation headers; the phone chat header's back arrow to Chats is the one exception. Task-specific links inside content (opening a request or a source conversation) stay with their context.

Pages with sections use `?tab=` URLs. Their first section is the default; unknown values fall back to it. `AppbarSections` renders them as real links with `aria-current` on the open one, not ARIA tabs: normal Tab/Enter and open-in-new-tab behavior apply.

The appbar is sticky on scrolling pages. Global search becomes an icon below 1024px of viewport or 900px of appbar width, keeping its keyboard shortcut. Run `npm run check:navigation` alongside the design guard, affected-file lint, and build when changing route metadata or section behavior.


## Rich answers, continuity and execution

Use `RichAnswer` for both streaming and finished assistant text. Its Markdown, code, table, math and supplied-citation controls inherit semantic colors and shared dialogs/popovers. Keep code and wide tables locally scrollable; never widen the thread. Copy/export original content, neutralize CSV formulas, reject unsafe links, and leave raw HTML and remote images inert. Source IDs come from client evidence, not invented links in prose.

Answering again makes versions of one response. Previous version / Next version in the reply's toolbar switch between them; Branch from here continues from that message in a new chat.

Checks: `check:rich-answer` and `check:answer-versions`, alongside the conversation and theme checks.

## Voice typing

The microphone in the composer (`src/components/gateway/new-chat-voice-control.tsx`) starts voice typing through the browser's speech recognition (`src/lib/voice/browser-voice-input.ts`), in English. Words go into the draft at the cursor or selection as they arrive, and it never sends; pressing it again stops. An unsupported browser or a failed start shows a short message beside the button. Disabling the composer or leaving the chat cancels the recording. Enter sends; Shift+Enter inserts a newline. On a phone (touch, phone width) Enter inserts a newline and the Send button sends, as in WhatsApp, Messages and Telegram.

Run `npm run check:voice` when changing it. Automated speech events validate the UI lifecycle; they do not establish that a physical microphone or an external recognition service worked.

## Calls

The Call button in a chat's header (`GatewayCallLauncher`, `src/components/gateway/call-workspace.tsx`) opens Call mode in a wide `TaskDialogContent`. On top: the call's state (ready, thinking, paused or ended), whether voice is ready, "Video unavailable", both participants and the Focus/Character style. Then the saved transcript, a typed box (4,000 characters) with a voice-turn button, and Pause/Resume, Refresh and End call in the footer. Audio is transient; the transcript is saved. An uncertain turn offers Check saved call instead of sending again.

## Character Studio

Companion settings at `/settings/companion` (`src/components/gateway/character-workspace.tsx`) use the existing semantic colors, editable radius, shared fields and `FormActions`; this surface introduces no new design tokens. Its six sections belong to the shared appbar: Identity & soul, Speaking style, Appearance, Voice, Expression & modes, and Harness. Do not duplicate section navigation inside the page. Harness opens the companion's agent editor; Character Studio owns presentation and authored personality. Import, history and restore use the centered `TaskDialogContent` and `ConfirmationDialog`.

The editor and live draft preview sit beside each other on large screens and stack on smaller screens. The preview stays sticky on large screens; Save and Discard remain in the shared action footer with visible pending, error and draft feedback. Import reads a Conker package or Character Card file into the draft only after Use draft and does not save by itself; Export downloads the saved revision. Every save and restore adds a new version; earlier ones never change.

Personality, backstory, relationship and speaking style are user-authored text. Activities (idle, listening, thinking, speaking) describe what the companion is doing; named expressions describe how it presents itself. Keep the two independently assignable. Assigned expression artwork takes priority, then activity artwork, then the main portrait. Preserve the complete, uncropped portrait with at least the existing one-eighth inset on each side. Uploaded video loops are muted; disabled motion or reduced-motion preference replaces a video with the still main portrait, and failed media falls back to it too.

Focus and Character are delivery modes for one identity, separate from models, tools, memory, harness and permissions. Qwen voice design is not connected; the Voice section says so beside the control.

## Memory workspace

### Gateway memory atlas

Gateway Memory (`src/components/gateway/memory-workspace.tsx`) uses the shared `GatewayHeader`. Map/Tree/List, memory type, Add memory, Refresh and Maximize use its secondary toolbar row; List searches inside its `ListCard`. Never add a second record-search field beside the universal trigger. Controls wrap without overflowing or hiding sidebar reopening. Maximize carries the same header with the workspace.

Memory opens on Map (List on phones); the view lives in `?view=graph|hierarchy|database`. Map uses a bounded, static D3 force layout and Tree uses D3 hierarchy; neither continuously runs a simulation. React Flow owns pan, zoom, dragging, keyboard point selection and one/two-hop focus. Preserve manually dragged positions within a mode, not stale coordinates when switching layouts.

Map and Tree share gateway metadata records, the existing semantic surfaces and bounded chart-category colors. Small type hubs carry record counts; finer curves expose recorded connections. Dashed branches are type organization, never factual relationships. Solid curves represent server-supplied links only. A quiet legend distinguishes them; relation labels appear on edge hover and the inspector retains the exact relationship. Labels stay visible in small graphs, and zoom/selection reveal detail in larger graphs. No fabricated points, embedding similarity, unrelated glows or route-specific palette.

Load relationship metadata for up to 100 loaded records, four requests at a time, one connection page per record, at most 250 distinct records. Cancel on navigation/filter changes and announce loading, incomplete pages or failed reads as a partial graph. Content remains an explicit inspector read; graph exploration cannot write memories. Keep List as the structured alternative, including search and pagination, and preserve the shared mobile/desktop inspector and revision-bound Forget flow.

## Memory forgetting and recovery

Forgetting a live memory uses the shared `ConfirmationDialog`, showing the exact
reviewed text and version before the owner confirms. Source conversations are
kept. After an uncertain response, keep the same request identity and offer
"Check same request"; do not silently generate a replacement deletion. Recovery
reads content-free metadata from Pi on reload and requires an explicit confirmation
before checking or completing the saved deletion. Keep metadata reads and mutation
pending states distinct, and exclude one while the other is active. Successful
forgetting clears the inspector and record deep link; late reads cannot restore
either. No memory text or deletion intent is stored in browser storage.

## Tools workspace

Tools adds no new theme or density tokens. The library (`src/components/gateway/tools-inventory.tsx`) is a `ListCard` whose items open their details in place. Keep one Tools sidebar destination; MCP servers (`?view=mcp`) and workflow drafts (`?draft=`) live under it, not in separate navigation.

Opening a draft shows `ToolEditor` (`src/app/tools/tool-editor.tsx`) below the appbar. Build, Source and Configure are local views of the same definition, selected in the compact editor toolbar; this extends Memory's local-mode exception and does not add appbar route sections. Keep the canvas in the leading viewport, with an add-step palette, optional step outline, visible Save/Test actions and secondary actions in the existing menu. Maximize/Restore changes the workspace frame. Preserve the selected theme's semantic surfaces, editable corners, shared controls and focus treatment; chart colors may distinguish step types without becoming a route palette.

Selection opens the shared nonmodal `WorkspaceInspector`, composed with `OverlayBody` and `ReferenceSection`, for focused step properties, connections and matching test output. This is contextual editing within the dedicated workspace. Shared inspector docking styles belong to `src/styles/design-system.css`, so Tools does not depend on Memory's stylesheet. Desktop docks the inspector on the right; mobile docks it below the usable selection region. Keep keyboard step selection and connection forms available alongside dragging, ports and stored directed edges.

Test results and version/run history occupy an optional bottom panel. Only a receipt matching the exact current draft may color steps or supply their output; historical receipts remain inspectable with their earlier-draft/version notice. Source edits canonical JSON. Preserve invalid source and unapplied step arguments until explicit Apply/Discard, with validation beside the task and visible draft feedback. Creation uses `TaskDialogContent` and `FormActions`; deletion uses `ConfirmationDialog`.

Check this surface in desktop light/dark and narrow layouts, including inspector and receipt-panel coexistence; use `npm run check:tools` and the shared design/build checks for relevant changes.

API-key provider controls serialize status reads and mutations under the current owner and client lifetime. Status reads have a 15-second deadline; mutations have a 210-second deadline starting after owner verification at dispatch. Pending and failed reads label retained revisions and spending policy as last-checked evidence. A dispatched failure or timeout requires an explicit read-only status check before another action and retains the earlier-unconfirmed notice after that check; no operation is automatically replayed. Server revision, activation recovery and spending-policy guards remain authoritative.

Each credential editor opening has a distinct identity. An unchanged successful status check can preserve its unsent in-memory key; changed provider evidence, owner/client replacement, closing, or submission clears it. Submission clears the key before password verification and never restores it after cancellation or failure; only the scoped in-flight request holds that value. Stale form/input/close callbacks cannot address a reopened editor. Refresh and recovery controls preserve keyboard focus; dialog closure restores the current opener or a live status action without taking focus from another dialog.

Native sessions (`/system?tab=native-sessions`) is a Server section with a Terminal link. The provider selector separates Conker-owned isolated Claude background sessions from saved Codex history and from Chats. Claude interactive native entries are not implied; truncation and omitted-entry counts are independent. Use the shared `ListCard` search and `RecordItem` rows, with `InlineDetails` for exact identity, working directory, native state and recovery. The attach command is a manual Conker-root CLI instruction, never automatically injected into a terminal; native permissions and approvals remain in Claude.

Toolbar choices use `WorkspaceChoice`: a Select inline, a radio submenu in desktop overflow, and labeled radio groups directly in the mobile menu so choices stay within the viewport. Composite Select roots must not be slotted as menu items because they have no focusable DOM node. Provider changes restore focus only after the new provider commits, with owner, source and navigation-generation fences. Selecting the checked provider leaves navigation unchanged.

Native metadata is last-checked evidence with explicit Refresh/Check status. Reads are bounded to 35 seconds and fenced by owner, client lifetime and selection; output is an explicit, identity-matched, bounded plain-text snapshot, cleared on source changes or failed identity reconciliation. No output polling or browser persistence. Stop uses `ConfirmationDialog` then owner verification for the exact ID and immutable identity, with a 45-second deadline beginning only at dispatch. Success means Stop requested, never stopped without a fresh read. Unknown outcomes require explicit status reconciliation and retain an uncertainty note; no Stop is automatically replayed. Closing the owner shell does not promise that independently supervised background native sessions have ended.

Codex uses the same destination with `provider=codex`, separate provider lifetimes and Unarchived/Archived saved-history scopes. The observer reads Conker’s isolated profile; it cannot prove activity in another Codex process. Do not infer Running, Idle, Completed or Stopped from stored metadata or expose a runtime-inspection action. Pages are explicit snapshots: Refresh restarts paging, Load more retains prior rows, and Search loaded threads filters only loaded names, bounded previews, IDs and working directories. Errors retain matching rows with last-loaded wording; invalid cursors require Refresh, never an empty-success fallback. Provider/archive/owner/client changes abort reads and clear old inspection state. No full transcript or output is loaded or persisted.

Codex detail reads are query-free, bounded to 35 seconds and bound to the exact canonical thread ID. Unnamed rows use a bounded preview fallback; shortened previews are labeled in detail. The exact `python scripts/conker.py native codex resume <id>` command is a manual action from the Conker repository and preserves native prompts and approvals. There are no Codex Stop, launch, approval or permission controls in this view. Native provider selection and all paging/retry controls remain accessible in the compact shared appbar and on mobile.

Retained memory edits start in the Memory inspector and read a fresh, full Companion
memory snapshot. The task dialog edits text only; source and confidence remain
read-only. Revision checks and operation-bound owner verification protect each
change. Draft text stays in the mounted editor and never enters browser storage.
Owner, client, selection, editor-instance and source-forget changes retire reads
and drafts. Reads stop after 35 seconds; mutation deadlines begin at dispatch
after verification and allow 45 seconds. Unknown outcomes never replay. On reload,
content-free pending metadata offers Check status; retry is a separate confirmed
operation bound to the server-saved approved payload hash. Applied receipts distinguish
saved text from indexing status. A missing receipt remains uncertain until an
authoritative outcome is verified. Source conversations and memory permissions remain unchanged.

## Failure, loading and connection states (24 October)

Job: when something goes wrong the owner always knows what happened, that nothing else broke, and
the one next step. Code: `src/components/resilience/`, `src/lib/connection-store.ts`.

| Situation | What he sees | Next step |
| --- | --- | --- |
| The whole app failed to render | `CrashScreen`: "Conker hit a problem", data is on the server | Reload Conker, Try again, Copy details |
| A newer build replaced a page's files | "Conker was updated" (app or page) | Reload Conker |
| One page failed | `WorkspaceError` in place; sidebar and header keep working; clears on navigation | Try again, Reload Conker, Copy details |
| One tile failed | `SectionError` inside the tile | Try again |
| A read failed | `InlineError`: kind-specific title and next step, Details with kind and HTTP status | Try again; network and dependency failures refresh by themselves once the server answers |
| Part of a page failed | "Some sections didn’t update"; failed sections say "Not loaded", never "nothing here" | Try again |
| Offline or server unreachable | `ConnectionBanner`, one muted line above the page; checks again by itself, no countdown | Retry now; "Back online." for 3 s when it returns |
| Page or list loading | Skeleton of the layout, revealed after 300 ms | — |
| A background action failed | Error toast that stays until dismissed, with Try again; never the only place it shows | Try again |

Rules: a read may retry by itself; a write never does (an interrupted write is an unknown outcome,
shown with the warning style). Copied details never contain the server address, query strings,
tokens or record contents. Timing values are in the conker-ui rationale ledger (Loading placeholder,
Reconnect, Back-online note, Failure toasts). In development, `?preview-failure=network`,
`dependency` or `partial` (or `window.conkerPreview.fail(...)`) forces these states in the preview.
