# Importing chats from ChatGPT and Claude

Bring your history from another assistant. Conker keeps each chat as an archived, read-only chat
labelled "Imported from ChatGPT" or "Imported from Claude", and offers the messages you wrote
there to memory as outside content: something you said elsewhere, never something you said to
Conker or approved as a memory. Nothing runs during an import: no model, no tool, no Conker.

## Get the export

- **ChatGPT**: Settings, Data controls, Export data. The emailed zip holds `conversations.json`.
- **Claude**: Settings, Privacy, Export data. The emailed zip holds `conversations.json`.

## Preview, then import

```sh
conker import chatgpt ~/Downloads/chatgpt-export.zip          # preview: saves nothing
conker import chatgpt ~/Downloads/chatgpt-export.zip --yes    # import that file
conker import claude ~/Downloads/claude-export.zip --yes
```

PATH is the zip as it arrived, its unpacked folder, or `conversations.json` itself. Only
`conversations.json` is read, at most 128 MB: the images and files in an export never leave the
machine you run the command on. In a development checkout, use `python scripts/conker.py import
...` the same way.

The preview says how many chats and messages the file holds, how many are new, from when to when,
a few titles, how many of your messages would be offered to memory, and what was left out (tool
calls and results, hidden notes, reasoning, chats that do not match the export format). `--yes`
imports exactly the file previewed: Pi checks it by its SHA-256 digest. `--json` prints Pi's
answer as JSON.

Importing the same export again adds nothing. A newer export adds only the chats and messages
that are new since the last one. If an import stops halfway, run it again.

## What memory gets

Only your own messages, whole and at most 16,000 characters; the other assistant's replies stay in
the archive. Nothing is offered when you skipped memory at setup or new chats start private. Your
words reach MemoryGate through its import listener, as an outside source with the normal
admission rules; until that listener is set up they wait. The installers set it up: each makes
the listener's key and gives it to Pi (`PI_MEMORYGATE_IMPORT_SOURCE`, `PI_MEMORYGATE_IMPORT_KEY`),
and because MemoryGate creates a listener only through its admin API, the listener itself is made
once MemoryGate runs: `./install.sh` does it after its health check, `workspace.py up` after
MemoryGate answers, and on the source-built Ubuntu layout run `conker setup import-listener` once
after starting (again any time; an existing listener keeps whether you turned it off). Pi's guide
(`docs/imports.md` in Pi) explains the listener itself.

## Limits and refusals

A file over 128 MB, with more than 20,000 chats or 500,000 messages, or that is not an export at
all is refused with the reason, and nothing is saved. A Claude export given to `chatgpt` (or the
other way round) is refused and named. A chat longer than 10,000 messages is left out; a message
over 50,000 characters is kept shortened, with a note, and not offered to memory.

## Not yet

The dashboard screens (upload, preview, confirm, imported chats under Chats) and their gateway
routes come next. Removing an imported chat is not built yet; forget its memories from the Memory
screen.
