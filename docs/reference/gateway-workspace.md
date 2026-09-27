# Authenticated gateway workspace

This dashboard shell connects to Pi's browser gateway. Development uses the same
shell with an in-memory gateway. The retired fixture-rich workspace is available
only through the explicit `npm run dev:legacy-fixtures` build and is never linked
from product routes.

## Modes and hosting

- Development defaults to `fixture`; production defaults to `gateway`. `VITE_CONKER_MODE=fixture` or `gateway` explicitly selects a build mode. Unknown values fail closed.
- Gateway mode requires the page's own HTTPS origin. It accepts no arbitrary service URL or browser bearer credential and never falls back to fixtures after a connection failure.
- Pi serves the trusted production build when `GATEWAY_DASHBOARD_DIR` is configured. Pi commits `265134d6` and `13d99366` add bounded asset serving and support the locally bundled KaTeX data font under the UI CSP.
- Preview providers, call hosts and fixture state load only in the explicit legacy-fixture build. An import-graph regression protects the gateway path from eager fixture imports. Gateway mode does not load external Google Fonts or analytics.

## What is connected

Owner-password login, session verification, logout and failed-logout locking use the real gateway cookie/CSRF protocol. Password setup and recovery require the host CLI. The password is cleared from the form before the attempt; errors do not echo server bodies or credentials.

The conversation workspace lists up to the latest 200 sessions, searches that loaded list, creates a session, reads saved messages and turn metadata, and submits one text turn. A returned automatic fork selects the actual destination. A receipt is not presented as a completed answer: saved detail is fetched separately. Forgotten and closed history is read-only; forgotten content is suppressed even if an inconsistent response includes it.

The new-conversation composer exposes the configured answer route before the first
message. An explicit model choice is retained across session creation and included in
that initial submission; it does not take effect only after the first answer. The
created conversation keeps the same choice in its header. Leaving the control on its
configured value sends no browser-authored override and preserves server routing.

Before that session exists, the composer also offers additive first-message privacy
restrictions. Memory-disabled and harness-disabled choices are validated by Pi and
written in the same transaction as the session and selected agent, so the first turn
cannot race ahead under weaker settings. Leaving a switch off preserves the setup-derived
default instead of asserting that the capability is enabled. Disabling the harness also
disables automatic routing: the composer requires an explicit answer model before it can
send. The created conversation then reads the authoritative saved settings and shows the
active incognito state in its header.

The composer also exposes the active durable agent before the first message. Pi
validates that the selected profile exists and is not archived, then writes the
session and its initial settings in one transaction; a rejected selection cannot
leave an orphan conversation. Setup-derived memory defaults are preserved in that
same settings record. Each assistant message projects the agent identity frozen in
its turn settings, so the transcript, live-writing state and reply composer name the
actual specialist instead of relabeling historical replies after a later handoff.
An open conversation exposes an explicit handoff dialog. It preserves the current
privacy, project and presentation settings, uses their latest revision, and changes
only the agent for future turns; Pi refuses the write while work is unresolved.

Drafts and uncertain mutation locks survive temporary same-session authentication checks in memory. A changed or lost authenticated identity clears that workspace. There is no local-storage transcript cache. Reload restores server history after signing in, not unsent drafts.

The Agents workspace uses Pi's durable, immutable profile revisions through the
owner-control channel. Owners can create, edit, archive and restore bounded agent
profiles. The canonical Companion can be renamed and given new role and instruction
text, but cannot be archived. Model, tool and memory references are selections only;
they grant no execution authority and are not presented as validated references.

The connected `/` route is the daily return surface. It derives bounded groups from
saved approvals, recorded tasks, durable sessions and non-executing proposals:
Waiting for you, Continue work, Recent conversations, Completed and Suggested. It
does not calculate engagement scores, invent urgency or infer work from missing
records. Reads settle independently, so one unavailable dependency leaves the other
server-authored groups usable and displays an explicit partial-load notice.

The Projects workspace creates and edits durable project guidance, archives and
restores projects, and links authoritative conversation or task identities without
copying their content. Current labels, availability and privacy come from Pi on each
read. Applying a project to a destination chat uses the existing revisioned session
settings contract and an explicit selection of at most 20 linked sources; Pi rechecks
project state, source origin and privacy while preparing each turn. Project membership
grants no model, provider, tool, memory or execution authority. Destructive project
removal, metadata search and the legacy caller-supplied privacy preview remain outside
the browser allowlist. File linking waits for an authoritative connected file inventory
instead of accepting paths or uploads from the browser.

The Artifacts workspace creates bounded documents, code, tables, charts, diagrams,
media references and sandboxed HTML previews as durable Pi records. Library reads
return metadata only; opening one artifact fetches its bounded history. Saving and
restoring append immutable versions, while archive and restore preserve identity and
provenance. A readable assistant response can be explicitly saved from its message
menu; Pi rechecks that it is a completed final response before copying it. Exports are
inert JSON envelopes downloaded by the browser. Source-copy
content fails closed when its conversation, evidence or privacy state can no longer
be verified, leaving a durable tombstone without cached bodies. The browser cannot
reach server-side document download, destructive removal or arbitrary artifact paths,
and artifact identity grants no execution authority.

