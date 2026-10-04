---
name: Conker Dashboard
description: Technical personal AI workspace with integrated documents and quiet context.
# Semantic values remain live in light, dark and custom themes.
# Sources: src/index.css and src/styles/design-system.css.
colors:
  primary: "var(--primary)"
  primary-foreground: "var(--primary-foreground)"
  background: "var(--background)"
  foreground: "var(--foreground)"
  card: "var(--card)"
  card-foreground: "var(--card-foreground)"
  popover: "var(--popover)"
  popover-foreground: "var(--popover-foreground)"
  secondary: "var(--secondary)"
  secondary-foreground: "var(--secondary-foreground)"
  muted: "var(--muted)"
  muted-foreground: "var(--muted-foreground)"
  accent: "var(--accent)"
  accent-foreground: "var(--accent-foreground)"
  destructive: "var(--destructive)"
  destructive-foreground: "var(--destructive-foreground)"
  success: "var(--success)"
  warning: "var(--warning)"
  border: "var(--border)"
  input: "var(--input)"
  ring: "var(--ring)"
  sidebar: "var(--sidebar)"
  sidebar-foreground: "var(--sidebar-foreground)"
  sidebar-accent: "var(--sidebar-accent)"
  sidebar-accent-foreground: "var(--sidebar-accent-foreground)"
  workspace-pane: "var(--workspace-pane, var(--background))"
  workspace-chrome: "var(--workspace-chrome, color-mix(in oklab, var(--background) 60%, var(--muted)))"
  workspace-context: "var(--workspace-context, color-mix(in oklab, var(--background) 50%, var(--card)))"
  workspace-field: "var(--workspace-field, color-mix(in oklab, var(--background) 50%, var(--muted)))"
  workspace-rule: "var(--workspace-rule, color-mix(in oklab, var(--border) 75%, transparent))"
# Sources: design-system/primitives.tsx, shared CSS and the existing Tailwind scale.
typography:
  headline:
    fontFamily: "var(--font-sans)"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: "2.25rem"
    letterSpacing: "0"
  title:
    fontFamily: "var(--font-sans)"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: "1.75rem"
    letterSpacing: "0"
  section:
    fontFamily: "var(--font-sans)"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: "1.5rem"
    letterSpacing: "0"
  record:
    fontFamily: "var(--font-sans)"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: "1.5"
    letterSpacing: "0"
  body:
    fontFamily: "var(--font-sans)"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.5rem"
    letterSpacing: "0"
  label:
    fontFamily: "var(--font-sans)"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: "1.5"
    letterSpacing: "0"
  metadata:
    fontFamily: "var(--font-sans)"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: "1.25rem"
    letterSpacing: "0"
  input:
    fontFamily: "var(--font-sans)"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.5rem"
    letterSpacing: "0"
rounded:
  sm: "var(--radius-sm)"
  md: "var(--radius-md)"
  lg: "var(--radius-lg)"
  xl: "var(--radius-xl)"
spacing:
  micro: "0.25rem"
  tight: "0.5rem"
  row-block: "0.75rem"
  related: "1rem"
  context-inset: "1.25rem"
  section: "1.5rem"
  split: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "var(--control-height)"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "var(--control-height)"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    size: "var(--control-height-sm)"
  workspace-input:
    backgroundColor: "{colors.workspace-field}"
    textColor: "{colors.foreground}"
    typography: "{typography.input}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
    height: "var(--control-height)"
  document-tab:
    textColor: "{colors.muted-foreground}"
    typography: "{typography.label}"
    padding: "0 16px"
    height: "2.25rem"
  document-tab-active:
    backgroundColor: "{colors.workspace-pane}"
    textColor: "{colors.accent-foreground}"
    typography: "{typography.label}"
    padding: "0 16px"
    height: "2.25rem"
  status-badge:
    textColor: "{colors.foreground}"
    typography: "{typography.metadata}"
    rounded: "{rounded.md}"
    padding: "2px 8px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.xl}"
    padding: "16px 0"
  collection-row:
    textColor: "{colors.foreground}"
    typography: "{typography.record}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
  workspace-mode:
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "var(--control-height-sm)"
  workspace-mode-selected:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "var(--control-height-sm)"
  overview-priority:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.lg}"
    padding: "20px"
---

# Design System: Conker Dashboard

## Overview

**Creative North Star: "The Technical Personal Workspace"**

Conker is a technical personal AI workspace: SiYuan's organization with Asri's quiet finish, expressed through Conker's existing semantic themes and system typography. Integrated document tabs, scanable records, soft fields and a content/context split make active work legible. Depth is restrained and source-native controls remain recognizable; there is no physical-material fiction.

The recurring task is to find a source, open its document or configuration, inspect the relevant context, then explicitly save or approve. The original sidebar and Kimi-derived empty new-chat canvas keep their accepted identity. Shared presentation does not change source authority, privacy, draft ownership or mutation eligibility.

