# 4 · Running Conker

Pick one of three ways.

| Way | For | Needs |
|---|---|---|
| [A · Preview](#a--preview-the-interface) | Looking around, UI work | Node.js 22.12+ |
| [B · Server](#b--server-ubuntu) | Real daily use | Ubuntu, Docker, about 16 GB RAM |
| [C · Local Windows stack](#c--local-windows-stack) | Backend development on Windows | Docker Desktop, Python 3.12, Ollama |

## A · Preview the interface

Sample data, no backend, nothing leaves your machine.

```sh
cd dashboard
npm ci
npm run dev -- --host localhost --port 5173 --strictPort
```

Open http://localhost:5173.

## B · Server (Ubuntu)

For a fresh repository installation, use the canonical repository and its
installer. It builds the connected dashboard with the pinned Node image and
pulls the application versions declared in `versions.env`:

```sh
git clone https://github.com/Conker-AI/conker.git
cd conker
./install.sh
```

Review the installer prompts and private-network configuration. Keep the owner
password private. A browser preview is not a connected installation and cannot
prove memory, tools or scheduled work. The source-built layout below is an
alternative; do not mix the two layouts over the same stores.

This runs ten containers: gateway, Pi, ToolGate, MemoryGate, PostgreSQL, Qdrant, embeddings,
SystemGate, Ollama and Laya decisions. Only the gateway gets a port, on `127.0.0.1`. Share it on
your private network with Tailscale Serve.

1. Export the six repositories into `~/conker-deploy/sources/` and build the dashboard.
2. Generate configuration and credentials (safe to re-run, keeps existing data):
   ```sh
   python3 sources/companion/deploy/ubuntu/prepare.py https://HOST:8443
   ```
3. Start everything:
   ```sh
   docker compose -f compose.json up -d
   ```
4. Download the configured local models, then choose and test the answer model in the
   Setup screen. For a headless install:
   ```sh
   conker setup models
   conker setup run model local-answer
   ```
5. Expose the gateway on the tailnet only. Do not use Funnel.
6. Check it works:
   ```sh
   acceptance.py --origin https://HOST:8443 --password-file FILE
   ```

Full guide: [deploy/ubuntu/README.md](../deploy/ubuntu/README.md).
The shared runtime contract and the one explicit decision-sidecar packaging difference
are recorded in [minimum deployment parity](reference/deployment-parity.md).

### Day to day

```sh
conker status                 # service health, not just container state
conker doctor                 # shared UI/CLI findings and recovery actions as JSON
conker inspect agents         # export a live, secret-free control-plane view as JSON
conker inspect boundaries     # inspect the exact ToolGate policy and digest
conker inspect approvals      # list ToolGate effect requests awaiting owner review
conker inspect approval req_123 # inspect one request before deciding it
conker inspect submission request_1234567890abcdef # reconcile an uncertain send
conker inspect file-roots    # list configured directory-listing roots, never content
conker inspect inventory-services # list configured service targets without observing them
conker inspect character      # export the current Companion character revision
conker inspect character-history # inspect immutable revision metadata
conker inspect character-export # export the current portable character package
conker inspect call call_... # inspect one durable typed call
conker inspect active-call ses_... # find the active call for a conversation
conker inspect call-capabilities # inspect bounded browser audio-turn readiness
conker inspect tool-drafts   # list the first bounded page of saved editor drafts
conker inspect tool-draft example # export one validated draft document
conker inspect tool-validation example # validate the saved graph without publishing
conker inspect session-settings ses_1234567890abcdef
conker apply models models.json # apply a revision-checked model-role document
conker apply agents agent.json # create, update, archive, or restore a profile
conker apply projects project.json # manage metadata and bounded source links
conker apply teams team.json # edit versioned team definitions only
conker apply jobs job.json # pause/resume or admit one durable manual run
conker apply memory forget.json # forget one reviewed revision everywhere
conker apply proposals decision.json # accept, decline, or suppress one proposal
conker apply tasks task.json # create, edit, transition, archive, or restore a task
conker apply artifacts artifact.json # create and version inert owner content
conker apply sessions session.json # change future-turn harness/privacy settings
conker apply approvals approval.json # decide one inspected ToolGate request
conker apply turns recovery.json # resume a parked turn or stop a retained submission
conker apply files listing.json # request or resume one directory metadata listing
conker apply inventory inventory.json # request or resume one redacted host observation
conker apply character character.json # save, import, or restore the Companion profile
conker apply calls call.json # start, steer, interrupt, end, or send a typed call turn
conker speech status         # secret-free host speech readiness
conker speech configure      # guided host-only speech setup with hidden key input
conker speech disable        # remove speech configuration and recreate Pi
conker apply tools tool.json # save, publish, grant, or durably run a workflow
conker setup status           # verified first-run state and next operation
conker setup run companion --accept # keep the supplied durable harness profile
conker setup models           # candidates, readiness, data location, and cost notice
conker setup run model CANDIDATE_ID # choose and verify one candidate with a live response
conker setup run memory --skip # or --include to return it to the guided path
conker setup run capabilities --skip # or --include
conker setup run boundaries --confirm-digest REVIEWED_SHA256
conker setup configure protection --destination /mnt/backup-device/conker --retention 7
conker setup protection      # inspect the same policy shown in the setup UI
conker setup run protection  # verify the mount, back up, enforce retention, record evidence
conker setup rehearsal      # current conversation, memory-review and approval proof
conker setup run rehearsal --review-memory
conker setup run rehearsal --start-approval
conker setup run rehearsal --finish-approval REQUEST_ID
conker setup run rehearsal --finalize
conker providers status       # secret-free hosted-provider revisions and state
conker logs pi
conker stop
conker start
conker update                 # staged, health-checked, rollback-capable
```

`conker help` is the authoritative command list in both installation layouts.

ChatGPT subscription sign-in needs the private provider service and official
Codex CLI **0.160.1** at `~/conker-model-runtime/bin/codex` (isolated from any personal
desktop Codex login). With Node.js/npm installed, install the pinned runtime using
`npm install --prefix "$HOME/conker-model-runtime" --no-audit --no-fund --ignore-scripts @openai/codex@0.160.1`,
then `conker providers install-ui-control`. The UI reports unavailable when that
runtime is absent or the version differs; it never silently upgrades it.
The CLI equivalents are `conker providers chatgpt status|login|models`,
`conker providers chatgpt cancel LOGIN_ID` and
`conker providers chatgpt logout CONNECTION_ID`. They use the same private worker
and revision-bound targets as the UI, not a second credential store.
OAuth credentials in `state/chatgpt-auth` (Ubuntu) or `.conker/chatgpt-auth`
(repository layout) are private and not mounted into Pi/Gateway or included in
normal Conker snapshots. Reconnect after restoring onto another host; never copy
desktop credentials into this store. Only Pi mounts `chatgpt-inference`; only
Gateway mounts `provider-control`. The main shell and tool permissions are unchanged.
Commands use the same arguments everywhere. When a layout cannot safely provide an
operation, help marks it unavailable and the command exits with an explanation;
the source-built Ubuntu layout supports verified backup and held recovery, but
cannot provide the repository install's self-update or single admin-key commands.

`conker inspect RESOURCE` reads one fixed, bounded control-plane resource through
the gateway container and prints the service's JSON unchanged. Supported resources
are `agents`, `approvals`, `artifacts`, `boundaries`, `jobs`, `memory`, `models`, `projects`, `proposals`,
`file-roots`, `inventory-containers`, `inventory-services`, `runs`, `sessions`,
`setup`, `tasks`, `teams`, and `tools`. The command accepts no
URL or arbitrary path, follows no redirects, ignores ambient proxies, and never
prints the scoped credential it uses. Redirect stdout to a file for a diffable,
secret-free inspection snapshot.
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

`conker apply jobs FILE` matches the connected UI's bounded `state` and `run`
operations. A manual run requires a stable 16-128 character `request_id`; an
accepted response records admission, not completion, and uncertain outcomes must
be reconciled through run history. Raw target authoring remains unavailable in both
UI and CLI because job inputs and publication identity need a dedicated safe editor.

`conker apply memory FILE` accepts only `forget`, with the reviewed memory ID,
expected revision and a stable request ID. The source conversation is retained. A
revision conflict requires a fresh review; after an uncertain response, repeating
the exact same request ID reconciles the idempotent operation instead of deleting
twice.

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

Use `conker inspect session-settings SESSION_ID` before `conker apply sessions
FILE`. The apply document carries that session ID, its expected settings revision,
and the complete typed settings object. Pi refuses busy, closed or call-controlled
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

The Companion editor has three fixed inspection views: `character`,
`character-history`, and `character-export`. `conker apply character FILE` accepts
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

Tool workflow inspection includes `tool-capabilities`, `workflow-capabilities`,
`tool-drafts`, and the identity-bound `tool-draft`, `tool-validation`,
`tool-publications`, and `tool-runs` views. `conker inspect tool-access DRAFT_ID
VERSION DIGEST` binds access review to one immutable publication. `conker apply
tools FILE` accepts only `save`, `publish`, `access`, or `run`. Drafts remain inert;
publish creates an immutable pinned version but grants and runs nothing. Access and
run require both the owner credential and the distinct scoped execution credential.
Runs require a stable `editor_...` action ID, bound version and digest, and at most
32 KiB of JSON arguments; approval resumes the same recorded action ID. Delete,
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

Protection policy is a revisioned Pi document shared by the setup UI and CLI. It
contains a normalized absolute host path, an explicit mounted-off-machine
destination type and the number of verified snapshots to retain. Saving policy
does not claim that a backup exists.

`setup run protection` supports the repository and generated source-built Ubuntu
layouts. It re-reads the saved policy, requires the destination to exist on a different mounted device,
creates a coordinated snapshot, verifies the completed manifest again, and prunes
only older snapshots that independently pass verification. It then records
evidence bound to the exact policy revision and digest through Pi's owner channel.
Changing destination or retention degrades the old receipt. The receipt expires
after 90 days. Each layout must match its exact service, storage, runtime-key and
database contract before writers stop; unknown authority fails closed.

`setup rehearsal` projects three ordinary owner proofs: one completed conversation,
one explicit review of the current memory choice, and one owner-approved invocation
of ToolGate's fixed `approval.test-echo`. The echo is local, content-free, and has
no network or filesystem access. Start it with `--start-approval`, decide the exact
request in Inbox, resume it with the returned request ID, then use `--finalize`.
Pi alone creates the rehearsal receipt after all three proofs exist; uploaded
rehearsal receipts are rejected. This onboarding proof is intentionally separate
from assembled Linux release acceptance, whose evidence never completes a user's
first-run setup.

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
rolled back and verified before a rerun starts. Ubuntu self-update remains explicitly
unavailable until its source-build layout can provide the same image identity,
acceptance and rollback guarantees.

### Reset the password

```sh
conker auth reset-password
```

This asks for the new password privately and signs out every browser.

### Backups

Stop the stack, archive `state/` and `compose.json`, check the archive's hash, then start the stack
again. Keep a copy on another machine. A restore starts in a held state and does not go straight
back into service. See [recovery](reference/recovery.md).

## C · Local Windows stack

From the repository root, with Docker Desktop and Ollama running:

```powershell
python scripts/local_stack.py init
python scripts/local_stack.py start postgres
python scripts/local_stack.py start memorygate
python scripts/local_stack.py start toolgate
python scripts/local_stack.py start decisions
python scripts/local_stack.py start pi
python scripts/local_stack.py start gateway
```

Open https://localhost:8050. State and logs are in `.local-run/`, which Git ignores. After
`npm run build`, restart the gateway to serve the new build.

Details: [reference/local-windows.md](reference/local-windows.md).

## Models

- **Default:** local models through Ollama, free and private. Small CPU models such as Qwen 2.5 3B
  work but are weak.
- **Better answers:** add a hosted provider with `conker providers set`, `verify` and
  `activate`, then choose its model in Settings. Every turn shows which provider answered.
- **Routing (optional):** the Laya decision service picks a model for each message. It takes about
  2 GB RAM and about 0.3 s per decision on CPU, and only sees the latest message.

Provider keys are host-only files, never browser settings or `.env` values. See
[hosted provider credentials](reference/provider-credentials.md) for rotation,
interruption recovery, issuer revocation and backup behavior.

## Security in one paragraph

Only the HTTPS gateway is reachable, and only from your private network. Services have no host
ports. Containers get no Docker socket or host filesystem. Anyone in the host's `docker` group
effectively has root. Hosted models, downloads and tools can still reach the internet. More detail:
[browser authentication](reference/browser-auth.md).
