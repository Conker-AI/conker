# Chat CLI

Every chat feature the dashboard offers has a command here; this page grows with each one.

## Context

`context show SESSION` - Display current context settings and summary for a chat.

`context rule SESSION MESSAGE {pin,exclude,retrieve,summarize,clear}` - Set how a message is handled in context or clear its rule.

`context instructions SESSION FILE` - Set session instructions from a file; use --clear to remove them.

`context budget SESSION --window N --reserve N [--other N]` - Set token budget limits; start with this command for new chats.

`context summary-edit SESSION FILE` - Edit the chat summary.

`context summary-restore SESSION REVISION` - Restore a previous summary version.

`context fork SESSION FILE [--request-id ID]` - Create a new chat from a summary; prints a request_id to repeat safely.

Writes check the revision and never retry automatically. Use context budget first when a chat has no settings.