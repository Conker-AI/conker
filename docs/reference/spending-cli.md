# Daily spending cap from the CLI

Pi keeps one cap over every paid model call for your local day (Pi's docs/spending-cap.md):
OpenRouter's paid models and the direct keys count; subscriptions, local models and voice do not.
The default is on, $5 and 2,000,000 tokens a day. When either limit is reached, paid calls stop
until the next local day and model roles fall back to free or local models.

## conker spending

`conker spending`

Prints today's meter as JSON: the cap, what paid calls used (`costUsd`, `tokens`, `calls`, and how
many reported no price or had their tokens estimated) and whether the cap is reached.

`conker spending cap [--dollars N] [--tokens N] [--on | --off]`

Changes the cap and prints the saved one.

- `--dollars`: money for the day, 0 to 1000 US dollars.
- `--tokens`: tokens for the day over every paid call, 0 to 100,000,000. Direct keys report no
  price, so for them the token limit is the one that stops.
- `--on`: stop paid calls at the cap. `--off`: keep counting, never stop.

The change is saved against the preferences' revision, so a save made meanwhile (in the dashboard,
say) is refused, never overwritten: run the command again. In the dashboard the same change asks
for your password; from the server's shell it does not, since the shell already has the keys.
