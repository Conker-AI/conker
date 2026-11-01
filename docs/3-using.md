# 3 · Using Conker

This guide describes the connected chat workspace. A development preview uses
simulated services; a connected installation reports real readiness and errors.
Optional capabilities depend on the host configuration. [Status](status.md)
records tested scope and remaining release work.

## Sign in and start a chat

Open your Conker address and enter the owner password. The local workspace uses
`https://localhost:18550`; its initial password location and recovery commands are
in [Connected workspace](reference/connected-workspace.md). Chat messages use your signed-in
session. Protected changes ask for owner verification for the exact operation.

Conker opens at **Home**: what needs you, what is coming up, and how much of each
plan is left. **Ask Conker** at the top of the sidebar starts a new chat. Choose an
agent and model if needed, type a message and send it. **Chats** lists existing conversations; **Load older** reads another
page. Its search matches saved titles and summaries. Global search with
**Ctrl/Cmd+K** also offers page navigation and source-specific search results,
including coverage notices when a source is incomplete or unavailable.

The sidebar shows recent chats. Conversations created from another client appear
on its next visible refresh. An open chat also checks for saved changes from
other clients; delayed updates offer a read-only check. Refreshing does not resume
or resend work.

## Find your way around

The sidebar has three groups. Everything else is one search away (**Ctrl/Cmd+K**).

| Group | Screens |
|---|---|
| **Overview** | **Home** (what needs you today), **Inbox** (every decision waiting for you), **Chats** |
| **Workspace** | **Projects**, **Memory**, **Agents** (with teams and skills), **Tools**, **Cron jobs** |
| **System** | **Server** (health, processes, ports, containers, files), **Settings** |

## Decide in the Inbox

Everything that waits for you is one card in the **Inbox**: a tool that needs your OK,
something Conker asks to create (a cron job, a tool, a memory), an idea, or a note from
an AI job. Each card says what it is, who asked and how long it has waited, and offers
the buttons that fit it, such as **Do it**, **Don't** and **Change**. **Change** sends
your words back to the chat as your next message.

A request waits as long as it takes. Once you approve, that exact action may run once
within 15 minutes; a changed argument needs a new approval. Answering a card continues
the work in its chat by itself. Which actions ask you at all depends on the chat, the
agent and the tool; the defaults are in **Settings > Access and safety**.

## Change a setting

**Settings** lists every topic on the left (on a phone, tap a topic to open it). Each
setting is one row: its name, one line on what it does, the control, and **Reset**
once it differs from the default. **Search settings** finds any of them; **Changed
only** shows what you changed; **Show advanced** reveals the rest. A row marked
**Not used yet** is saved now and read by a feature that comes later.

The same settings work from the terminal:

```sh
conker config list --group appearance
conker config set appearance.accent blue
conker config reset appearance.accent
```

## Keep talking while Conker thinks

In **Settings > Models**, choose a **Talking model** and, optionally, a separate
**Thinking model**. In a Companion chat, enable **Think** for the next message to
request background analysis. Ordinary messages do not start it automatically.

The thinking card identifies the message being analyzed. You can continue talking,
cancel that analysis, or read its findings when ready. **Discuss these findings**
adds them to your draft for review and sending. A new Think request replaces
unfinished analysis; an ordinary follow-up keeps it. Thinking runs no tools and
uses its provider's allowance separately from the talking reply.

Choose a fixed model in the composer to override the default. **Auto** uses the
configured router and eligible models; it is available only when routing is
enabled. Open the saved turn details to inspect which model answered, routing
attempts, fallback and available usage. A selected model is not proof of a
successful response.

## Connect providers and assign roles

**Settings > Models** holds the talking and thinking choices, and under **Providers**
the provider connections, the model catalogue and the role assignments. Context selection, summarization, ranking and proposals can use
their own configured roles.

For the enhanced local profile, choose **Sign in with ChatGPT** or **Sign in with
Claude subscription** and complete the displayed provider flow yourself. Native
provider runtimes keep their credentials in separate Conker-owned directories.
Existing desktop/CLI account stores are not imported. Sign-in does not select
a model, grant tools or prove that the account can run a particular model.
Inspect readiness, add the supported model to the catalogue, and choose its role.
Provider allowance and availability still apply.

