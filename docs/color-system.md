# Conker color system

The owner selected the shadcnstore template as the color and component authority on September 16, 2026. Read [template-reference.md](template-reference.md) for the pinned source, feature map and permitted Conker adaptations. This replaces the September 15 mixed-surface recipes.

## Use the template's semantic roles directly

| Role | Background / foreground |
| --- | --- |
| Page, appbar, dialog or sheet | `background` / `foreground` |
| Content card or persistent content group | `card` / `card-foreground` |
| Floating menu or popover | `popover` / `popover-foreground` |
| Primary action | `primary` / `primary-foreground` |
| Secondary action | `secondary` / `secondary-foreground` |
| Quiet detail, reference heading or table heading | `muted` / `muted-foreground` where appropriate |
| Hover, keyboard highlight or selected navigation | `accent` / `accent-foreground` |
| Sidebar navigation | `sidebar`, `sidebar-accent` and their foreground pairs |
| Outlines, field boundaries and focus | `border`, `input`, `ring` |
| Data visualization | `chart-1` through `chart-5`, with labels/legends |

`bg-card` means the exact current `--card` value. The same direct mapping applies to background, popover and other standard roles. Do not introduce a `--surface-*` mixing layer or reinterpret a user's imported theme. Configure the palette through the existing customizer.

## Shared components own their recipes

Buttons, fields, menus, tabs, switches, checkboxes, dialogs and tooltips use the source template's treatments. For example, outline buttons use the background and the template's dark input fill; fields are transparent in light mode and use the prescribed input tint in dark mode. Neutral hover/selection follows accent roles. Do not replace all component states with one new universal fill.

The template legitimately uses opacity in specific primitives. Its exact recipes are recorded by owner in `scripts/template-foundation.json`. Consumers compose those primitives instead of choosing new opacity values. Collection search owns its larger dimensions and inherits Input styling; Chats and Inbox share the same component.

Main text uses the surface's foreground pair; supporting text uses `muted-foreground`. Conker retains its existing slight secondary-text contrast adjustment and readable destructive foreground pair. Status uses labeled success/warning extensions; color must not be the only cue. The terminal owns its local black command-area tokens; photo portraits remain neutral and uncropped.

## Change and verification rules

1. Find the upstream component and its local counterpart before creating a new style.
2. Change a shared owner when equivalent consumers need a change. Keep imported values, presets, radius, modes and layout options functional.
3. Keep direct theme mappings. The build guard checks them and enforces recipe ownership, alongside shared heading/search/navigation rules.
4. Build and inspect actual desktop/mobile, light/dark consumers, interactive states and theme imports. Check text contrast and keyboard focus. Neither using the template nor passing static checks establishes full accessibility conformance for arbitrary user palettes.

The source of these rules is the pinned [template CSS](https://github.com/shadcnstore/shadcn-dashboard-landing-template/blob/65fc11224e96d56a62e224a58f7ed590aea5ac24/vite-version/src/index.css) and [component library](https://github.com/shadcnstore/shadcn-dashboard-landing-template/tree/65fc11224e96d56a62e224a58f7ed590aea5ac24/vite-version/src/components/ui).
