# Workflow builder

Describe a workflow in your own words. Pi's drafting model drafts it from the tools and published
workflows Conker can use, and you review the draft before anything runs. It is the same drafter
the chat ("make me a tool that ...") and the Tools screen ("Describe a new tool") use.

```bash
conker tool draft "Every morning, get the weather for Tel Aviv and tell me if I need an umbrella"
python scripts/conker.py tool draft "..."      # the same, in the workspace
python scripts/conker.py workflow draft "..."  # the same again, under its older name
```

1. The command files a tool request in Pi and returns its id (`creq_...`). Pi drafts in the
   background: it offers the model only the tools that share words with your description (at
   most 8, published workflows included), checks the draft with ToolGate and has the model
   repair it up to two times.
2. The command waits and prints the steps in plain words and any issues, or why drafting failed.
   `--no-wait` returns at once; `--timeout SECONDS` waits longer or shorter (30 minutes by
   default). Exit codes: 0 ready (or filed, with `--no-wait`), 1 failed, 3 still drafting when
   the time ran out, 4 the drafter asks a question.
3. The draft waits in the Inbox, the same card a chat request makes. Review it there, then save
   and publish it in Tools. Nothing is saved, published or run from the command line.

If the command's answer is lost, run it again with `--request-id` and the id it printed: the
same id files nothing twice.

## When the drafter asks a question

A request made in a chat can need a detail ("Which city?"). Conker asks it in that chat and the
card says what it asks; your next message in that chat is the answer, or answer it in the Inbox,
or from the terminal:

```bash
conker tool answer creq_... "Tel Aviv"
```

Drafting goes on with the same draft: the drafter sees your description and every question and
answer so far, and asks at most four times. A request made from the terminal or the Tools screen
has no chat, so a question fails it with the question's words: describe it again with that
detail.

## From a chat message

```bash
python scripts/conker.py show SESSION
python scripts/conker.py workflow from-chat SESSION MESSAGE_ID
```

Files a tool request from one of your own messages, exactly as `tool draft` does with that text,
and waits for it. Only your own messages work, never Conker's or a forgotten one. In a chat you
can simply ask Conker for the tool instead.

`python scripts/conker.py workflow dismiss creq_...` declines a tool request: its card leaves the
Inbox and nothing is made.

## Review and publish a saved draft

Once a draft is saved in Tools:

```bash
python scripts/conker.py workflow list
python scripts/conker.py workflow show morning-weather
python scripts/conker.py workflow publish morning-weather --expected-revision 1 --request creq_...
```

`show` prints the steps, which steps ask you before they run (that comes from ToolGate, not from
the model), and whether the draft is valid. `publish` asks you before each run by default
(`owner_confirmation`); `--authorization auto` lets it run without asking. Every tool it calls
still keeps its own grants and approvals. `--request` names the tool request it was drafted for,
so Conker tells the chat that asked that the tool is live; the tool is published even if Pi does
not confirm that.

## A model for drafting

The drafter uses your talking model unless you give it one of its own. A small local model can
chat well and still draft badly; give drafting a stronger one while chat stays local:

```bash
python scripts/conker.py models --role drafting --model MODEL_ID
python scripts/conker.py models --role drafting --model MODEL_ID --backup LOCAL_ID
python scripts/conker.py models --role drafting --off
```

With `--backup`, a draft that fails on the first model is tried on the next, in the order given.

It sees only your description, its questions and your answers, and the list of capabilities. Each
model call, backups included, gets the drafting role's own time limit. A hosted model costs what
that provider charges per draft.

## What the drafter cannot do

- Use a tool or workflow Conker cannot use. It says so instead.
- See your memories, chats or keys.
- Bind credentials, publish or run anything. Agents see the tool only once you publish it with
  "Let Conker use this tool".

## Retired (2026-10-30)

`workflow draft` no longer asks questions in the terminal or saves straight into Tools, and its
`--all-tools` and `--id` options are gone: Pi chooses the tools and the draft's id comes from its
name when you save it. `workflow accept` (Pi's offers) is gone, and `workflow dismiss` takes a
tool request's id instead of a `wfp_` or `wfo_` Inbox item.

Pi's side is documented in Pi's `docs/workflow-drafts.md` and `docs/change-requests.md`.