If sign-in, cancellation or disconnect cannot be confirmed, use **Check status**.
This reads the latest connection without repeating the operation. The earlier
request may still have changed authorization. Automatic checks run only while a
sign-in is pending and pause when the page is hidden, offline or their check limit
is reached; the card offers a manual check. A ChatGPT device code belongs to one
sign-in attempt and is not saved across page reloads.

**Connections > Refresh** checks provider status without changing your
model draft. While a check is pending or unavailable, retained names are labeled
as last checked. A stalled check offers **Try again** after 15 seconds. An
OpenRouter catalogue can be cached, so its presence means **Connected, not
tested**. An explicit model test in Setup verifies a response for the saved
configuration; opening Settings does not run that test or spend inference usage.

API keys (the **API keys** row) are a separate connection with their own spending controls.
If saving a key or changing spending cannot be confirmed, use **Check status**
in the API keys sheet before another action. This reads the server without repeating the
change; the earlier request may still finish. A refresh temporarily labels
retained settings as last checked. Changing the owner or server connection clears
an unsent key. See [Hosted provider credentials](reference/provider-credentials.md)
for verification, activation and recovery.

**How much of a plan is left.** `python scripts/conker.py limits` shows each ChatGPT
and Claude plan window in percent, with its reset time. It costs no model call. Pi
also checks every 15 minutes. When a window passes your level (`plans.alert_percent`,
default 80), the Inbox gets a heads-up, and a reset line when the window resets.
`limits --alerts` lists Pi's readings and open alerts. `limits --dismiss ID` hides
one alert until its window resets. Turn the alerts off with
`conker config set plans.alerts off`.

Model-role calls through a subscription runtime remain distinct from a full
native-agent session. For host CLI commands and installation requirements, see
[Harnesses and model roles](reference/harnesses-and-models.md).

## Inspect native sessions

Open **Native sessions** in Work, or **System > Native sessions**, and choose a
provider. This directory reads Conker's isolated native profiles and is separate
from Chats and other CLI installations' history.

For **Codex**, choose **Unarchived** or **Archived**, then load more pages as
needed. Search matches only loaded threads. Select a thread for saved metadata
and a bounded preview. This connection cannot tell whether work is running in
another Codex process; it does not display a live activity state.

Copy the exact resume command and run it manually from the Conker repository
root to open that conversation in Codex. Resuming can run native work and keeps
Codex's own permission prompts. Reading this page does not resume the thread.

For **Claude Code**, inspect background sessions. Interactive Claude sessions are outside its scope;
the page reports omitted entries and list truncation.

Select a session to check its current native state and working directory.
**Read output** loads a bounded plain-text snapshot on request. It does not
subscribe to a stream or save a transcript in Conker. Changing the selection
or signing out clears the displayed output. A failed check labels retained
information as last checked instead of claiming that the session disappeared.

**Stop** asks for owner verification of that exact session. An acknowledged
request means Stop was requested; check status to learn its current state.
After a lost response, check status before considering another Stop. Conker
does not repeat the operation automatically. Stopping cannot undo completed
actions or provider usage.

The displayed attach command runs manually from the Conker repository root
and uses the same isolated profile. Attaching can resume native work. Native
permission and approval prompts remain in Claude; this view does not answer
them. Closing a terminal does not establish that a background session stopped.
See [Native sessions](reference/native-sessions.md) for CLI commands and limits.

## Drafts, Stop and recovery

Unsent drafts save privately on the server with their model, skills, research
mode and Think choice. The new-chat draft also retains agent, title and privacy.
Watch the saved state beside the composer: reload restores acknowledged saves;
an unconfirmed edit is not guaranteed to survive. Concurrent edits offer a choice
between the saved version and this tab's version.

**Stop** interrupts the talking request. **Cancel thinking** targets background
analysis. Closing a tab does neither. A completed tool action or provider usage
cannot be undone by cancellation.

