# Conker dashboard design system

This is the implementation contract for the active dashboard. The owner's accepted Chats layout is the reference for collections throughout the app: use the same components, not copied markup or a similar collection of classes. Product direction remains in [design-language.md](../docs/design-language.md).

The foundation is the Vite version of [shadcnstore/shadcn-dashboard-landing-template](https://github.com/shadcnstore/shadcn-dashboard-landing-template/tree/65fc11224e96d56a62e224a58f7ed590aea5ac24/vite-version), reviewed at commit `65fc11224e96d56a62e224a58f7ed590aea5ac24`. Preserve shadcn's native props, Radix keyboard interactions, Button `asChild` composition and semantic theme variables.

## Ownership and imports

| Need | Use | Owner |
| --- | --- | --- |
| Standard route shell and heading | `BaseLayout` with `title` and `description` | `src/components/layouts/base-layout.tsx` |
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

Import the shared application patterns from `@/components/design-system`. Their exported TypeScript props are the API. Route code supplies content, destinations and state; these components own matching dimensions, insets, typography, dividers and hover/focus treatment.

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

## Density and layout contract

| Role / token | Default contract |
| --- | --- |
| Default button / input / select: `--control-height` | 40px / `2.5rem` |
| Compact control: `--control-height-sm` | 32px / `2rem` |
| Large control: `--control-height-lg` | 44px / `2.75rem` |
| Collection search: `--collection-search-height` | 48px / `3rem`, full available width |
| Collection row: `--collection-row-height` | Minimum 64px / `4rem` |
| Collection portrait: `--collection-portrait-size` | 32px / `2rem` |
| Page sections: `--page-section-gap` | 24px / `1.5rem` |
| Appbar section navigation | 40px links in a horizontally scrollable row below the 56px appbar toolbar |
| Standard page title | 30px type / 36px line height, semibold weight |
| Page description | 14px type / 24px line height |
| Page gutters | 16px mobile / 24px small screens / 32px large screens |
| Width | Full available width; no centered route-wide maximum |
| Corners | Derive from editable `--radius` |

Dimensions describe roles. A small inline action can use the compact variant, while collection search always uses its larger shared pattern. Avoid overriding equivalent roles with page-owned `h-*`, `px-*`, font, radius or palette classes. If a new role is needed, add an explicit shared variant and document it here.

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

The composer owns the next turn: preserved draft, reply target, Tools menu, direct model/provider picker, voice typing, send, and stop. Toolbar actions use compact icon buttons with accessible names and tooltips, including Tools and dictation's cancel/return-to-keyboard actions. Model names remain visible because they communicate the selected route. The final waveform action starts listening directly for an empty/whitespace-only draft, becomes Send once there is text, and Stop while streaming. No intermediate "Use voice typing" dialog or separate Talk button is needed. The model chip reads enabled entries from Settings' catalogue; it truncates on narrow screens so the action buttons remain inside the composer. The conversation default remains separate from a one-turn override, which clears after that turn. The quiet provider/cost line clearly labels the fixture. Streaming and thinking are deterministic simulations with abort support; they never run tools.

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

The browser speech adapter is composed through `ConkerClient.voiceInput`; the fixture client itself has no recording capability. Speech recognition uses the browser's speech service and may process audio online. Conker does not retain recordings. Microphone permission, unsupported browsers, unavailable speech services, and empty recordings have explicit recovery messages. Dictation follows the browser's preferred language; Tools has no dictation-language submenu. Both microphone and waveform controls enter inline dictation directly. Attachment and live back-and-forth AI calls are not connected; do not label browser dictation as a live call.

Use `npm run check:voice` for transcription merging, finalization, cancellation, permission races, microphone cleanup, and draft limits. Verify listening and editable states in light/dark themes and at narrow widths. Automated speech events validate the UI lifecycle; they do not establish that a physical microphone or an external recognition service worked.
