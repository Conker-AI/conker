# Conker dashboard design system

This is the implementation contract for the active dashboard. The owner's accepted Chats layout is the reference for collections throughout the app: use the same components, not copied markup or a similar collection of classes. Product direction remains in [design-language.md](../docs/design-language.md).

The foundation is the Vite version of [shadcnstore/shadcn-dashboard-landing-template](https://github.com/shadcnstore/shadcn-dashboard-landing-template/tree/65fc11224e96d56a62e224a58f7ed590aea5ac24/vite-version), reviewed at commit `65fc11224e96d56a62e224a58f7ed590aea5ac24`. Preserve shadcn's native props, Radix keyboard interactions, Button `asChild` composition and semantic theme variables.

## Ownership and imports

| Need | Use | Owner |
| --- | --- | --- |
| Standard route shell and heading | `BaseLayout` with `title` and `description` | `src/components/layouts/base-layout.tsx` |
| Page heading outside that shell | `PageHeader` | `src/components/design-system/index.tsx` |
| Route sections | `RouteSection`; navigation is rendered by `SiteHeader` | `src/config/navigation.ts`, `src/components/appbar-navigation.tsx` |
| Collection or table search | `CollectionSearch` | Same design-system module |
| Search, results announcement and empty state together | `CollectionPanel` | Same design-system module |
| Group heading and divided collection | `CollectionSection` | Same design-system module |
| Compact linked item | `CollectionRow` | Same design-system module |
| No results / no items | `CollectionEmpty` | Same design-system module |
| Agent identity in a collection | `AgentIdentityPortrait` | Same design-system module |
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

Use minimum row height instead of a fixed clipping box. Long content, translated text, browser zoom and responsive wrapping must remain usable. Keep title/preview truncation deliberate and retain accessible names. Collection navigation should use actual links, not divs that only respond to mouse clicks.

Photo avatars use the shared neutral outlined frame. The complete image uses `size-3/4 object-contain`, leaving one eighth of the inner frame on each side. Preserve the full artwork and its aspect ratio without zoom transforms or an inner crop. No green tint behind photo portraits. Apply this proportional padding across brand, appbar, thread, collections, and studio; larger studio previews do not change collection density.

## Palette and theming

Use semantic utilities: `bg-background`, `bg-card`, `bg-muted`, `text-foreground`, `text-muted-foreground`, `border-border`, `text-primary`, `text-warning`, `text-destructive` and their established foreground pairs. Quiet fills and thin borders define surfaces. Use accent/status color for meaning.

Conversation surfaces use the shared `conversation-contrast` variant in `src/styles/design-system.css`. It derives secondary text (78% foreground), outlines (24%), and input outlines (35%) from the active theme's foreground/background. The composer uses a stronger muted surface and 12px secondary text. Apply this role to conversation appbars, threads, and portaled controls rather than inventing separate palettes. Theme colors and custom radius remain editable.

Do not add independent gray/green/red palettes or literal colors to route classes. The theme editor owns preset colors, imported theme colors and radius. Shared design-system CSS must inherit those variables so switching theme applies across routes. Do not put an `!important` app-wide palette over ThemeRuntime or reset the owner's customizer settings.

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
- The terminal's neutral surface variables in `src/index.css` preserve terminal readability. They do not establish a separate general application palette.

Dormant template demo routes are outside the guard until imported by the active route graph. Do not broaden exceptions just to make a new finding disappear; choose the shared component or document and narrowly implement a real new role.

## Validation and maintenance

Run `npm run design:check` for the TypeScript AST guard. It follows local static imports, exports and literal dynamic imports from `src/config/routes.tsx`. This covers active routes and their dependencies while avoiding unused template demos.

The guard rejects standard raw `h1` headings, direct primitive-tab imports from active route modules, raw `Input`/native search fields, and hard-coded Tailwind palette/literal-color classes in reachable application code. It recognizes aliased inputs and search placeholders such as `searchPlaceholder`. It does not ban arbitrary layout dimensions or normal form fields.

`npm run lint` and `npm run build` both run the guard before their usual checks. `npm run design:check:test` proves invalid fixtures fail, valid shared patterns pass, exceptions stay narrow and inactive demos remain excluded. No additional test framework is required.

Static checks cover recognizable source patterns, not every possible runtime-generated style. Render the affected screens before finishing visual work. Compare Chats/Inbox search, tabs, rows, portraits and titles at desktop and narrow mobile widths. Check light/dark themes, a radius or preset change, keyboard focus, empty states, long content and navigation. For shared primitive changes, inspect a representative form, table and detail page as well. Record screenshots and any untested limitations.

Update the shared component and its contract first; migrate consumers together. A new page should compose these patterns from the start. Shared implementation, automated checks and rendered review are the mechanism for keeping screens consistent.


## Home and Companion

Home (`/`) is the read-first daily overview: priorities, upcoming agenda, decisions, recent activity, and sourced news status. It has no chat composer. Its content comes from `getDailyOverview`, with sample date and provenance visible.

Companion (`/companion`) is the main-agent workspace: a dedicated stable conversation, daily briefing, action starters, and contextual events/news. It uses the shared `Conversation` shell and composer. Existing chats remain at `/chat/:id`. Never choose the main companion by session array position.

Character customization lives at `/settings/companion`, separate from conversation. Brand navigation opens Companion. The sidebar brand row owns the theme switcher.

`BaseLayout` accepts an optional `actions` slot for standard page-header actions. DailyNews owns feed content; its parent owns the section heading. It renders publisher/date/source metadata for ready feeds and a truthful unavailable state otherwise.

Home planning links carry `{ prompt }` in React Router state to Companion. Append it to an existing draft, never overwrite the user's words or send automatically. The 4,000-character composer limit remains enforced.

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

Conversation-wide actions live only in the appbar title menu: rename, conversation-default model/route, pin, archive/restore, delete/clear, view forks, and edit companion. The right-side order is search, Incognito, then the rail toggle. Incognito uses the standard hat-and-glasses icon, with no visible text label; its tooltip and accessible name expose the current mode. There is no separate conversation header. The theme switcher stays beside the sidebar brand. All sidebar destinations retain independent roots.

Incognito opens a dialog with two independent switches, **No memory** and **No harness**. All four combinations are supported and stored per conversation through ConkerClient; forks copy them independently. Only the memory switch changes the declared memory scope. The aggregate `incognito` flag means at least one exclusion is enabled, and the legacy boolean update remains a shortcut for both. The rail reports both settings separately. These preview preferences do not imply server enforcement, deletion of existing transcripts, or private browser speech processing.

Message actions live only in that message's hover/focus/touch-accessible menu: Reply, Fork, Copy, Share link, Retry with model, Pin, Edit, Redact, Explain, Open source. Fork copies the conversation only through that message. Edits are visibly marked; redaction keeps an empty tombstone and does not alter independent forks. Sharing copies a local preview link and does not publish content.

The composer owns the next turn: preserved draft, reply target, Tools menu, direct model/provider picker, voice typing, send, and stop. Toolbar actions use compact icon buttons with accessible names and tooltips, including Tools and dictation's cancel/return-to-keyboard actions. Model names remain visible because they communicate the selected route. The final action is Voice call for an empty/whitespace-only draft, Send once there is text, and Stop while streaming. Do not add a separate Talk button beside Send. The model chip reads enabled entries from Settings' catalogue; it truncates on narrow screens so the action buttons remain inside the composer. The conversation default remains separate from a one-turn override, which clears after that turn. The quiet provider/cost line clearly labels the fixture. Streaming and thinking are deterministic simulations with abort support; they never run tools.

The reference rail is collapsed by default. It owns model/usage detail, grants/autonomy, session/fork tree, other sessions of the contact, memory/incognito scope, files, pinned-message references, and source/explanation detail. It is an inline rail on wide screens and an accessible sheet on narrow ones. Companion daily reference content also lives here.

The thread retains recorded tool status/arguments, plan/summary cards, blocked requests linking to Inbox, acted-no-reply cards with reply-only recovery, and citations. User messages align right; companion messages align left; the thread and composer use the shared page gutters. No provider credentials enter thread or rail metadata.

## Voice typing

`ConversationComposer` is shared by Companion and agent conversations. Keep dictation inside this same docked surface: microphone → listening → **Use text** → editable draft. While listening, live text sits above a microphone-level waveform, with a quiet status/timer and Cancel / Use text controls below. Confirmed words use foreground text; interim words use muted text. The waveform displays actual audio levels, arriving in the center and moving outward, with semantic accent color and reduced-motion support. Do not add a recording modal or a second conversation toolbar.

Finishing dictation inserts words at the original cursor/selection and never sends. Cancel discards only the current recording. Leaving the conversation or backgrounding the page releases the microphone and keeps words already received in that conversation's draft. Drafts remain memory-only and survive route navigation, not a full reload. Speech exceeding the 4,000-character limit is preserved for editing, with Send disabled until shortened. Enter sends; Shift+Enter inserts a newline; Escape cancels active dictation.

The browser speech adapter is composed through `ConkerClient.voiceInput`; the fixture client itself has no recording capability. Speech recognition uses the browser's speech service and may process audio online. Conker does not retain recordings. Microphone permission, unsupported browsers, unavailable speech services, and empty recordings have explicit recovery messages. Dictation language lives in Tools. Attachment and live **Talk** remain clearly marked as not connected; Talk must never masquerade as a working AI voice call.

Use `npm run check:voice` for transcription merging, finalization, cancellation, permission races, microphone cleanup, and draft limits. Verify listening and editable states in light/dark themes and at narrow widths. Automated speech events validate the UI lifecycle; they do not establish that a physical microphone or an external recognition service worked.