After a lost send or action response, use the displayed status/recovery action
before sending again. A saved submission may already exist. If a tool completed
but the reply failed, **Ask only for the reply** can continue without rerunning
the action. Approval requests link to Inbox; approve or deny the exact request,
then continue the waiting turn when prompted.

## Memory and chat privacy

Open **Memory** to inspect retained evidence and memories with their sources.
A message saying “I remember” does not prove delivery. Check its **Remembered**
receipt and the answer's retrieval details. Pending delivery can be checked
without resending the message.

With memory enabled, a direct request beginning **“Remember that…”** or
**“Запомни, что…”** asks to retain that statement. Quoted examples and questions
do not force admission. **“Don't remember…”** excludes that statement from active
memory; use **Forget this memory** to remove an existing reviewed record. Forgetting
one memory keeps its source chat. If a deletion remains uncertain, the recovery
control reconciles the same request and can complete that deletion; it does not
choose a different record to delete.
To correct retained wording, select **Edit memory**. Conker loads the full current
text and revision for review; it does not edit a shortened library preview.
Save the change and complete owner verification. Editing changes the text of a
Companion memory while preserving its source and confidence, including whether
it was inferred. It keeps the source conversation. Other record kinds and
namespaces remain read-only. Finish or stop active work before making a change.

If saving is unconfirmed, **Check status** reads the original receipt without
resending the edit. **Retry approved change** is a separate, explicit action that
can send only the exact previously approved text. Recall pauses while that
correction remains unresolved. A changed revision requires a fresh review;
an unavailable read never proves that the previous edit failed. Closing the
editor discards unsent text. Text being saved and search indexing being ready are
separate results.

Conker remembers across chats: what it learned in one chat can come up in any other.
To keep every chat to itself, turn off **Settings > Memory > Remember across chats**
(or `./conker config set memory.across_chats off`); it applies from the next answer.
The Companion's own **Memory access** in **Agents** can narrow it further. Neither choice
grants tools or enables memory for other agents.

The chat's **Incognito** control opens two independent future-message choices:

- Turn off **Use memory** to stop recall and learning for those future messages.
- Turn off **Use assistant tools** to disable the harness, including routing and
  background thinking; choose an explicit answer model.

Messages still stay in chat history. These switches do not delete earlier memory
or make a hosted model local. Use the explicit forget action for retained content.
Private chats remain available to their owner in Chats while source policy limits
their reuse elsewhere.

A fork carrying restricted context retains that restriction through linked
summaries. Removing an exact pin does not make a summary independent of it.
Start a new independent chat when you need a conversation without that context.

## Where other work lives

| Screen | Use it for |
|---|---|
| **Projects** | Project metadata and selected source links. |
| **Memory** | What Conker remembers, the map of how it connects, and the chat each memory came from. Correct or forget any memory here. |
| **Agents** | Profiles with their own model, toolkit and memory; teams and reusable skills. Instructions do not grant execution rights. |
| **Tools** | Registered tools, workflow drafts, publication and runs, and which tools Conker may use. |
| **Cron jobs** | Your instructions run by the AI with tools, on a schedule, an event or a webhook, and their recorded runs. |
| **Server** | Diagnostics and host observations. The production owner terminal remains deferred. |
| **Tasks, runs and the activity log** | Recorded work and events, from search or the pages that link to them. |
| **Artifacts** | Saved owner content and its versions. |
| **Settings > Companion** | Character, speaking style and voice. Full 3D appearance and voice cloning are not connected. |

Calls support durable typed turns and bounded English voice turns when a compatible
speech service is configured. Microphone capture begins only after your click;
audio is transient while transcripts remain in the call conversation. Camera,
continuous streaming and incoming calls remain unconnected. Configure speech on
the host with `conker speech configure`; inspect it with `conker speech status`.

The host CLI and UI share many operations, but not complete parity. Downloads,
backups, restoration and service lifecycle retain host-only paths. See
[Running Conker](4-running.md) for those commands.
