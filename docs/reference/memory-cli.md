# Memory from the CLI

## conker memory

`conker memory search "WORDS" [--limit N]`

Finds memories by their words, as the Memory screen's search does, and prints Pi's answer as
JSON. It is the owner's counterpart of Conker's own tool `conker.recall`, and it reads only: it
changes nothing and files nothing in the Inbox.

- `WORDS`: 1-200 characters.
- `--limit`: how many to show, 1 to 50 (default 10).

`conker memory used ID [--limit N] [--after CURSOR] [--json]`

Lists the answers that used one memory, newest first, and changes nothing. A header says how many
answers in how many chats and since when Pi has noted uses; each line gives the time, the source
(`context`: the turn's own recall; `recall`: the AI's search tool), the chat title, the chat and
turn ids and the memory's revision at the time.

- `ID`: the memory's id, as `conker memory beliefs` prints it.
- `--limit`: 1 to 100 (default 20). `--after`: the cursor the last line of the previous page gave.
- `--json`: print Pi's reply instead.

It answers for a memory since corrected or forgotten: the notes hold ids, never words. A chat in
the Trash or forgotten is not shown. Answers from before Pi began noting uses are not listed.

`conker memory upkeep [--unused-days N] [--limit N] [--json]`

Lists memories worth tidying and changes nothing: exact and near duplicates, open
contradictions, expired memories and ones not recalled for N days. Each candidate is one line,
`duplicate|near-duplicate|contradiction|expired|unused  ids  reason`, with each memory's revision
and words below it; a last line per group says how many more there are.

- `--unused-days`: not recalled for this many days counts as unused, 1 to 3650 (default 90).
- `--limit`: at most this many per group, 1 to 500 (default 50).
- `--json`: print Pi's reply instead.

A memory being forgotten, or made from a chat in the Trash, is not shown, and neither is any
candidate that names one.

Forgetting and correcting a memory are done in the dashboard (Memory) or by
`conker inspect memory` and `conker apply memory FILE` ([CLI inspection](cli-inspection.md)).
