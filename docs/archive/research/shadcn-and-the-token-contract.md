# shadcn/ui: the conventions, and the one that was recorded backwards

**Verified 2026-09-07** against shadcn CLI `4.21.0`, Tailwind CSS v4, the live registry, and npm.
Every claim here was checked against a primary source or compiled and run; where a secondary source
disagreed, the primary source won and the disagreement is written down.

This exists because the design system is the foundation the whole dashboard sits on, and because
[`frontend-and-streaming.md`](frontend-and-streaming.md) recorded a theming rule that is **exactly
inverted** — following it produces a theme toggle that silently does nothing.

---

## 1. `@theme inline` — the correction

[`frontend-and-streaming.md`](frontend-and-streaming.md) §"Design tokens" says:

> `@theme inline` bakes values in at build time and **breaks runtime theme switching**. The working
> pattern is two-stage — raw channel values declared in `:root` and the dark override, mapped by a
> **non-inline** `@theme`.

**This is backwards.** `inline` is required for exactly the case it warns about.

Tailwind's own documentation, [Theme › Referencing other
variables](https://tailwindcss.com/docs/theme):

> When defining theme variables that reference other variables, use the `inline` option with
> `@theme`. This instructs utility classes to use the theme variable's **underlying value** rather
> than referencing the variable itself, preventing unexpected fallback values caused by how CSS
> resolves variables across DOM nesting levels.

### Compiled, not argued

Both forms were compiled with `@tailwindcss/cli` from one stylesheet:

```css
:root { --brand: oklch(0.98 0 0); }
.dark { --brand: oklch(0.15 0 0); }

@theme inline { --color-inlined:    var(--brand); }
@theme        { --color-notinlined: var(--brand); }
```

The output:

```css
:root, :host {
  --color-notinlined: var(--brand);          /* resolved HERE, against :root's --brand */
}
.bg-inlined    { background-color: var(--brand); }             /* per-element */
.bg-notinlined { background-color: var(--color-notinlined); }  /* indirection through :root */
```

`--color-notinlined` is declared on `:root`, so its value is substituted using `:root`'s `--brand`.
An element inside `.dark` inherits the **already-computed** value. The `.dark` override never
reaches it.

`inline` removes the indirection: the utility is `var(--brand)` directly, resolved at the element,
where `.dark` applies.

**Rule: a theme variable that references another variable must be declared in `@theme inline`.**
This is also why shadcn's own `globals.css` uses `@theme inline` for every colour.

The original entry was right that this fails silently and right that it is a correctness
requirement. It named the wrong culprit.

---

## 2. The token contract

shadcn's palette is a **fixed set of semantic pairs**, not a scale. Components reference only these,
which is what makes the palette swappable without touching a component.

| Pair | Used for |
|---|---|
| `background` / `foreground` | the page |
| `card` / `card-foreground` | raised surfaces |
| `popover` / `popover-foreground` | overlays |
| `primary` / `primary-foreground` | the main action |
| `secondary` / `secondary-foreground` | the second action |
| `muted` / `muted-foreground` | de-emphasised text and fills |
| `accent` / `accent-foreground` | hover and highlight |
| `destructive` | danger (its foreground is `white`, not a token — see below) |
| `border`, `input`, `ring` | edges and focus |
| `chart-1` … `chart-5` | series colours |
| `sidebar*` | a parallel set, so the sidebar can differ from the page |

Plus `--radius`, from which `--radius-sm/md/lg/xl` are derived by `calc()`.

**Colours are OKLCH.** Perceptually uniform, so `oklch(0.6 0.2 250)` and `oklch(0.6 0.2 130)` look
equally bright. That is what makes generating a coherent palette from one brand hue tractable, and
it is why lightening a colour is a lightness change rather than guesswork.

**Two asymmetries worth knowing before they look like bugs.** `destructive` has no
`destructive-foreground` in current versions — the button hardcodes `text-white`. And dark mode
overrides `border`/`input` with alpha (`oklch(1 0 0 / 10%)`) rather than a solid colour.

### Adding our own tokens

Conker needs tokens shadcn does not ship — the status vocabulary (`live`, `degraded`, `offline`, `stale`,
`blocked`, `empty`, `planned`, `unknown`) from `principles.md` §1 is a design requirement, not a nicety. The
supported way is identical to the built-ins:

```css
:root      { --status-degraded: oklch(0.84 0.16 84); }
.dark      { --status-degraded: oklch(0.41 0.11 46); }
@theme inline { --color-status-degraded: var(--status-degraded); }
```

That yields `bg-status-degraded`, `text-status-degraded`, and so on.

---

## 3. Component anatomy, as it is now

Pulled from the live registry (`shadcn view @shadcn/button`), not from a changelog. Several widely
copied patterns are **obsolete**:

```tsx
const buttonVariants = cva("inline-flex shrink-0 items-center …", {
  variants: { variant: { default: "bg-primary text-primary-foreground hover:bg-primary/90", … },
              size:    { default: "h-9 px-4 py-2 has-[>svg]:px-3", … } },
  defaultVariants: { variant: "default", size: "default" },
})

function Button({ className, variant = "default", size = "default", asChild = false, ...props }:
  React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button"
  return <Comp data-slot="button" data-variant={variant} data-size={size}
               className={cn(buttonVariants({ variant, size, className }))} {...props} />
}
```

- **No `forwardRef`.** React 19 passes `ref` as an ordinary prop. Every tutorial showing
  `React.forwardRef<React.ElementRef<…>, React.ComponentPropsWithoutRef<…>>` is pre-2025.
- **`React.ComponentProps<"button">`**, not the `ElementRef`/`ComponentPropsWithoutRef` pair.
- **`data-slot` on every part.** The styling and testing hook: `[&_[data-slot=button]]:…` reaches
  into a composed component without a class contract. Also the honest selector for tests.
- **`data-variant` / `data-size` mirror the props**, so state is inspectable in the DOM.
- **`asChild` → `Slot.Root`** from the unified `radix-ui` package, not `@radix-ui/react-slot`.
- **`cva` for variants, `cn` for merging.** `cn` is an npm dependency (`dependencies:
  ["cn", "radix-ui"]`), imported from `"cn"`, not assumed to exist at `@/lib/utils`.
- Accessibility is in the base string, not bolted on: `focus-visible:ring-[3px] ring-ring/50`,
  `aria-invalid:border-destructive`, `disabled:pointer-events-none disabled:opacity-50`.
- Icon sizing by attribute selector: `[&_svg:not([class*='size-'])]:size-4` — a child SVG gets a
  default size unless it sets its own.

---

## 4. Distribution: the registry, and why it matters here

shadcn is a **code distribution platform**, not a dependency. `shadcn add` writes source into the
repo; there is no runtime package to upgrade and no version skew. That is the same reasoning
[ADR-0003](../../adr/0003-the-gates-go-headless.md) used to put the design system in this repository.

A `components.json` can point at more than the default registry:

```json
{ "registries": { "@acme": "https://acme.com/r/{name}.json",
                  "@private": { "url": "…", "headers": { "Authorization": "Bearer ${TOKEN}" } } } }
```

Then `shadcn add @acme/header`. **Relevant to Conker twice over:** the design system can be
published as a registry so a fork consumes it the same way, and a `registry:theme` item is exactly
how a swappable palette ships — a JSON file of `cssVars.light` / `cssVars.dark` and nothing else.

`shadcn build` produces such a registry from this repo. `shadcn preset` encodes a theme as a
shareable code.

---

## 5. Radix or Base UI — resolved by ADR-0009

**shadcn made Base UI the default for new projects in July 2026**
([changelog](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default)), while stating Radix
"remains fully supported, and all new components will continue to be shipped for both libraries."
`shadcn init --base` selects the primitives.

npm, checked today:

| Package | Version | Published |
|---|---|---|
| `@base-ui-components/react` | **`1.0.0-rc.0`** | 2026-07-15 |
| `radix-ui` | `1.6.7` | 2026-07-31 |
| `@radix-ui/react-dialog` | `1.1.23` | 2026-07-31 |

**Base UI is still a release candidate**, unchanged since July, and shadcn defaults to it anyway.
`frontend-and-streaming.md` was right to flag this and is still right.

The `new-york-v4` style the registry served for `button` today depends on `radix-ui`, so Radix is
not a legacy path.

**Recommendation: Radix, deliberately, and record why.** Nothing about the token contract, the
component anatomy or the registry changes with this choice — it is one line in `components.json` and
the same abstraction either way, which is precisely why it is safe to revisit when Base UI ships
`1.0.0` final. Betting a system meant to outlive its author on an RC that has not moved in eight
weeks is the trade this project has consistently declined.

Resolved by [ADR-0009](../../adr/0009-radix-primitives-for-now.md): Radix.

---

## 6. What this settles for Conker

1. **`@theme inline` for every token that references another variable.** Not optional.
2. **Semantic pairs only.** No component references a raw colour; the status vocabulary becomes
   tokens like everything else — which is also how the "no raw hex in application code" rule in
   `CLAUDE.md` gets enforced rather than promised.
3. **OKLCH throughout**, so a palette can be regenerated from a brand hue.
4. **Current anatomy**: no `forwardRef`, `data-slot` everywhere, `cva` + `cn`.
5. **The design system ships as a registry**, so a fork consumes it the way it consumes shadcn.
6. **Radix for now**, written down as a decision rather than a default.


## 7. Implementation check — 2026-09-11

The foundation now lives in [`design-system/`](../../../design-system/README.md).
Three details needed correction when using CLI 4.21.0 and the actual registry:

- The custom status vocabulary above previously listed five transport-style
  statuses. The UI contract is the eight states in `principles.md` and `CONTEXT.md`.
- A top-level `base` property in `components.json` is rejected by the CLI's strict
  `rawConfigSchema` as an unrecognized key. `--base radix` is an initialization
  option; the generated **style** selects the primitive family. This package uses
  `style: "new-york"` with Tailwind v4, resolving to `new-york-v4`, whose primitives
  import `radix-ui`. Changing a style affects later imports; existing component
  files still require migration.
- `cn` in registry `dependencies` is an **npm package**, imported with
  `import { cn } from "cn"`. It is not a `registryDependencies` item. The package
  supplies class merging; no local `utils.ts` copy is needed for these sources.

The upstream destructive foreground really is `text-white`; dialog and sheet
also use `bg-black/50`. Conker replaces them with semantic foreground/overlay
roles and removes explicit dark color overrides so palette pairs own both themes.

The `@theme inline` correction held in Chromium: root and nested dark theme
changes alter computed surface and status foreground/background colors. Replacing
`@theme inline` with non-inline `@theme` makes the nested-theme behavioral test
fail. See the package's repeatable mutation drill. This establishes the CSS
contract; it does not validate a backend health check or a Linux dependency install.
