# Status

What works today, what has been proven where, and what is still missing. Three files back this
page and answer different questions: [`capabilities.json`](../capabilities.json) is the executable
inventory of what the source can do, [`versions.env`](../versions.env) pins the release, and a
[release-acceptance](reference/release-acceptance.md) evidence bundle is the only proof that an
assembled deployment works. One never stands in for another.

Last updated **28 October 2026**. The source has **44 tracked
capability families: 43 active and 1 deferred**. Active means a real product surface exists; it
does not by itself mean the screen, the CLI and the gateway all reach it, or that a server runs it.

## The current release

| Service | Version | |
|---|---|---|
| Pi and the Gateway | 0.12.0 | Conversations, model roles, access, Inbox, owner settings |
| ToolGate | 0.9.1 | Tools, approvals, spending, the agent sandbox |
| MemoryGate | 0.6.0 | Memory with sources |
| SystemGate | 0.4.0 | Read-only view of the machine |
| Embeddings | 0.1.4 | Text to vectors |
| Agent sandbox | active | Terminal and Install packages for agents |
| Owner terminal | deferred | See below |

Every image is published at `ghcr.io/conker-ai/<service>:<version>` and pinned in `versions.env`.

## What works

"Proven" names the most recent run on real services. "Built" means implemented and covered by
tests, but not yet exercised end to end on an installed stack.

| Area | What you can do | Proven |
|---|---|---|
| **Install and run** | `./install.sh`, the guided `./conker setup`, `status`, `update` with rollback, `backup`, held `restore` | Fresh install of main on Linux (WSL2), 27 October: every service healthy, Conker's built-in tools usable with no admin step. Owner's server (source-built layout), 28 October: updated to this release after a verified backup; "Everything is working" |
| **Chat** | Chats and drafts, stop, steer and queue, regenerate and branch, search, Think in the background, recovery after a lost connection | Installed stack, 27 to 28 October |
| **Models** | Local models through Ollama; OpenRouter, OpenAI and Anthropic keys; ChatGPT and Claude plan sign-in (Claude plan on a server: the Ubuntu layout's Claude plan runtime, `conker providers claude login`; not yet in the repository install); a model per role (answer, thinking, reviewer, helpers); Auto; plan usage alerts | Installed stack with local models, 28 October. Hosted providers: built. Claude plan runtime: image built and started signed out in CI, not yet signed in on a server |
| **Access** | Per chat, agent and tool: run, let the AI reviewer decide, or ask. A floor of actions always asks. The owner's switch for each tool Conker may use | Installed stack, 28 October: reviewer 5 of 5 (a harmless command ran, a deletion asked, a "no" closed it) |
| **Inbox** | One card per approval, request and idea; Do it, Don't, Change; Conker's own questions; requests wait until answered, then run once within 15 minutes | Installed stack, 28 October: 13 of 13 decision paths, and a request still approvable after 21 minutes |
| **Agent sandbox** | Terminal and Install packages in a fresh locked-down container per command, no network, packages through a read-only proxy | Owner's server and installed stack, 27 October: a command ran, a package installed through the proxy, network lookups failed as they should. Owner's server on this release, 28 October: a command ran from chat |
| **Memory** | Memories with their sources, the memory map, correct and forget from the screen and the CLI, delivery receipts | Built; source checks on Windows, 10 October |
| **Cron jobs** | The owner's instructions run by the AI with tools, on a schedule, an event or a webhook; workflows drafted from words | Local stack, 23 October: offers appear in the Inbox. Drafting needs a larger model than a 3B CPU model |
| **Settings** | 401 settings in 31 topics, one pattern, search, changed-only view; `conker config` from the terminal | Installed stack and the owner's server on Pi 0.11.0, 28 October: 9 of 9 save and refusal checks, `conker config` set and reset; screens checked at phone and desktop, light and dark |
| **Projects, agents, teams** | Projects with sources, agent profiles with their own toolkits, teams | Built |
| **Calls and voice** | Voice turns in a call | Built; needs a configured speech service |

## Deferred

| Capability | Why it is deferred |
| --- | --- |
| Owner terminal | The constrained PTY, UI, candidate image, health probe, workspace preflight, recovery exclusions and guarded deployment shapes exist. Manifest v2 records the capability as deferred and needs both a registry digest and hashed target-Linux acceptance to activate it; neither exists yet. |

## Known gaps

- **Small CPU models are the weak spot.** A 3B model sometimes breaks the tool-call format, a 4B
  reviewer on a 4-core CPU can take minutes and time out, and workflow drafts need a larger or
  hosted model.
- **An answer can be lost** if Pi restarts while delivering it.
- **The profile photo is kept per browser** for now.
- **Some settings say "Not used yet":** they are saved, and the feature that reads them comes later.
- When a chat has no context settings, the error suggests `conker context budget`, a command that
  exists only in the development CLI.

Open work is tracked in [GitHub issues](https://github.com/Conker-AI/conker/issues).

## Release blockers

1. Run assembled acceptance for the exact current manifest on Linux and keep its evidence bundle.
2. Exercise the CLI inspection and mutation families against the assembled Linux services, with
   redacted evidence.
3. Run the source-built Ubuntu backup and isolated held-restore drill on the Linux host.
4. Package and accept the owner terminal, or keep it deferred from the release; exercise the
   voice path with a configured speech service.
5. Pin the dashboard revision and module releases only after those pass.

The latest completed Ubuntu acceptance is the
[23 September 2026 run](../deploy/ubuntu/acceptance-2026-09-23.md). It proves that older build,
not the current one.

## History

Every verification before this page was rewritten, with its full detail, is in the
[status log up to 28 October 2026](https://github.com/Conker-AI/conker/blob/af68cfb78ce738ba75ba779c4da371219583762e/docs/status.md).
Changes by release are in the [changelog](../CHANGELOG.md).
