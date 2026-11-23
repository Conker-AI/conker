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

Asks for your Conker password (typed without echo), changes the cap and prints the saved one.

- `--dollars`: money for the day, 0 to 1000 US dollars.
- `--tokens`: tokens for the day over every paid call, 0 to 100,000,000. Direct keys report no
  price, so for them the token limit is the one that stops.
- `--on`: stop paid calls at the cap. `--off`: keep counting, never stop.

Raising, lowering or turning off the cap asks for the password, as Settings does. The password and
the change go once, on stdin, to the gateway's `spending-cap` command, which checks the password
(five wrong ones in five minutes and it waits) and saves only the cap; Pi refuses a cap change made
with the recovery key the other commands use. The password never goes in the command line, the
environment or an error. It guards the command, not the server: anyone with the server's shell
can still reset the password (`conker auth reset-password`).

The change is saved against the preferences' revision, so a save made meanwhile (in the dashboard,
say) is refused, never overwritten: run the command again. Needs a Pi release with the gateway's
`spending-cap` command; an older one answers that it does not know it, and nothing is changed.
