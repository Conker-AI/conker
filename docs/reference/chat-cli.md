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

`output set SESSION [--format F] [--length L] [--language TAG] [--level L]` - Set output format (auto text list table document code json), length (auto short medium long), and language (auto or a language tag like ru or en-GB). `--level` sets the answer's style: strict (short controlled sentences), plain (everyday words), normal, or deep (full detail and technical terms); `auto` follows your `chats.language_level` owner setting.

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

`inbox [--json]` - Everything that happened and everything that needs you. Shows needs you items, handled items, upcoming items, and impact metrics. With --json, outputs raw JSON data. Conker's requests show with a `?` and what approving would make (cron job, tool, memory, new agent, new team).

An installed stack runs `inbox`, `spending`, `loops`, `memory search`, `memory beliefs`, `memory upkeep`, `agent create` and `team create` as `./conker inbox` and so on (scripts/owner_cli.py: Pi reached in its container, only these commands' routes).

## Open loops

Promises across every chat you can see: what you said you would do and what Conker said it would do, each with who promised, an optional due date in your time zone and the chat it belongs to. A promise in a chat in the Trash is not shown; forgetting the chat removes it.

`conker loops list [--done | --dropped | --all] [--due-before DATE] [--limit N] [--after CURSOR] [--json]` - Open promises by default, soonest due first and undated last (default 50, at most 100). A header gives today's date and zone, then one line per promise: `due  owner|conker  text  OVERDUE  (id in chat)`. When there is another page, the last line gives its `--after` value.

`conker loops add CHAT_ID "TEXT" [--by owner|conker] [--due YYYY-MM-DD] [--message MESSAGE_ID]` - File a promise (1-500 characters) for a chat, optionally pointing at the message it came from; prints the new promise with its id.

`conker loops done LOOP_ID`, `conker loops drop LOOP_ID`, `conker loops reopen LOOP_ID` - Mark a promise done, dropped, or open again. This works in a chat that has since been forked or closed.

## Memory, Agents and Teams

These are your own counterparts of Conker's tools `conker.recall`, `conker.create_agent` and `conker.create_team`: you make things at once, with no request to approve.

`memory search QUERY [--limit N]` - Find memories by their words (1-200 characters), as the Memory screen's search does; at most 50, default 10.

`memory beliefs [--stated | --concluded] [--review] [--type fact|phase|context|watch] [--limit N] [--after CURSOR] [--json]` - What Conker believes about you, one page at a time (default 50, at most 100): a header with the counts (what you told it, what it concluded, what waits for review), then one line per belief: `stated|concluded  confidence  backed-by-N  text  (id rev N)`. `--review` shows only memories waiting for review. When there is another page, the last line gives its `--after` value. A memory being forgotten, or made from a chat in the Trash, is not shown. To fix one, use `memory-edit apply ID FILE --expected-revision N --request-id REQUEST` with its revision.

`memory upkeep [--unused-days N] [--limit N] [--json]` - Memories worth tidying, read only: exact and near duplicates, open contradictions, expired memories and ones not recalled for N days (default 90, 1-3650). One line per candidate, `duplicate|near-duplicate|contradiction|expired|unused  ids  reason`, with each memory's revision and words below it; at most `--limit` per group (default 50, at most 500), and a line says how many more there are. A memory being forgotten, or made from a chat in the Trash, is not shown, and neither is any candidate that names one. To act on one, fix it with `memory-edit apply ID FILE --expected-revision N --request-id REQUEST` or forget it from the Memory screen.

`agent create --name NAME --role TEXT --instructions TEXT [--tool ID ...] [--model ID] [--memory none|conversation|owner]` - Make an agent. Without `--tool` it has no tools; each tool keeps its own access setting. Memory defaults to only the chat it is in.

`team create --name NAME --objective TEXT --role NAME AGENT INSTRUCTIONS [--role ...] [--role-tokens N] [--role-cents N]` - Make a linear team: each role hands its result to the next after you review it. AGENT is an agent id or its exact name; each role gets that agent's tools and no memory of its own. Each role has one turn and, by default, 50000 tokens and 25 cents; the team's budget is their sum plus two turns. Run it from Teams.
