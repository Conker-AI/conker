# Chat CLI

Every chat feature the dashboard offers has a command here; this page grows with each one.

## Context

`context show SESSION` - Display current context settings and summary for a chat.

`context rule SESSION MESSAGE {pin,exclude,retrieve,summarize,clear}` - Set how a message is handled in context or clear its rule.

`context instructions SESSION FILE` - Set session instructions from a file; use --clear to remove them.

`context budget SESSION --window N --reserve N [--other N]` - Set token budget limits; start with this command for new chats. An installed stack runs it as `./conker context budget`.

`context summary-edit SESSION FILE` - Edit the chat summary.

`context summary-restore SESSION REVISION` - Restore a previous summary version.

`context fork SESSION FILE [--request-id ID]` - Create a new chat from a summary; prints a request_id to repeat safely.

`context summary-draft SESSION [--focus TEXT]` - Create a draft summary without saving it; review it and save with context summary-edit.

`context compact SESSION SUMMARY_FILE (--cover MESSAGE ... | --cover-file IDS_FILE)` - Compact messages using a reviewed summary; cover up to 10000 distinct messages by ID or from a file.

`context compaction SESSION` - Show current compaction status and covered messages.

Writes check the revision and never retry automatically. Run `conker context budget` first when a chat has no context settings; then `conker config` can change the rest. The usual flow: context summary-draft to propose, save the summary, then context compact to fold messages.

## Output

`output show SESSION` - Show current output settings.

`output set SESSION [--format F] [--length L] [--language TAG]` - Set output format (auto text list table document code json), length (auto short medium long), and language (auto or a language tag like ru or en-GB).

## Names

`title show SESSION` - Show the chat's name and whether you or Jev set it.

`title set SESSION TEXT` - Name the chat yourself (1-60 characters, one line). Jev never renames it on its own afterwards.

`title auto SESSION` - Ask Jev to name the chat now. Unnamed chats are also named automatically after their first answer.

## Suggestions

`suggest SESSION [--count N]` - Ask Jev for 1 to 3 messages you might send next, from the last answer and your message before it. The count defaults to your `chats.suggestions_count` setting. Nothing is sent or saved; excluded, redacted and forgotten messages never reach Jev, and a chat with helper models off is refused.

## Messages

`message list SESSION [--limit N] [--cursor MESSAGE]` - Show messages including those inherited from a parent chat.

`message branch SESSION MESSAGE [--summary FILE | --drop-summary] [--request-id ID]` - Create a new chat from this message; requires a reviewed summary decision when the chat has a summary.

`message retry SESSION MESSAGE --model MODEL [--request-id ID]` - Retry this answer with another model; prints the request id first and never repeats automatically.

`message retry-status SESSION REQUEST_ID` - Check a retry request status.

`message compare SESSION MESSAGE --models A,B[,C] [--request-id ID]` - Compare answers from up to three models, one after another; prints the request id first and stops at the first failure. The same --request-id continues safely without paying twice.

`message versions SESSION ROOT` - Show all versions of an answer.

`message select SESSION ROOT MESSAGE` - Select a version to show.

`message judge SESSION ROOT [--model MODEL] [--rubric FILE] [--request-id ID]` - A blind judge scores the answer versions (never its own model's) with an optional rubric; prints the request id first, and the same --request-id replays without paying twice.

`message judgements SESSION ROOT` - Show judgement results.

`message vote SESSION ROOT MESSAGE {up,down,winner,clear}` - Your vote on an answer version; it outweighs the judge.

`message votes SESSION ROOT` - Show votes.

`message fact-check SESSION MESSAGE [--model MODEL] [--request-id ID]` - Check the claims in this answer; prints the request id first, and the same --request-id replays without paying twice.

`message fact-checks SESSION MESSAGE` - Show fact-check results for this answer.

## Context Items

`context decide SESSION TEXT [--cite MESSAGE ...] [--replaces ITEM]` - Add a decision to the chat context; at most 10 distinct message cites, text 1-500 characters.

`context thread SESSION TEXT [--cite MESSAGE ...]` - Add a thread to the chat context; at most 10 distinct message cites, text 1-500 characters.

`context items SESSION` - List context items for a chat.

`context item-state SESSION ITEM {active,open,resolved,withdrawn}` - Change a context item's state.

## Files

`files upload SESSION PATH [--type MIME]` - Upload a file to a chat session; MIME type is auto-detected if not provided.

`files list SESSION` - List all attachments in a chat session.

`files show SESSION ID` - Show details for a specific attachment.

`files download SESSION ID [--output PATH]` - Download an attachment; writes to the attachment's name in current directory or specified path. Refuses to overwrite existing files.

`files remove SESSION ID` - Remove an attachment (only if not yet sent in a message).

`chat SESSION TEXT --attach ID [--attach ID ...]` - Send a message with file attachments; attachment IDs must match the pattern `attachment_` followed by 32 hex characters.

## Model Roles

`models` - Show the model catalogue and which model plays each role.

`models --role ROLE --model MODEL [--backup MODEL]...` - Point one role at one model and switch it
on; everything else stays as saved. Each `--backup` is tried in the order given when the model
before it fails; without one the role stops on failure. `models --role ROLE --off` switches it
off. Example: `models --role drafting --model MODEL` lets the workflow builder use a stronger
model while chat stays on yours.

## Model Profiles

`profiles` - Read-only model profiles from recorded outcomes.

## Inbox

`inbox [--json]` - Everything that happened and everything that needs you. Shows needs you items, handled items, upcoming items, and impact metrics. With --json, outputs raw JSON data.
