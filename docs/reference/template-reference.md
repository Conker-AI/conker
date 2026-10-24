# Conker's UI kit authority

On 24 October 2026 the owner chose [coss ui](https://coss.com/ui) (the Cal.com design system, built on
[Base UI](https://base-ui.com) and Tailwind CSS v4) as Conker's UI kit, replacing the shadcnstore template
chosen on 16 September. He picked it for its outlined, layered surfaces after comparing it with
shadcn-admin, Untitled UI, Catalyst and Intent UI. Its license is AGPL-3.0, so every Conker repository
moved to AGPL-3.0-only the same day.

Pinned source: [cosscom/ui](https://github.com/cosscom/ui) at `3d8ca28e7d90123e9e0f44665944dc240b026ccb`,
installed through the shadcn registry (`@coss/style`). Docs for each component, with examples:
`https://coss.com/ui/docs/components/<name>` (Markdown: append `.md`). Map of all docs:
<https://coss.com/ui/llms.txt>.

## Where things live

| Need | coss ui | Conker owner |
| --- | --- | --- |
| Colors, radius, fonts, animations | `@coss/style` (neutral colors, Inter, toast and skeleton keyframes) | `dashboard/src/index.css` |
| Buttons, fields, menus, tabs, dialogs, sheets, toasts and the other primitives | `@coss/ui` (53 primitives on Base UI) | `dashboard/src/components/ui/` |
| Framed groups of panels (the layered look) | `frame`, `card` with `CardFrame` | same directory |
| Empty, loading and error states | `empty`, `skeleton`, `spinner`, `alert`, `toast` | same directory, composed by the resilience components |
| Dropdown menus | `menu` (also exported as `DropdownMenu*` through `ui/dropdown-menu.tsx`) | same directory |

The calendar, drawer and composer primitives are not installed yet (Conker does not use them; add them
from the registry when a screen needs them).
`ui/chart.tsx` and `ui/loading-spinner.tsx` are Conker's own.

## Rules

- Use the coss primitive; do not restyle it per route. Base UI composes with the `render` prop
  (`<Button render={<Link to="/x" />}>Open</Button>`), not Radix's `asChild`.
- Colors come from the semantic tokens (`primary`, `muted`, `success`, `success-foreground`, `info`, …).
  Text in a status color uses the `-foreground` token (`text-success-foreground`), fills use the base
  token with opacity as the primitives do.
- `dashboard/scripts/template-foundation.json` records every class recipe of the installed primitives;
  the design guard allows them only in their owning file. Re-generate it when coss ui is updated.

The previous template's MIT notice stays in `dashboard/THIRD_PARTY_LICENSES/` for the code that remains
from it.
