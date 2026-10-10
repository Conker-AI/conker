# 3 · Using Conker

This guide describes the connected chat workspace. A development preview uses
simulated services; a connected installation reports real readiness and errors.
Optional capabilities depend on the host configuration. [Status](status.md)
records tested scope and remaining release work.

## Sign in and start a chat

Open your Conker address and enter the owner password. The local workspace uses
`https://localhost:18550`; its initial password location and recovery commands are
in [Connected workspace](connected-workspace.md). Chat messages use your signed-in
session. Protected changes ask for owner verification for the exact operation.

Conker opens at **New chat**. Choose an agent and model if needed, type a message
and send it. **Chats** lists existing conversations; **Load older** reads another
page. Its search matches saved titles and summaries. Global search with
**Ctrl/Cmd+K** also offers page navigation and source-specific search results,
including coverage notices when a source is incomplete or unavailable.

The sidebar shows recent chats. Conversations created from another client appear
on its next visible refresh. An open chat also checks for saved changes from
other clients; delayed updates offer a read-only check. Refreshing does not resume
or resend work.

## Keep talking while Conker thinks

In **Settings > General**, choose a **Talking model** and, optionally, a separate
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

**Settings > Providers** contains provider connections, the model catalogue and
advanced role assignments. General keeps the common talking/thinking choices
close at hand. Context selection, summarization, ranking and proposals can use
their own configured roles.

For the enhanced local profile, choose **Sign in with ChatGPT** or **Sign in with
Claude subscription** and complete the displayed provider flow yourself. Native
provider runtimes keep their credentials in separate Conker-owned directories.
Existing desktop/CLI account stores are not imported. Sign-in does not select
a model, grant tools or prove that the account can run a particular model.
Inspect readiness, add the supported model to the catalogue, and choose its role.
Provider allowance and availability still apply.

**Runtime readiness > Refresh** checks provider status without changing your
model draft. While a check is pending or unavailable, retained names are labeled
as last checked. A stalled check offers **Try again** after 15 seconds. An
OpenRouter catalogue can be cached, so its presence means **Configured, inference
not verified**. An explicit model test in Setup verifies a response for the saved
configuration; opening Settings does not run that test or spend inference usage.

API-key providers are a separate connection with their own spending controls.
Model-role calls through a subscription runtime remain distinct from a full
native-agent session. For host CLI commands and installation requirements, see
[Harnesses and model roles](harnesses-and-models-2026-10-09.md).

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
A message saying “I remember” does not prove delivery. Check its **Added to memory**
receipt and the answer's retrieval details. Pending delivery can be checked
without resending the message.

With memory enabled, a direct request beginning **“Remember that…”** or
**“Запомни, что…”** asks to retain that statement. Quoted examples and questions
do not force admission. **“Don't remember…”** excludes that statement from active
memory; use **Forget this memory** to remove an existing reviewed record. Forgetting
one memory keeps its source chat. If a deletion remains uncertain, the recovery
control reconciles the same request and can complete that deletion; it does not
choose a different record to delete.
Editing a memory's text from this screen remains planned.

For automatic recall across chats, open **Agents > Companion > Harness** and
choose **Memory access > Across my chats**. Saving requires owner verification
and applies to future turns. The default is **Current conversation**. This choice
does not grant tools or enable memory for other agents.

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

| Destination | Use it for |
|---|---|
| **Work / Overview** | Attention, active work and recent activity. |
| **Inbox** | Tool approvals and proposals with evidence. Accepting a proposal records your choice; it does not execute it automatically. |
| **Activity** | Tasks, runs and recorded events. |
| **Library / Projects** | Project metadata and selected source links. |
| **Artifacts** | Saved owner content and its versions. |
| **Agents / Teams** | Durable profiles, model choices and granted capabilities; team definitions and runs. |
| **Skills / Tools** | Reusable instructions, registered tools, workflow drafts, publication and runs. Instructions do not grant execution rights. |
| **Schedules** | Configured jobs and recorded runs; execution needs the host scheduler. |
| **System** | Diagnostics and configured host observations. The enhanced Windows owner terminal is a separate host-access surface; the production container terminal remains deferred. |
| **Settings / Companion** | Character, speaking style and configured voice choices. Full 3D appearance and voice cloning are not connected. |

Calls support durable typed turns and bounded English voice turns when a compatible
speech service is configured. Microphone capture begins only after your click;
audio is transient while transcripts remain in the call conversation. Camera,
continuous streaming and incoming calls remain unconnected. Configure speech on
the host with `conker speech configure`; inspect it with `conker speech status`.

The host CLI and UI share many operations, but not complete parity. Downloads,
backups, restoration and service lifecycle retain host-only paths. See
[Running Conker](4-running.md) for those commands.
