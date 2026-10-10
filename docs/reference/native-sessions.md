# Native sessions

The enhanced local profile exposes native session discovery through
**System > Native sessions**, with a Work shortcut and a link from Terminal.
Choose **Claude Code** for its background-session registry or **Codex** for
saved thread history. These are separate from Conker Chats.

Each provider reads its Conker-owned isolated profile: `claude-auth` or
`chatgpt-auth`. Another CLI installation's account and history are not imported.
The APIs require the host owner's private control credential or the signed-in
browser owner. Browser API responses use `Cache-Control: no-store`.
Inference credentials do not authorize native history or controls.

## Codex saved history

The Codex view lists **Unarchived** or **Archived** threads, newest updated first.
**Load more** reads another page; **Refresh** starts again in the current scope.
**Search loaded threads** filters only metadata already loaded in the browser.
All source kinds supported by the pinned native runtime are requested, including
CLI, editor, exec, app-server and subagent threads.

Select a thread to read its saved name, preview, working directory, timestamps,
source and model provider. Previews are plain text, limited to 500 characters and
marked when truncated. This view does not load the full conversation transcript.
A failed read is unavailable, not evidence that history is empty or deleted.

Run these commands from the Conker repository:

```powershell
python scripts/conker.py native-sessions codex list
python scripts/conker.py native-sessions codex list --archived --limit 10
python scripts/conker.py native-sessions codex list --archived --limit 10 --cursor NEXT_CURSOR
python scripts/conker.py native-sessions codex status THREAD_UUID
python scripts/conker.py native codex resume THREAD_UUID
```

`status` reads saved metadata. It does **not** establish whether that thread is
running elsewhere. Use the exact lowercase UUID. The page size is 1–50, default
25; a continuation cursor belongs to the same isolated profile, archive scope
and page size. Start again without the cursor if it is rejected.

The displayed resume command is copied for manual use. Running it opens the
native agent and can resume work; it retains Codex's own permission and approval
prompts. Discovery itself sends no prompt and does not launch or resume a task.

### What the Codex connection can establish

Conker starts a separate, short-lived app-server process to read native saved
metadata. It cannot establish activity in another Codex process. Responses label
this boundary as `runtimeVisibility: "observer_only"`; the UI does not convert
the observer's `notLoaded` state into stopped, completed or idle.

The adapter allows only initialization, `thread/list` and `thread/read` with
`includeTurns: false`. Native listing may scan rollouts and maintain its own
history index. Conker does not copy transcripts into its database. Each read has
a 20-second operation deadline plus bounded cleanup; cleanup terminates only the
observer it created. Gateway and CLI allow 30 seconds; browser reads allow 35.

List responses contain `schemaVersion: 1`, `provider: "codex"`,
`scope: "saved_threads"`, `runtimeVisibility: "observer_only"`, `archived`,
`results` and `nextCursor`. Detail responses use the same fixed scope fields
and a `session` object. Native control/status fields are deliberately absent.

The contract was checked against installed Codex **0.160.1** using its offline
schema generator. The official [app-server documentation](https://learn.chatgpt.com/docs/app-server)
describes the underlying metadata calls. Live native events, Stop and approvals
require a separate connection with ownership of the relevant running turn.

## Claude background sessions

Claude discovery covers background sessions in Conker's isolated profile.
Ordinary interactive sessions are outside this registry's supported scope.

### CLI

Run from the Conker repository:

```powershell
python scripts/conker.py native-sessions claude list
python scripts/conker.py native-sessions claude status SESSION_ID
python scripts/conker.py native-sessions claude output SESSION_ID
python scripts/conker.py native-sessions claude stop SESSION_ID --expected-identity IDENTITY
python scripts/conker.py native claude attach SESSION_ID
```

Use the full `id` and `identity` returned by a current list or status response.
The local CLI uses the host owner's private control credential. In the browser,
Stop additionally requires the signed-in owner, CSRF protection and a one-use
verification proof bound to the exact path and body. Inference credentials do
not authorize these operations.

The `identity` digest binds the isolated profile, native ID, conversation ID,
start time and working directory. Stop re-reads the native registry and rejects
a changed identity or a session that is no longer working or blocked. Native
names and shortened ID prefixes are never accepted as control targets.

### Evidence and recovery

List responses have `schemaVersion: 1`, `provider: "claude"` and
`scope: "background_sessions"`. They return at most 100 background entries,
newest first. `truncated` describes this limit; `omittedCount` separately counts
non-background entries. Missing from a partial list does not prove deletion.
Malformed or unsupported native responses report unavailable rather than empty.
An unrecognized native state is `unknown` and cannot authorize Stop.

Output is an explicit read of recent native output, capped at 65,536 UTF-8 bytes
and marked when truncated. Conker strips terminal controls, displays plain text
and does not persist this snapshot. Native Claude retains its own session data.
Output can contain private task material; the API requires the owner and sends
`Cache-Control: no-store`. Selection and authentication changes clear the UI.

The host bounds each operation to 20 seconds plus process cleanup. Gateway's
transport timeout is 30 seconds; the browser stops waiting for reads after 35
seconds and for Stop after 45 seconds from verified dispatch. Time spent entering
the owner password is excluded. A timeout is not cancellation of a native job.

A successful Stop receipt says `stop_requested` and `automaticReplay: false`.
It is not evidence that native work has stopped. Read status explicitly after a
successful or unconfirmed request. Recovery retains the earlier uncertainty and
never replays Stop automatically. Completed actions and usage remain completed.

### Native runtime boundary

Discovery, status and output do not launch or resume an agent task. Claude may
start its own session supervisor to answer discovery. Conker owns only the
short-lived CLI request, not the independently supervised jobs.
Restarting the provider bridge requests graceful shutdown and, if needed,
terminates only the exact Conker provider processes. It does not recursively
terminate native background supervisors or their jobs.

The attach command is a manual native operation and can resume an exited
session. Claude continues to own its tools, permissions and approval prompts.
This view does not approve requests, change permission modes, launch sessions,
or turn native output into a structured Conker run. Ordinary interactive Claude
sessions need a separate adapter.

Claude documents these interfaces in its
[background session guide](https://code.claude.com/docs/en/agent-view).
The local implementation was developed against Claude 2.1.270. Unsupported
command or output contracts report unavailable.
