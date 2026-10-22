# Workflow builder

Describe a workflow in your own words. The talking model drafts it from the tools and published
workflows you already have, and you review the draft before anything runs.

```bash
python scripts/conker.py workflow draft "Every morning, get the weather for Tel Aviv and tell me if I need an umbrella"
```

1. Conker lists your active tools and published workflows from ToolGate and sends Pi the ones
   that share words with your description, at most 8, shortened. Words few tools share count
   more than words most of them share. `--all-tools` sends all of them, which a slow local model
   may not read within Pi's time limit.
2. If a detail is missing, the builder asks one question. Answer it in the terminal. In a script
   with no terminal, the command stops and prints the question; add the answer to the
   description and run it again.
3. The draft is saved in ToolGate's workflow editor and validated. If Pi or ToolGate finds a
   problem, such as a step using a tool you do not have or a step left unconnected, the builder
   fixes it, up to two times. Each problem names its step. Output the model garbled is retried
   once.
4. The command prints the steps, the inputs, what the workflow does (`read`, `prepare` or
   `write`) and whether it is valid. Steps whose tool asks you before it runs say so; that comes
   from ToolGate, not from the model. Nothing is published.

Then review and publish:

```bash
python scripts/conker.py workflow show morning-weather
python scripts/conker.py workflow publish morning-weather --expected-revision 1
```

`publish` asks you before each run by default (`owner_confirmation`). `--authorization auto`
lets it run without asking. Every tool it calls still keeps its own grants and approvals.
`workflow list` shows all saved drafts.

## From a chat message

Write what you want in a chat, then turn that message into a workflow:

```bash
python scripts/conker.py show SESSION
python scripts/conker.py workflow from-chat SESSION MESSAGE_ID
```

It drafts from your message exactly as `draft` does, saves the draft for review, and puts
"Workflow draft ready: <name>" in your Inbox ("to fix" when ToolGate found problems). Publishing
it clears the Inbox item; `workflow dismiss ID` clears it without publishing. Only your own
messages work. The companion never makes a workflow on its own, so text pasted into a chat cannot
start one. Forgetting the chat removes the Inbox item; the draft stays, as your own work.

## When you ask in chat

Ask the companion for something recurring ("every morning tell me the weather in Tel Aviv",
"remind me every Monday ...", "make me a workflow that ..."; English or Russian) and it says it
put an offer in your Inbox: "Draft a workflow from your message? ...". To accept:

```bash
python scripts/conker.py workflow accept wfo_...
```

That drafts from your message exactly as `from-chat` does, and the draft takes the offer's
place in the Inbox. `workflow dismiss wfo_...` declines it. Pi makes the offer from your own
message only, before the model answers; nothing the model writes, and no web page or tool
result, can make one. Nothing is drafted until you accept, and nothing runs until you publish.

## What the builder cannot do

- Use a tool or workflow you do not have. It says so instead.
- See your memories, chats or keys. It sees only your description and the list of capabilities.
- Bind credentials, show the workflow to agents, publish it or run it. Agent visibility is off
  until you turn it on in the editor.
- Overwrite a draft. If one with that name exists, choose another with `--id`.

Pi's side is documented in Pi's `docs/workflow-drafts.md`.
