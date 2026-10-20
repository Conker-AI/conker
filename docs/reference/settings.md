# Settings

Generated from `settings-registry.json` by `scripts/settings_docs.py`; do not edit by hand.
Read and change any of them with `conker config get|set|reset ID` (add `--chat CHAT_ID` for
chat settings); `conker config list --search TEXT` finds them. Each setting lives in one
service document, shown as its home.

## Everywhere

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Quiet hours**<br>`notifications.quiet_hours.enabled` | During these hours the Companion starts no suggestions or research of its own. (applies right away) | on | pi `/owner/preferences` `quietHours.enabled` |
| **Quiet hours start**<br>`notifications.quiet_hours.start` | When quiet hours begin, in 24-hour time. (applies right away) | `22:00` | pi `/owner/preferences` `quietHours.start` |
| **Quiet hours end**<br>`notifications.quiet_hours.end` | When quiet hours end, in 24-hour time; must differ from the start. (applies right away) | `07:00` | pi `/owner/preferences` `quietHours.end` |
| **Time zone**<br>`notifications.quiet_hours.time_zone` | The time zone quiet hours and daily budgets follow. (applies right away) | `Asia/Jerusalem` | pi `/owner/preferences` `quietHours.timeZone` |
| **Urgent messages during quiet hours**<br>`notifications.quiet_hours.urgent_exceptions` | Let urgent messages through quiet hours. (applies right away) | off | pi `/owner/preferences` `quietHours.urgentExceptions` |
| **When the Companion reaches out**<br>`companion.proactivity` | Meaningful updates, only urgent ones, or never. Values: meaningful, urgent_only, off. (applies right away) | `meaningful` | pi `/owner/preferences` `urgency` |
| **Suggestions per day**<br>`companion.daily_budget.suggestions` | How many suggestions the Companion may make each day. 0 to 100. (applies right away) | `4` | pi `/owner/preferences` `dailyBudget.suggestions` |
| **Research minutes per day**<br>`companion.daily_budget.research_minutes` | How long the Companion may research on its own each day. 0 to 1440. (applies right away) | `30` | pi `/owner/preferences` `dailyBudget.researchMinutes` |
| **Spending per day**<br>`companion.daily_budget.cost_cents` | How much, in cents, the Companion may spend on its own each day. 0 to 100000. (applies right away) | `0` | pi `/owner/preferences` `dailyBudget.costCents` |
| **Idle lock**<br>`session.idle_timeout_minutes` | Minutes before Conker locks after inactivity. Saved, but nothing enforces it yet. Values: 0, 5, 15, 30, 60. (saved, not enforced yet) | `15` | pi `/owner/preferences` `idleTimeoutMinutes` |
| **Search sources**<br>`search.sources` | What global search looks through. (applies right away) | conversations, memory, projects, artifacts, tasks, jobs, agents, tools, activity | pi `/search/settings` `sources` |
| **Exact text search**<br>`search.exact_text` | Match the words you type literally. (applies right away) | on | pi `/search/settings` `exactText` |
| **Meaning search**<br>`search.semantic` | Also find results by meaning. Needs the embeddings service. (applies right away) | off | pi `/search/settings` `semantic` |
| **AI ranking**<br>`search.reranking` | Let a model reorder results. Needs a search ranking model. (applies right away) | off | pi `/search/settings` `reranking` |

## Per chat

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Agent**<br>`chat.agent` | Which agent answers in this chat (companion or an agent id). (applies from the next message) | `companion` | pi `/sessions/{chat}/settings` `agentId` |
| **Memory off**<br>`chat.privacy.memory_off` | This chat neither reads nor adds long-term memory. (applies from the next message) | off | pi `/sessions/{chat}/settings` `privacy.memoryDisabled` |
| **Tools off**<br>`chat.privacy.tools_off` | The assistant may not use tools in this chat. (applies from the next message) | off | pi `/sessions/{chat}/settings` `privacy.harnessDisabled` |
| **Answer format**<br>`chat.output.format` | Let the model choose, or ask for text, a list, a table, a document, code or JSON. Values: auto, text, list, table, document, code, json. (applies from the next message) | `auto` | pi `/sessions/{chat}/output` `format` |
| **Answer length**<br>`chat.output.length` | Let the model choose, or ask for short, medium or long answers. Values: auto, short, medium, long. (applies from the next message) | `auto` | pi `/sessions/{chat}/output` `length` |
| **Answer language**<br>`chat.output.language` | auto, or a language tag such as en, ru or en-GB. (applies from the next message) | `auto` | pi `/sessions/{chat}/output` `language` |
| **Chat instructions**<br>`chat.context.instructions` | Instructions the model gets for every turn of this chat. (applies from the next message) | empty | pi `/context/{chat}` `sessionInstructions` |
| **Context window**<br>`chat.context.window_tokens` | Tokens the model may receive in total for this chat; larger than the answer reserve plus other input. 2 to 10000000. (applies from the next message) | none | pi `/context/{chat}` `budget.contextWindowTokens` |
| **Answer reserve**<br>`chat.context.output_reserve_tokens` | Tokens kept free for the answer. (applies from the next message) | none | pi `/context/{chat}` `budget.outputReserveTokens` |
| **Other input**<br>`chat.context.other_input_tokens` | Tokens set aside for instructions, memory and tools. (applies from the next message) | none | pi `/context/{chat}` `budget.otherInputTokens` |
