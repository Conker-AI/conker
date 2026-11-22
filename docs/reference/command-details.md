# Command details

Moved out of [Running Conker](../4-running.md#commands-in-detail) so that page stays short. `conker help` is the authoritative list; every command group has a page (tests/test_cli_docs.py).

ChatGPT subscription sign-in needs the private provider service and official
Codex CLI **0.160.1** at `~/conker-model-runtime/bin/codex` (isolated from any personal
desktop Codex login). With Node.js/npm installed, install the pinned runtime using
`npm install --prefix "$HOME/conker-model-runtime" --no-audit --no-fund --ignore-scripts @openai/codex@0.160.1`,
then, on the Ubuntu layout or when a repository install's worker did not start,
`conker providers install-ui-control`. The UI reports unavailable when that
runtime is absent or the version differs; it never silently upgrades it.
The CLI equivalents are `conker providers chatgpt status|login|models`,
`conker providers chatgpt cancel LOGIN_ID` and
`conker providers chatgpt logout CONNECTION_ID`. They use the same private worker
and revision-bound targets as the UI, not a second credential store.
OAuth credentials in `state/chatgpt-auth` (Ubuntu) or `.conker/chatgpt-auth`
(repository layout) are private and not mounted into Pi/Gateway or included in
normal Conker snapshots. Reconnect after restoring onto another host; never copy
desktop credentials into this store. Pi mounts `chatgpt-inference`; with the Claude plan
runtime on, that runtime mounts it too, and in the Ubuntu layout only the runtime does. Only
Gateway mounts `provider-control`
([provider credentials](reference/provider-credentials.md#browser-and-recovery-boundaries)).
The main shell and tool permissions are unchanged.
Commands use the same arguments everywhere. When a layout cannot safely provide an
operation, help marks it unavailable and the command exits with an explanation;
the source-built Ubuntu layout supports verified backup and held recovery, but
cannot provide the repository install's branch-following update or single admin-key commands;
it updates to a named release instead (`conker update --to X.Y.Z`, see [looking after your
server](reference/server-care.md#update-to-a-new-release)).

`conker inspect RESOURCE` prints one fixed, read-only control-plane view as JSON. It takes no
URL or path and never prints its credential, so redirect it to a file for a secret-free snapshot.
The full route and authority table is in [CLI inspection](reference/cli-inspection.md).

`conker apply models FILE` accepts the same `{expected_revision, configuration}`
document as the model settings UI. The host only streams bounded JSON into the
gateway container; the filename and owner credential are not sent to Pi. Pi applies
its strict schema and optimistic revision check. The command never retries an
uncertain write and accepts no URL or arbitrary path.

`conker apply agents FILE` accepts one strict operation envelope: `create` carries
an agent configuration, `update` also carries the stable agent ID and expected
revision, and `archive` carries the non-Companion agent ID, expected revision and
desired archived state. Profiles choose models, tools and memory references; this
command cannot grant authority or execute an agent.

`conker apply projects FILE` supports `create`, `update`, `archive`, `link` and
`unlink`. Links retain only validated conversation, task or attachment identities;
they never copy source content or inherit grants. Destructive project removal is
not exposed through this owner-control command.

`conker apply teams FILE` supports `create`, `update`, `archive` and `restore` for
versioned team definitions. Role references, graph structure and aggregate budgets
are validated before dispatch. Preparation, execution and permission grants are
deliberately absent from this command.

`conker apply jobs FILE` covers the UI's `state` (pause/resume) and `run` (one manual run)
operations; every other job write is UI-only. A manual run requires a stable 16-128 character `request_id`; an
accepted response records admission, not completion, and uncertain outcomes must
be reconciled through run history. Raw target authoring remains unavailable in both
UI and CLI because job inputs and publication identity need a dedicated safe editor.

`conker apply memory FILE` forgets or remembers one memory, or corrects one and retries a
correction. The file shapes and recovery rules are in [CLI
inspection](reference/cli-inspection.md#correct-retained-memory-text).

`conker apply proposals FILE` records `accept`, `decline` or `never` for one
inspected proposal. Acceptance records preference only: it cannot execute a tool or
grant authority. Identical repeated decisions are harmless; conflicting later
decisions remain rejected by Pi.

`conker apply tasks FILE` supports durable task metadata and lifecycle changes.
Creation requires a stable request ID, edits and transitions require the expected
revision, and status changes require an explanatory note. These operations record
work; they do not dispatch an agent or grant tool authority.

`conker apply artifacts FILE` supports inert `create`, `from_message`, `append`,
`restore` and `archive` operations. Content keeps the same bounded typed formats as
the UI, message copies recheck provenance and privacy on Pi, and this command offers
no execution or arbitrary download operation.

Use `conker inspect session-settings SESSION_ID` ([ID
rules](reference/cli-inspection.md)) before `conker apply sessions FILE`. The apply
document carries that session ID, its expected settings revision, and the complete
typed settings object. Pi refuses busy, closed or call-controlled
sessions and prevents inherited privacy from being weakened. Changes affect future
turns only and never grant authority.

Use `conker inspect approvals` to list the approval inbox and `conker inspect
approval REQUEST_ID` to review one exact request. `conker apply approvals FILE`
accepts only `{operation: "decide", id, status, note?}`, where status is
`approved`, `rejected` or `dismissed`. It sends only the ToolGate owner credential
to one compiled decision route; the execution credential, arbitrary ToolGate paths,
and automatic retries are unavailable. A successful response records ToolGate's
decision and does not claim that an external effect completed.

Use `conker inspect submission REQUEST_ID` after a lost or malformed send
acknowledgement. It reads the durable receipt for that exact retained identity and
never repeats the request. `conker apply turns FILE` accepts either
`{operation: "resume", id}` for a parked turn or
`{operation: "cancel_submission", request_id}` for the same bounded stop action as
the chat UI. Resume reuses the stored action after approval, and cancellation keeps
completed effects while durably recording the stop. Neither operation retries an
uncertain write automatically.

The system inspection commands preserve the UI's no-authority model. `conker
inspect file-roots` returns configured roots; `conker apply files FILE` can request
or resume only directory metadata, and `conker inspect file-listing REQUEST_ID`
reconciles its durable receipt. It cannot read content, edit, upload, delete, or
invoke a shell. `conker inspect inventory-services` and `inventory-containers`
show configured targets without observing them. `conker apply inventory FILE`
requests or resumes one redacted read-only observation, and `conker inspect
inventory REQUEST_ID` reconciles it. No process, port, container, or terminal
action exists on either CLI resource.

Read the Companion first with the `character` views ([CLI
inspection](reference/cli-inspection.md)). `conker apply character FILE` accepts
only `save`, `import`, or `restore`. Save carries the complete validated profile and
its expected revision; import validates a portable package into a draft without
saving it; restore appends an old revision as a new immutable revision. Embedded
media requires the existing isolated 66 MiB character envelope, while every other
apply resource stays at 2 MiB. External media URLs, arbitrary agent IDs, synthesis,
and automatic retries remain unavailable.

Typed calls expose `call-capabilities`, `call CALL_ID`, and `active-call
CONVERSATION_ID` inspection. `conker apply calls FILE` accepts only `start`,
`update`, `interrupt`, `end`, and `turn`, with stable request IDs and expected
revisions where required. The command uses the same durable typed-turn path as the
UI. Microphone audio, camera, perception, recording, replay, and media endpoints
are absent; channel fields are preferences only, external effects still require
ToolGate approval, and an uncertain turn must be inspected before any retry.

Inspect the draft, its validation and its publications first ([CLI
inspection](reference/cli-inspection.md)). `conker apply tools FILE` accepts only `save`,
`publish`, `access`, `run`, or `run_tool`. Drafts remain inert; publish creates an immutable
pinned version but grants and runs nothing.
Access, run and run_tool require both the owner credential and the distinct scoped
execution credential. Runs require a stable `editor_...` action ID, bound version and
digest, and at most 32 KiB of JSON arguments; approval resumes the same recorded action
ID. `run_tool` runs one published tool by hand, as the browser's Run does:
`{"operation": "run_tool", "id": TOOL_ID, "action_id": "owner_...", "args": {...}}`,
plus `approval_request_id` when resuming an approval, with the same 32 KiB limit. Delete,
arbitrary paths, raw credential binding, alternate execution, and automatic retries
are unavailable.

`setup run boundaries` accepts only the digest returned by the current
`inspect boundaries` result. Pi compares that digest with ToolGate again before it
records the review, so a concurrent policy change fails closed.

`setup run memory --skip` and `setup run capabilities --skip` record an explicit,
revision-checked owner choice. Memory skip makes no-memory the durable default for
new conversations; sessions already created keep their own setting. Capability
skip hides ToolGate capabilities from model turns without stopping ToolGate or
erasing its catalogue. `--include` restores the corresponding runtime default.
Neither choice turns a failed service green. The dashboard uses the same append-only
choice records and asks for operation-bound password verification before changing them.

`setup run companion --accept` records that the owner reviewed and kept the
supplied Companion harness profile. Editing and saving that profile creates a new
immutable agent revision and also satisfies the step. Character artwork and voice
remain separate presentation settings; accepting the harness profile grants no
new model, memory or tool authority.

`setup models` lists only candidates assembled by Pi from its durable catalogue and
running adapters, including whether the setup prompt remains local and whether hosted
provider billing may apply. `setup run model CANDIDATE_ID` re-reads that list, refuses
unknown or unavailable candidates, preserves advanced role settings, revision-checks
the write, and asks the selected adapter for one short live response. Setup advances
only when an append-only receipt matches the current model configuration revision.
The receipt stores provider/model identity and a response digest, never prompt or
response text. The dashboard performs the same owner operation in place. Neither
client accepts a provider URL, credential or arbitrary model route.

`conker setup configure protection` saves where backups go and how many to keep;
`conker setup run protection` backs up, verifies, prunes and records the receipt (it expires
after 90 days). Procedure and failure rules: [backup and recovery](reference/recovery.md); owner
steps: [looking after your server](reference/server-care.md#set-up-backups-once).

`setup rehearsal` projects three ordinary owner proofs: one completed conversation,
one explicit review of the current memory choice, and one owner-approved invocation
of ToolGate's fixed `approval.test-echo`. The echo is local, content-free, and has
no network or filesystem access. Run `--review-memory`, then `--start-approval`, decide
the request in Inbox, then `--finish-approval REQUEST_ID` and `--finalize`.
Pi alone creates the rehearsal receipt after all three proofs exist; uploaded
rehearsal receipts are rejected. Release acceptance is a separate check and never
completes it ([release acceptance](reference/release-acceptance.md)).

Repository updates refuse a dirty checkout, an active backup, or any recovery or
update hold. The updater validates the candidate manifest and Compose model in a
detached staging worktree, resolves every pulled image to a registry digest, records
the current Git revision, image IDs and running-service state, and only then applies
the candidate. Health acceptance covers the live gateway and gate endpoints. A failed
candidate restores the recorded revision and exact local image IDs without invoking
application actions. If that restoration cannot be proven, the updater writes a
durable hold under Git's private `conker-update` directory and refuses another update.

Each attempt leaves a redacted JSON receipt in `.git/conker-update/receipts/` (or the
equivalent private Git directory for a worktree). Receipts contain revisions and
status, never `.env` values or command output. An interrupted mutating attempt is
rolled back and verified before a rerun starts. On the source-built Ubuntu layout an update
names a release (`conker update --check`, `conker update --to X.Y.Z`, or Update in the Inbox):
see [looking after your server](reference/server-care.md#update-to-a-new-release) for the steps
and what each result means, and deploy/ubuntu/README.md for how it works.
