# Connected Conker workspace

This branch makes conversation the starting point in Conker's real Gateway
client. Conversations, memory, workflows, approvals, projects, agents,
teams, schedules, artifacts and settings retain their existing service contracts.
The independent `astra-cleanroom/conker-ui` design prototype is preserved.

See the [source review](conker-research-2026-10-09.md) and
[validation record](connected-workspace-validation.md) for evidence and tested scope.

## Run on this computer

Requires Python 3.12, Node.js 22.12+, Git, Docker Desktop and Ollama. The local
answer model must already be installed in Ollama. From this repository:

```powershell
ollama pull qwen2.5:3b
python scripts/workspace.py install --model qwen2.5:3b
python scripts/workspace.py up
```

Open **https://localhost:18550**. The local TLS certificate is generated for
localhost. The initial password is in
`.local-run/gateway/initial-owner-password.txt`; enter it only in the local app.
Choose your own password with `python scripts/workspace.py password`.

Keep Docker Desktop and Ollama running. Browsers may ask you to accept the
self-signed certificate for this localhost address. No system trust store is modified.

```powershell
python scripts/workspace.py status
python scripts/workspace.py down
python scripts/workspace.py build
python scripts/workspace.py up
```

Stop before rebuilding to replace the Gateway's snapshot of frontend assets.
Stopping retains every database and the dedicated PostgreSQL volume. Existing
Conker installations, server data, provider credentials and grants are not copied.
The launcher refuses unrelated listeners and container identities. An occupied
port is never treated as proof that this workspace is running.
The launcher also checks recorded processes before their ports open. Startup waits
for an owned process, shutdown verifies its exit, and maintenance refuses a process
that is still starting. Unreadable ownership is reported for inspection.

Older local installations may lack the dedicated connection for editing and
forgetting individual memories. Prepare it without reinstalling models or providers:

```powershell
python scripts/workspace.py down
python scripts/workspace.py memory-corrections
python scripts/workspace.py up
```

This creates one distinct correction credential scoped to the existing companion
memory namespace. It preserves existing credentials and refuses conflicting or
partial configurations. The configuration status does not prove a running service
has accepted the credential; verify the record preview in Memory after startup.

The backend repositories are pinned in `scripts/workspace-sources.json` and
cloned beneath the ignored `.local-run/sources` directory. Each has its own
Python environment so conflicting dependency pins do not get silently combined.
On Windows, uvicorn uses asyncio instead of the unsupported uvloop package.

## Workspace behavior

- Start in New chat. Work groups the overview, approvals and scheduled activity;
  Library groups projects, artifacts, agents, skills and tools. Memory and recent
  conversations remain directly accessible.
- Expand Open views to manage feature pages and conversations as tabs. Pin,
  close, reorder, or move with Left/Right/Home/End. Delete closes an unpinned tab.
- Tabs are in-memory navigation, not duplicated records. Unsent drafts save to
  the private server with their model, skills, research mode and Think choice.
  The new-chat draft also retains its agent, title and privacy choices. Composer
  text is never stored in browser storage; the saved state is visible beside it.
- Reload restores a saved draft. Concurrent edits offer an explicit choice
  between the saved version and this tab's version. An unconfirmed save is read
  back before another write. Interrupted chat creation opens the same chat for
  review without automatically sending its draft.
- Tab metadata is not persisted in browser storage. Forgotten conversations
  disappear from the tab strip and context pane.
- Use the single sidebar or Ctrl/Cmd+K search to move through Conker.
- The optional context pane reads actual saved model, turn and memory receipts.
- Saved user messages show a separate memory delivery status. “Added to memory”
  requires a valid MemoryGate acknowledgement; a saved chat or an assistant saying
  “I remember” is not that acknowledgement. Pending delivery can be checked again
  without resending the message.
- With memory enabled, start a direct request with “Remember that…” or
  “Запомни, что…”. MemoryGate admits the exact statement as an owner request,
  separate from its ordinary signal score. Quoted examples and questions do not
  force admission. “Don't remember…” excludes that statement from active memory;
  it does not delete the conversation or an earlier memory. Use Memory's Forget
  action for an existing record.
- Themes, narrow layouts, owner verification, Stop and uncertain-outcome
  recovery retain their existing behavior. Closing a tab does not stop a turn.
  Stop interrupts the owned inference request even while no answer text arrives;
  recorded tool effects still require their normal outcome checks. An old Stop
  cannot interrupt a later reply that the owner explicitly resumed.

Setup and the sidebar share their latest check, including refresh failures.
Progress tracks saved setup choices and verification evidence. Choosing and testing
an answer model checks its exact local route and saves the selection only after a
successful test. Failed tests leave settings alone, and concurrent owner changes
take precedence. No setup test runs merely from opening the page.

## What this local installation does and does not establish

The production frontend cannot fall back to fixture data. A stopped service
produces its real error/empty/readiness state. PostgreSQL, MemoryGate, ToolGate,
Pi and Gateway run locally; inference uses the installed Ollama model.

This minimum local profile intentionally has no Qdrant/embedding server, Laya
router, host-observation service, speech server, hosted credentials or action
grants. Memory uses its explicit lexical fallback. The UI reports those optional
dependencies as unavailable or unconfigured. Their configuration in another
deployment is not inherited here.

The optional `enhance` profile now installs Laya, native subscription sign-in,
independent background thinking, and a Windows owner terminal. See
[harnesses and model roles](harnesses-and-models-2026-10-09.md) for setup, CLI
commands, current validation and remaining parity work.

ChatGPT subscription connection still needs the official provider runtime and
owner sign-in. Hermes-style unified onboarding remains issue #71. Full media
replay, video perception, independent split editors, organizational groups,
published template libraries and complete UI/CLI parity remain product work;
they are not represented as working merely because the prototype showed them.

This branch is a local connected build, not an assembled Linux production
release or a change to the owner's deployed server.
