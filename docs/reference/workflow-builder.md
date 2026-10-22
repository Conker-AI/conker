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

## What the builder cannot do

- Use a tool or workflow you do not have. It says so instead.
- See your memories, chats or keys. It sees only your description and the list of capabilities.
- Bind credentials, show the workflow to agents, publish it or run it. Agent visibility is off
  until you turn it on in the editor.
- Overwrite a draft. If one with that name exists, choose another with `--id`.

Pi's side is documented in Pi's `docs/workflow-drafts.md`.
