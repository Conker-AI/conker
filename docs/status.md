# Status

This is the human-readable status of the current source tree. The executable
inventory is [`capabilities.json`](../capabilities.json); the pinned release input
is [`versions.env`](../versions.env); an assembled deployment is proven only by a
completed [release-acceptance](reference/release-acceptance.md) evidence bundle.
Those three artifacts answer different questions and must not be substituted for
one another.

Last source verification: **27 September 2026**. The current tree has **35 tracked
capability families: 34 active and 1 deferred**. Active means at least one real
product surface exists; it does not imply UI/CLI parity or current-server rollout.

## Current source

### Connected owner workflows

- Browser authentication, session revocation and operation-bound password checks.
- Conversation sessions, streaming turns, cancellation, resume and reconciliation.
- Tasks, run activity, proactive proposals and owner approval decisions.
- Model catalogue and role configuration, including host-managed provider secrets.
- Memory inspection and owner-reviewed forgetting.
- Tool inventory plus workflow drafting, publication and recorded runs.
- Durable agents, Companion editing, projects, artifacts, jobs and agent teams.
- Durable typed calls plus bounded voice turns with browser-owned PCM capture,
  authenticated transient transport, explicit speech readiness and disposable playback.
- Read-only owner file inventory and host service, port and process observations.
- Shared diagnostics, resumable verified setup status and durable setup evidence.

The connected dashboard uses one gateway shell. Fixture data is restricted to the
explicit preview build; production bundles contain no fixture chunk. Every active
UI capability names a bounded CLI inspection or apply command; the deferred owner
terminal remains outside that parity claim.

The first-run dashboard now presents the verified checks as a three-phase path,
keeps the current operation dominant, distinguishes retained status after a failed
refresh, and hands the owner to a first conversation as soon as security,
Companion and model checks pass. Boundary review remains an authenticated receipt
operation and protection still requires an evidence-producing host command.
Rehearsal is now an ordinary owner mission in the connected UI and CLI: Pi proves
a completed conversation, a revision-bound review of the current memory choice,
and ToolGate's real single-use approval path through its fixed local echo. Only Pi
can finalize that receipt; assembled release evidence cannot be uploaded in its place.

Protection setup now stores one append-only, revision-checked policy shared by UI
and CLI: a normalized mounted off-machine destination and a retention count. Saving
policy is not completion. The repository host verifier requires separate mounted
storage, creates and re-verifies the coordinated snapshot, prunes only older
independently verified snapshots, and records evidence bound to the exact policy.
Changing destination or retention degrades the old receipt. Browser code cannot
submit protection evidence.

Absent optional memory and capability services now have durable, revisioned
`skip` and `include` choices through the same UI and CLI control plane. A memory
skip durably defaults new conversations to no long-term memory, while existing
sessions keep their own setting. A capability skip removes ToolGate capabilities
from model turns without stopping the service or erasing its catalogue. Skips are
shown as off, not verified-enabled, and cannot turn a failed included service green.

A fresh supplied Companion profile is no longer treated as owner-reviewed merely
because it exists. Setup now requires either an edited durable agent revision or
an explicit acceptance of the default through UI or CLI. The previously dormant
Companion harness editor is connected as a dedicated section beside Character
Studio, keeping agent authority separate from appearance and voice.

First-run model selection is now a bounded setup operation rather than a link to
the full settings editor or an operator-only bootstrap script. Pi discovers the
running local model and existing catalogue candidates, reports live readiness,
data location and possible provider cost, and accepts only a current server-issued
candidate and configuration revision. Selection alone no longer marks the model
complete: Pi sends one fixed, bounded prompt through the selected server-owned
adapter and stores an append-only receipt bound to the resulting configuration
revision. The receipt contains model identity and a response digest, never prompt
or response text. The setup UI and `conker setup models` / `conker setup run model
CANDIDATE_ID` share that operation; unknown or unavailable models fail closed,
failed request IDs are not replayed, and advanced role settings survive changes.

### Host CLI

