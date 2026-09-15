# Conker color rules

September 15, 2026. The owner's request is consistency within the existing compact shadcn design. This is the reasoning behind the implementation contract in [DESIGN.md](../dashboard/DESIGN.md). It supplements the existing type, density, layout and interaction rules.

## What the research changes

- **Choose a role before a color.** Radix assigns colors specific jobs across backgrounds, controls, states, borders and text. Conker keeps a smaller set of semantic names over its existing theme, instead of choosing a convenient gray or opacity for each component. [Radix color scale](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale)
- **A role survives a theme change.** Carbon separates token meaning from theme values and uses neutral surfaces for most of the interface. Conker's source theme remains editable; components consume the same roles in every theme. [Carbon color](https://carbondesignsystem.com/elements/color/overview/)
- **Hover is not elevation.** Atlassian distinguishes interactive states from raised and overlay surfaces. Conker reserves its brightest dark neutral for floating UI, rather than using it on ordinary buttons, searches and hover states. [Atlassian elevation](https://atlassian.design/foundations/elevation/)
- **Keep foreground/background pairs.** New roles extend the existing CSS-variable and Tailwind system. They do not replace shadcn primitives or add a second theme provider. [shadcn theming](https://ui.shadcn.com/docs/theming)
- **Measure the actual result.** Normal text requires 4.5:1 contrast. Essential control boundaries and state indicators require 3:1 against adjacent colors; decorative dividers do not all need this contrast. These requirements also need keyboard, labeling and interaction checks. [WCAG text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [WCAG non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)

These are Conker's decisions informed by the sources, not a wholesale adoption of another company's palette.

## Surface decision table

| Question | Role | Consumers |
| --- | --- | --- |
| Is this the page behind the content? | `bg-background` | Workspace and transcript ground |
| Is this a persistent content group? | `bg-card text-card-foreground` | Collection container, plan, user message, approval request, composer |
| Is this supporting navigation? | `bg-surface-chrome text-sidebar-foreground` | Appbar and reference rail; chrome derives from `--sidebar` |
| Is this a field or subordinate detail? | `bg-surface-inset` | Input, search, select, tool details, reference/table headings, padded photo frame |
| Does this float above other content? | `bg-popover text-popover-foreground` | Menu, tooltip, dialog and default sheet |

The reference sheet intentionally retains the rail's chrome role on mobile. The sidebar retains its shadcn surface and foreground pair. Both follow the same underlying sidebar theme values. A collection owns one surface; individual rows do not each acquire a panel.

Dark surfaces progress from near-black canvas through graphite panels to lighter overlays. Fields and supporting details recede. Light mode uses a toned canvas, white panels, pale field wells and white overlays distinguished by their floating shadow. Do not require every surface to have a unique hue or add a shadow to every nested section.

## Interaction, text and meaning

| Role | Assignment |
| --- | --- |
| Primary action / progress / checked control | `primary` and `primary-foreground`; reserve solid accent for actionable emphasis |
| Ordinary button | Outline: `secondary` plus normal border. Ghost: transparent. Both use `surface-hover` on hover |
| Neutral hover / menu keyboard highlight | `surface-hover` and `accent-foreground` |
| Selected item | `selection` fill; primary text/border where appropriate, plus checked state, current-page semantics or weight |
| Sidebar selected item | `sidebar-selection` and `primary`; same brand accent as page navigation, over the sidebar surface |
| Primary/destructive action hover | Named `primary-hover` / `destructive-hover` recipes |
| Main text | The surface's foreground pair |
| Metadata / placeholder / supporting text | `muted-foreground`; no third, fainter text tier |
| Passive outline / divider | `border-border` / `divide-border`, unchanged across routes |
| Field boundary | `border-input`, stronger than decorative outlines |
| Keyboard focus | Solid `ring-ring` or `outline-ring`; preserve the primitive's focus behavior |
| Live / healthy | `success`, `success-subtle`, `success-border`; independent of the brand preset |
| Degraded / needs attention | `warning`, `warning-subtle`, `warning-border` |
| Destructive action / error | `destructive`; solid buttons use `destructive-foreground` |

Color accompanies meaning, never replaces it. Status badges retain words and dots; switches and checkboxes retain their position/check mark; selection keeps its accessible state. An ordinary approval request remains neutral. Only an actual warning earns amber. Informational tooltips remain neutral.

## Ownership and change procedure

1. Use an existing shared component and role first. Do not tune a route with `bg-muted/40`, a local gray, or a replacement foreground variable.
2. When a new role is actually needed, define it in `src/styles/design-system.css`, expose its utility in `src/index.css`, document the intended consumers here, and migrate matching consumers together. Do not create a token for each individual widget.
3. Preserve ThemeRuntime, source theme variables and radius controls. No `!important` palette overlay. Default contrast improvements do not guarantee that every user-imported palette is accessible.
4. Run the design guard, its self-tests, the build and affected lint. Inspect Chats and Inbox, a form/table, chat with contextual details, overlays, mobile, light/dark and one custom preset. Check actual foreground/background contrast and keyboard focus.

The guard follows active route imports, including shared foundations. It rejects raw route palette values, ad hoc neutral opacity, unowned primary/status tints, the old `conversation-contrast` class and the ambiguous `bg-surface-raised` utility. It also retains heading, search and navigation rules. It cannot infer the meaning of every component, evaluate arbitrary runtime CSS, or replace rendered review.

Narrow exceptions: theme values and swatches represent their actual colors; generated portrait artwork owns its optional green/soft treatments; layout thumbnails use opacity to draw miniature content; the terminal owns a black command area and graphite frame in both modes. Photo portraits remain neutral, padded and uncropped. These exceptions do not authorize unrelated route styling.
