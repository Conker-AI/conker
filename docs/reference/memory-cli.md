# Memory from the CLI

## conker memory

`conker memory search "WORDS" [--limit N]`

Finds memories by their words, as the Memory screen's search does, and prints Pi's answer as
JSON. It is the owner's counterpart of Conker's own tool `conker.recall`, and it reads only: it
changes nothing and files nothing in the Inbox.

- `WORDS`: 1-200 characters.
- `--limit`: how many to show, 1 to 50 (default 10).

Forgetting and correcting a memory are done in the dashboard (Memory) or by
`conker inspect memory` and `conker apply memory FILE` ([CLI inspection](cli-inspection.md)).