The foundation is the Vite version of [shadcnstore/shadcn-dashboard-landing-template](https://github.com/shadcnstore/shadcn-dashboard-landing-template/tree/65fc11224e96d56a62e224a58f7ed590aea5ac24/vite-version), reviewed at commit `65fc11224e96d56a62e224a58f7ed590aea5ac24`. Preserve shadcn's native props, Radix keyboard interactions, Button `asChild` composition and semantic theme variables. [template-reference.md](../docs/reference/template-reference.md) retains the foundation reference; built tokens and the approved technical scope below supersede its historical green-primary and global-density descriptions without changing dependencies or theme architecture.

The owner's accepted Chats collection remains the reuse reference: use its shared components, not copied markup. Product direction remains in [PRODUCT.md](PRODUCT.md) and [design-language.md](../docs/reference/design-language.md). The owner's pinned redesign direction is `seed7cdf9281`; this contract records the current code rather than the earlier visual seed.

**Key Characteristics:**

- Compact application chrome and full-width working records.
- Integrated document tabs, soft fields and a content/context split.
- Semantic light, dark and custom themes with editable corners.
- Source-native controls, visible consequences and explicit commitment.

## Colors

The default light and dark palettes are achromatic: dark action ink on a white canvas reverses to light action ink on charcoal. Custom themes remain authoritative. Frontmatter references the actual CSS variables rather than freezing one mode's color values.

### Primary

Primary and primary-foreground form the action and selection pair. Technical workspace and technical overlay text selection use this same pair, including inverse custom themes. Selection communicates the current context; it does not create a grant or a bulk-selection mode.

### Neutral

Background/foreground, card/card-foreground, popover/popover-foreground, secondary/secondary-foreground, muted/muted-foreground and accent/accent-foreground retain their native semantic meanings. A custom card value renders directly as the card color.

The shared stylesheet owns five scoped workspace roles: pane follows background; chrome softens the appbar with muted; context blends background with card; field softens input surfaces with muted; rule softens border opacity. Their exact formulas live in the frontmatter and in `src/styles/design-system.css`; these are explicit application roles, not a replacement theme layer. The `WorkspaceSplit` aside uses its own background/card blend (65% background) and a standard border. Portaled technical overlay headers use 55% background with card; their action footer uses 70%.

Sidebar navigation continues to use sidebar-specific pairs outside the technical namespace. Border, input and ring retain their standard meanings. Arrowless tooltips use the actual popover pair from `src/components/ui/tooltip.tsx`; they are not forced to a dark fill in every theme.

### Status and data

Success, warning and destructive communicate named states or consequential actions alongside text. `StatusBadge` retains its native status dot and outlined treatments. Existing chart tokens distinguish data categories in graphs; their bounded lightness belongs to that data visualization, not a route palette. The terminal's locally owned neutral tokens remain a readable black command surface in either mode.

**The Semantic Pair Rule.** Keep foreground/background pairs and custom themes live. Derive workspace tones only in their shared owner; preserve legitimate upstream opacity recipes.

Read [color-system.md](../docs/reference/color-system.md) for semantic usage. Approved upstream opacity recipes remain owned by the primitive and recorded in `scripts/template-foundation.json`. Do not add `--surface-*` remapping, another theme provider or `!important` color overrides. Preset/import correctness and contrast still require relevant UI verification; token names alone do not establish them.

## Typography

**Body and operating text:** `--font-sans` in `src/index.css`: -apple-system, BlinkMacSystemFont, Segoe UI, system-ui, Roboto, Helvetica Neue, Arial, sans-serif. The existing theme runtime can replace the family. **Source and code:** the existing `--font-mono` stack, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace. There is no display heading role in the technical shell.

### Hierarchy

Frontmatter owns the reused ramp. Standard fallback page headings use headline; compact `PageHeader` uses title (20px with 28px leading). The technical `WorkspaceSection` and `OverviewSection` use section (15px, semibold with 24px leading). Collection record titles use record (14px, medium with 1.5 leading); previews use 13px with 1.5 leading. Document tabs and collection group labels use label (13px, medium). Body copy uses 14px with 24px leading; counts, statuses and fine metadata use 12px with 20px leading. Inputs use 16px on narrow viewports and 14px from the existing 768px Tailwind breakpoint.

Supporting prose can use `max-w-prose` inside a full-width page. Essential information stays in foreground; size, weight and order carry hierarchy before extra color. Tabular numerals align dates, counts and structured values. Preserve full timestamps and names in accessible labels when visible text truncates.

**The Task Type Rule.** Use the system sans stack for operating text, sentence-case labels and normal tracking. Reserve monospace for source, code and tabular technical content; this workspace has no display-face role.

## Layout

### Technical scope and document anatomy

`src/components/gateway/workspace.tsx` chooses `appearance="technical"` and `contentClassName="technical-workspace"` for the content inset on gateway routes. The exception is exactly `chatActive && !session`, which uses the original appearance. `BaseLayout` applies the class to `SidebarInset`; the sidebar is a sibling and never enters the namespace. This scope also excludes dormant template and legacy fixture routes unless explicitly opted in.

`PageHeader actionsOnly` portals route actions and keeps an accessible hidden h1 without a second visual heading band. With `document`, it publishes the current record title to `WorkspaceChromeContext.documentTitle` and clears it on unmount. `GatewayHeader` shows that title and a parent-return control for the supported project, artifact, agent and job detail relationships. Collection roots use their contextual icon and route title.

`WorkspaceControls` portals local controls below the shared primary appbar. `WorkspaceModes` represents immediate views of the same object with a horizontal Radix radio group; route sections remain URL-addressed links in `AppbarSections`. Technical document tabs attach to the content pane with open lower corners, an inset top rule and no floating pill wrapper.

`WorkspaceSplit` gives the working document a flexible primary track and a context track bounded from 17rem to 21rem, with a 32px gap. Its aside has 20px insets and a left divider, and stays sticky within its owning scroll region. At 1100px and below, it stacks after primary content with a top divider, a 24px gap and transparent background. Today, Setup, Project detail and Character Studio use the same composition with their own tasks and state.

The primary appbar uses three tracks: flexible context, a search track from 12rem up to 420px, and flexible actions. Search compacts when viewport width is below 1024px or available appbar width is at most 900px; it opens the same scoped field in a viewport-bounded popover. Route actions compact on mobile, when there are more than two items, or when their available column is below 224px. The last supplied action stays visible; earlier actions enter the named secondary menu, so consumers must supply the principal command last.

**The Scoped Frame Rule.** Apply the technical appearance to the gateway SidebarInset except chatActive && !session. The sidebar keeps its original tokens and component ownership.

**The One Search Rule.** Keep one local scoped search entry in the appbar. Its scope menu carries the query to global results; route-owned filtering and source-owned retrieval stay intact.

### Structural workspace rules

The active gateway workspace translates SiYuan's organization and Asri's quiet
finish into Conker's existing semantic theme, not their literal styling.
Corresponding tasks share components; specialized canvases and consequential
decisions retain their own anatomy. Review each component against the owner's
six questions: primary task and competition; navigation/toolbar/content/inspector
placement; duplication and grouping; surface meaning; friction versus visible
consequences; and whether it directs the user toward their intended action.

| Component family | Shared rule | Active consumers |
| --- | --- | --- |
| Find a record | One `WorkspaceSearch` in the appbar: filter the current view, or choose Search all Conker with the same query. `CollectionToolbar` retains filters, count and view actions below; no second page-search field. | Chats, Projects, Agents, Jobs, Artifacts, Tools, Activity, Inbox, Memory |
| Browse records | `CollectionPanel` + `CollectionSection` + `CollectionRow`; one quiet divided structural surface. 60px minimum row, 16px desktop / 12px narrow row inset, 14px title, 13px preview text. | The six record libraries; Today reuses rows inside purpose-specific groups |
| Compare structured records | `DataTable` uses the same toolbar and `collection-surface`, preserving sorting, columns, keyboard opening and pagination. Native tables use shared shadcn table primitives, not separately styled HTML. | Activity and system inventories; Memory List retains its canvas-owned search and bounded server pagination |
| Edit related fields | `WorkspaceSection` owns the technical 15px semibold heading, readable description and 16px within-group gap; divided sections use 28px bottom padding. `StudioSection` delegates to it. | General/Search Settings, Character Studio; Inbox's waiting group uses the same heading without a divider |
| Inspect a selection | `ReferenceSection` is a quiet topic divider inside the already framed inspector, never another card or toolbar slab. Option sets use a named select rather than a row of pseudo-command buttons. | Memory content fields and relationships; contextual reference panels |
| Loading / empty | `CollectionLoading` reflects search and rows, not decorative dashboard cards. Empty feedback names the state and provides the appropriate creation or filter recovery action. | Collection libraries, lazy workspaces, Activity |
| Status / priority | Align status at the row end, explanation beneath the record label. Use a border and card pair for priority overview decisions; retain component-owned elevation for actual framed cards, composer and floating overlays. | System diagnostics, Today, Inbox, Chat |

Keep the main shell flat and use the technical appbar geometry below. Meaningful
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
Memory List keeps its native comparison table on desktop and uses the same
`RecordItem` anatomy on mobile. Inspectors present preview, explicitly requested
content and relationships before destructive commands; the consequence stays
beside that command. Selection communicates current context, not bulk selection.

Shared UI does not mean shared authority or transport state: keep source-owned
abort/revision/draft hooks in their existing modules. Centralize presentation
and composition only. Use the shared tokens, native Radix controls, arrowless semantic popover
tooltips and unclipped/reduced-motion icon behavior already in the system.
Design guards enforce shared slot ownership and semantic tokens; the workspace
primitive render checks cover grouping, list semantics and empty/loading states.

`WorkspaceSearch` keeps query/filter state owned by the route and portals only
the control into the appbar. It replaces the universal-search trigger there;
routes without a local query keep that universal entry. On narrow workspaces the
same control opens a focused, viewport-bounded search popover. Typing still filters
loaded collections without provider calls; Memory submits its bounded server read
with Enter. Search all Conker opens the existing authenticated search with the
current query, retaining the local query on return and restoring focus. Exact,
semantic, coverage and privacy behavior are unchanged. `CollectionSearch` remains
an inline field only for task-specific pickers inside forms/dialogs, not another
page query. Review necessity and scope before component styling, not afterward.

### Density and layout contract

#### Technical workspace chrome

The technical gateway inset shares `WorkspaceAppbar`: a 48px desktop / 56px
mobile primary row, 24px desktop and 16px mobile insets, a bounded 420px central
search entry, and right-hand route actions. The original empty-chat frame keeps
the 56px base appbar. The sidebar opener appears only when navigation is hidden; its
artwork aligns to the title inset. Chat and Memory retain ownership of their
stateful controls but use this frame. `PageHeader actionsOnly` portals actions
into the mounted appbar without leaving an empty content band. Specialized
editors retain meaningful record names, not repeated route titles.

Collection filters remain near the results; the local query occupies the single
appbar search entry and its scope menu can open universal results.
Secondary sections and graph controls occupy a quiet, unfilled secondary row.
Main shells have no elevation. Priority overview sections have a border and card pair with no surface shadow.
Framed Card consumers and composers retain their component-owned shadow tokens;
floating overlays retain their stronger depth.
Today keeps setup progress above the sidebar profile, not in a second banner.

Route commands use `WorkspaceRouteActions`: on phones keep the primary command
reachable and disclose secondary commands in the named workspace-actions menu.
Character editor sections are unframed; genuinely framed previews remain raised.

#### Universal search contract

The command dialog progressively groups pages, authenticated metadata, retained
literal text and explicitly enabled semantic retrieval. Match labels survive
optional AI ranking. Local filters are not universal search. Opening a result
navigates to its actual source; search never executes work or changes authority.
Abort obsolete queries, debounce typing and retain literal results when providers
fail. Expose partial, unavailable and degraded coverage rather than inventing hits.

Settings use verified writes with revision checks. Metadata and literal text need
no provider; semantic retrieval and bounded `search-ranking` are opt-in. The model
role owns its model, timeout and fallback. Current source adapters scan at most
200 records; memory library text is limited to retained previews, and only
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
| Collection row: `--collection-row-height` | Technical minimum 60px / `3.75rem`; original frame minimum 64px / `4rem` |
| Collection portrait: `--collection-portrait-size` | 32px / `2rem` |
| Page sections: `--page-section-gap` | 24px / `1.5rem` |
| Related collection controls/results: `--collection-section-gap` | 16px / `1rem` |
| Appbar section navigation | Technical document tabs: 36px desktop / minimum 40px mobile; original links remain 40px |
| Standard page title | 30px type / 36px line height, semibold weight |
| Compact fallback page title | 20px type / 28px line height, semibold weight; ordinary gateway routes portal actions instead of repeating their appbar title |
| Page description | 14px type / 24px line height |
| Collection description | 14px type / 20px line height; 4px after its title |
| Page top inset | 24px; no extra desktop-only gap before the heading |
| Page gutters | 16px mobile / 24px desktop |
| Width | Full available width; no centered route-wide maximum |
| Corners | Derive from editable `--radius` |

Dimensions describe roles. A small inline action can use the compact variant; collection search uses one shared 40px pattern across lists and tables. Avoid overriding equivalent roles with page-owned `h-*`, `px-*`, font, radius or palette classes. If a new role is needed, add an explicit shared variant and document it here.

#### Priority, grouping and screen purpose

Consistency means equivalent controls behave and look alike; it does not mean every screen repeats the same stack of cards. Define the first useful action or piece of information before choosing a composition. The selected theme owns color, type family, corners and elevation; operational text keeps normal tracking, and the screen owns reading order and emphasis.

- **Collections** (Chats, Inbox, Agents, Tools, Journal, Jobs): use `BaseLayout variant="collection"`. Keep heading/help, search and results close, with 16px between related regions. Keep the scope's minimum row height (60px technical, 64px original) and usable controls; reclaim overhead before shrinking content. At 1280×720, aim to begin an ordinary unfiltered list in the upper third to two-fifths of the viewport, allowing real content to wrap. Tabs stay in the appbar.
- **Today**: waiting decisions, continuing work and continuing conversations lead in `WorkspaceSplit`; suggestions and completed work sit in the contextual aside. `OverviewSection priority` is present only when there are waiting decisions, exposed as `data-priority`, and uses a border/card pair without a surface shadow. Technical overview headings are 15px; supporting groups stay unframed. The original fixture Home composition remains documented under Components.
- **Forms and settings**: retain the standard heading, 24px between meaningful sections and existing task-specific editors. Bound long prose inside the full-width page when it aids reading; do not cap the whole route.
- **Conversations and tools**: preserve their viewport-filling variants and existing control ownership. They do not need collection headings to be consistent. Memory uses the canvas role with its own workflow toolbar, including when showing its Database mode.

Use 4–8px within a label/detail group, 16px between related controls or list regions, and 24px between distinct sections. A container must communicate a boundary, state or priority. Do not enclose every heading or supporting group just to fill space. Borders define structure, muted foreground carries supporting detail, and primary color identifies actions/selection rather than decorating every heading. Keep the surface's foreground for essential information; use size and weight before adding colors.

Review the complete vertical stack, not each component in isolation. Desktop and narrow screenshots must show the leading task, readable supporting content, intact corners and reachable actions. Shared token compliance is a baseline, not a substitute for this review.

Page section links remain in one scrollable appbar row on narrow screens; the current section scrolls into view. The appbar collapse control uses the default 40px icon size with an 8px edge inset. In the live product shell the theme control lives in the sidebar's account menu (Settings, Light/Dark mode, Sign out), like other chat apps; the fixture workspace keeps it beside the Conker label. Technical appbar controls use 32px desktop / 40px below 768px; the original conversation retains its compact role.

`BaseLayout` owns a viewport-height frame for every sidebar variant. The appbar stays outside the standard page's keyboard-accessible scroll region; route/section changes reset that region to the top. Inset clips its children to the theme-derived radius and retains its 8px outer frame while content scrolls, on either sidebar side and in expanded/collapsed states. On mobile the frame is edge-to-edge and the sidebar opens as a sheet. Conversations keep their existing transcript and reference-panel scroll regions.

The opt-in `workspace` variant retains the shared heading and gutters, lets its child fill the remaining height, and delegates scrolling to the tool's own regions. System uses this variant for its Terminal and Files sections, with matching `RouteSection variant="workspace"` containers. Overview and regular pages retain page scrolling; conversations retain their separate layout.

The opt-in `canvas` variant fills the remaining viewport below the appbar without a separate page heading or `PageContainer` insets. Memory owns a compact toolbar, spacious canvas, optional folder browser, nonmodal inspector and status line within this frame. Maximize temporarily fills the viewport with that workspace; Restore returns to the shared application frame. This is a canvas role, not a new default page layout.

Use minimum row height instead of a fixed clipping box. Long content, translated text, browser zoom and responsive wrapping must remain usable. Keep title/preview truncation deliberate and retain accessible names. Collection navigation should use actual links, not divs that only respond to mouse clicks.

Photo avatars use the shared neutral outlined frame. The complete image uses `size-3/4 object-contain`, leaving one eighth of the inner frame on each side. Preserve the full artwork and its aspect ratio without zoom transforms or an inner crop. No green tint behind photo portraits. Apply this proportional padding across brand, appbar, thread, collections, and studio; larger studio previews do not change collection density.

Scrollbars share `--scrollbar-size` (10px) and theme-derived thumb tokens in `src/styles/design-system.css`. Native scroll containers and the Radix `ScrollArea` use a rounded thumb inset by 2px, a transparent track, brighter hover, and the primary accent while dragging. Firefox uses its native thin scrollbar with the same resting colors. Preserve native wheel, keyboard, and touch scrolling; forced-colors mode retains system colors. Do not hide overflowing content's scrollbar or add route-specific scrollbar skins.

### Appbar routing

`src/config/navigation.ts` owns route paths, breadcrumb ancestry, page sections, and related-page actions. The router, sidebar, and command search use those paths. Companion stays accessible through the Conker brand and command search, with no separate sidebar item.

Every sidebar destination is an independent navigation root. Home remains the entry page at `/`; it is never an automatic breadcrumb ancestor. Companion is also an independent root. Only actual detail relationships have parents: Chats → conversation, Inbox → request, and Settings → Companion settings. Unknown routes have their own not-found breadcrumb.

`SiteHeader` renders the page path, related-page actions, command search, and section navigation above the content title. Do not add back links, section tabs, or companion-customization shortcuts under page titles or in conversation headers. Task-specific links inside content (opening a request, a source conversation, or a proposed plan) stay with their context.

Chats, Inbox, and Settings use `?tab=` URLs. Their first section is the default; unknown values fall back safely. Links preserve other query parameters and participate in browser Back/Forward. `RouteSection` renders the selected content, while page-owned form/search state remains in the route component. These are real links, not ARIA tabs: normal Tab/Enter and open-in-new-tab behavior apply.

Breadcrumbs resolve conversation and request names from the current snapshot. Reviewed requests return to Inbox's history view. Parent links provide a deterministic route on direct loads. Long names truncate with a full title; the owning section stays visible at mobile widths. Related-page actions retain accessible names.

The appbar is sticky on scrolling pages. Conversation layouts keep their bounded viewport and docked composer. Global search becomes an icon on narrow screens, retaining the keyboard shortcut. Run `npm run check:navigation` alongside the design guard, affected-file lint, and build when changing route metadata or section behavior.

## Elevation & Depth

Ordinary page structure uses tonal separation and rules. The technical inset has no shell shadow; collections use divided structural surfaces. `OverviewSection priority` uses `data-priority`, card/foreground, theme-derived large corners and a border, with 20px desktop / 16px mobile padding. It does not apply `elevation-surface`. That correction replaces the older blanket priority-elevation guidance.

### Shadow vocabulary

The full, theme-aware values live in `src/index.css` and in the sidecar extensions: `shadow-surface` belongs to genuinely framed `Card` consumers; `shadow-composer` belongs to the floating composer; `shadow-overlay` belongs to the technical task dialog and detail sheet. The native button's small shadow and upstream overlay recipes remain valid in their owners. `WorkspaceAction` removes the shadow for routine quiet actions.

Technical overlays carry their own `technical-overlay` class because portals sit outside the content inset. They use the existing overlay shadow, standard border and large theme-derived corners; shared header/footer tones distinguish the task's regions. Context topics use `ReferenceSection` dividers within the inspector rather than another card.

**The Boundary Before Shadow Rule.** Use rules, tone and reading order for ordinary structure. Priority overview sections use a border and card pair without elevation-surface; framed cards, composers and floating overlays retain their own depth.

### Motion

State transitions retain Tailwind's native 150ms standard easing. The overview arrival remains the observed 420ms, 6px settle from 0.65 opacity with `cubic-bezier(0.16, 1, 0.3, 1)`, only when reduced motion is not requested. Native dialogs use 200ms; sheets use their existing 500ms open / 300ms close recipes. These are component values, not a claim that every overlay suppresses all motion. Scoped reduced-motion CSS disables smooth scrolling within technical workspaces/overlays; existing icons, graphs and character media keep their own motion guards. Preserve native scrolling and truthful activity rather than imitating execution with animation.

## Shapes

Corners derive from editable `--radius` in `src/index.css` (default 10px): small subtracts 4px, medium subtracts 2px, large keeps the base and extra-large adds 4px. The default results are 6px / 8px / 10px / 14px; frontmatter stays bound to the source variables so imports and radius controls remain effective.

Technical fields and modes use medium corners; collection rows use small corners; document tabs round the top only; priority sections and technical overlays use large corners. The upstream `Card` retains extra-large corners and its framed role. The original Kimi-derived composer keeps its specific 24px radius, round send action and pill starters. These role-specific forms do not justify a new route-wide radius scale.

Dividers express related records, context topics and field groups. Do not nest cards inside cards or wrap ordinary page sections as floating panels. Preserve intact clipped inset corners, uncropped artwork and usable expanding row height.

## Components

### Shared primitives and states

Buttons retain the native default, outline, ghost, secondary, destructive and link APIs. `WorkspaceAction` makes routine toolbar commands quiet and gives explicit commitment primary emphasis; icon controls need an accessible name. Small toolbar hit areas are 32px desktop and 40px narrow where the source assigns that responsive role. Standard fields and buttons remain 40px; large buttons remain 44px.

Technical `Input`, `Textarea` and `SelectTrigger` use the soft field role, medium corners, workspace rule and no resting shadow. Focus retains the primitive's ring (3px, ring at 50%) and ring border; invalid states retain the destructive recipe and disabled controls retain their native behavior. Collection search uses the pane tone, a 16px leading search icon and trailing scope control; the composer textarea is deliberately transparent and borderless inside its owned frame.

`CollectionRow` is a real link in a list, with a 60px minimum in the technical scope, 12px block padding, 16px desktop / 12px narrow inline padding, a 16px content gap and small corners. Hover uses the workspace field tone; keyboard focus retains the ring outline. Group labels use the 13px role. `CollectionLoading` mirrors rows; `CollectionEmpty` names the state and supplies working clear/create recovery without decorative dashboard tiles.

`Badge` and `StatusBadge` retain semantic outline, primary and status treatments with text; they are not general navigation pills. `Card` remains a genuinely framed container with its source-owned shadow, extra-large corners, border, 16px vertical padding and 16px child insets. It does not define the collection or page-section default. `OverviewSection priority` is a separate border-only decision primitive.

`WorkspaceModes` supplies radio semantics and focus indication; it uses 32px controls with icon/text on desktop and 40px icon controls below 640px, retaining the accessible option names. `AppbarSections` remains link navigation. `WorkspaceInspector` docks nonmodally at the right, using 340px in the technical scope with its inherited maximum of 40%; below 768px it becomes a bottom inspector with a 42dvh height. Task dialogs and details sheets retain viewport bounds, close clearance and restoration behavior.

**The Shared Ownership Rule.** Reuse the exported application patterns for corresponding tasks. Centralize presentation and composition while keeping abort, revision, draft and authority hooks in their source modules.

### Gateway records and authority

Project detail uses document identity and `WorkspaceSplit`: fields occupy primary content and linked work occupies context. Links store source identity, not copied content or inherited grants. Dirty fields require an explicit save/reset before reference changes; context inclusion remains a separately reviewed action. Project revision conflicts preserve feedback beside Save.

Artifact detail uses `PageHeader document`, `WorkspaceControls` and Preview/Source/History modes. Saving appends an immutable version; historical source is read-only. Unavailable or unverifiable source content blocks preview, history bodies, editing and export while retaining the tombstone. Local mode changes do not broaden source access.

Setup and Character Studio share the split while retaining their own source checks, drafts, import review and save eligibility. Gateway memory, runtime conversation, approvals and recovery retain source-owned abort, revision and privacy hooks. The contract records built presentation and source boundaries, not a claim of production readiness. The existing search groups and opt-in retrieval below are bounded capabilities, not complete layered indexing.

### Ownership and imports

| Need | Use | Owner |
| --- | --- | --- |
| Standard route shell and heading | `BaseLayout` with `title` and `description` | `src/components/layouts/base-layout.tsx` |
| Find-and-manage collection shell | `BaseLayout variant="collection"`; compact shared heading and section rhythm | Same layout module |
| Prioritized overview groups | `OverviewSection`; `priority` exposes a bordered decision surface without elevation | `src/components/design-system/primitives.tsx` |
| Viewport-filling tool beneath a standard heading | `BaseLayout variant="workspace"`; tool owns its scroll regions | Same layout module |
| Canvas-led workspace without a separate page heading | `BaseLayout variant="canvas"`; local workflow toolbar and independent canvas/inspector regions | Same layout module; Memory is the current consumer |
| Page heading or document identity | `PageHeader`; `actionsOnly` portals actions, `document` publishes the record title | `src/components/design-system/primitives.tsx` |
| Route sections | `RouteSection`; navigation is rendered by `SiteHeader` | `src/config/navigation.ts`, `src/components/appbar-navigation.tsx` |
| Page search / scope | `WorkspaceSearch`, mounted once into workspace chrome | `src/components/design-system/primitives.tsx` |
| Collection or table filters | `CollectionToolbar`; page search moves to the appbar | Same design-system module |
| Task-specific option search | `CollectionSearch` inside the picker | Same design-system module |
| Search, results announcement and empty state together | `CollectionPanel` | Same design-system module |
| Group heading and divided collection | `CollectionSection` | Same design-system module |
| Compact linked item | `CollectionRow` | Same design-system module |
| No results / no items | `CollectionEmpty` | Same design-system module |
| Agent identity in a collection | `AgentIdentityPortrait` | Same design-system module |
| Related form fields / section heading | `WorkspaceSection`; Studio delegates through `StudioSection` | Shared design-system module |
| Topic within a reference panel | Quiet `ReferenceSection` divider | `src/components/reference-section.tsx` |
| Inspect a canvas selection without blocking further selection | `WorkspaceInspector` with `OverlayBody` and `ReferenceSection` | `src/components/design-system/overlays.tsx` |
| General buttons, fields, cards, badges, dialogs | Existing `@/components/ui/*` and `StatusBadge` | Shadcn primitives plus application status composition |
| Content/context composition | `WorkspaceSplit`, with task-owned children and accessible aside label | `src/components/design-system/primitives.tsx` |
| Local object modes | `WorkspaceModes`, horizontal radio selection | Same primitive module |
| Local chrome controls | `WorkspaceControls`, portaled to the controls slot | Same primitive module |
| Appbar slots and action overflow | `WorkspaceAppbar`, `WorkspaceRouteActions`, `WorkspaceAction` | `src/components/design-system/workspace-chrome.tsx`, `src/lib/workspace-chrome.ts` |
| Dimensions and density | CSS tokens with technical inset overrides | `src/styles/design-system.css` |
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

Declare the route's sections in `src/config/navigation.ts`. The shared appbar owns their links and selected state. Route content must not add another navigation strip below its title. Memory and Tools retain task-local workflow modes in their workspace toolbar. The gateway Memory Map/Tree/List radio group uses `WorkspaceModes`; the original fixture Memory Network/Hierarchy/Database selector keeps its URL-backed behavior. The appbar remains application navigation.

For working collection examples, read `src/app/chat/page.tsx` and `src/app/inbox/page.tsx`. Both routes import the same patterns. Chats shows sessions or each agent's latest session; Inbox shows requests or past decisions. Their content differs while corresponding UI elements match.

`WorkspaceSearch` takes a required accessible `label` and normal input props (`value`, `onChange`, `placeholder`), plus optional `onSubmit` for server retrieval. It owns appbar placement, scope, compact presentation and accessible focus behavior. `CollectionSearch` is its field primitive and the inline task-picker alternative. `CollectionRow` takes `to`, `title`, `description` and optional `descriptionTitle`, `leading` and `trailing` slots. Use `AgentIdentityPortrait name={agentName}` in the leading slot. `CollectionPanel` owns the shared search registration, live result count and clearable empty-state composition for list screens.

`DataTable` uses `WorkspaceSearch` too. It retains columns, sorting, filters, selection and pagination where structured comparison needs them. Do not replace a useful data table with a collection merely to make every screen identical.

### Interaction placement

Choose the surface from the user's task, then reuse the same pattern wherever that task occurs. This is a frontend contract; it does not imply a connected executor or permission to add backend behavior.

| User intent | Surface / shared pattern | Examples |
| --- | --- | --- |
| Create an item or change several related fields | Centered `TaskDialogContent` inside the shared `Dialog`; `size="wide"` for a job form | New/edit job, conversation model, message edit, theme import |
| Configure multiple sections with previews or long-lived navigation | Dedicated page with `BaseLayout` | Settings, Character Studio, first-run setup |
| Inspect a record while preserving list position | `DetailPanel` with `OverlayBody` and `ReferenceSection` topics | Agent conversations, tool scope, journal source, job history |
| Inspect successive canvas points without a modal interruption | Shared nonmodal `WorkspaceInspector`, docked right on desktop and below the canvas on mobile | Memory records, category folders, topics and source evidence |
| Make a small immediate preference change | Labeled inline control, with state feedback | Theme, layout, Incognito toggles |
| Review a consequential request with evidence | Dedicated detail page, decision actions beside the request | Inbox approval/proposal; do not add a second generic confirmation |
| Delete/redact an item | `ConfirmationDialog`, naming the target and consequence; Cancel receives initial focus | Job deletion, conversation deletion/clear, message redaction |
| Submit a draft | `FormActions`: feedback at the left, secondary action before primary at the right | Save/discard in Settings and Studio, Cancel/Create in dialogs |

Import application patterns from `@/components/design-system`. `TaskDialogContent` and `DetailPanel` own header spacing, close-control clearance, viewport bounds, scroll-body composition and corner clipping. Compose their children with `OverlayBody` and `FormActions`; a specialized form such as `JobEditor` may own its scrollable fieldset. Use a 16px minimum outer dialog gutter, a viewport-bounded height, 20px internal insets, and 32px close controls inset 12px from the corner. Dialogs keep theme-derived corners; edge-attached sheets are deliberately flush. Terminal fullscreen and the expanded call stage are explicit edge-to-edge shared Dialog exceptions; the ended-call summary returns to a bounded dialog with theme-derived corners.

Creation and substantial editing never share a generic details drawer. Completing creation returns to the collection with visible feedback; editing from an inspector returns to that inspector. Preserve validation, prevent accidental outside-click dismissal of draft forms, disable submission while pending, and restore useful keyboard focus when closing or moving between surfaces. Keep existing drafts, Incognito behavior and conversation feature ownership intact.

Common actions remain visible: Run/Pause for jobs, New chat for agents, source links for evidence. Use named buttons; reserve icon-only controls for familiar actions with accessible labels/tooltips. Secondary actions belong in a menu. Avoid duplicate page-navigation strips: the sidebar chooses roots, the appbar owns route sections and context, and the page header may own creation actions.

Legacy Agents, Tools, Memory's Database mode, Journal and Jobs share `DataTable`. Supply `renderItem` using `RecordItem` below 1280px; desktop keeps the table for comparison. System services use the same responsive pattern with read-only summaries and a Connections action. One table instance owns search, filters, sorting and pagination across both representations. Mobile sorting remains available. Row titles open details using real buttons; visible actions remain separate. Keep column definitions stable when selection changes so a closing inspector can restore focus to its initiating control. Tables use wrapping content and one quiet structural surface, not an elevated card. Active gateway consumers follow the component-family rules above. Empty states explain the next action; filtered empties offer a clear action, and creation empties link to the working creation flow.

Bounded forms scroll a normal `div` around their fieldset, with `min-height: 0` throughout the flex chain. Do not make the fieldset itself the flex scroll region: browser fieldset sizing can allow its content to overlap the footer on short screens. The action footer stays outside that scroll region. Validate this visually at a short mobile viewport, not only a tall desktop window.

Do not relocate a correctly placed feature just to touch every screen. Home remains an overview; Companion remains the proactive conversation; Chats preserves message/appbar/composer/reference ownership; System keeps Overview, Terminal and Files as separate sections.

### Intentional exceptions

Exceptions have a concrete UI role and narrow ownership. They do not permit an unrelated search, tab or palette implementation in the same file.

- `src/app/chat/conversation.tsx`: the conversation has an accessible hidden h1 and specialized transcript/composer. Its h1 is allowed; palette and search rules still apply. Visible identity and conversation controls live in the appbar.
- `src/app/login/page.tsx` and `src/app/setup/page.tsx`: standalone authentication/onboarding headings use AuthLayout. Their `h1` elements are allowed.
- `src/app/errors/not-found/components/not-found-error.tsx`: the standalone error code heading is allowed.
- `src/components/design-system/primitives.tsx`: owns raw shared heading/search markup, modes and primitive tab composition; `index.tsx` re-exports the public API. Other route code consumes it.
- `src/components/ui/*`: foundational primitives retain their raw implementation APIs. Product routes must use the shared application pattern where one exists.
- `src/lib/character-options.ts`: swatches represent artwork colors. Character Studio can use larger portrait previews while keeping shared fields and surfaces.
- `src/config/theme-data.ts`, `src/config/theme-customizer-constants.ts`, `src/utils/tweakcn-theme-presets.ts`, `src/utils/shadcn-ui-theme-presets.ts`: theme definition/swatch files may contain actual color values. They must not become a place to hide route styling.
- The customizer's nested controls can compose primitive tabs inside their own editor. Page-level navigation uses the shared appbar and URL-addressed `RouteSection` content. `PageTabs` remains available for local, non-routing tab interactions.
- Memory owns local URL-backed workflow modes in its toolbar, a searchable command-style point picker, and the shared `WorkspaceInspector` for immediate nonmodal inspection. Its graph uses chart-derived category colors with a local dark-theme lightness bound; this data-visualization role does not establish a separate application palette or replace shared collection search and form controls.
- The terminal's neutral surface variables in `src/index.css` preserve a black command area, graphite chrome and readable text in both themes. Its inset command area has an 8px frame and fills the available width; the info control opens project/connection context. Fullscreen uses a viewport-filling shared Dialog with Escape and focus restoration. These variables do not establish a separate general application palette.

System is one sidebar destination with Overview, Terminal and Files in the shared appbar section navigation, exactly like Chats and Inbox. Overview (`/system`) owns system stats and services; Terminal (`/system?tab=terminal`) and Files (`/system?tab=files`) are separate section bodies. Files owns the expandable tree, selected path and copy action, using normal card/accent theme roles on desktop and mobile. Do not embed the tree in Terminal or its fullscreen view. Command search links directly to each section; old `/terminal` and `/files` bookmarks redirect to the matching System section.

Both remain frontend previews with separate `ConkerClient` snapshots: `TerminalSnapshot` supplies shell context and `FilesSnapshot` supplies the sample directory tree. Directory disclosure, path selection and copying work locally; no file editor, filesystem access or shell command transport is implied. Keep the Files sample label and Terminal offline state visible until those connections exist.

Dormant template demo routes are outside the guard until imported by the active route graph. Do not broaden exceptions just to make a new finding disappear; choose the shared component or document and narrowly implement a real new role.

### Validation and maintenance

This documentation pass used source inspection only. No browser inspection or screenshot generation was performed; desktop/mobile, light/dark and custom-theme browser acceptance was not independently verified here. The integration report records pushed UI commit `6c78b67661e28431b3ade7ebdd37a2d83a2df2c5` with all 29 suites, build, lint and design guards passing and a ship verdict for the two resolved fixes. Those are supplied integration results, not newly run documenter checks or proof of production behavior.

#### Gateway conversation presentation

The connected/preview gateway chat uses `ChatComposerFrame` for both the initial request and subsequent replies. It owns the input's growing height, focus-within border, unified surface and wrapping toolbar; the gateway owns model/agent/privacy controls and mutation eligibility. `conversationColumn` supplies identical transcript and reply-composer gutters. Do not duplicate those dimensions in the route.

Saved conversation headers keep the compact title, call and secondary menu. Next-turn agent/model selection, privacy and voice typing stay in the composer. When navigation is hidden, the sidebar opener remains visible on both new and saved chat, including mobile. `ConversationHistory` follows changing content only while near the bottom; reading older content exposes a latest-message control and linked-message navigation retains its target.

Message actions reveal on hover/focus for pointer users and remain visible on touch. Keep user-message actions outside the bubble's layout height, avoid empty feedback rows, and retain full timestamps in accessible labels/tooltips. Runtime memory/tool evidence and approval/recovery controls remain sourced from saved turns: never turn prose into executable proposals or imply unsupported attachments/video calls.

Run `npm run design:check` for the TypeScript AST guard. It follows local static imports, exports and literal dynamic imports from `src/config/routes.tsx`. This covers active routes and their dependencies while avoiding unused template demos.

The guard rejects standard raw `h1` headings, direct primitive-tab imports from active route modules, raw `Input`/native search fields, and hard-coded Tailwind palette/literal-color classes in reachable application code. It recognizes aliased inputs and search placeholders such as `searchPlaceholder`. It does not ban arbitrary layout dimensions or normal form fields.

`npm run lint` and `npm run build` both run the guard before their usual checks. `npm run design:check:test` proves invalid fixtures fail, valid shared patterns pass, exceptions stay narrow and inactive demos remain excluded. No additional test framework is required.

Static checks cover recognizable source patterns, not every possible runtime-generated style. Render the affected screens before finishing visual work. Compare Chats/Inbox search, tabs, rows, portraits and titles at desktop and narrow mobile widths. Check light/dark themes, a radius or preset change, keyboard focus, empty states, long content and navigation. For shared primitive changes, inspect a representative form, table and detail page as well. Record screenshots and any untested limitations.

Update the shared component and its contract first; migrate consumers together. A new page should compose these patterns from the start. Shared implementation, automated checks and rendered review are the mechanism for keeping screens consistent.

### Jobs

The following describes the original ConkerClient fixture workspace. Gateway jobs retain their source-owned read, revision and mutation rules and compose shared collections/document identity; a shared presentation does not imply that a fixture receipt is a connected scheduler.

Jobs owns direct management at `/jobs`: New job, editable instructions/agent/schedule/time zone, visible Run now and Pause/Resume, and a compact menu for details/history, editing, duplication and deletion. New/edit forms use a wide centered task dialog with a scrollable fieldset and fixed action footer. Details/history use `DetailPanel`; deletion uses `ConfirmationDialog`. Copies start paused with no inherited run history. Running a paused job does not enable its schedule.

Use the shared searchable/sortable `DataTable` for desktop comparison and its `renderItem`/`RecordItem` presentation below 1280px. Search and status/last-failure filters belong to the page and survive these responsive changes; sorting stays in the shared table instance. Reuse the same `JobActions` in the table, stacked rows and detail sheet. Keep long titles wrapped, instructions readable, keyboard focus restored, and form errors beside their fields.

All job mutations go through the existing `ConkerClient` fixture adapter. Daily, weekly and hourly-interval schedules are configuration previews; new/edited jobs show “Awaiting scheduler.” Run now records an explicit simulated receipt and never invokes agents, tools or server commands. The in-memory data resets on reload. Keep the Preview label, sample-receipt provenance and form limitation copy. Validate via `npm run check:jobs` plus affected lint, build and rendered desktop/mobile checks.

### Today, Home and Companion

The gateway Today workspace is distinct from the original fixture Home below. It composes `WorkspaceSplit` with Waiting for you, Continue work and Continue a conversation in the primary track, and Suggested/Completed in the aside. Only actual waiting decisions enable `priority`. Refresh and New chat stay in the appbar; setup progress remains above the sidebar profile rather than a second Today banner. Suggested work requires an explicit choice. Source failures preserve partial-state feedback, not a fabricated ready overview.

#### Original fixture Home and Companion

Home (`/`) is the workspace overview for Conker's internal screens. Linked counts open Agents, Tools, Memory and Jobs; the remaining sections show pending requests, agent status, recent Journal activity, recent conversations and System status. The page-header actions are New chat and Open companion, and System status links to Connections and System.

Compose Home with `BaseLayout`, shared cards, `CollectionRow`, `AgentIdentityPortrait`, buttons and status badges. The resource strip has two columns on narrow screens and four on large screens. At extra-large widths, requests and activity occupy the wider left column, with agents and conversations on the right; smaller screens stack these sections. System status spans the page. Preserve shared section gaps, density, theme/radius behavior, the inset frame and complete padded portraits.

Tasks and calendars belong to the separate productivity app, which may later connect through MCP/ToolGate. Home has no daily briefing, agenda, news feed, planning starters or chat composer. Journal summaries may include recorded calendar-tool activity as audit data; they must not become a personal calendar interface.

Home reads the `ConkerClient` snapshot and derives its summaries through `getWorkspaceOverview` in `src/lib/workspace-overview.ts`. Show up to three pending requests and agents, four recent Journal entries, and three recent conversations; conversations exclude the permanent Companion, archived sessions and empty drafts. Enabled jobs count scheduled jobs, with paused jobs reported separately. Preserve the Preview data label and explicit sample-service status; fixture activity dates remain anchored to their recorded date. `getDailyOverview` remains available for Companion's day context.

Home has one quiet overview arrival: 420ms with a 6px upward settle and a small opacity change, enabled only when reduced motion is not requested. Keep it an entrance treatment rather than an imitation of live agent activity. No new palette, density or motion tokens are introduced.

Companion (`/companion`) is the main-agent workspace: a dedicated stable conversation, daily briefing, action starters, and contextual events/news. It uses the shared `Conversation` shell and composer. Existing chats remain at `/chat/:id`. Never choose the main companion by session array position.

Companion has its own appbar identity, with no Chats ancestor. Its check-in stays in the thread after the first exchange and folds into an expandable summary. Recent conversations and pending decisions use the shared collection rows and real fixture destinations. Action starters prepare editable prompts; they never send automatically. The main companion cannot be handed to another agent, archived, or mixed into regular chat history.

`/chat/new` opens a separate topic with Conker by default; `?agent=<id>` preselects an existing agent. New chat is available from conversation and collection appbars, Agents rows, and command search. The client reuses an empty draft for the selected agent, preserving unsent words on route navigation. The first message names the conversation and adds it to history. Empty drafts stay out of Chats and daily recent activity. Conversations and drafts are memory-only in this preview and reset on a full reload.

The ordinary chat's appbar avatar opens the agent picker. Before the first message it selects the agent; afterward it becomes an explicit handoff. Handoffs appear at their message boundary, retain previous authors, preserve Incognito preferences and the separate model selection, and clear execution grants. A fork restores the agent at its selected message boundary rather than inheriting a later handoff. The canonical Companion identity remains fixed; separate chats can still use the companion agent.

Character customization lives at `/settings/companion`, separate from conversation. Brand navigation opens Companion. In the fixture workspace the sidebar brand row owns the theme switcher; the live shell uses the account menu.

`BaseLayout` accepts an optional `actions` slot for standard page-header actions. DailyNews owns feed content; its parent owns the section heading. It renders publisher/date/source metadata for ready feeds and a truthful unavailable state otherwise.

When Companion receives `{ prompt }` in React Router state, append it to an existing draft, never overwrite the user's words or send automatically. Home's New chat and Open companion actions navigate directly without planning prompts. The 4,000-character composer limit remains enforced.

The current transport is a sample preview. No AI replies, news headlines, weather, or external actions may be implied to be live until corresponding providers are connected. Keep the briefing date explicit; render plans as proposals rather than booked calendar events.

### Models and conversation data

Settings owns the Models / Providers catalogue at `/settings?tab=models`: provider endpoint/key drafts, enabled catalogue routes, and the workspace default. These are explicit sample configurations; saving never contacts a provider. Keys remain masked and memory-only. Chat picks only enabled catalogue entries and exposes no provider credentials.

All conversation mutations and simulated replies go through ConkerClient. Normalized messages retain source identity, edits, redacted tombstones, and independent fork copies. Conversation defaults differ from per-turn model overrides. Preview incognito stores independent memory/harness exclusions; no transport or production privacy promise is implied. Run `npm run check:conversation` for mutation, fork, model, retry, privacy, and abort behavior.

### The four conversation homes

Conversation-wide actions live in the appbar: the avatar owns agent selection/handoff, and the title menu owns rename, conversation-default model/route, pin, archive/restore, delete/clear, Conversation info, Sessions & forks, and edit companion. The permanent Companion omits rename, pin, and archive and adds Daily context. The right-side order is New chat, search, Incognito. There is no standalone right-panel toggle: features open the relevant reference view. Incognito uses the standard hat-and-glasses icon, with no visible text label; its tooltip and accessible name expose the current mode. There is no separate conversation header. The theme switcher stays beside the sidebar brand. All sidebar destinations retain independent roots.

Incognito opens a dialog with two independent switches, **No memory** and **No harness**. All four combinations are supported and stored per conversation through ConkerClient; forks copy them independently. Only the memory switch changes the declared memory scope. The aggregate `incognito` flag means at least one exclusion is enabled, and the legacy boolean update remains a shortcut for both. The rail reports both settings separately. These preview preferences do not imply server enforcement, deletion of existing transcripts, or private browser speech processing.

Message actions occupy a compact row beneath the message. Gateway pointer controls reveal on hover/focus and remain visible on touch; the original fixture workspace keeps its always-visible row. `MessageActions` owns both its controls and metadata, using 32px icon buttons with tooltips. Response actions are Copy, Read aloud/Stop, Good response, Bad response, Try again, Share, and More; user actions are Copy, Edit, Reply, Share, and More. The timestamp and Edited/Pin markers share this row and wrap when space is tight. User rows align right, response rows left. A short user bubble must retain its natural width independently of its toolbar.

Less frequent actions stay in the same message's More menu: Fork, Reply/Edit when absent from the visible row, Retry with model, Pin, Redact, Message info, and Open source. Message info replaces the old Explain label and shows recorded metadata and provenance; it does not imply an AI-generated explanation. Fork copies only through that message. Edits are visibly marked; redaction keeps a tombstone and does not alter independent forks. Sharing copies a local preview link and never publishes content. Ratings are optional, mutually exclusive, reversible preview data saved through ConkerClient; editing or redacting a response clears its rating.

Read aloud uses the browser's speech synthesis with one message playing at a time, a visible Stop control, and error recovery. Playback stops on navigation, message changes, backgrounding, or starting microphone input. This is text playback, not an AI voice call. Run `npm run check:voice` for playback chunking, cancellation, and failure behavior alongside dictation checks.

The composer owns the next turn: preserved draft, reply target, Tools menu, direct model/provider picker, voice typing, call entry, send, and stop. Toolbar actions use compact icon buttons with accessible names and tooltips, including Tools and dictation's cancel/return-to-keyboard actions. Model names remain visible because they communicate the selected route. The microphone starts inline voice typing. The separate final phone action starts or returns to the call for an empty/whitespace-only draft, becomes Send once there is text, and Stop while streaming. The conversation title menu also offers Start call / Return to call, including when the composer has a draft. The model chip reads enabled entries from Settings' catalogue; it truncates on narrow screens so the action buttons remain inside the composer. The conversation default remains separate from a one-turn override, which clears after that turn. The quiet provider/cost line clearly labels the fixture. Streaming and thinking are deterministic simulations with abort support; they never run tools.

The reference panel is closed by default and shows one requested topic at a time. It has a context-specific title and conversation name or selected message author/time/excerpt. Each topic uses `ReferenceSection`: a quiet top divider with 16px top spacing and 12px internal spacing, inheriting the inspector's inset and surface. Do not nest another filled panel or append the entire conversation's metadata beneath a selected source.

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

### Rich answers, continuity and execution

Use `RichAnswer` for both streaming and finished assistant text. Its Markdown, code, table, math and supplied-citation controls inherit semantic colors and shared dialogs/popovers. Keep code and wide tables locally scrollable; never widen the thread. Copy/export original content, neutralize CSV formulas, reject unsafe links, and leave raw HTML and remote images inert. Read-aloud consumes readable text. Source IDs come from client evidence, not invented links in prose.

Queue controls belong immediately above the composer. Enter queues while a response runs; Stop remains separate. Each of up to five entries captures its text, reply target, agent, model, privacy and options. Changing the next-turn controls never silently changes a queued entry. Stop, failure, unresolved approval or revoked/changed context pauses dispatch. Resume is explicit; changed settings require review. Queues survive route navigation but remain memory-only. Deleting a conversation explicitly warns that its queue is removed.

Retries are versions of one response, with compact Previous/Next controls beneath that response. Viewing an old version does not rewrite the active continuation. Continue in a fork makes that intent explicit; editing an earlier submitted message also creates a fork when later turns exist. Preserve each version's sources, model, partial text and public activity. Redaction clears its derived evidence and cached previews.

`ConversationRun` is the sole activity disclosure: public steps, tools, named agents, handoffs, plans and supplied receipts. Inspector actions open the existing reference rail; approval actions open Inbox. Group repetitive steps and bound logs. Label simulated evidence Preview. Normal fixture replies must never invent executed work. Development scenarios are available only in development with `?fixtures=1` and never in the production composer. Text retry does not replay an action scenario.

Activity artwork follows supplied state, with a Focus orb and Character media/fallback. Keep padded full artwork, quiet terminal states and motion suppression for reduced motion, hidden/offscreen content and disabled Studio motion. Failed or blocked media playback falls back to the portrait. Announce phase changes, not every token or timer tick. Automatic queue dispatch, streamed updates and completion preserve manual reading position; only explicit send/jump actions force the thread to the bottom.

Checks: `check:rich-answer`, `check:chat-continuity`, `check:chat-workspace` and `check:activity`, alongside existing conversation/call/voice/theme checks. The scoped delivery evidence and limits live in [chat-delivery-progress.md](../docs/archive/chat-delivery-progress.md).

### Voice typing

`ConversationComposer` is shared by Companion and agent conversations. Keep dictation inside this same docked surface: microphone → listening → **Use text** → editable draft. While listening, live text sits above a microphone-level waveform, with a quiet status/timer and Cancel / Use text controls below. Confirmed words use foreground text; interim words use muted text. The waveform displays actual audio levels, arriving in the center and moving outward, with semantic accent color and reduced-motion support. Do not add a recording modal or a second conversation toolbar.

Finishing dictation inserts words at the original cursor/selection and never sends. Cancel discards only the current recording. Leaving the conversation or backgrounding the page releases the microphone and keeps words already received in that conversation's draft. Drafts remain memory-only and survive route navigation, not a full reload. Speech exceeding the 4,000-character limit is preserved for editing, with Send disabled until shortened. Enter sends; Shift+Enter inserts a newline; Escape cancels active dictation.

The browser speech adapter is composed through `ConkerClient.voiceInput`; the fixture client itself has no recording capability. Speech recognition uses the browser's speech service and may process audio online. Conker does not retain recordings. Microphone permission, unsupported browsers, unavailable speech services, and empty recordings have explicit recovery messages. Dictation follows the browser's preferred language; Tools has no dictation-language submenu. The microphone enters inline dictation; the waveform is its level display. The phone opens the separate call preview. Starting a call from the appbar cancels active dictation and any late microphone request, preserves received words in the chat draft, and leaves focus in the call. Voice typing stays unavailable during an active call. Attachment and live AI speech remain unconnected; do not label browser dictation as a live call.

Use `npm run check:voice` for transcription merging, finalization, cancellation, permission races, microphone cleanup, and draft limits. Verify listening and editable states in light/dark themes and at narrow widths. Automated speech events validate the UI lifecycle; they do not establish that a physical microphone or an external recognition service worked.

### Calls

`CallHost` is global, outside route content. It owns one call preview in a viewport-filling shared `Dialog`, with equal-width participant sides: Conker's conversation by default, and the user's full-frame camera preview with optional live captions at the bottom and typing below. Appearance is an optional replacement for the conversation view, off by default. Use `object-contain` for camera video; never crop the frame to fill its side. Participant labels and audio controls sit at the bottom. Mobile stacks two equal rows with a 20rem minimum in a scrolling region; the main dock remains reachable. Keep existing semantic colors, compact controls, theme-derived surfaces, padded uncropped character artwork and reduced-motion behavior.

The header owns Call, model/provider choice, Incognito, optional browser fullscreen and minimize. The main bottom toolbar aligns companion controls/settings to the left and user controls/settings to the right, with Pause/Resume and End call in the center. On narrow screens those participant groups retain their sides above the session controls and use the shared compact 32px control role. Settings use centered `TaskDialogContent`: companion settings own Focus/Character, voice and session details; user settings own devices and language. Browser fullscreen failure must leave the expanded call usable.

Minimize and Escape preserve the active session in a floating in-app mini call across route navigation. Expansion restores the same call, channels and separate call draft; ordinary conversation drafts remain intact. The mini call uses the same appearance preference and offers mic, camera, audio activity, expand and hang-up controls, with received live captions when enabled. It is not an OS picture-in-picture window or a separate browser tab. Only End call ends the session; dismissing its summary restores focus to the invoking control when available, otherwise to a visible enabled shell control. Minimizing moves focus to the mini call's Expand control.

Keep six independent channels: the user's microphone, camera and keyboard, and the companion's voice, avatar and text/captions. A camera never enables a microphone; typing works with both off. The user's optional live-caption control is separate from companion text visibility, which does not hide the user's sent messages. Focus and Character remain delivery modes for one identity, separate from the model, channels, privacy and permissions. Reuse the Studio's existing character media; the appearance preference applies in expanded, mini and ended states.

Reuse `ConversationIncognito` in the call header with independent No memory and No harness switches. A call inherits the conversation's exclusions and can change them for that call without changing the conversation. Details explain each setting and link to the existing character/voice editor; do not add a second privacy implementation or imply server enforcement.

The phone opens a frontend preview through `ConkerClient.calls`; typed turns produce labeled sample replies. Microphone/camera actions enable local capture, with no Conker recording or camera analysis. Optional live captions use the real `ConkerClient.voiceInput` browser speech adapter in English with the system-default microphone; disclose that its speech service may process audio online in the waiting state and settings. Captions never send a turn or change either draft. Keep the internal rolling buffer bounded to 4,000 characters; display the latest 40 words as a bottom-anchored two-line subtitle tail without a text scrollbar. Mute, caption-off and hang-up cancel recognition; normal/silence endings restart, while other errors offer Retry. Pause captions during any browser read-aloud, including while minimized. The caption adapter borrows the call's stream for level analysis and must not stop the call-owned tracks.

Play on Conker's side manually reads the latest sample reply with the browser's voice, preferring local English. It opens the speech view: full padded portrait, centered bar waveform beneath it, then the complete reply. `CallSpeechText` owns both sides' word styling. Spoken words use foreground, future words muted-foreground, and the actual current word primary plus an underline and a brief settling motion. Follow speech-engine boundary events with absolute text offsets across chunks; never estimate exact word timings. Without boundary support, keep the text readable and disclose the limit. The portrait/waveform stay visible while long lyrics scroll within their own keyboard-accessible region. New microphone words use a brief arrival animation and never show predicted words. Reduced motion removes movement while preserving color and underline states.

Pause is a session preference through `ConkerClient.calls`: hold fixture generation and browser playback, cancel caption recognition and disable owned camera/mic tracks. Preserve channel preferences, current word, received captions and draft; Resume re-enables previous channels and continues playback. Paused drafts remain editable but cannot send. Mini calls expose the same pause/resume action. Hanging up still stops and releases devices; pause is not hang-up.

Character voice and live AI remain unconnected. Shared audio bars show measured microphone level for input and a playback indicator for output, never claimed output amplitude. Preserve permission/device recovery, release capture on hang-up or page exit, and synchronize device flags on cleanup/remount so a stopped stream cannot appear on. The timeline records sent messages, pauses and mode events, not saved word-aligned audio/video or live captions. Session state is memory-only; reload does not reconnect or preserve the call. See [CALL_INTERFACE.md](CALL_INTERFACE.md) for scope and validation; run `npm run check:calls` alongside the voice, conversation, navigation and design checks for relevant changes.

### Conversation activity

`ConversationRun` owns the response activity disclosure: a compact animated mark, transport-supplied phase label, measured elapsed time and chevron while running; a quiet Worked for / Stopped after / Failed after summary afterward. A vertical list exposes each supplied step, with nested disclosure for public details and tool arguments/results. Keep the summary above the answer, including recorded scenario receipts; do not duplicate it in another full-width tool card. Details use existing muted/background roles. Ordinary completion needs no toast or celebration.

`ConversationActivity` supplies the mark. Character mode uses Studio's assigned Thinking media (falling back to the complete padded portrait) with an indeterminate ring; Focus and agents without character media use a dotted orb. Studio's artwork-motion preference applies to artwork; progress motion independently respects reduced motion, hidden tabs and whether the inline indicator is visible. No fabricated tool tasks, elapsed estimates or emotion inference.

`ReplyOptions.onActivity` carries immutable `ConversationRun` snapshots through `ConkerClient`. Responses retain their activity with the message; forks copy it independently, and edit/redaction removes stale activity. The workspace retains an interrupted attempt with no output until the next attempt, without inventing an empty assistant message. This fixture state survives route navigation, not reload. Live preview events describe only preparation and simulated writing. Recorded tool receipts are explicitly Preview and have no invented total duration. Future searching, waiting, tool and agent phases must come from the transport; never cycle labels on a timer. The elapsed clock is not a screen-reader live region.

When reading earlier messages, show a small opaque floating control at the bottom center of the thread viewport, just above the composer: 32px visible circle, with a 44px pointer target and a 16px arrow. Keep it 12px above the thread's bottom edge and open its tooltip upward. Compact activity artwork scales within that same circle; inline activity keeps its existing size. It shows active character/orb progress and becomes a down arrow once work ends. Clicking it jumps to the latest content and focuses the thread. It occupies no composer/header row. Follow new content only when already near the bottom, or after the owner sends a new message; completion, retries and stopped partial replies never pull the owner away from older messages. Preserve source hash navigation and announce phase changes once, separately from streamed tokens. The indicator remains labelled as a preview while the fixture client supplies responses.

### Character Studio

Companion settings at `/settings/companion` extend the accepted dashboard world. Keep `BaseLayout`, existing semantic colors, editable radius, shared fields/cards and `FormActions`; this surface introduces no new design tokens. Its six sections belong to the shared appbar: Identity & soul, Speaking style, Appearance, Voice, Expression & modes, and Harness. Do not duplicate section navigation inside the page. Harness edits the durable primary-agent role, instructions, model reference, tool references and memory scope; Character Studio owns presentation and authored personality. Use the dedicated page for editing, a centered `TaskDialogContent` for import review, and the appbar's existing Companion destination for returning to conversation.

The gateway editor and draft preview use `WorkspaceSplit`, with the shared 1100px stacking breakpoint and sticky context behavior. The original fixture keeps its matching editor/preview composition; Save and Discard remain in the shared action footer. Preserve visible pending, error, draft and memory-only feedback. Export includes the current draft; import requires review before replacing that draft and does not save automatically.

Personality, soul, backstory, relationship and speaking style are user-authored text. Do not replace them with personality presets. Activities (idle, listening, thinking, speaking) describe what the companion is doing; named expressions describe how it presents itself. Keep the two independently assignable. Assigned expression artwork takes priority, then activity artwork, then the main portrait. Preserve the complete, uncropped portrait with at least the existing one-eighth inset on each side. Uploaded video loops are muted; disabled motion or reduced-motion preference replaces a video with the still main portrait. Still assigned images remain usable.

Focus and Character are delivery modes for one identity, separate from models, tools, memory, harness and permissions. Keep the conversation menu's preview label and the Studio's authored-example label. Qwen voice design/cloning is not connected; reference playback is an uploaded recording, and existing browser read-aloud still uses a device voice. Show these limitations beside the relevant control. See [CHARACTER_STUDIO.md](CHARACTER_STUDIO.md) for data ownership, import formats and integration boundaries.

The structural pass inspected Studio's editor layout at desktop and 390 x 844, including the width-aware appbar and its secondary-action menu. This verifies layout and navigation, not newly authored media, voice integration or production save behavior.

### Memory workspace

#### Gateway memory atlas

Gateway Memory owns the shared `GatewayHeader`. Its one `WorkspaceSearch` occupies the primary appbar search slot; Map/Tree/List, type and graph commands use the secondary toolbar slot. Never add a second record-search field beside the universal trigger. Controls wrap without overflowing or hiding sidebar reopening. The appbar keeps the normal semantic background; only record search has a subtle field fill. Maximize carries the same header with the workspace.

The active gateway workspace defaults to Map; Tree and List use `?view=graph|hierarchy|database`. Tree restores the previously unreachable hierarchy mode. Map uses a bounded, static D3 force layout and Tree uses D3 hierarchy; neither continuously runs a simulation. React Flow owns pan, zoom, dragging, keyboard point selection and one/two-hop focus. Preserve manually dragged positions within a mode, not stale coordinates when switching layouts.

Map and Tree share gateway metadata records, the existing semantic surfaces and bounded chart-category colors. Small type hubs carry record counts; finer curves expose recorded connections. Dashed branches are type organization, never factual relationships. Solid curves represent server-supplied links only. A quiet legend distinguishes them; relation labels appear on edge hover and the inspector retains the exact relationship. Labels stay visible in small graphs, and zoom/selection reveal detail in larger graphs. No fabricated points, embedding similarity, unrelated glows or route-specific palette.

Load relationship metadata for up to 100 loaded records, four requests at a time, one connection page per record, at most 250 distinct records. Cancel on navigation/filter changes and announce loading, incomplete pages or failed reads as a partial graph. Content remains an explicit inspector read; graph exploration cannot write memories. The five-record gateway preview is not the legacy 50-record illustrative dataset below. Keep List as the structured alternative, including search and pagination, and preserve the shared mobile/desktop inspector and revision-bound Forget flow.

#### Legacy fixture workspace

Memory uses `BaseLayout variant="canvas"`. The shared appbar remains navigation; a local toolbar owns the Network, Hierarchy and Database dropdown, searchable point picker, dataset choice, filters, folder-browser toggle and Maximize/Restore action. Modes use `?view=graph|hierarchy|database`; legacy `tab` links remain accepted, including `sources` as Hierarchy. Text/category filters stay URL-backed across modes. The point picker searches the currently available points, supports keyboard selection and focuses a chosen point; it is distinct from the shared record-text filter.

The React Flow graph combines small filled record points, outlined topic points, source symbols and labeled category folders. Existing chart tokens supply five category colors; the graph locally bounds their lightness for visibility in light and dark themes. This color has a data role, while chrome, labels, controls and selection retain semantic theme roles. Labels reveal with zoom and selection/neighbor emphasis; folder labels stay visible. Thin curved edges keep the overall structure readable: dotted means shared topic; solid means category parent or source reference. Hover/selection highlights connected points, and controls provide dragging, pan/zoom, fit/reset and one/two-hop focus. Reduced motion disables optional transitions.

`src/lib/memory-layout.ts` projects Library → category → record parent-child links. Network uses deterministic organic category clusters and bounded spacing relaxation; Hierarchy uses deterministic category columns with linked topics/sources arranged below. These are starting positions, not a running force simulation or embedding similarity. Dragging changes the view only. The expandable folder browser groups categories and records; neither it nor the hierarchy represents server folders or physical file storage. Topic links express shared metadata, not agreement between claims. Original source references remain separate and intact.

Selecting a graph point, folder-browser record or database record immediately updates the shared nonmodal `WorkspaceInspector`. It docks right on desktop and at the bottom on mobile, preserving space for further canvas selection. Compose its evidence, linked records, topic navigation, JSON payload and copy action with `OverlayBody` and `ReferenceSection`. Database retains `DataTable` sorting/column controls and `RecordItem` mobile presentation. New/edit remain centered `TaskDialogContent` flows with `FormActions`; delete remains `ConfirmationDialog`.

The default illustrative dataset contains 50 fictional, read-only records across five categories in `src/lib/memory-demo.ts`. Keep it isolated from the memory store and explicitly labeled as illustrative, not the user's data. Sample records selects the original four claims and preserved source URLs; only that fixture dataset supports create/edit/delete through `ConkerClient`. Source-hash links open the sample dataset. Edits retain original source/text for review, new notes are unreviewed, and fixture changes reset on reload. JSON inspection/export reports the selected dataset with its preview/demo boundary. There is no live vector search, media upload/transcription, physical file editing or production MemoryGate write.

Research and integration boundaries are in [memory-workspace-research.md](../docs/archive/memory-workspace-research.md). The canvas revision was reviewed in desktop dark/light and 390×844 mobile captures, including searchable selection, dock geometry, hierarchy and maximize/restore. The review found stale layout zoom and mobile point occlusion; both were corrected and visually rechecked. Build, design guard, affected lint, memory/layout, navigation and daily-overview checks passed. This verifies the frontend preview, not a production memory connection.

### Tools workspace

Tools extends the existing compact, full-width shadcn New York foundation without new theme or density tokens. One searchable library combines connector actions and workflows using `BaseLayout variant="collection"`, `DataTable` and responsive `RecordItem` rows. Keep one Tools sidebar destination; implementation type is a library filter, not separate Flows navigation.

Opening a capability uses `BaseLayout variant="canvas"`. Build, Source and Configure are local views of the same definition, selected in the compact workspace toolbar; this extends Memory's local-mode exception and does not add appbar route sections. Keep the canvas in the leading viewport, with a searchable step palette, optional step outline, visible Save/Test actions and secondary actions in the existing menu. Maximize/Restore changes the workspace frame. Preserve the selected theme's semantic surfaces, editable corners, shared controls and focus treatment; chart colors may distinguish step types without becoming a route palette.

Selection opens the shared nonmodal `WorkspaceInspector`, composed with `OverlayBody` and `ReferenceSection`, for focused step properties, connections and matching test output. This is contextual editing within the dedicated workspace. Shared inspector docking styles belong to `src/styles/design-system.css`, so Tools does not depend on Memory's stylesheet. Desktop docks the inspector on the right; mobile docks it below the usable selection region. Narrow screens default to a readable step list with an optional graph. Keep keyboard step selection and connection forms available alongside dragging, ports and stored directed edges.

Test results and version/run history occupy an optional bottom panel. Only a receipt matching the exact current draft may color steps or supply their output; historical receipts remain inspectable with their earlier-draft/version notice. Source edits canonical JSON. Preserve invalid source and unapplied step arguments until explicit Apply/Discard, with validation beside the task and visible draft feedback. Creation uses `TaskDialogContent` and `FormActions`; deletion uses `ConfirmationDialog`.

Keep local-preview and reload-reset boundaries visible. Fixture tests, credential references and preview publication do not imply external execution, real credentials, live MCP registration or scheduled jobs. The current graph supports bounded transformations and published child calls; arbitrary scripts, general loop bodies, joins, waits, retries, AI nodes and resumable workers remain deferred. [tools-workspace.md](../docs/archive/tools-workspace.md) owns the exact implemented scope and verification record. Check this surface in desktop light/dark and narrow layouts, including inspector and receipt-panel coexistence; use `npm run check:tools` and the shared design/build checks for relevant changes.

## Do's and Don'ts

### Do:

- Do compose corresponding tasks with the actual shared components and their exported props.
- Do keep document titles, route sections, local modes, search scope and contextual actions in their shared owners.
- Do retain light/dark/custom themes, editable radius, native Radix behavior and Button asChild composition.
- Do show loading, partial coverage, unavailable content, privacy scope, revision conflicts and action consequences beside the task.
- Do preserve structured alternatives, keyboard focus, minimum row heights, wrapping and reduced-motion behavior.
- Do verify relevant consumers and run the design guard and targeted checks when changing UI; a documentation refresh is not production verification.

### Don't:

- Don't namespace or restyle the original sidebar or the empty new-chat canvas with technical-workspace.
- Don't duplicate page search, route navigation, field dimensions, portraits or collection markup in a route.
- Don't turn ordinary sections into floating cards or nest a filled reference card inside an inspector.
- Don't introduce a route palette, another theme provider, surface remapping, physical-material fiction or important color overrides.
- Don't infer execution, grants, source content, production privacy or completed indexing from frontend presentation.
- Don't promote dormant demo styles, unsupported capability claims or craft defects into rules for new surfaces.
