# Frontend stack and streaming

Researched September 2026, before building the dashboard (#30–#33). Every claim below was checked
against a primary source — npm, the installed package, or official documentation — because two of
the most confident secondary claims turned out to be wrong.

## What the gates already established

The MemoryGate and ToolGate dashboards were built on **React + Vite + TypeScript + Tailwind v4 +
oxlint**, with `lucide-react` for icons and `react-router-dom`. Those dashboards are being retired
([ADR-0003](../../adr/0003-the-gates-go-headless.md)), but the stack choice is prior art from this
project rather than a guess, and nothing found here argues against it.

**Decision: keep that stack.** One frontend toolchain across the project, and no migration cost paid
for a preference.

---

## Streaming: Server-Sent Events, not WebSocket

**FastAPI has native SSE support**, and this was verified against the version Pi actually runs:

```
fastapi 0.138.2
fastapi.responses: ['EventSourceResponse', 'StreamingResponse']
EventSourceResponse: AVAILABLE
```

Introduced in **0.135.0**. It handles, without any code of ours:

- **keep-alive pings every 15 s**, which is what stops proxies dropping an idle stream
- `Cache-Control: no-cache`
- `X-Accel-Buffering: no`, which is what stops nginx buffering the stream into uselessness
- **`Last-Event-ID`** — a dropped connection can resume where it left off

Those first three are the exact problems that usually push a team to WebSocket. The fourth matters
here specifically: the owner reads Conker on a phone over Tailscale, and a stream that cannot resume
after a network blip is a stream that loses the answer.

### The argument for WebSocket, and why it does not win

The strongest case found: *with SSE the client can drop the connection while the server keeps
generating tokens and burning money until it notices.* That is real, and it matters more here than
in most products because Conker runs all day.

It does not decide it, because **Pi needs an explicit cancel path regardless**. A turn that stops
being wanted has to be recorded as such — the store already distinguishes `interrupted`, and
"the socket closed" is not the same fact as "the owner cancelled". So the cancel endpoint exists
either way, and once it does, WebSocket's full-duplex pipe is buying complexity for a feature that
is already covered.

SSE is also plain HTTP: no upgrade handshake to survive Tailscale and any reverse proxy a forker
puts in front, and far easier for the module contract's CI to exercise.

**Decision: SSE via `EventSourceResponse`, plus an explicit cancel endpoint on Pi.**

---

## Design tokens: Tailwind v4 `@theme`, and one trap

Tailwind v4 moved configuration into CSS with `@theme`, and tokens become **real CSS variables** the
browser and other CSS can read. That fits [ADR-0003](../../adr/0003-the-gates-go-headless.md)'s
requirement that tokens are defined once and consumed everywhere.

> [!WARNING]
> **This section was wrong and has been corrected. See
> [`shadcn-and-the-token-contract.md`](shadcn-and-the-token-contract.md) §1.**
>
> It named `@theme inline` as the trap. `inline` is in fact **required** for the case described,
> and the non-inline form is what breaks the theme toggle. The original text is kept below, struck
> through, because a research file that quietly rewrites itself cannot be trusted either.

~~**The trap, worth writing down before it bites:** `@theme inline` bakes values in at build time
and **breaks runtime theme switching**. The working pattern is two-stage — raw channel values
declared in `:root` and the dark override, mapped by a **non-inline** `@theme`.~~

**What is actually true**, from Tailwind's own documentation and confirmed by compiling both forms:
a theme variable that *references another variable* must be declared with `@theme inline`, or the
reference is resolved once at `:root` and every element below inherits that computed value — so the
`.dark` override never applies.

```css
/* correct */
:root { --brand: oklch(0.98 0 0); }
.dark { --brand: oklch(0.15 0 0); }
@theme inline { --color-brand: var(--brand); }   /* → .bg-brand { background: var(--brand) } */
```

The rest of the original entry stands: this fails **silently** — the build succeeds, the tokens
look right, and the toggle does nothing — and the module contract requires both themes to work, so
it is a correctness requirement rather than a style note. Only the culprit was inverted.

---

## Headless primitives: defer the choice

The secondary sources were confidently wrong here, and npm settled it.

| Library | Version | Last published | Weekly downloads |
|---|---|---|---|
| `@radix-ui/react-dialog` | 1.1.23 | 2026-07-31 | **71,407,978** |
| `@base-ui-components/react` | **1.0.0-rc.0** | 2026-07-15 | 534,931 |
| `@ark-ui/react` | 5.39.1 | 2026-08-28 | 1,053,374 |
| `react-aria-components` | 1.21.1 | **2026-09-04** | — |

A widely-repeated 2026 comparison states that *"Base UI reached v1.0 stable in December 2025"* and
recommends it over Radix on that basis. **npm says it is still `1.0.0-rc.0`.** Choosing it on that
claim would have been betting a long-lived project on a release candidate.

Radix is described in the same sources as slowing after its acquisition. Its last publish was five
weeks before this was written, which is slower than weekly but is not abandonment, and 71M weekly
downloads is a very large amount of production traffic keeping its API honest.

**Decision: add no primitive library yet.**

C1's dashboard is one screen. Choosing a primitives library before knowing which primitives are
needed is exactly the premature dependency [ADR-0008](../../adr/0008-supply-chain-policy.md) asks about
— *how much would we write ourselves* (a chat view: very little) and *where does it sit* (under the
entire UI). Semantic HTML and the design system's tokens cover C1.

When a component arrives where accessibility is genuinely hard — a combobox, a dialog with focus
management — **`react-aria-components` is the leading candidate**: most recently maintained of the
four, Adobe-backed, and the deepest accessibility primitives available. ADR-0003 makes focus states
and keyboard paths properties of the design system, which is an argument for the library that takes
them most seriously rather than the most popular one.

---

## Tooling installed

**Context7 MCP**, registered at user scope. It serves version-specific documentation pulled from
source repositories, which is the largest single source of accuracy loss in AI-written code. The
dashboard work touches Tailwind v4, Vite and React — all of which have moved.

*Windows note:* registering it as `npx -y @upstash/context7-mcp` times out on the 30-second health
check while npm downloads the package, and the `.cmd` shim path gets mangled by MSYS. Installing the
package globally and registering `node <path>/dist/index.js` connects immediately.

Still worth adding when their work arrives: **Playwright MCP** at [#31](https://github.com/alexeybe1kin/conker/issues/31),
and the **mobbin** MCP (already configured) for reference flows. The three-to-five server ceiling in
[`../agents/toolchain.md`](../../agents/toolchain.md) still holds.