The Jobs workspace reads redacted schedule definitions and durable run states from
Pi. Owners can pause or resume future automatic admission, explicitly admit one
manual run with a stable request identity, cancel waiting work, provision a scoped
recurring allowance, continue after approval and reconcile an uncertain ToolGate
outcome without repeating execution. Reads never admit work, and successful manual
admission is not presented as completed execution. Target arguments, receipts,
budget identities and credentials remain server-side. Raw schedule authoring and
updates stay outside the browser until an authoritative published-procedure picker
can provide the exact target version, digest and typed inputs.

Character Studio is connected to Pi's durable Companion character package. The
owner can edit identity, authored presentation instructions, appearance and
expression assignments, voice design/reference preferences, and Focus/Character
modes; import and export Conker v1 packages; and restore an immutable historical
revision as a new revision. Saves use expected-revision compare-and-swap and fresh
operation-bound password verification. The browser exposes only the canonical
`companion` character, not arbitrary agent IDs. Character routes alone receive a
66 MiB authenticated JSON envelope so the existing bounded embedded-media package
can cross the gateway; ordinary browser operations retain the 64 KiB request cap.
Stored voice, renderer and motion preferences remain truthful configuration: they
do not claim synthesis, cloning, perception, emotion inference or 3D execution.

The connected System workspace adds explicit read-only host observations for
processes, listening ports and containers. Starting a sample creates one durable
request identity; checking or continuing that request never dispatches a replacement,
and every fresh sample requires a deliberate new action. Pi validates the complete
SystemGate receipt before projecting it into browser DTOs. Raw process IDs, command
lines, users, container images and IDs, host addresses, environment, files and terminal
access are excluded. Configured service and container targets are separately labeled
as configuration, not observation or execution. No process, port or container action
is exposed through this browser contract.

The Files section exposes only operator-configured ToolGate roots and bounded
directory listings. Pi keeps a durable request identity and validates each receipt;
the browser receives relative names, entry kinds, timestamps and truncation state.
It receives no file contents, write capability, upload, delete, recursive crawl,
shell route, ToolGate action identity or approval identity. Each refresh or folder
navigation creates a new explicit request, while check and continue actions reuse the
saved request without redispatching it. The terminal remains a separate deferred
capability and is not implied by file browsing.

The Teams section connects Pi's canonical collaboration definitions without exposing
the separate team executor. Owners can create and edit bounded roles, budgets,
context references and declared handoffs; archive or restore a definition; and inspect
immutable historical revisions. Writes use expected-revision compare-and-swap and
fresh operation-bound password verification. Current agent references are revalidated
for availability and narrowing, but their presence grants no tools, memory, model,
budget, approval or execution authority. Preparation, team runs and step dispatch stay
outside the browser allowlist.

## Recovery and boundaries

- Mutations are never automatically retried. Turn submissions now reserve a durable request identity before preparation and atomically bind the effective session, input, turn and optional task.
- Lost or malformed acknowledgements retain the draft and block further sends. The owner checks the saved submission by identity. An explicit retry after a not-found result keeps the original request identity; a known interrupted preparation can restore its saved input without overwriting a newer draft.
- An accepted turn missing from the fetched detail also blocks a new send until reconciled.
- Unfinished turns and recoverable states such as approval waits, budget waits, action-in-progress, unknown effects and acted-without-reply remain blocked even when a turn has an end timestamp.
- Logout is not queued behind a slow turn. Late responses from a different or revoked browser session are discarded. Aborting a browser fetch does not claim cancellation of server work.
- Reads and writes have bounded validated data. Unsupported message content remains explicit instead of being rendered as invented text.

## Verification

`npm run check:gateway` covers mode resolution, same-origin transport, auth rotation/expiry/logout races, runtime DTOs and receipts, guarded sends, atomic first-turn agent and privacy selection, immutable message attribution, harness-disabled explicit-model enforcement, first-turn model forwarding, retained workspace state, strict typed-call, host-inventory and directory-listing projections, exact route denial, and fixture import isolation. Theme checks cover gateway font isolation; design, TypeScript and production build checks pass.

Browser QA uses the actual Pi HTTPS gateway and cookie/CSRF implementation with a **simulated Pi dependency**, not a model or gate. It exercised invalid and valid login, session creation, saved replies, lost acknowledgement with no duplicate send, history reload, logout, and desktop dark/mobile light layouts. Simulation text identifies itself. This is transport/UI evidence, not an end-to-end live-model acceptance claim.

## Still outstanding

Durable task metadata, Activity, tools, memory and model routing are connected.
System diagnostics are also connected through one bounded gateway contract shared
with `conker doctor`; findings and recovery instructions are not rebuilt in the UI.
Fresh operation-bound password verification, a server-enforced unlock deadline,
durable turn identities and exact message associations are also connected; see
[gateway-verification-recovery.md](gateway-verification-recovery.md). The chat header also
connects durable typed calls with bounded history, retained request identities and explicit
pause, interrupt, end and uncertain-result recovery. It also exposes one exact transient
PCM WAV turn when Pi reports configured speech: the browser owns consent and cleanup,
the gateway accepts no arbitrary media route, and uncertain audio is checked rather than
replayed. First-run setup now reports speech readiness and hands configuration to the
host-only `conker speech configure` wizard. Camera and continuous streaming remain outside
the call contract. Owner terminal packaging and target-Linux acceptance are still pending. The
assembled release gate owns the real install, conversation,
backup and held-recovery exercise.
