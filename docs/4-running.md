# 4 · Running Conker

Pick one way. The two server layouts run the same services; use one per machine and never point
both at the same stores.

| Way | Supported for | Updates | Needs |
|---|---|---|---|
| [A · Preview](#a--preview-the-interface) | Looking around, UI work | `git pull` | Node.js 22.12+ |
| [B · Server: repository install](#b--server) | A new Linux machine: trying Conker or running it without building anything | `./conker update` follows the checkout's branch: staged, health-checked, rolled back on failure | Linux (or WSL2) with Docker; about 16 GB of RAM for local models |
| [B · Server: source-built Ubuntu](#source-built-ubuntu-layout) | The owner's server, and anyone who wants releases offered in the Inbox | Releases only: the Inbox's Update or `conker update --to X.Y.Z`, snapshot first, rollback, a daily check for new releases | Ubuntu with Docker; builds every service from source on the server |
| [C · Local Windows stack](#c--local-windows-stack) | Developing the connected app; never a server | Rebuild from the pins | Docker Desktop, Python 3.12, Node.js 22.12+, Ollama |

## A · Preview the interface

Sample data, no backend, nothing leaves your machine.

```sh
cd dashboard
npm ci
npm run dev -- --host localhost --port 5173 --strictPort
```

Open http://localhost:5173. A preview is not a connected installation: it cannot prove memory,
tools or scheduled work.

## B · Server

### Install

```sh
git clone https://github.com/Conker-AI/conker.git
cd conker
./install.sh
```

The installer checks the machine, generates every secret, pulls the images pinned in
`versions.env`, starts them, waits for real health and prints one address. Run it again at any
time: it repairs rather than duplicates, and it keeps existing secrets. `./install.sh --check` only
checks the machine; `--yes` accepts every default.

At the end it offers `./conker setup`, a guided first run that asks one plain question at a time:
your browser password, the companion, the answer model, memory, tools and their limits, backups,
and a short test run. Stop it with Ctrl+C and run it again to continue where you left off.

Only the gateway gets a port, on `127.0.0.1`. To reach Conker from your phone or laptop,
`./conker tailscale` walks you through a private path over Tailscale. Do not expose it to the
internet.

### Day to day

```sh
conker status        # is everything working, and what isn't
conker doctor        # the same findings as the System screen, with recovery actions
conker update        # a pinned release, staged and health-checked, with rollback
conker update --to X.Y.Z  # the same on source-built Ubuntu, to a named release
conker config list   # every setting from the Settings screen
conker backup        # a verified snapshot
conker logs pi       # recent logs of one service
conker stop / start / restart
conker ops           # recent server actions and how they ended
```

Weekly checks, backups, updates and restores step by step (source-built Ubuntu): [looking after
your server](reference/server-care.md).

<details>
<summary>More commands, with an example (all of them: <code>conker help</code>)</summary>

```sh
conker apply models models.json # apply a revision-checked model-role document
conker apply agents agent.json # create, update, archive, or restore a profile
conker apply projects project.json # manage metadata and bounded source links
conker apply teams team.json # edit versioned team definitions only
conker apply jobs job.json # pause/resume or admit one durable manual run
conker apply memory forget.json # forget one reviewed revision everywhere
conker apply proposals decision.json # accept, decline, or suppress one proposal
conker apply requests request.json # approve, decline, or record the saved draft of one of Conker's requests
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
conker apply tools tool.json # save, publish, grant, or durably run a workflow or tool
conker setup                  # guided first run; it continues where you left off
conker setup status           # verified first-run state and next operation
conker setup run companion --accept # keep the supplied durable harness profile
conker setup models           # candidates, readiness, data location, and cost notice
conker setup run model CANDIDATE_ID # choose and verify one candidate with a live response
conker setup run memory --skip # or --include to return it to the guided path
conker setup run capabilities --skip # or --include
conker setup run boundaries --confirm-digest REVIEWED_SHA256
conker setup rehearsal      # current conversation, memory-review and approval proof
conker setup run rehearsal --review-memory
conker setup run rehearsal --start-approval
conker setup run rehearsal --finish-approval REQUEST_ID
conker setup run rehearsal --finalize
```

</details>

### Source-built Ubuntu layout

Builds each service from reviewed source exports on the server instead of pulling images. Only
this layout updates to a named release (Inbox or `conker update --to`), recovers an update a reboot
cut off and runs the Claude plan runtime today; it has scoped credentials and no single admin key.
The repository install's optional parts are Compose overlays that `versions.env` turns on: the agent
sandbox and direct providers (on), the owner terminal (frozen) and the Claude plan runtime (on
once a release publishes its image; until then connect Claude with an API key).

Full guide: [deploy/ubuntu/README.md](../deploy/ubuntu/README.md). The shared runtime contract
and the one packaging difference are recorded in [deployment parity](reference/deployment-parity.md).

### Commands in detail

`conker help` is the authoritative command list in both installation layouts. Every command
group it lists has a page here or under [reference](reference/) (tests/test_cli_docs.py); the
owner's own ones are [agents and teams](reference/agents-cli.md),
[memory](reference/memory-cli.md), [spending](reference/spending-cli.md) and
[chat](reference/chat-cli.md); hosted keys are in [provider
credentials](reference/provider-credentials.md).

`conker model NAME` fetches another local model into Ollama (`conker model qwen3:4b`).
`conker key` shows the repository layout's single admin key; the Ubuntu layout has separate
scoped keys and refuses it.

The long form of each command (provider sign-in, `conker apply` documents, `setup run` steps, repository updates) is in [command details](reference/command-details.md).

### Reset the password

```sh
conker auth reset-password
```

This asks for the new password privately and signs out every browser; limits in [browser
authentication](reference/browser-auth.md#password-and-recovery-for-the-owner).

### Backups

`conker backup` makes a verified snapshot and `conker restore SNAPSHOT --into DIR` restores it
into a held, isolated copy; the nightly backup and weekly restore drill stay off until
`conker backup schedule on [--drill weekly]`. Steps: [looking after your
server](reference/server-care.md#set-up-backups-once); details: [recovery](reference/recovery.md).

### Server actions and the host helper

The host helper is the private provider-control service (`conker providers install-ui-control`)
grown to run a fixed list of server actions for the UI ([ADR-0014](adr/0014-server-actions-through-one-host-helper.md)).
Only the gateway can reach it, and it runs the same `conker` commands, never a shell.

```sh
conker ops                                     # recent server actions, newest first
conker ops show ID                             # one receipt as JSON
conker ops run services.status                 # each service's state
conker ops run services.restart service=memorygate
conker ops run update.check                    # check for a new release now (waits for the result)
conker ops run backup.list                     # the saved backup folder and its snapshots
conker ops run backup.verify snapshot=snapshot-20261029T040000Z-1a2b3c4d
conker ops run backup.run                      # back up to the saved folder, verify, keep the set number
```

One action runs at a time, and none starts while a backup or a held recovery is in progress.
Each leaves a receipt in `state/host-ops/journal.jsonl` (`.conker/host-ops/` in the repository
layout): what ran, when, done or failed and why. No secrets, no command output. **Unknown** means
the action was cut off (the helper restarted, or `conker ops run` was interrupted); it is never
retried by itself. Run the check the receipt names, then decide. `conker ops` reads the journal
directly, so it works when the helper is down, and the plain commands (`conker restart SERVICE`,
`conker backup`) keep working without it. Restarting Pi (`conker restart pi`, the
`services.restart` action, or `conker restart`) also restarts the services that share its network
namespace, the Claude plan runtime and Laya, after it, so they are not left without a network. When
Pi restarts on its own (it does to finish **Delete forever**, or after a crash), both notice they
are left with loopback only within 2 s, exit, and Docker starts them again in Pi's new namespace.

## C · Local Windows stack

For the current connected workspace, from the repository root with Docker Desktop
and Ollama running:

```powershell
ollama pull qwen2.5:3b
python scripts/workspace.py install --model qwen2.5:3b
python scripts/workspace.py up
```

Open https://localhost:18550. State and logs are in `.local-run/`, which Git ignores; the
first password is in `.local-run/gateway/initial-owner-password.txt`.

Full instructions and optional-service limits:
[Connected workspace](reference/connected-workspace.md). The older multi-repository backend
harness is documented separately in [Local Windows reference](reference/local-windows.md);
its ports and lifecycle commands are not interchangeable with this workspace.

## Models

- **Local:** models run through Ollama without a per-request provider charge.
  Hardware, model size and task complexity affect response quality and latency.
- **Hosted:** configure a provider, check availability and select its model. The
  connected turn records which provider answered. Host API-key lifecycle commands
  include `conker providers set`, `verify` and `activate`.
- **Subscription runtimes:** the enhanced local profile, and the Claude plan runtime of
  the Ubuntu layout (below), connect native ChatGPT and Claude Code sign-in separately from
  API keys. Connecting does not select or
  verify a model. See [Harnesses and model roles](reference/harnesses-and-models.md).
- **Auto and thinking:** optional Laya chooses among eligible answer models using
  model descriptions and bounded conversation context. This is not a guarantee of
  best-model selection or fixed latency. A separately assigned thinking model runs
  only for explicit Think requests and uses its own provider allowance.

Provider keys are host-only files, never browser settings or `.env` values. See
[hosted provider credentials](reference/provider-credentials.md) for rotation,
interruption recovery, issuer revocation and backup behavior.

### Connect Claude

The server keeps the tools, folders, commands and internet; the thinking can run on Claude.
There are two ways to connect it, and they differ by layout:

| Layout | Claude plan (subscription) | Anthropic API key (billed per request) |
|---|---|---|
| Source-built Ubuntu (`deploy/ubuntu`) | `conker providers claude login`, once | `conker providers set anthropic` |
| Repository install (`./install.sh`) | `./install.sh --claude-plan`, once a release pins the image ([Claude plan runtime](reference/claude-plan-runtime.md)) | `conker providers set anthropic` |
| Windows workspace (C) | Settings > Providers, or `python scripts/conker.py auth claude login`, after `workspace.py enhance` | Not wired |

**Claude plan on the Ubuntu layout.** The runtime is the `subscriptions` service, built from
the source export ([how it is boxed in](reference/claude-plan-runtime.md)); its sign-in stays in
`state/subscriptions` and is not in snapshots. Once, after updating the source export:

```sh
python3 sources/companion/deploy/ubuntu/prepare.py https://HOST:8443   # adds the service and keys
docker compose -f compose.json up -d --build
conker providers claude login    # open the link it prints in any browser, sign in to
                                 # your Claude account, paste the code it shows back here
conker providers claude status   # "connected": true
```

Then choose a Claude model (`sonnet`, `opus` or `haiku` under Claude Code) for each role in
Settings > Models > Model roles. `conker providers claude logout` signs out. Signing in happens
only in the terminal: the server cannot receive the browser's sign-in callback, and the
Settings sign-in button stays unavailable on the server until the Gateway can reach this
runtime. No token is copied in or out.

**API key, both server layouts.** `conker providers set anthropic`, then `verify` and
`activate`; Pi answers only after `conker providers spending on` (until then: "paid models are
disabled"). Steps, rotation and the Settings worker: [hosted provider
credentials](reference/provider-credentials.md#add-or-rotate-a-credential).

### Which command makes a tool

`conker tool draft "what it should do"` (`python scripts/conker.py tool draft` in the workspace)
has Pi draft the tool and puts it in the Inbox for review; flags, exit codes and answering the
drafter: [workflow builder](reference/workflow-builder.md).

## Security in one paragraph

The server container profile exposes its HTTPS gateway for private-network access.
The local workspace uses owned loopback listeners and dedicated host processes.
The optional Windows owner terminal has host-account access, not container
isolation. Anyone in the host's `docker` group effectively has root. Hosted
models, downloads and tools can reach the internet. More detail:
[browser authentication](reference/browser-auth.md).
