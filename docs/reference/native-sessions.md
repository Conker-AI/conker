# Native Claude sessions

Conker exposes Claude's background-session registry through the enhanced local
provider bridge. The UI is **System > Native sessions**, with a Work shortcut
and a link from Terminal. It reads Conker's isolated `claude-auth` profile,
not another CLI installation's account or history.

## CLI

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

## Evidence and recovery

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

## Native runtime boundary

Discovery, status and output do not launch or resume an agent task. Claude may
start its own session supervisor to answer discovery. Conker owns only the
short-lived CLI request, not the independently supervised jobs.
Restarting the provider bridge requests graceful shutdown and, if needed,
terminates only the exact Conker provider processes. It does not recursively
terminate native background supervisors or their jobs.

The attach command is a manual native operation and can resume an exited
session. Claude continues to own its tools, permissions and approval prompts.
This view does not approve requests, change permission modes, launch sessions,
or turn native output into a structured Conker run. Ordinary interactive native
sessions and Codex thread discovery need separate adapters.

Claude documents these interfaces in its
[background session guide](https://code.claude.com/docs/en/agent-view).
The local implementation was developed against Claude 2.1.270. Unsupported
command or output contracts report unavailable.