The repository and source-built Ubuntu launchers share one command implementation.
It covers service lifecycle, diagnostics, fixed control-plane inspection, local
model download, hosted-provider credential rotation, authentication and TLS,
verified backup, held recovery, pinned updates, and the executable setup steps.

`conker setup run boundaries`, `protection` and the multi-step `rehearsal` commands
use the same Pi operations as the setup UI. Verified backup, verification, held restore and
recovery status now use strict repository and generated-Ubuntu layout profiles. Ubuntu still
refuses repository-only self-update and single-key recovery rather than guessing at an unsafe
equivalent.
The Ubuntu generator also consumes the validated release manifest directly for PostgreSQL,
Qdrant and Ollama, so a fresh deployment no longer begins from mutable `latest` tags.

### Deferred

| Capability | Why it is deferred |
| --- | --- |
| Owner terminal | The constrained PTY, UI, dedicated candidate image, health probe, workspace preflight, recovery exclusions and guarded repository/Ubuntu deployment shapes exist. Manifest v2 still records the capability as deferred and requires both a registry digest and hashed target-Linux acceptance to activate it; neither promotion input exists yet. |

This capability exposes no production surface in the capability matrix. Its
presence in lower-level code is not a release claim.

## Deployment evidence

The latest completed Ubuntu acceptance is the
[23 September 2026 run](../deploy/ubuntu/acceptance-2026-09-23.md). It proved the
then-connected chat, memory, approval, workflow, authentication, private HTTPS and
cold-backup subset. It does **not** prove the current source tree, current dashboard
revision, setup flow, provider lifecycle, terminal work or new owner workspaces.

The Ubuntu deployment host is currently off at the owner's request. No Linux-only
check is being simulated locally. Promotion of a new release remains pending until
the exact manifest is assembled on a clean Linux host and produces passing install,
image-identity, TLS/auth, setup, conversation, backup/held-restore and teardown
evidence.

Local verification on 27 September:

- Conker root suite: 218 passed, 33 platform skips. The added Windows skip is the
  active terminal workspace UID/GID fixture; the same generator branch passed in a
  disposable local Linux container with a real `65532:65532` workspace.
- Pi suite: 1,364 passed, 11 platform skips.
- Connected dashboard gateway contracts, lint, design-system checks and production
  build passed.
- The authenticated shell now has one typed connected-route registry shared by
  workspace resolution, the sidebar and page search. Browser QA proved that only
  connected destinations are advertised, System navigation reaches the live
  diagnostic workspace, and unknown section values fall back to Overview without
  rendering the disconnected-workspace surface. All 27 dashboard contract suites
  pass, source reachability is 354/354, and the production bundle remains fixture-free.
- Today now leads with the one decision that needs the owner, keeps active work and
  recent conversations in the primary reading path, and gives empty states a useful
  next action. It was inspected at the default desktop viewport and at 390 x 844 and
  320 x 667 with no horizontal overflow or browser-console warnings.
- A new conversation now exposes its answer model before the first message. An
  explicit choice survives session creation and is sent on the initial submission;
  the configured-default option still leaves routing to the server. Browser QA at
  desktop, 390 x 844 and 320 x 667 showed no overflow, and an exercised preview turn
  retained `Qwen 2.5 3B` in the header and recorded `ollama / qwen2.5:3b` in its saved
  turn details with no console warnings.
- A new conversation now also selects an active durable agent before the first
  message. Pi validates and saves that identity atomically with the session while
  preserving the setup-derived memory default; missing or archived agents leave no
  orphan session. Assistant records expose the agent frozen into each turn, and the
  connected transcript, live-writing state and reply composer use that attribution.
  Browser QA exercised a Research partner turn at desktop and inspected the selector
  at 320 x 667 with no horizontal overflow. Open chats also expose a revisioned
  future-turn handoff that preserves the rest of the session settings and historical
  attribution; the UI detector reported no findings.
