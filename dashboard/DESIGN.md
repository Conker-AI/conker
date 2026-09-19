# Conker dashboard design system

This is the implementation contract for the active dashboard. The owner's accepted Chats layout is the reference for collections throughout the app: use the same components, not copied markup or a similar collection of classes. Product direction remains in [design-language.md](../docs/design-language.md).

The foundation is the Vite version of [shadcnstore/shadcn-dashboard-landing-template](https://github.com/shadcnstore/shadcn-dashboard-landing-template/tree/65fc11224e96d56a62e224a58f7ed590aea5ac24/vite-version), reviewed at commit `65fc11224e96d56a62e224a58f7ed590aea5ac24`. Preserve shadcn's native props, Radix keyboard interactions, Button `asChild` composition and semantic theme variables.

## Ownership and imports

| Need | Use | Owner |
| --- | --- | --- |
| Standard route shell and heading | `BaseLayout` with `title` and `description` | `src/components/layouts/base-layout.tsx` |
| Find-and-manage collection shell | `BaseLayout variant="collection"`; compact shared heading and section rhythm | Same layout module |
| Prioritized overview groups | `OverviewSection`; `priority` for the leading decision surface | `src/components/design-system/index.tsx` |
| Viewport-filling tool beneath a standard heading | `BaseLayout variant="workspace"`; tool owns its scroll regions | Same layout module |
| Page heading outside that shell | `PageHeader` | `src/components/design-system/index.tsx` |
| Route sections | `RouteSection`; navigation is rendered by `SiteHeader` | `src/config/navigation.ts`, `src/components/appbar-navigation.tsx` |
| Collection or table search | `CollectionSearch` | Same design-system module |
| Search, results announcement and empty state together | `CollectionPanel` | Same design-system module |
| Group heading and divided collection | `CollectionSection` | Same design-system module |
| Compact linked item | `CollectionRow` | Same design-system module |
| No results / no items | `CollectionEmpty` | Same design-system module |
| Agent identity in a collection | `AgentIdentityPortrait` | Same design-system module |
| Topic within a reference panel | `ReferenceSection` | `src/components/reference-section.tsx` |
| General buttons, fields, cards, badges, dialogs | Existing `@/components/ui/*` and `StatusBadge` | Shadcn primitives plus application status composition |
| Dimensions and density | CSS tokens | `src/styles/design-system.css` |
| Colors and radius | Semantic CSS variables and theme customizer | `src/index.css`, `ThemeRuntime`, existing theme manager |

Import the shared application patterns from `@/components/design-system`. Their exported TypeScript props are the API. Route code supplies content, destinations and state; these components own matching dimensions, insets, typography, dividers and hover/focus treatment. `BaseLayout` / `PageHeader` accept a `status` beside the title for page-wide context such as Home's Preview data label; keep that context visible before the content on narrow screens.

```tsx
import { BaseLayout } from "@/components/layouts/base-layout"
import { RouteSection } from "@/components/design-system"

<BaseLayout title="Inbox" description="Review requests and past decisions.">
  <RouteSection value="pending">{/* Shared search and pending collection */}</RouteSection>
  <RouteSection value="history">{/* Shared search and reviewed collection */}</RouteSection>
</BaseLayout>
```

Declare the route's sections in `src/config/navigation.ts`. The shared appbar owns their links and selected state. Route content must not add another navigation strip below its title.

For working collection examples, read `src/app/chat/page.tsx` and `src/app/inbox/page.tsx`. Both routes import the same patterns. Chats shows sessions or each agent's latest session; Inbox shows requests or past decisions. Their content differs while corresponding UI elements match.

`CollectionSearch` takes a required accessible `label` and normal input props (`value`, `onChange`, `placeholder`). Its type, class names and accessible-label implementation belong to the component. `CollectionRow` takes `to`, `title`, `description` and optional `descriptionTitle`, `leading` and `trailing` slots. Use `AgentIdentityPortrait name={agentName}` in the leading slot. `CollectionPanel` owns the shared search, live result count and clearable empty-state composition for list screens.

`DataTable` uses `CollectionSearch` too. It retains columns, sorting, filters, selection and pagination where structured comparison needs them. Do not replace a useful data table with a collection merely to make every screen identical.

## Interaction placement (owner-approved, September 16)

Choose the surface from the user's task, then reuse the same pattern wherever that task occurs. This is a frontend contract; it does not imply a connected executor or permission to add backend behavior.

| User intent | Surface / shared pattern | Examples |
| --- | --- | --- |
| Create an item or change several related fields | Centered `TaskDialogContent` inside the shared `Dialog`; `size="wide"` for a job form | New/edit job, conversation model, message edit, theme import |
| Configure multiple sections with previews or long-lived navigation | Dedicated page with `BaseLayout` | Settings, Character Studio, first-run setup |
| Inspect a record while preserving list position | `DetailPanel` with `OverlayBody` and `ReferenceSection` topics | Agent conversations, tool scope, memory evidence, journal source, job history |
| Make a small immediate preference change | Labeled inline control, with state feedback | Theme, layout, Incognito toggles |
| Review a consequential request with evidence | Dedicated detail page, decision actions beside the request | Inbox approval/proposal; do not add a second generic confirmation |
| Delete/redact an item | `ConfirmationDialog`, naming the target and consequence; Cancel receives initial focus | Job deletion, conversation deletion/clear, message redaction |
| Submit a draft | `FormActions`: feedback at the left, secondary action before primary at the right | Save/discard in Settings and Studio, Cancel/Create in dialogs |

Import application patterns from `@/components/design-system`. `TaskDialogContent` and `DetailPanel` own header spacing, close-control clearance, viewport bounds, scroll-body composition and corner clipping. Compose their children with `OverlayBody` and `FormActions`; a specialized form such as `JobEditor` may own its scrollable fieldset. Use a 16px minimum outer dialog gutter, a viewport-bounded height, 20px internal insets, and 32px close controls inset 12px from the corner. Dialogs keep theme-derived corners; edge-attached sheets are deliberately flush. Terminal fullscreen and the expanded call stage are explicit edge-to-edge shared Dialog exceptions; the ended-call summary returns to a bounded dialog with theme-derived corners.

Creation and substantial editing never share a generic details drawer. Completing creation returns to the collection with visible feedback; editing from an inspector returns to that inspector. Preserve validation, prevent accidental outside-click dismissal of draft forms, disable submission while pending, and restore useful keyboard focus when closing or moving between surfaces. Keep existing drafts, Incognito behavior and conversation feature ownership intact.

Common actions remain visible: Run/Pause for jobs, New chat for agents, source links for evidence. Use named buttons; reserve icon-only controls for familiar actions with accessible labels/tooltips. Secondary actions belong in a menu. Avoid duplicate page-navigation strips: the sidebar chooses roots, the appbar owns route sections and context, and the page header may own creation actions.

Agents, Tools, Memory, Journal and Jobs share `DataTable`. Supply `renderItem` using `RecordItem` below 1280px; desktop keeps the table for comparison. System services use the same responsive pattern with read-only summaries and a Connections action. One table instance owns search, filters, sorting and pagination across both representations. Mobile sorting remains available. Row titles open details using real buttons; visible actions remain separate. Keep column definitions stable when selection changes so a closing inspector can restore focus to its initiating control. Tables use wrapping content and a single clipped card container. Collections retain the accepted Chats/Inbox patterns. Empty states explain the next action; filtered empties offer a clear action, and creation empties link to the working creation flow.

Bounded forms scroll a normal `div` around their fieldset, with `min-height: 0` throughout the flex chain. Do not make the fieldset itself the flex scroll region: browser fieldset sizing can allow its content to overlap the footer on short screens. The action footer stays outside that scroll region. Validate this visually at a short mobile viewport, not only a tall desktop window.

Do not relocate a correctly placed feature just to touch every screen. Home remains an overview; Companion remains the proactive conversation; Chats preserves message/appbar/composer/reference ownership; System keeps Overview, Terminal and Files as separate sections.

## Density and layout contract

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
| Collection page title | 24px type / 32px line height, semibold weight |
| Page description | 14px type / 24px line height |
| Collection description | 14px type / 20px line height; 4px after its title |
| Page top inset | 24px; no extra desktop-only gap before the heading |
| Page gutters | 16px mobile / 24px small screens / 32px large screens |
| Width | Full available width; no centered route-wide maximum |
| Corners | Derive from editable `--radius` |

Dimensions describe roles. A small inline action can use the compact variant; collection search uses one shared 40px pattern across lists and tables. Avoid overriding equivalent roles with page-owned `h-*`, `px-*`, font, radius or palette classes. If a new role is needed, add an explicit shared variant and document it here.

### Priority, grouping and screen purpose

Consistency means equivalent controls behave and look alike; it does not mean every screen repeats the same stack of cards. Define the first useful action or piece of information before choosing a composition. The selected theme owns color, type family, tracking, corners and elevation; the screen owns reading order and emphasis.

- **Collections** (Chats, Inbox, Agents, Tools, Memory, Journal, Jobs): use `BaseLayout variant="collection"`. Keep heading/help, search and results close, with 16px between related regions. Keep the 64px minimum row and usable controls; reclaim overhead before shrinking content. At 1280×720, aim to begin an ordinary unfiltered list in the upper third to two-fifths of the viewport, allowing real content to wrap. Tabs stay in the appbar.
- **Home**: pending decisions lead. `OverviewSection priority` gives that group the card surface and a 20px heading; supporting sections use 16px headings and their content/dividers without another enclosing card. Workspace values use 24px tabular numerals with quieter labels. Resource links remain secondary to actions. Desktop has an attention/activity column and a workspace/agents/conversations column; narrow screens preserve that reading order in one column. Preview labels remain visible.
- **Forms and settings**: retain the standard heading, 24px between meaningful sections and existing task-specific editors. Bound long prose inside the full-width page when it aids reading; do not cap the whole route.
- **Conversations and tools**: preserve their viewport-filling variants and existing control ownership. They do not need collection headings to be consistent.

Use 4–8px within a label/detail group, 16px between related controls or list regions, and 24px between distinct sections. A container must communicate a boundary, state or priority. Do not enclose every heading or supporting group just to fill space. Borders define structure, muted foreground carries supporting detail, and primary color identifies actions/selection rather than decorating every heading. Keep the surface's foreground for essential information; use size and weight before adding colors.

Review the complete vertical stack, not each component in isolation. Desktop and narrow screenshots must show the leading task, readable supporting content, intact corners and reachable actions. Shared token compliance is a baseline, not a substitute for this review.

Page section links remain in one scrollable appbar row on narrow screens; the current section scrolls into view. The appbar collapse control uses the default 40px icon size with an 8px edge inset. The theme control sits beside the Conker label in the sidebar brand row, including the mobile drawer; in icon-collapse mode it stacks below the brand. Conversation appbar controls use the compact 32px control role.

`BaseLayout` owns a viewport-height frame for every sidebar variant. The appbar stays outside the standard page's keyboard-accessible scroll region; route/section changes reset that region to the top. Inset clips its children to the theme-derived radius and retains its 8px outer frame while content scrolls, on either sidebar side and in expanded/collapsed states. On mobile the frame is edge-to-edge and the sidebar opens as a sheet. Conversations keep their existing transcript and reference-panel scroll regions.

The opt-in `workspace` variant retains the shared heading and gutters, lets its child fill the remaining height, and delegates scrolling to the tool's own regions. System uses this variant for its Terminal and Files sections, with matching `RouteSection variant="workspace"` containers. Overview and regular pages retain page scrolling; conversations retain their separate layout.

Use minimum row height instead of a fixed clipping box. Long content, translated text, browser zoom and responsive wrapping must remain usable. Keep title/preview truncation deliberate and retain accessible names. Collection navigation should use actual links, not divs that only respond to mouse clicks.

Photo avatars use the shared neutral outlined frame. The complete image uses `size-3/4 object-contain`, leaving one eighth of the inner frame on each side. Preserve the full artwork and its aspect ratio without zoom transforms or an inner crop. No green tint behind photo portraits. Apply this proportional padding across brand, appbar, thread, collections, and studio; larger studio previews do not change collection density.

Scrollbars share `--scrollbar-size` (10px) and theme-derived thumb tokens in `src/styles/design-system.css`. Native scroll containers and the Radix `ScrollArea` use a rounded thumb inset by 2px, a transparent track, brighter hover, and the primary accent while dragging. Firefox uses its native thin scrollbar with the same resting colors. Preserve native wheel, keyboard, and touch scrolling; forced-colors mode retains system colors. Do not hide overflowing content's scrollbar or add route-specific scrollbar skins.

## Palette and theming

**The owner's selected shadcnstore template is the shared styling authority.** Read [template-reference.md](../docs/template-reference.md) for the pinned source, component/feature map and narrow Conker adaptations. [color-system.md](../docs/color-system.md) defines the color usage contract. The September 16 instruction supersedes the previous mixed-surface system.

Use the template's semantic pairs directly: background/foreground, card/card-foreground, popover/popover-foreground, primary/primary-foreground, secondary/secondary-foreground, muted/muted-foreground, accent/accent-foreground, and sidebar-specific pairs. Border, input, ring and chart tokens retain their standard meanings. A custom card value must render as that exact color, without an added foreground mix.

Keep standard button, field, menu, tab, tooltip, dialog and selection treatments from the template. Their approved opacity recipes belong to the owning primitive, recorded in `scripts/template-foundation.json`. Do not ban legitimate upstream recipes or recreate them differently in each route. Application code consumes shared components and ordinary semantic utilities; a new visual role requires a documented owner.

Conker keeps its green default accent, compact density, custom navigation and controls, complete photo portraits, native scrollbars and black terminal region. Existing secondary-text/destructive-foreground contrast adjustments and labeled success/warning statuses remain explicit extensions. Custom themes, imports and radius must still work. Do not add `--surface-*` remapping, route-specific palettes, another theme provider or `!important` color overrides.

Collections own one card container. The composer, plans and requests use card roles. Tool details and reference headings use muted. Appbar, dialogs and the reference rail use background; sidebar navigation keeps sidebar roles. Shared field styling comes from Input/Select/Textarea, including collection searches.

The guard checks direct color mappings and upstream recipe ownership in addition to shared heading, search and navigation rules. Rendered review remains required: preset/import correctness, contrast, focus and component behavior cannot be inferred solely from token names.

## Intentional exceptions

Exceptions have a concrete UI role and narrow ownership. They do not permit an unrelated search, tab or palette implementation in the same file.

- `src/app/chat/conversation.tsx`: the conversation has an accessible hidden h1 and specialized transcript/composer. Its h1 is allowed; palette and search rules still apply. Visible identity and conversation controls live in the appbar.
- `src/app/login/page.tsx` and `src/app/setup/page.tsx`: standalone authentication/onboarding headings use AuthLayout. Their `h1` elements are allowed.
- `src/app/errors/not-found/components/not-found-error.tsx`: the standalone error code heading is allowed.
- `src/components/design-system/index.tsx`: owns raw shared heading/search markup and primitive tab composition. Other route code consumes it.
- `src/components/ui/*`: foundational primitives retain their raw implementation APIs. Product routes must use the shared application pattern where one exists.
- `src/lib/character-options.ts`: swatches represent artwork colors. Character Studio can use larger portrait previews while keeping shared fields and surfaces.
- `src/config/theme-data.ts`, `src/config/theme-customizer-constants.ts`, `src/utils/tweakcn-theme-presets.ts`, `src/utils/shadcn-ui-theme-presets.ts`: theme definition/swatch files may contain actual color values. They must not become a place to hide route styling.
- The customizer's nested controls can compose primitive tabs inside their own editor. Page-level navigation uses the shared appbar and URL-addressed `RouteSection` content. `PageTabs` remains available for local, non-routing tab interactions.
- The terminal's neutral surface variables in `src/index.css` preserve a black command area, graphite chrome and readable text in both themes. Its inset command area has an 8px frame and fills the available width; the info control opens project/connection context. Fullscreen uses a viewport-filling shared Dialog with Escape and focus restoration. These variables do not establish a separate general application palette.

System is one sidebar destination with Overview, Terminal and Files in the shared appbar section navigation, exactly like Chats and Inbox. Overview (`/system`) owns system stats and services; Terminal (`/system?tab=terminal`) and Files (`/system?tab=files`) are separate section bodies. Files owns the expandable tree, selected path and copy action, using normal card/accent theme roles on desktop and mobile. Do not embed the tree in Terminal or its fullscreen view. Command search links directly to each section; old `/terminal` and `/files` bookmarks redirect to the matching System section.

Both remain frontend previews with separate `ConkerClient` snapshots: `TerminalSnapshot` supplies shell context and `FilesSnapshot` supplies the sample directory tree. Directory disclosure, path selection and copying work locally; no file editor, filesystem access or shell command transport is implied. Keep the Files sample label and Terminal offline state visible until those connections exist.

Dormant template demo routes are outside the guard until imported by the active route graph. Do not broaden exceptions just to make a new finding disappear; choose the shared component or document and narrowly implement a real new role.

## Validation and maintenance

Run `npm run design:check` for the TypeScript AST guard. It follows local static imports, exports and literal dynamic imports from `src/config/routes.tsx`. This covers active routes and their dependencies while avoiding unused template demos.

The guard rejects standard raw `h1` headings, direct primitive-tab imports from active route modules, raw `Input`/native search fields, and hard-coded Tailwind palette/literal-color classes in reachable application code. It recognizes aliased inputs and search placeholders such as `searchPlaceholder`. It does not ban arbitrary layout dimensions or normal form fields.

`npm run lint` and `npm run build` both run the guard before their usual checks. `npm run design:check:test` proves invalid fixtures fail, valid shared patterns pass, exceptions stay narrow and inactive demos remain excluded. No additional test framework is required.

Static checks cover recognizable source patterns, not every possible runtime-generated style. Render the affected screens before finishing visual work. Compare Chats/Inbox search, tabs, rows, portraits and titles at desktop and narrow mobile widths. Check light/dark themes, a radius or preset change, keyboard focus, empty states, long content and navigation. For shared primitive changes, inspect a representative form, table and detail page as well. Record screenshots and any untested limitations.

Update the shared component and its contract first; migrate consumers together. A new page should compose these patterns from the start. Shared implementation, automated checks and rendered review are the mechanism for keeping screens consistent.


## Jobs

Jobs owns direct management at `/jobs`: New job, editable instructions/agent/schedule/time zone, visible Run now and Pause/Resume, and a compact menu for details/history, editing, duplication and deletion. New/edit forms use a wide centered task dialog with a scrollable fieldset and fixed action footer. Details/history use `DetailPanel`; deletion uses `ConfirmationDialog`. Copies start paused with no inherited run history. Running a paused job does not enable its schedule.

Use the shared searchable/sortable `DataTable` for desktop comparison and its `renderItem`/`RecordItem` presentation below 1280px. Search and status/last-failure filters belong to the page and survive these responsive changes; sorting stays in the shared table instance. Reuse the same `JobActions` in the table, stacked rows and detail sheet. Keep long titles wrapped, instructions readable, keyboard focus restored, and form errors beside their fields.

All job mutations go through the existing `ConkerClient` fixture adapter. Daily, weekly and hourly-interval schedules are configuration previews; new/edited jobs show “Awaiting scheduler.” Run now records an explicit simulated receipt and never invokes agents, tools or server commands. The in-memory data resets on reload. Keep the Preview label, sample-receipt provenance and form limitation copy. Validate via `npm run check:jobs` plus affected lint, build and rendered desktop/mobile checks.

## Home and Companion

Home (`/`) is the workspace overview for Conker's internal screens. Linked counts open Agents, Tools, Memory and Jobs; the remaining sections show pending requests, agent status, recent Journal activity, recent conversations and System status. The page-header actions are New chat and Open companion, and System status links to Connections and System.

Compose Home with `BaseLayout`, shared cards, `CollectionRow`, `AgentIdentityPortrait`, buttons and status badges. The resource strip has two columns on narrow screens and four on large screens. At extra-large widths, requests and activity occupy the wider left column, with agents and conversations on the right; smaller screens stack these sections. System status spans the page. Preserve shared section gaps, density, theme/radius behavior, the inset frame and complete padded portraits.

Tasks and calendars belong to the separate productivity app, which may later connect through MCP/ToolGate. Home has no daily briefing, agenda, news feed, planning starters or chat composer. Journal summaries may include recorded calendar-tool activity as audit data; they must not become a personal calendar interface.

Home reads the `ConkerClient` snapshot and derives its summaries through `getWorkspaceOverview` in `src/lib/workspace-overview.ts`. Show up to three pending requests and agents, four recent Journal entries, and three recent conversations; conversations exclude the permanent Companion, archived sessions and empty drafts. Enabled jobs count scheduled jobs, with paused jobs reported separately. Preserve the Preview data label and explicit sample-service status; fixture activity dates remain anchored to their recorded date. `getDailyOverview` remains available for Companion's day context.

Home has one quiet overview arrival: 420ms with a 6px upward settle and a small opacity change, enabled only when reduced motion is not requested. Keep it an entrance treatment rather than an imitation of live agent activity. No new palette, density or motion tokens are introduced.

Companion (`/companion`) is the main-agent workspace: a dedicated stable conversation, daily briefing, action starters, and contextual events/news. It uses the shared `Conversation` shell and composer. Existing chats remain at `/chat/:id`. Never choose the main companion by session array position.

Companion has its own appbar identity, with no Chats ancestor. Its check-in stays in the thread after the first exchange and folds into an expandable summary. Recent conversations and pending decisions use the shared collection rows and real fixture destinations. Action starters prepare editable prompts; they never send automatically. The main companion cannot be handed to another agent, archived, or mixed into regular chat history.

`/chat/new` opens a separate topic with Conker by default; `?agent=<id>` preselects an existing agent. New chat is available from conversation and collection appbars, Agents rows, and command search. The client reuses an empty draft for the selected agent, preserving unsent words on route navigation. The first message names the conversation and adds it to history. Empty drafts stay out of Chats and daily recent activity. Conversations and drafts are memory-only in this preview and reset on a full reload.

The ordinary chat's appbar avatar opens the agent picker. Before the first message it selects the agent; afterward it becomes an explicit handoff. Handoffs appear at their message boundary, retain previous authors, preserve Incognito preferences and the separate model selection, and clear execution grants. A fork restores the agent at its selected message boundary rather than inheriting a later handoff. The canonical Companion identity remains fixed; separate chats can still use the companion agent.

Character customization lives at `/settings/companion`, separate from conversation. Brand navigation opens Companion. The sidebar brand row owns the theme switcher.

`BaseLayout` accepts an optional `actions` slot for standard page-header actions. DailyNews owns feed content; its parent owns the section heading. It renders publisher/date/source metadata for ready feeds and a truthful unavailable state otherwise.

When Companion receives `{ prompt }` in React Router state, append it to an existing draft, never overwrite the user's words or send automatically. Home's New chat and Open companion actions navigate directly without planning prompts. The 4,000-character composer limit remains enforced.

The current transport is a sample preview. No AI replies, news headlines, weather, or external actions may be implied to be live until corresponding providers are connected. Keep the briefing date explicit; render plans as proposals rather than booked calendar events.


## Appbar routing

`src/config/navigation.ts` owns route paths, breadcrumb ancestry, page sections, and related-page actions. The router, sidebar, and command search use those paths. Companion stays accessible through the Conker brand and command search, with no separate sidebar item.

Every sidebar destination is an independent navigation root. Home remains the entry page at `/`; it is never an automatic breadcrumb ancestor. Companion is also an independent root. Only actual detail relationships have parents: Chats → conversation, Inbox → request, and Settings → Companion settings. Unknown routes have their own not-found breadcrumb.

`SiteHeader` renders the page path, related-page actions, command search, and section navigation above the content title. Do not add back links, section tabs, or companion-customization shortcuts under page titles or in conversation headers. Task-specific links inside content (opening a request, a source conversation, or a proposed plan) stay with their context.

Chats, Inbox, and Settings use `?tab=` URLs. Their first section is the default; unknown values fall back safely. Links preserve other query parameters and participate in browser Back/Forward. `RouteSection` renders the selected content, while page-owned form/search state remains in the route component. These are real links, not ARIA tabs: normal Tab/Enter and open-in-new-tab behavior apply.

Breadcrumbs resolve conversation and request names from the current snapshot. Reviewed requests return to Inbox's history view. Parent links provide a deterministic route on direct loads. Long names truncate with a full title; the owning section stays visible at mobile widths. Related-page actions retain accessible names.

The appbar is sticky on scrolling pages. Conversation layouts keep their bounded viewport and docked composer. Global search becomes an icon on narrow screens, retaining the keyboard shortcut. Run `npm run check:navigation` alongside the design guard, affected-file lint, and build when changing route metadata or section behavior.


## Models and conversation data

Settings owns the Models / Providers catalogue at `/settings?tab=models`: provider endpoint/key drafts, enabled catalogue routes, and the workspace default. These are explicit sample configurations; saving never contacts a provider. Keys remain masked and memory-only. Chat picks only enabled catalogue entries and exposes no provider credentials.

All conversation mutations and simulated replies go through ConkerClient. Normalized messages retain source identity, edits, redacted tombstones, and independent fork copies. Conversation defaults differ from per-turn model overrides. Preview incognito stores independent memory/harness exclusions; no transport or production privacy promise is implied. Run `npm run check:conversation` for mutation, fork, model, retry, privacy, and abort behavior.


## The four conversation homes

Conversation-wide actions live in the appbar: the avatar owns agent selection/handoff, and the title menu owns rename, conversation-default model/route, pin, archive/restore, delete/clear, Conversation info, Sessions & forks, and edit companion. The permanent Companion omits rename, pin, and archive and adds Daily context. The right-side order is New chat, search, Incognito. There is no standalone right-panel toggle: features open the relevant reference view. Incognito uses the standard hat-and-glasses icon, with no visible text label; its tooltip and accessible name expose the current mode. There is no separate conversation header. The theme switcher stays beside the sidebar brand. All sidebar destinations retain independent roots.

Incognito opens a dialog with two independent switches, **No memory** and **No harness**. All four combinations are supported and stored per conversation through ConkerClient; forks copy them independently. Only the memory switch changes the declared memory scope. The aggregate `incognito` flag means at least one exclusion is enabled, and the legacy boolean update remains a shortcut for both. The rail reports both settings separately. These preview preferences do not imply server enforcement, deletion of existing transcripts, or private browser speech processing.

Every completed message has an always-visible, compact action row directly beneath it. `MessageActions` owns both its controls and metadata, using 32px icon buttons with tooltips. Response actions are Copy, Read aloud/Stop, Good response, Bad response, Try again, Share, and More; user actions are Copy, Edit, Reply, Share, and More. The timestamp and Edited/Pin markers share this row and wrap when space is tight. User rows align right, response rows left. A short user bubble must retain its natural width independently of its toolbar.

Less frequent actions stay in the same message's More menu: Fork, Reply/Edit when absent from the visible row, Retry with model, Pin, Redact, Message info, and Open source. Message info replaces the old Explain label and shows recorded metadata and provenance; it does not imply an AI-generated explanation. Fork copies only through that message. Edits are visibly marked; redaction keeps a tombstone and does not alter independent forks. Sharing copies a local preview link and never publishes content. Ratings are optional, mutually exclusive, reversible preview data saved through ConkerClient; editing or redacting a response clears its rating.

Read aloud uses the browser's speech synthesis with one message playing at a time, a visible Stop control, and error recovery. Playback stops on navigation, message changes, backgrounding, or starting microphone input. This is text playback, not an AI voice call. Run `npm run check:voice` for playback chunking, cancellation, and failure behavior alongside dictation checks.

The composer owns the next turn: preserved draft, reply target, Tools menu, direct model/provider picker, voice typing, call entry, send, and stop. Toolbar actions use compact icon buttons with accessible names and tooltips, including Tools and dictation's cancel/return-to-keyboard actions. Model names remain visible because they communicate the selected route. The microphone starts inline voice typing. The separate final phone action starts or returns to the call for an empty/whitespace-only draft, becomes Send once there is text, and Stop while streaming. The conversation title menu also offers Start call / Return to call, including when the composer has a draft. The model chip reads enabled entries from Settings' catalogue; it truncates on narrow screens so the action buttons remain inside the composer. The conversation default remains separate from a one-turn override, which clears after that turn. The quiet provider/cost line clearly labels the fixture. Streaming and thinking are deterministic simulations with abort support; they never run tools.

The reference panel is closed by default and shows one requested topic at a time. It has a context-specific title and conversation name or selected message author/time/excerpt. Each topic uses `ReferenceSection`: a filled panel, a contrasting inset heading with a bottom divider, 16px body padding, and 20px separation between sections. Do not append the entire conversation's metadata beneath a selected source.

| Entry point | Reference view / content |
| --- | --- |
| Message ⋯ → Open source | Original request or recorded source, with a working link back; no unrelated sample references |
| Message ⋯ → Message info | Author, time, state, recorded model and preview provenance |
| Provider/cost line beneath composer | Usage & cost: conversation route, input/output tokens and sample cost |
| Conversation title → Conversation info | Agent, message count, state, files and pinned messages |
| Conversation title → Sessions & forks | Current/parent/fork relationships and other chats with this agent, without duplicates or empty drafts |
| Incognito → View memory & permissions; Conversation info → Memory & permissions | Separate memory, harness, and permissions/autonomy sections |
| Companion check-in or title menu → Daily context | Upcoming plan, pending decisions and sourced news status |

The panel is a 352px inline aside from 1280px, and an accessible sheet below that width. Switching topic resets its scroll position; desktop headings receive focus and Escape closes the panel. Close restores focus to the initiating control when available. The composer draft and transcript remain intact. Usage totals are conversation-level sample data, not per-message measurements or live billing. Keep Incognito's two editable switches in its existing dialog; the reference view explains their current scope.

The thread retains recorded tool status/arguments, plan/summary cards, blocked requests linking to Inbox, and acted-no-reply cards with reply-only recovery. Source details open from the message's More → Open source action into the reference rail; do not add a duplicate row of “Saved request” source buttons beneath responses. User messages align right; companion messages align left; the thread and composer use the shared page gutters. No provider credentials enter thread or rail metadata.

Inline approval requests use `ApprovalRequest`: a compact, neutral outlined link with the requested action, service icon, approval status, and Review request / View decision affordance. It uses the existing muted surface and theme border, not a warning-colored Alert. The full row opens its exact Inbox request; making a decision remains in Inbox with the full arguments and risk information. Titles wrap, the action moves below on narrow screens, and reviewed requests show their actual outcome. Reserve warning alerts for conditions that need warning treatment, not routine approval navigation.

## Voice typing

`ConversationComposer` is shared by Companion and agent conversations. Keep dictation inside this same docked surface: microphone → listening → **Use text** → editable draft. While listening, live text sits above a microphone-level waveform, with a quiet status/timer and Cancel / Use text controls below. Confirmed words use foreground text; interim words use muted text. The waveform displays actual audio levels, arriving in the center and moving outward, with semantic accent color and reduced-motion support. Do not add a recording modal or a second conversation toolbar.

Finishing dictation inserts words at the original cursor/selection and never sends. Cancel discards only the current recording. Leaving the conversation or backgrounding the page releases the microphone and keeps words already received in that conversation's draft. Drafts remain memory-only and survive route navigation, not a full reload. Speech exceeding the 4,000-character limit is preserved for editing, with Send disabled until shortened. Enter sends; Shift+Enter inserts a newline; Escape cancels active dictation.

The browser speech adapter is composed through `ConkerClient.voiceInput`; the fixture client itself has no recording capability. Speech recognition uses the browser's speech service and may process audio online. Conker does not retain recordings. Microphone permission, unsupported browsers, unavailable speech services, and empty recordings have explicit recovery messages. Dictation follows the browser's preferred language; Tools has no dictation-language submenu. The microphone enters inline dictation; the waveform is its level display. The phone opens the separate call preview. Starting a call from the appbar cancels active dictation and any late microphone request, preserves received words in the chat draft, and leaves focus in the call. Voice typing stays unavailable during an active call. Attachment and live AI speech remain unconnected; do not label browser dictation as a live call.

Use `npm run check:voice` for transcription merging, finalization, cancellation, permission races, microphone cleanup, and draft limits. Verify listening and editable states in light/dark themes and at narrow widths. Automated speech events validate the UI lifecycle; they do not establish that a physical microphone or an external recognition service worked.

## Calls

`CallHost` is global, outside route content. It owns one call preview in a viewport-filling shared `Dialog`, with equal-width participant sides: Conker's conversation by default, and the user's full-frame camera preview with optional live captions at the bottom and typing below. Appearance is an optional replacement for the conversation view, off by default. Use `object-contain` for camera video; never crop the frame to fill its side. Participant labels and audio controls sit at the bottom. Mobile stacks two equal rows with a 20rem minimum in a scrolling region; the main dock remains reachable. Keep existing semantic colors, compact controls, theme-derived surfaces, padded uncropped character artwork and reduced-motion behavior.

The header owns Call, model/provider choice, Incognito, optional browser fullscreen and minimize. The main bottom toolbar aligns companion controls/settings to the left and user controls/settings to the right, with Pause/Resume and End call in the center. On narrow screens those participant groups retain their sides above the session controls and use the shared compact 32px control role. Settings use centered `TaskDialogContent`: companion settings own Focus/Character, voice and session details; user settings own devices and language. Browser fullscreen failure must leave the expanded call usable.

Minimize and Escape preserve the active session in a floating in-app mini call across route navigation. Expansion restores the same call, channels and separate call draft; ordinary conversation drafts remain intact. The mini call uses the same appearance preference and offers mic, camera, audio activity, expand and hang-up controls, with received live captions when enabled. It is not an OS picture-in-picture window or a separate browser tab. Only End call ends the session; dismissing its summary restores focus to the invoking control when available, otherwise to a visible enabled shell control. Minimizing moves focus to the mini call's Expand control.

Keep six independent channels: the user's microphone, camera and keyboard, and the companion's voice, avatar and text/captions. A camera never enables a microphone; typing works with both off. The user's optional live-caption control is separate from companion text visibility, which does not hide the user's sent messages. Focus and Character remain delivery modes for one identity, separate from the model, channels, privacy and permissions. Reuse the Studio's existing character media; the appearance preference applies in expanded, mini and ended states.

Reuse `ConversationIncognito` in the call header with independent No memory and No harness switches. A call inherits the conversation's exclusions and can change them for that call without changing the conversation. Details explain each setting and link to the existing character/voice editor; do not add a second privacy implementation or imply server enforcement.

The phone opens a frontend preview through `ConkerClient.calls`; typed turns produce labeled sample replies. Microphone/camera actions enable local capture, with no Conker recording or camera analysis. Optional live captions use the real `ConkerClient.voiceInput` browser speech adapter in English with the system-default microphone; disclose that its speech service may process audio online in the waiting state and settings. Captions never send a turn or change either draft. Keep the internal rolling buffer bounded to 4,000 characters; display the latest 40 words as a bottom-anchored two-line subtitle tail without a text scrollbar. Mute, caption-off and hang-up cancel recognition; normal/silence endings restart, while other errors offer Retry. Pause captions during any browser read-aloud, including while minimized. The caption adapter borrows the call's stream for level analysis and must not stop the call-owned tracks.

Play on Conker's side manually reads the latest sample reply with the browser's voice, preferring local English. It opens the speech view: full padded portrait, centered bar waveform beneath it, then the complete reply. `CallSpeechText` owns both sides' word styling. Spoken words use foreground, future words muted-foreground, and the actual current word primary plus an underline and a brief settling motion. Follow speech-engine boundary events with absolute text offsets across chunks; never estimate exact word timings. Without boundary support, keep the text readable and disclose the limit. The portrait/waveform stay visible while long lyrics scroll within their own keyboard-accessible region. New microphone words use a brief arrival animation and never show predicted words. Reduced motion removes movement while preserving color and underline states.

Pause is a session preference through `ConkerClient.calls`: hold fixture generation and browser playback, cancel caption recognition and disable owned camera/mic tracks. Preserve channel preferences, current word, received captions and draft; Resume re-enables previous channels and continues playback. Paused drafts remain editable but cannot send. Mini calls expose the same pause/resume action. Hanging up still stops and releases devices; pause is not hang-up.

Character voice and live AI remain unconnected. Shared audio bars show measured microphone level for input and a playback indicator for output, never claimed output amplitude. Preserve permission/device recovery, release capture on hang-up or page exit, and synchronize device flags on cleanup/remount so a stopped stream cannot appear on. The timeline records sent messages, pauses and mode events, not saved word-aligned audio/video or live captions. Session state is memory-only; reload does not reconnect or preserve the call. See [CALL_INTERFACE.md](CALL_INTERFACE.md) for scope and validation; run `npm run check:calls` alongside the voice, conversation, navigation and design checks for relevant changes.

## Conversation activity (September 19)

`ConversationActivity` presents actual response phases as a compact Thinking/Writing pill. Character mode uses Studio's assigned Thinking media (falling back to the complete padded portrait) with an indeterminate ring; Focus and agents without character media use a dotted orb. Studio's artwork-motion preference applies to artwork; progress motion independently respects reduced motion, hidden tabs and whether the inline indicator is visible. No fabricated tool tasks, elapsed estimates or emotion inference.

When reading earlier messages, show a small opaque floating control at the top center of the thread viewport. It shows active character/orb progress and becomes a down arrow once work ends. Clicking it jumps to the latest content and focuses the thread. It occupies no composer/header row. Follow new content only when already near the bottom, or after the owner sends a new message; completion, retries and stopped partial replies never pull the owner away from older messages. Preserve source hash navigation and announce phase changes once, separately from streamed tokens. The indicator remains labelled as a preview while the fixture client supplies responses.

## Character Studio

Character Studio at `/settings/companion` extends the accepted dashboard world. Keep `BaseLayout`, existing semantic colors, editable radius, shared fields/cards and `FormActions`; this surface introduces no new design tokens. Its five sections belong to the shared appbar: Identity & soul, Speaking style, Appearance, Voice, and Expression & modes. Do not duplicate section navigation inside the page. Use the dedicated page for editing, a centered `TaskDialogContent` for import review, and the appbar's existing Companion destination for returning to conversation.

The editor and live draft preview sit beside each other on large screens and stack on smaller screens. The preview may stay sticky on large screens; Save and Discard remain in the shared action footer. Preserve visible pending, error, draft and memory-only feedback. Export includes the current draft; import requires review before replacing that draft and does not save automatically.

Personality, soul, backstory, relationship and speaking style are user-authored text. Do not replace them with personality presets. Activities (idle, listening, thinking, speaking) describe what the companion is doing; named expressions describe how it presents itself. Keep the two independently assignable. Assigned expression artwork takes priority, then activity artwork, then the main portrait. Preserve the complete, uncropped portrait with at least the existing one-eighth inset on each side. Uploaded video loops are muted; disabled motion or reduced-motion preference replaces a video with the still main portrait. Still assigned images remain usable.

Focus and Character are delivery modes for one identity, separate from models, tools, memory, harness and permissions. Keep the conversation menu's preview label and the Studio's authored-example label. Qwen voice design/cloning is not connected; reference playback is an uploaded recording, and existing browser read-aloud still uses a device voice. Show these limitations beside the relevant control. See [CHARACTER_STUDIO.md](CHARACTER_STUDIO.md) for data ownership, import formats and integration boundaries.

This staging handoff records source behavior only. No new Character Studio screenshots, browser-console inspection or rendered interaction verification were available. The existing screenshot reference establishes the incumbent design only; it does not approve the new surface.
