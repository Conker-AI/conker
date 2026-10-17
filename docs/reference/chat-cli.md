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

`context summary-draft SESSION [--focus TEXT]` - Create a draft summary without saving it; review it and save with context summary-edit.

Writes check the revision and never retry automatically. Use context budget first when a chat has no settings.

## Output

`chat-settings output show SESSION` - Show current output settings.

`chat-settings output set SESSION [--format F] [--length L] [--language TAG]` - Set output format (auto text list table document code json), length (auto short medium long), and language (auto or a language tag like ru or en-GB).

## Names

`chat-settings title show SESSION` - Show current title.

`chat-settings title set SESSION TEXT` - Set title (1-60 characters, one line).

`chat-settings title auto SESSION` - Generate title automatically.

## Messages

`message list SESSION [--limit N] [--cursor MESSAGE]` - Show messages including those inherited from a parent chat.

`message branch SESSION MESSAGE [--summary FILE | --drop-summary] [--request-id ID]` - Create a new chat from this message; requires a reviewed summary decision when the chat has a summary.

`message retry SESSION MESSAGE --model MODEL [--request-id ID]` - Retry this answer with another model; prints the request id first and never repeats automatically.

`message retry-status SESSION REQUEST_ID` - Check a retry request status.

`message compare SESSION MESSAGE --models A,B[,C] [--request-id ID]` - Compare answers from up to three models, one after another; prints the request id first and stops at the first failure. The same --request-id continues safely without paying twice.

`message versions SESSION ROOT` - Show all versions of an answer.

`message select SESSION ROOT MESSAGE` - Select a version to show.

`message judge SESSION ROOT [--model MODEL] [--rubric FILE] [--request-id ID]` - Judge answer versions with optional model and rubric; prints the request id first.

`message judgements SESSION ROOT` - Show judgement results.

`message vote SESSION ROOT MESSAGE {up,down,winner,clear}` - Vote for an answer.

`message votes SESSION ROOT` - Show votes.
