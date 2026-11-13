# Status

What works today, what has been proven where, and what is still missing. Three files back this
page and answer different questions: [`capabilities.json`](../capabilities.json) is the executable
inventory of what the source can do, [`versions.env`](../versions.env) pins the release, and a
[release-acceptance](reference/release-acceptance.md) evidence bundle is the only proof that an
assembled deployment works. One never stands in for another.

Last updated **13 November 2026**. The family counts, the release table and the deferred table
are written by `python scripts/status_page.py` from `capabilities.json` and `versions.env`; CI
fails when they drift.

<!-- generated:families -->
The source has **41 tracked
capability families: 40 active and 1 deferred**. Active means a real
product surface exists; it does not by itself mean the screen, the CLI and the gateway all reach
it, or that a server runs it.
<!-- /generated:families -->

## The current release

<!-- generated:release -->
| Service | Version | |
|---|---|---|
| Pi and the Gateway | 0.24.0 | Conversations, model roles for every AI job, direct providers (OpenAI, Anthropic, Gemini, xAI, Mistral, DeepSeek, Groq, OpenRouter), access, Inbox, tool drafting, imports and exports |
| ToolGate | 0.15.1 | Tools, approvals, spending, the agent sandbox, draft checks, owner tool settings |
| MemoryGate | 0.8.2 | Memory with sources; its AI through Pi |
| SystemGate | 0.5.2 | Read-only view of the machine |
| Embeddings | 0.1.7 | Text to vectors |
| Agent sandbox | active | Terminal and Install packages for agents |
| Owner terminal | deferred | See Deferred below |
<!-- /generated:release -->

Every image is published at `ghcr.io/conker-ai/<service>:<version>` and pinned in `versions.env`.

## What works

"Proven" names the most recent run on real services. "Built" means implemented and covered by
tests, but not yet exercised end to end on an installed stack.

| Area | What you can do | Proven |
|---|---|---|
| **Install and run** | `./install.sh`, the guided `./conker setup`, `status`, `update` with rollback, `backup`, held `restore` | Fresh install of main on Linux (WSL2), 27 October: every service healthy, Conker's built-in tools usable with no admin step. Owner's server (source-built layout), 7 November: updated to Pi 0.24.0 and ToolGate 0.15.1 after a verified snapshot; `conker status` all ok |
| **Chat** | Chats and drafts, stop, steer and queue, regenerate and branch, search, Think in the background, recovery after a lost connection | Installed stack, 27 to 28 October |
| **Models** | Local models through Ollama; OpenRouter, OpenAI and Anthropic keys; ChatGPT and Claude plan sign-in (Claude plan on a server: the Ubuntu layout's Claude plan runtime, `conker providers claude login`; not yet in the repository install); a model per role (answer, thinking, reviewer, helpers); Auto; plan usage alerts | Installed stack with local models, 28 October. Hosted providers: built. Claude plan on the owner's server, 31 October: signed in, Sonnet answers chats |
| **Access** | Per chat, agent and tool: run, let the AI reviewer decide, or ask. A floor of actions always asks. The owner's switch for each tool Conker may use | Installed stack, 28 October: reviewer 5 of 5 (a harmless command ran, a deletion asked, a "no" closed it) |
| **Sign-in** | The password at sign-in is enough while you use Conker; it signs the browser out after the time set in Settings > Account (default 15 minutes) with no click or key press. The password is asked again only for forgetting, deleting and paying, security settings (password, sign-in time, access grants, keys) and the terminal | Pi 0.20.0: gateway tests and the sign-in mutation drill (37 of 37 caught), 6 November |
| **Inbox** | One card per approval, request and idea; Do it, Don't, Change; Conker's own questions; requests wait until answered, then run once within 15 minutes | Installed stack, 28 October: 13 of 13 decision paths, and a request still approvable after 21 minutes |
| **Agent sandbox** | Terminal and Install packages in a fresh locked-down container per command, no network, packages through a read-only proxy | Owner's server and installed stack, 27 October: a command ran, a package installed through the proxy, network lookups failed as they should. Owner's server on ToolGate 0.14.0, 7 November: a misspelt package name was refused before approval, an approved install went through the proxy and a command imported it |
| **Memory** | Memories with their sources, the memory map, correct and forget from the screen and the CLI (many at once), delivery receipts; chats and imported chats deleted forever | Built; source checks on Windows, 10 October. Deleting forever and bulk forget: Pi 0.22.0 suite (3890 passed) and the forgetting audit drill (29 of 29 caught), 7 November |
| **Cron jobs** | The owner's instructions run by the AI with tools, on a schedule, an event or a webhook; workflows drafted from words | Local stack, 23 October: offers appear in the Inbox. Drafting needs a larger model than a 3B CPU model |
| **Settings** | 102 settings that take effect (221 more planned), one pattern, search, changed-only view, planned ones hidden until asked for; `conker config` from the terminal | Installed stack and the owner's server on Pi 0.11.0, 28 October: 9 of 9 save and refusal checks, `conker config` set and reset; screens checked at phone and desktop, light and dark |
| **Projects, agents, teams** | Projects with sources, agent profiles with their own toolkits, teams | Built |
| **Home** | Today at a glance (what needs you, plan allowance, coming up, Conker's work), and **Jump back in**: unpublished tool and workflow drafts, unsent messages, the last chats opened in this browser and tasks in progress, one click from where you left them | Built; checked in the preview at phone and desktop, light and dark, 12 November |
| **Lists** | Every list (chats, agents, projects, artifacts, cron jobs, teams, skills, MCP tools, tools, tool drafts, imported sessions) can be searched and sorted; lists with a write action also filter, select many and archive, pause or turn off in bulk, with one Undo | Built; checked in the preview at phone and desktop, light and dark, 6 November. |
| **Calls and voice** | Voice turns in a call | Built; needs a configured speech service |
| **Phone app** | Add Conker to the home screen (its icon, a fast start, a plain offline page); on a phone a chat fills the screen, the composer stays above the keyboard, and the back arrow or a swipe right returns to Chats | Built; checked in a phone-sized browser with the keyboard simulated. Installing needs Pi's gateway to allow the web manifest (`manifest-src 'self'`); not yet tried on a real phone |

## Deferred

<!-- generated:deferred -->
| Capability | Why it is deferred | What it still needs |
| --- | --- | --- |
| Owner terminal | The constrained gateway PTY is not configured or mounted by the release deployment, and its fixture screen is not a connected product route. | operator-selected validated workspace; digest-pinned owner-terminal registry image; hashed target-Linux acceptance bundle; explicit owner terminal transport; production UI |
<!-- /generated:deferred -->

## Known gaps

- **Small CPU models are the weak spot.** A 3B model sometimes breaks the tool-call format, a 4B
  reviewer on a 4-core CPU can take minutes and time out, and workflow drafts need a larger or
  hosted model.
- **An answer can be lost** if Pi restarts while delivering it.
- **The profile photo is kept per browser** for now.
- **Some settings say "Not used yet":** they are saved, and the feature that reads them comes later.

Open work is tracked in [GitHub issues](https://github.com/Conker-AI/conker/issues).

## Release blockers

1. Run assembled acceptance for the exact current manifest on Linux and keep its evidence bundle.
2. Exercise the CLI inspection and mutation families against the assembled Linux services, with
   redacted evidence.
3. Run the source-built Ubuntu backup and isolated held-restore drill on the Linux host
   (`conker backup drill` scripts it; not yet run there).
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
