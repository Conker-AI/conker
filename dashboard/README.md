# Conker dashboard preview

A browser-only sketch of Conker. Start with Chat, review the coach’s message in Inbox,
then look at System’s deliberately imperfect health evidence. Nothing calls a backend,
model, or third party. Every action changes fixtures in this tab only; reloading resets
the preview, including appearance. Do not enter real passwords in setup.

## Run

From `companion/dashboard`, with Node 22.12 or newer:

```sh
npm --prefix ../design-system install
npm install
npm run dev
```

Open **http://127.0.0.1:5173/**. First-run setup is **http://127.0.0.1:5173/setup**.
The port is fixed so browser checks and the shared review URL agree. If it is occupied,
stop the other preview on that port before starting this one.

`../design-system` is a local package dependency; keep it alongside this app. Its styles,
fonts, theme provider, eight-state Status and Radix primitives are consumed directly.
There is no second component theme here. The owner popover composes Radix with the
design-system Button. React Router owns navigation; no server routing is required in dev.
A production static host must route unknown paths back to `index.html`.

## Review and checks

```sh
npm run check
npm run build
npx playwright install chromium
npm test
```

The browser tests cover each screen, fixture decisions, reply-only recovery, corrections,
forgetting, filters, job controls, setup, phone layout, and actual light → dark → light
component colours. A runtime check rejects data requests and third-party origins.
`scripts/check-boundaries.mjs` also checks source for network clients, literal colours,
font declarations and persistent browser storage. These checks guard the prototype’s
scope; they are not security enforcement for a future connected dashboard.

Dependency verification on this machine used the existing design-system install and cached
packages: shell registry access was unavailable. A clean `npm ci` and Linux build have not
been verified. The inherited lock metadata has the design system's documented native-package
caveat; regenerate and verify the lockfiles on a networked machine before release.

## Where data lives

- `src/fixtures/`: named, typed examples per screen. Approval wording comes from registered
  fixture tool templates filled with exact arguments, never agent prose.
- `src/state.tsx`: decisions, journal events, memory edits/tombstones, grants, jobs,
  conversations and profile choices shared across routes for the lifetime of the page.
- `src/pages/`: screen composition. `src/ui.ts` is the design-system import seam.
- `src/styles.css`: app layout and type scale, using the design-system tokens.

The fixture story is Saturday 12 September: a Monday maths exam, Tuesday/Thursday judo,
a coach email waiting for approval, and a server that needs attention. Evidence dates
labelled “Fixture receipt” are captured once per page load and become stale; refreshing
System does not manufacture a successful health check. Missing cost remains unknown.

## Deliberate limits

Chat replies stream a fixed sample. Approvals record a decision but execute nothing;
their two clocks explain the contract and do not mint or consume tokens. Old consumed
and expired examples cannot be approved again. Proposal acceptance prepares no real work.
Grants edit only a fixture frequency. Tool governance is read-only. Memory search is
explicitly a degraded, literal word match; it does not simulate semantic retrieval.
Forget leaves a local tombstone and does not erase the source conversation.
Jobs replay receipts rather than start work. Image tags are examples, not live versions.

Setup discards the password field when advancing and creates no account. Its explanation
describes the intended real owner flow: a server-side password check and temporary browser
session, with terminal password reset on the owner’s server. Such a reset signs out browser
sessions; it cannot restore lost storage, backups or vault recovery keys. This app implements
none of that authentication and must not be deployed as an authenticated control plane.

The navigation in `docs/screens.md` worked as written. Its resolved standing-grant model
supersedes the older autonomy-level examples in the same document. This prototype chooses
the five setup steps requested in the brief; their order was still open in the document.
