# Agents and teams from the CLI

The owner's counterparts of Conker's own tools `conker.create_agent` and `conker.create_team`:
from a shell you make the agent or team at once, with no change request in the Inbox. Pi checks
every field; the command only shapes the request. Both work on an installed stack (`./conker`)
and in the development CLI.

## conker agent

`conker agent create --name NAME --role ROLE --instructions TEXT [--tool ID ...] [--model ID]
[--memory none|conversation|owner]`

Makes an agent now and prints it as JSON.

- `--name`: 1-80 characters, unique among your agents.
- `--role`: what it does, 1-160 characters.
- `--instructions`: 1-8000 characters.
- `--tool ID`: a tool it may use; repeat for more. Default: none.
- `--model ID`: default is your answer model.
- `--memory`: `none` (remembers nothing), `conversation` (only its own chat, the default) or
  `owner` (what Conker knows about you).

## conker team

`conker team create --name NAME --objective TEXT --role NAME AGENT INSTRUCTIONS ...
[--role-tokens N] [--role-cents N]`

Makes a linear team of existing agents: each role hands its result to the next, in the order the
`--role` options are given (at most 12).

- `--role NAME AGENT INSTRUCTIONS`: one role. AGENT is an agent id or its exact name.
- `--objective`: 1-2000 characters.
- `--role-tokens`: token budget per role (default 50000).
- `--role-cents`: cost budget per role, in cents (default 25).

### Run a team

A run is yours, one role at a time: Pi freezes the team and its agents, runs the role you name and
never decides by itself that a handoff condition holds.

- `conker team run TEAM_ID --chat CHAT_ID --task TEXT`: starts a run from a chat you own and runs
  the first role. The answer is in that role's chat, which the command prints.
- `conker team next RUN_ID --reviewed`: after you read the last answer, runs the next role over the
  team's handoff. `--reviewed` says its condition holds.
- `conker team show RUN_ID`: the run's state and steps.
- `conker team finish RUN_ID [--cancel]`: ends the run as completed (or cancelled).

Pi refuses to start or step a run while the daily spending cap is off (`conker spending`), and
every paid model call of a role passes that cap. Add `--json` to print Pi's reply.
