# Conker's template authority

The owner designated [shadcnstore/shadcn-dashboard-landing-template](https://github.com/shadcnstore/shadcn-dashboard-landing-template) as the shared UI authority on September 16, 2026. Use its components with Conker's content and features. Preserve Conker's custom appbar and sidebar controls.

Reference reviewed: `65fc11224e96d56a62e224a58f7ed590aea5ac24`, the upstream HEAD at review time. Use the **Vite version**. The implementation takes precedence over generic documentation examples: the source uses Tailwind v4 with OKLCH variables, while some documentation still illustrates older HSL conventions.

## Where to learn and copy

| Need | Upstream source | Conker owner |
| --- | --- | --- |
| Colors, foreground pairs, radius and type variables | [index.css](https://github.com/shadcnstore/shadcn-dashboard-landing-template/blob/65fc11224e96d56a62e224a58f7ed590aea5ac24/vite-version/src/index.css) | `dashboard/src/index.css` |
| Buttons, fields, menus, tabs, dialogs and other primitives | [components/ui](https://github.com/shadcnstore/shadcn-dashboard-landing-template/tree/65fc11224e96d56a62e224a58f7ed590aea5ac24/vite-version/src/components/ui) | Same directory in the dashboard |
| Presets, radius, light/dark, color editor and CSS imports | [theme-customizer](https://github.com/shadcnstore/shadcn-dashboard-landing-template/tree/65fc11224e96d56a62e224a58f7ed590aea5ac24/vite-version/src/components/theme-customizer) | Existing customizer plus persistent preferences and mounted `ThemeRuntime` |
| Applying preset/imported values | [use-theme-manager.ts](https://github.com/shadcnstore/shadcn-dashboard-landing-template/blob/65fc11224e96d56a62e224a58f7ed590aea5ac24/vite-version/src/hooks/use-theme-manager.ts) | Existing hook and theme provider |
| Sidebar variants, collapse and side | [ui/sidebar.tsx](https://github.com/shadcnstore/shadcn-dashboard-landing-template/blob/65fc11224e96d56a62e224a58f7ed590aea5ac24/vite-version/src/components/ui/sidebar.tsx) | Existing sidebar/context; retain Conker's mobile and right-inset fixes |
| Tables, sorting, filtering, selection and pagination | [data-table.tsx](https://github.com/shadcnstore/shadcn-dashboard-landing-template/blob/65fc11224e96d56a62e224a58f7ed590aea5ac24/vite-version/src/components/data-table.tsx) | Existing DataTable with shared CollectionSearch |
| Charts and tooltips | [ui/chart.tsx](https://github.com/shadcnstore/shadcn-dashboard-landing-template/blob/65fc11224e96d56a62e224a58f7ed590aea5ac24/vite-version/src/components/ui/chart.tsx) | Existing Recharts wrapper; retain installed-version TypeScript fixes |
| Application composition examples | [app directory](https://github.com/shadcnstore/shadcn-dashboard-landing-template/tree/65fc11224e96d56a62e224a58f7ed590aea5ac24/vite-version/src/app) | Reuse suitable patterns with ConkerClient data and Conker routes |

All **39 upstream UI primitives** are present; Conker has 41 including its extensions. Keep the full primitive API, variants and Radix interactions. Existing preset libraries, theme imports, color editing, radius, light/dark/system handling, three sidebar variants, three collapse modes and both sidebar positions remain available. Tests cover the actual controls; documentation feature lists alone are not proof of behavior.

Application demos and landing pages remain source references in the repository. They are not substitutes for Conker's real routes, data or chat behavior, and their presence does not imply a connected backend. Use the available table/chart/form/application patterns when implementing Conker features instead of inventing another component library.

## Explicit Conker adaptations

- Green primary/foreground and focus colors are the default Conker theme choice. Presets and imports can replace them. Standard shadcn color roles remain direct variables.
- Keep existing compact density, full-width gutters, 48px collection search, 64px minimum rows and small appbar controls. Shared primitive dimensions still use Conker's density tokens; do not enlarge every screen to match a demo page.
- Keep custom navigation, brand/theme-control placement, contextual conversation rail, drafts, voice, message actions, command search and ConkerClient fixtures.
- Keep complete padded photo portraits, custom scrollbars and the terminal's deliberately black command area.
- Keep the existing readable secondary-text value and the destructive button foreground pair. Warning and success are small semantic extensions, used with labels.
- The native color picker converts supported CSS colors to hex for its swatch, while keeping the original value in its text field. It follows the actual active theme, including OKLCH presets and mode changes.

These adaptations do not authorize another palette, a second theme provider or per-route replacements for shared controls.

## Enforcing the reference

`dashboard/scripts/template-foundation.json` pins the revision and records the upstream color recipes by owning primitive. The design guard permits those exact recipes in their owners, rejects arbitrary route colors, and checks direct Tailwind-to-shadcn color mappings. Never remove a valid upstream opacity recipe merely to satisfy an invented blanket rule; never use that exception to scatter new tones across routes.

For a future change: inspect the relevant upstream file, reuse the local primitive, preserve its API, adapt only the Conker-specific content/behavior, then review desktop/mobile and light/dark consumers. Update the recorded reference deliberately when adopting a new upstream revision.

The upstream MIT notice is retained in `dashboard/THIRD_PARTY_LICENSES/shadcn-dashboard-template.txt`.