- A new conversation can add memory-disabled and harness-disabled restrictions before
  the session exists. Pi validates and persists them atomically with the selected agent;
  omitted keys preserve setup defaults, and disabling the harness requires an explicit
  answer model before the first send. Browser QA exercised both restrictions through a
  completed preview turn, then reopened the saved conversation and confirmed both
  authoritative switches remained active. The dialog and three-control utility row were
  inspected at the default desktop viewport and 320 x 667 with no horizontal overflow or
  console warnings; the UI detector reported no findings.
- Setup was rendered and exercised at 1440 x 900 and 390 x 844, including the
  expanded boundary-policy review; no browser-console errors or horizontal
  overflow were observed.
- The connected Companion Harness editor was rendered and exercised at the same
  desktop and mobile sizes, including its direct URL, mobile section focus and
  durable save transition; the preview console remained error-free.
- Guided model activation was rendered at 1440 x 900 and 390 x 844 with local data
  and cost disclosures, then exercised through the live-test transition from 4/8
  model setup to 5/8 boundary review and first-conversation readiness. The preview
  console remained error-free and the UI detector reported no findings.
- The ordinary owner rehearsal was rendered at 1440 x 900 and 390 x 844 and
  exercised end to end: current memory-choice review, fixed local approval request,
  Inbox approval, exact-request resume and Pi-owned finalization to 8/8 completion.
  The preview console remained error-free with no horizontal overflow.
- Protection policy was rendered and exercised at desktop and 390 x 844: the
  destination, retention, off-machine acknowledgement, saved-policy summary and
  exact host handoff remained readable with no console errors or overflow.
- Bounded voice turns now connect browser-owned mono PCM capture to an exact
  authenticated gateway route and Pi's once-only STT/model/TTS chain. Raw input and
  generated output are transient, uncertain audio is never replayed, and the UI
  remains text-ready when speech is unconfigured. Local contracts do not prove a
  speech server, physical microphone, latency, voice quality or Linux deployment.
- First-run capability setup now reports secret-free speech readiness and hands
  configuration to `conker speech configure`. Repository and generated Ubuntu layouts
  mount the optional key read-only, Pi refuses ambiguous key sources, activation
  verifies the recreated runtime and rolls back failed host configuration.
- Capability validator: 35 total, 34 active, 1 deferred.
- Release acceptance v2 now performs the complete headless first-run sequence,
  requires a real conversation and exact fixed approval rehearsal, creates policy-bound
  protection evidence on a separate mounted device, verifies a held restore, and only
  then accepts the final eight-step setup status. Deterministic acceptance contracts pass;
  the powered-off Linux host has not executed this gate yet.
- Every active capability with a connected UI route now names a bounded CLI
  inspection or apply command; owner terminal remains explicitly deferred.
- The owner-terminal adversarial container harness passes locally for normal PTY and
  boundary behavior, escaped-process cleanup, attempted listener replacement and
  supervisor loss without reconnect. Its image is still local and the host is WSL2,
  so this is not the required published-digest target-Ubuntu acceptance.

Both Python suites report one upstream Starlette/httpx deprecation warning. The
dashboard build reports large-chunk warnings. A repository-wide Ruff sweep passes;
the deployment retirement scripts and decision service no longer carry the eleven
previous formatting and lint findings. These local checks are not represented as
passing release acceptance.

## Release blockers

1. Run assembled acceptance for the exact current manifest on Linux and retain its
   evidence bundle.
2. Exercise the new CLI inspection and mutation families against the assembled
   Linux services and retain redacted evidence; local tests prove the route,
   schema and credential boundaries but not the powered-off deployment.
3. Run the source-built Ubuntu policy-bound backup and isolated held-restore drill on the
   powered-on Linux host. Local tests prove its generated service, store, key and database
   contract, but are not Linux/Docker acceptance evidence.
4. Package and accept the owner terminal or keep it deferred from the release;
   exercise the host-configured voice path with an explicit compatible speech service.
5. Reconcile the pinned dashboard revision and component releases only after those
   gates pass.

The immutable `v1` reference remains separate from this working tree and is not
modified by current development.
