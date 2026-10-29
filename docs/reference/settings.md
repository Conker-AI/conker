# Settings

Generated from `dashboard/src/settings/registry/` by `scripts/settings_docs.py`; do not edit
by hand. Read and change server settings with `conker config get|set|reset ID` (add
`--chat CHAT_ID` for chat settings); `conker config list --search TEXT` finds them. Each
setting lives in one home: its own service document, the owner settings document, or this
browser. "Saved, not used yet" settings keep your choice until the feature that reads them
is built.

## You

Who you are, where you are and how your days run.

### Identity

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Name and photo**<br>`you.profile` | Your name and photo in Conker and in calls. (applies right away) | its own screen | Settings screen |
| **What Conker calls you**<br>`you.call_me` | The name Conker uses when it talks to you; empty uses your name. (applies from the next message) | empty | owner settings |
| **Pronouns**<br>`you.pronouns` | How Conker refers to you when it writes about you. Choices: Not set, He, She, They. (applies from the next message) | Not set | owner settings |
| **About you**<br>`you.about` | A short text Conker always knows: school, work, what matters to you. (applies from the next message) | empty | owner settings |
| **Your goals**<br>`you.goals` | Goals Conker keeps in mind when it plans, suggests and reminds. (applies from the next message) | none | owner settings |
| **Important people**<br>`you.people` | Who is who in your life: name, relation and how to reach them, one per line. (applies from the next message) | empty | owner settings |

### Place and language

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Time zone**<br>`you.time_zone` | Your time zone for schedules, reminders and the daily ritual. (saved, not used yet) | `Asia/Jerusalem` | owner settings |
| **Follow this device's time zone**<br>`you.time_zone_auto` | Updates your time zone when you travel. (saved, not used yet) | on | owner settings |
| **App language**<br>`you.app_language` | The language of Conker's screens. Choices: English, Hebrew, Russian. (saved, not used yet) | English | owner settings |
| **Answer language**<br>`you.answer_language` | The language Conker answers in. Choices: Same as your message, English, Hebrew, Russian. (saved, not used yet) | Same as your message | owner settings |
| **Time format**<br>`you.time_format` | How times are written. Choices: 24-hour, 12-hour. (saved, not used yet) | 24-hour | owner settings |
| **Date format**<br>`you.date_format` | How dates are written. Choices: 28 Oct 2026, Oct 28, 2026, 2026-10-28. (saved, not used yet) | 28 Oct 2026 | owner settings |
| **First day of the week**<br>`you.week_start` | Where weeks start in calendars and weekly plans. Choices: Sunday, Monday. (saved, not used yet) | Sunday | owner settings |
| **Units**<br>`you.units` | Units for distance, weight and temperature. Choices: Metric, Imperial. (applies from the next message) | Metric | owner settings |

### Your rhythm

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Wake time**<br>`you.wake` | When your day usually starts. (applies from the next message) | `07:00` | owner settings |
| **Sleep time**<br>`you.sleep` | When your day usually ends. (applies from the next message) | `23:00` | owner settings |
| **Your week**<br>`you.week` | Fixed parts of your week, like school, work or training, in your own words. (applies from the next message) | empty | owner settings |
| **Best focus time**<br>`you.focus` | When Conker should plan your hardest work. Choices: Morning, Afternoon, Evening, Night, It varies. (applies from the next message) | It varies | owner settings |

## Appearance

How Conker looks on your screens.

### Theme

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Theme** (this device)<br>`appearance.theme` | Light or dark, or follow this device. Choices: Follow this device, Light, Dark. (applies right away) | Dark | this browser |
| **Accent color**<br>`appearance.accent` | The color of main buttons and of things that need you. Choices: Neutral, Blue, Indigo, Purple, Magenta. (applies right away) | Neutral | owner settings |
| **Switch theme automatically**<br>`appearance.theme_switch` | Changes between light and dark during the day. Choices: Off, At sunrise and sunset, At set times. (saved, not used yet) | Off | owner settings |
| **Background tint**<br>`appearance.tint` | A light tint behind the content. Choices: None, Warm, Cool. (saved, not used yet) | None | owner settings |
| **High contrast**<br>`appearance.contrast` | Darker text and stronger lines everywhere. (saved, not used yet) | off | owner settings |
| **Color-blind friendly colors**<br>`appearance.color_vision` | Status colors that stay apart for your kind of color vision. Choices: Off, Red and green, Blue and yellow. (saved, not used yet) | Off | owner settings |

### Text

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Text size** (this device)<br>`appearance.text_size` | The size of all text on this device. Choices: Small, Default, Large, Larger. (applies right away) | Default | this browser |
| **Chat text size**<br>`appearance.chat_text_size` | The size of messages, apart from the rest of the screen. Choices: Small, Default, Large, Larger. (saved, not used yet) | Default | owner settings |
| **Font**<br>`appearance.font` | The font for screens and messages. Choices: System, Inter, Atkinson Hyperlegible, OpenDyslexic. (saved, not used yet) | System | owner settings |
| **Code font**<br>`appearance.code_font` | The font for code and commands. Choices: System monospace, JetBrains Mono, Fira Code. (saved, not used yet) | System monospace | owner settings |
| **Code ligatures**<br>`appearance.ligatures` | Joins symbol pairs like => into one sign in code. (saved, not used yet) | off | owner settings |
| **Line spacing**<br>`appearance.line_spacing` | Space between lines of text. Choices: Compact, Normal, Relaxed. (saved, not used yet) | Normal | owner settings |

### Layout

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Density**<br>`appearance.density` | How much fits on the screen. Choices: Comfortable, Compact, Spacious. (saved, not used yet) | Comfortable | owner settings |
| **Corners**<br>`appearance.corners` | How round cards and buttons are. Choices: Sharp, Soft, Round. (saved, not used yet) | Soft | owner settings |
| **Chat width**<br>`appearance.chat_width` | How wide messages can grow on large screens. Choices: Narrow, Medium, Wide, Full width. (saved, not used yet) | Medium | owner settings |
| **Message style**<br>`appearance.message_style` | How messages are drawn in chats. Choices: Flat, Bubbles, Cards. (saved, not used yet) | Flat | owner settings |
| **Portraits in chat**<br>`appearance.portraits` | Shows the agent's portrait next to its messages. (saved, not used yet) | on | owner settings |
| **Sidebar**<br>`appearance.sidebar` | How the sidebar starts on large screens. Choices: Open, Collapsed, Hide on small screens. (saved, not used yet) | Open | owner settings |
| **Sidebar places**<br>`appearance.sidebar_places` | Which places show in the sidebar. Choices: Projects, Memory, Agents, Tools, Cron jobs, Server. (saved, not used yet) | Projects, Memory, Agents, Tools, Cron jobs, Server | owner settings |
| **Chat views**<br>`appearance.chat_views` | Which views a chat's title bar offers. Choices: Context, Thinking, Files, Browser, Terminal, Logs. (saved, not used yet) | Context, Thinking, Files, Browser, Terminal, Logs | owner settings |

### Motion and sound

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Animations** (this device)<br>`appearance.motion` | How much moves on screen. Choices: Follow this device, On, Reduced, Off. (applies right away) | Follow this device | this browser |
| **How answers appear**<br>`appearance.streaming` | Whether answers show as they are written or all at once. Choices: Word by word, In chunks, All at once. (saved, not used yet) | Word by word | owner settings |
| **Sounds**<br>`appearance.sounds` | Plays a short sound when an answer is done or something needs you. (saved, not used yet) | off | owner settings |
| **Sound volume**<br>`appearance.volume` | How loud Conker's sounds are. 0 to 100 %. (saved, not used yet) | `60` % | owner settings |

### Details on screen

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Under each answer**<br>`appearance.answer_details` | What shows under Conker's answers. Choices: Model, Time, Cost, Tokens, Why this model, Tools used. (saved, not used yet) | Model, Time | owner settings |
| **Times**<br>`appearance.timestamps` | How times are shown in lists and chats. Choices: 5 min ago, Exact time, Hidden. (saved, not used yet) | 5 min ago | owner settings |
| **Rich text in answers**<br>`appearance.rich_text` | Shows headings, lists and tables instead of plain text. (saved, not used yet) | on | owner settings |
| **Technical IDs**<br>`appearance.technical_ids` | Shows ids and revisions next to things, for fixing problems. (saved, not used yet) | off | owner settings |

## Home

What your first screen shows.

### Tiles

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Tiles on Home**<br>`home.tiles` | Which tiles Home shows. Choices: Needs you, Today, Plan allowance, Running now, Coming up, Recent chats, Ideas, Done today, Your goals, Server health, Spending. (saved, not used yet) | Needs you, Plan allowance, Coming up, Done today | owner settings |
| **Waiting items on Home**<br>`home.needs_count` | How many waiting items Home shows before the rest stay in the Inbox. 1 to 5. (saved, not used yet) | `3` | owner settings |
| **Greeting**<br>`home.greeting` | The line at the top of Home. Choices: None, Short, Encouraging, when earned. (saved, not used yet) | Short | owner settings |
| **Quick actions**<br>`home.quick_actions` | Buttons on Home for things you do often. Choices: New chat, Voice note, Add a memory, Run a tool, New cron job. (saved, not used yet) | New chat, Add a memory | owner settings |
| **Plan usage ring**<br>`home.plan_ring` | Where your plan allowance ring shows. Choices: On Home, In the message box, Both, Off. (saved, not used yet) | Both | owner settings |

## Your day

Calmer screens for tired days and focused ones.

### Modes

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Easy mode**<br>`day.easy_mode` | Bigger buttons, fewer cards and one thing at a time. (saved, not used yet) | off | owner settings |
| **Focus mode**<br>`day.focus_mode` | Hides everything that is not urgent until you turn it off. (saved, not used yet) | off | owner settings |
| **Cards at once**<br>`day.max_cards` | The most Inbox cards shown together. 1 to 20. (saved, not used yet) | `5` | owner settings |
| **Late-night mode**<br>`day.late_night` | Calmer colors and shorter answers in the evening. (saved, not used yet) | off | owner settings |

### Settings profiles

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Profile**<br>`day.profile` | A set of settings for one kind of day. Choices: None, School day, Weekend, Exams, Vacation. (saved, not used yet) | None | owner settings |
| **Switch profiles by schedule**<br>`day.profile_schedule` | Changes the profile by day and time on its own. (saved, not used yet) | off | owner settings |

## Accessibility

Ways to make Conker easier to see, hear and use.

### Seeing and using

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Bigger focus outlines**<br>`accessibility.focus` | Makes the keyboard focus easier to see. (saved, not used yet) | off | owner settings |
| **Larger buttons**<br>`accessibility.large_targets` | Makes every button and link easier to tap. (saved, not used yet) | off | owner settings |
| **Captions for voice**<br>`accessibility.captions` | Shows the words while Conker speaks. (saved, not used yet) | off | owner settings |
| **Simpler wording**<br>`accessibility.simple_words` | Asks Conker to answer in short sentences and plain words. (applies from the next message) | off | owner settings |

## Keyboard

Shortcuts for working fast.

### Shortcuts

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Keyboard shortcuts**<br>`keyboard.shortcuts` | Turns Conker's keyboard shortcuts on or off. (saved, not used yet) | on | owner settings |
| **Search everything**<br>`keyboard.palette` | The keys that open search for places, chats and actions. Choices: Ctrl+K, Ctrl+P. (saved, not used yet) | Ctrl+K | owner settings |
| **Shortcut list on ?**<br>`keyboard.cheat_sheet` | Pressing ? shows every shortcut. (saved, not used yet) | on | owner settings |
| **Approve with Enter**<br>`keyboard.approve_enter` | Lets you approve the open Inbox card with Enter; never for messages, money or deleting. (saved, not used yet) | off | owner settings |

## Phone and devices

How Conker works on your phone and other devices.

### Phone

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Offer to install as an app**<br>`devices.install` | Offers to put Conker on your home screen like an app. (saved, not used yet) | on | owner settings |
| **Phone navigation**<br>`devices.navigation` | How you move between places on a phone. Choices: Menu button, Bottom bar. (saved, not used yet) | Menu button | owner settings |
| **Swipe Inbox cards**<br>`devices.swipe` | Swipe a card to move it to Later. (saved, not used yet) | on | owner settings |
| **Offline reading**<br>`devices.offline` | Keeps your recent chats readable without a connection. (saved, not used yet) | off | owner settings |

## Inbox

How requests, questions and the daily ritual work.

### Waiting and running

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Requests wait**<br>`inbox.wait` | How long a request waits for your answer. Choices: Until you answer, One hour, One day, One week. (saved, not used yet) | Until you answer | owner settings |
| **Time to run after you approve**<br>`inbox.run_window` | How long an approved action has to start. 5 to 60 minutes. (saved, not used yet) | `15` minutes | owner settings |
| **Same request twice**<br>`inbox.duplicates` | What happens when Conker asks for the same action again. Choices: One card, Separate cards. (saved, not used yet) | One card | owner settings |

### Cards

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Buttons per tool**<br>`inbox.tool_buttons` | The buttons a tool's card shows when it asks you. (applies right away) | its own screen | Settings screen |
| **Exact details open**<br>`inbox.details_open` | Shows a request's exact details without tapping Details. (saved, not used yet) | off | owner settings |
| **Questions per chat**<br>`inbox.asks_per_chat` | How many of Conker's questions can wait from one chat. 1 to 10. (saved, not used yet) | `3` | owner settings |
| **Questions in all**<br>`inbox.asks_total` | How many of Conker's questions can wait at once. 5 to 100. (saved, not used yet) | `20` | owner settings |
| **Group cards by**<br>`inbox.group_by` | How the Inbox groups what waits for you. Choices: Kind, Chat, Agent, Urgency. (saved, not used yet) | Kind | owner settings |
| **Order**<br>`inbox.sort` | Which cards come first. Choices: Urgent first, Oldest first, Newest first. (saved, not used yet) | Urgent first | owner settings |
| **Later means**<br>`inbox.later` | When a card you moved to Later comes back. Choices: Next ritual, Tonight, Tomorrow morning. (saved, not used yet) | Next ritual | owner settings |
| **Badge count**<br>`inbox.badge` | What the Inbox count includes. Choices: Everything, Urgent only, Off. (saved, not used yet) | Everything | owner settings |
| **Keep Handled**<br>`inbox.handled_days` | How long the list of what Conker did stays. 1 to 90 days. (saved, not used yet) | `7` days | owner settings |
| **Keep AI-job notes**<br>`inbox.notes_days` | How long findings from cron jobs stay in the Inbox. 1 to 90 days. (saved, not used yet) | `14` days | owner settings |
| **Approve similar together**<br>`inbox.batch` | Lets you approve many of one kind at once; never for messages, money or deleting. (saved, not used yet) | off | owner settings |

## Notifications

When and how Conker gets your attention.

### Channels

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Where notifications go**<br>`notifications.channels` | The places Conker can reach you. Choices: Browser, Phone, Email, Telegram, Desktop. (saved, not used yet) | Browser | owner settings |
| **Delivery**<br>`notifications.delivery` | Whether notifications arrive at once or together. Choices: Right away, Once an hour, Only at ritual times. (saved, not used yet) | Right away | owner settings |

### What notifies you

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Notify me about**<br>`notifications.events` | Which events send a notification. Choices: Requests, Conker's questions, Cron job findings, Failures, Budget limits, Plan usage, Server problems, Updates, Backups. (saved, not used yet) | Requests, Conker's questions, Failures, Budget limits, Plan usage | owner settings |
| **Urgent means**<br>`notifications.urgent` | What may reach you during quiet hours. Choices: Failures, Money, Security, A person waiting. (saved, not used yet) | Failures, Money, Security | owner settings |
| **Remind again**<br>`notifications.repeat` | Whether an unopened notification comes back. Choices: Never, After an hour, After a day. (saved, not used yet) | Never | owner settings |
| **Show text in notifications**<br>`notifications.preview` | Shows what a notification is about; off shows only that something needs you. (saved, not used yet) | on | owner settings |

### Quiet hours

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Quiet hours**<br>`notifications.quiet_hours.enabled` | During these hours Conker starts no suggestions or research of its own. (applies right away) | on | pi `/owner/preferences` `quietHours.enabled` |
| **Quiet hours start**<br>`notifications.quiet_hours.start` | When quiet hours begin each day. (applies right away) | `22:00` | pi `/owner/preferences` `quietHours.start` |
| **Quiet hours end**<br>`notifications.quiet_hours.end` | When quiet hours end each day. (applies right away) | `07:00` | pi `/owner/preferences` `quietHours.end` |
| **Quiet hours time zone**<br>`notifications.quiet_hours.time_zone` | The time zone quiet hours follow. (applies right away) | `Asia/Jerusalem` | pi `/owner/preferences` `quietHours.timeZone` |
| **Urgent exceptions**<br>`notifications.quiet_hours.urgent_exceptions` | Lets something urgent through during quiet hours. (applies right away) | off | pi `/owner/preferences` `quietHours.urgentExceptions` |
| **Quiet all day on**<br>`notifications.quiet_days` | Days with no notifications at all. Choices: Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday. (saved, not used yet) | none | owner settings |
| **Quiet during calls**<br>`notifications.quiet_in_calls` | Holds notifications while you are in a call. (saved, not used yet) | on | owner settings |

## Chats

How new chats start and how chats look and behave.

### New chats

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Mode**<br>`chats.default_mode` | How hard Conker works in a new chat. Choices: Auto, Fast, Balanced, Deep. (saved, not used yet) | Auto | owner settings |
| **Access**<br>`chats.default_access` | What Conker may do without asking in a new chat. Choices: Agent's setting, Ask me, AI decides, Full access. (saved, not used yet) | Agent's setting | owner settings |
| **Private by default**<br>`chats.default_incognito` | New chats remember nothing and stay out of search. (saved, not used yet) | off | owner settings |
| **A new chat starts with**<br>`chats.start` | What you see in an empty chat. Choices: Nothing, A greeting, Today's summary, A suggested request. (saved, not used yet) | Nothing | owner settings |

### Chat names

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Name chats automatically**<br>`chats.names.auto` | Gives each chat a short name and keeps it current; your own name stops it. (saved, not used yet) | on | owner settings |
| **Rename when**<br>`chats.names.when` | When an automatic name changes. Choices: After the first answer, When the topic changes. (saved, not used yet) | When the topic changes | owner settings |
| **Name style**<br>`chats.names.style` | How automatic names look. Choices: Short, Descriptive, With an emoji. (saved, not used yet) | Short | owner settings |

### Suggestions

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Suggest your next message**<br>`chats.suggestions` | Shows what you might ask next under Conker's answer. (saved, not used yet) | on | owner settings |
| **Suggestions shown**<br>`chats.suggestions_count` | How many next-message suggestions appear. 1 to 3. (saved, not used yet) | `2` | owner settings |
| **Suggestion style**<br>`chats.suggestions_style` | How suggestions appear. Choices: Buttons, Gray text in the box. (saved, not used yet) | Buttons | owner settings |
| **Prompt check**<br>`chats.prompt_check` | Advises how to make a request clearer before you send it. Choices: Auto, On, Off. (saved, not used yet) | Auto | owner settings |
| **Template suggestions**<br>`chats.template_suggest` | Offers a template when your message looks like one. Choices: Auto, Off. (saved, not used yet) | Auto | owner settings |

### Writing

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Send with**<br>`chats.send_with` | The key that sends a message. Choices: Enter, Ctrl+Enter. (saved, not used yet) | Enter | owner settings |
| **Spell check**<br>`chats.spellcheck` | Marks spelling mistakes while you type. (saved, not used yet) | on | owner settings |
| **Paste images as attachments**<br>`chats.paste_images` | Turns a pasted picture into an attachment. (saved, not used yet) | on | owner settings |
| **Queue messages**<br>`chats.queue` | Lets you send more messages while Conker is still working. (saved, not used yet) | on | owner settings |
| **Queued messages**<br>`chats.queue_max` | How many messages can wait in one chat. 1 to 5. (saved, not used yet) | `5` | owner settings |

### Reading

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Tool calls**<br>`chats.tool_calls` | How tool calls show in a chat. Choices: Folded, Open, Hidden. (saved, not used yet) | Folded | owner settings |
| **Thinking**<br>`chats.thinking` | How Conker's thinking shows in a chat. Choices: Folded, Open, Hidden. (saved, not used yet) | Folded | owner settings |
| **Sources**<br>`chats.citations` | How sources show in answers. Choices: Numbers in the text, At the end, Hidden. (saved, not used yet) | Numbers in the text | owner settings |
| **Follow new text**<br>`chats.autoscroll` | Scrolls down as an answer is written. (saved, not used yet) | on | owner settings |
| **Wrap long code lines**<br>`chats.code_wrap` | Breaks long code lines instead of scrolling sideways. (saved, not used yet) | off | owner settings |
| **Line numbers in code**<br>`chats.code_numbers` | Numbers the lines of code blocks. (saved, not used yet) | off | owner settings |
| **Fold long answers after**<br>`chats.fold_after` | Folds answers longer than this; 0 never folds. 0 to 500 lines. (saved, not used yet) | `0` lines | owner settings |
| **Read aloud**<br>`chats.read_aloud` | Whether answers are read aloud. Choices: When you ask, Always. (saved, not used yet) | When you ask | owner settings |

### Keeping chats

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Archive after**<br>`chats.archive_after` | Archives chats with no messages for this long; 0 never archives. 0 to 365 days. (saved, not used yet) | `0` days | owner settings |
| **Forget after**<br>`chats.forget_after` | Forgets chats with no messages for this long; 0 keeps them. 0 to 3650 days. (saved, not used yet) | `0` days | owner settings |
| **Pinned chats on top**<br>`chats.pinned_top` | Keeps pinned chats at the top of the list. (saved, not used yet) | on | owner settings |
| **Fold old messages**<br>`chats.compaction` | Whether long chats fold their oldest messages into a summary. Choices: Auto, Only when you ask. (saved, not used yet) | Auto | owner settings |
| **Warn when context is**<br>`chats.context_warning` | Warns when a chat's context is this full. 50 to 95 %. (saved, not used yet) | `80` % | owner settings |
| **Export as**<br>`chats.export_format` | The file type for exported chats. Choices: Markdown, PDF, JSON. (saved, not used yet) | Markdown | owner settings |
| **Include tool results in exports**<br>`chats.export_tools` | Adds tool calls and their results to exported chats. (saved, not used yet) | off | owner settings |

### In each chat

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Agent** (per chat)<br>`chat.agent` | Which agent answers in this chat (companion or an agent id). (applies from the next message) | `companion` | pi `/sessions/{chat}/settings` `agentId` |
| **Memory off** (per chat)<br>`chat.privacy.memory_off` | This chat neither reads nor adds memories. (applies from the next message) | off | pi `/sessions/{chat}/settings` `privacy.memoryDisabled` |
| **Helpers off** (per chat)<br>`chat.privacy.tools_off` | No helper models or tools see this chat. (applies from the next message) | off | pi `/sessions/{chat}/settings` `privacy.harnessDisabled` |
| **Answer format** (per chat)<br>`chat.output.format` | The shape of answers in this chat. Choices: Auto, Text, List, Table, Document, Code, JSON. (applies from the next message) | Auto | pi `/sessions/{chat}/output` `format` |
| **Answer length** (per chat)<br>`chat.output.length` | How long answers are in this chat. Choices: Auto, Short, Medium, Long. (applies from the next message) | Auto | pi `/sessions/{chat}/output` `length` |
| **Answer language** (per chat)<br>`chat.output.language` | The language of answers in this chat; auto follows your message. (applies from the next message) | `auto` | pi `/sessions/{chat}/output` `language` |
| **Instructions** (per chat)<br>`chat.context.instructions` | Instructions for this chat only. (applies from the next message) | empty | pi `/context/{chat}` `sessionInstructions` |
| **Context window** (per chat)<br>`chat.context.window_tokens` | The most tokens this chat sends to a model. 2 to 10000000 tokens. (applies from the next message) | none | pi `/context/{chat}` `budget.contextWindowTokens` |
| **Answer reserve** (per chat)<br>`chat.context.output_reserve_tokens` | Tokens kept free for the answer. (applies from the next message) | none | pi `/context/{chat}` `budget.outputReserveTokens` |
| **Other input** (per chat)<br>`chat.context.other_input_tokens` | Tokens set aside for instructions, memory and tools. (applies from the next message) | none | pi `/context/{chat}` `budget.otherInputTokens` |

## Prompts and templates

Templates, commands and snippets for writing requests.

### Templates

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Built-in templates**<br>`prompts.builtin` | Which ready-made templates are offered. Choices: Research, Writing, Code, Analysis, Summary. (saved, not used yet) | Research, Writing, Code, Analysis, Summary | owner settings |
| **Default template**<br>`prompts.default_template` | The template a new message starts with. Choices: None, Research, Writing, Code, Analysis, Summary. (saved, not used yet) | None | owner settings |
| **Required fields must be filled**<br>`prompts.required_fields` | Blocks sending until a template's required fields are filled. (saved, not used yet) | on | owner settings |

### Commands and mentions

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Slash commands**<br>`prompts.slash` | Typing / opens a list of commands. (saved, not used yet) | on | owner settings |
| **What @ can mention**<br>`prompts.mentions` | What you can point to with @ in a message. Choices: Chats, Files, Memories, Projects, Web pages. (saved, not used yet) | Chats, Files, Memories, Projects, Web pages | owner settings |
| **Snippets**<br>`prompts.snippets` | Saved text you insert by name, one per line as name: text. (saved, not used yet) | empty | owner settings |

## Context

What the AI sees when it answers.

### Instructions

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Instructions for every chat**<br>`context.instructions` | Text added to every chat after the agent's own instructions. (applies from the next message) | empty | owner settings |
| **Where instructions go**<br>`context.placement` | Whether instructions come first or right before your latest message. Choices: At the start, Before your latest message. (saved, not used yet) | At the start | owner settings |

### History and memory

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Chat history**<br>`context.history` | How much of the chat the model sees. Choices: Auto, Recent messages, Everything, Summary only. (saved, not used yet) | Auto | owner settings |
| **Recent messages**<br>`context.recent_messages` | How many recent messages count as recent. 5 to 200. (saved, not used yet) | `30` | owner settings |
| **Memories per answer**<br>`context.memories_per_answer` | The most memories added to one answer. 1 to 50. (saved, not used yet) | `8` | owner settings |
| **Project sources**<br>`context.project_sources` | Whether a chat's project files are offered to the model. Choices: Auto, None. (applies from the next message) | Auto | owner settings |

### Budget

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Context meter**<br>`context.meter` | Shows how full the context is in the message box. (saved, not used yet) | on | owner settings |
| **Web page size**<br>`context.web_page_limit` | The most text taken from one web page. 1000 to 12000 characters. (applies from the next message) | `12000` characters | owner settings |
| **Keep web pages**<br>`context.web_keep` | How long a fetched page stays in context. Choices: For one answer, For the whole chat. (saved, not used yet) | For one answer | owner settings |
| **Decisions list**<br>`context.decisions` | Who can add to a chat's list of decisions. Choices: Only you, You and Conker, marked. (saved, not used yet) | You and Conker, marked | owner settings |
| **Open threads**<br>`context.threads` | Tracks questions that are still open in a chat. (saved, not used yet) | off | owner settings |

## Research and review

How Conker searches the web and checks its answers.

### Research

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Research by default**<br>`research.default` | Whether new chats search the web. Choices: Off, Web, Deep. (saved, not used yet) | Off | owner settings |
| **Searches in deep research**<br>`research.deep_searches` | The most searches one deep research makes. 1 to 4. (applies from the next message) | `4` | owner settings |
| **Sources per answer**<br>`research.sources` | The most sources one answer cites. 1 to 20. (saved, not used yet) | `5` | owner settings |
| **Prefer recent**<br>`research.recent` | How new sources should be. Choices: Any age, Last year, Last month. (applies from the next message) | Any age | owner settings |
| **Trusted sites**<br>`research.trusted_sites` | Sites Conker prefers when it searches. (saved, not used yet) | none | owner settings |
| **Sites to skip**<br>`research.skip_sites` | Sites Conker never uses as sources. (saved, not used yet) | none | owner settings |

### Review

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Fact check**<br>`research.fact_check` | Checks claims in answers against sources. Choices: Auto, On, Off. (saved, not used yet) | Auto | owner settings |
| **Judge**<br>`research.judge` | A second model scores answers when several models compete. (saved, not used yet) | off | owner settings |
| **Your votes teach model profiles**<br>`research.votes` | Your thumbs up and down shape which models Conker picks. (saved, not used yet) | on | owner settings |

## Search

What Conker's search looks through.

### Sources

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Included sources**<br>`search.sources` | Which kinds of records search looks through. Choices: Chats, Memory, Projects, Artifacts, Tasks, Cron jobs, Agents, Tools, Activity. (applies right away) | Chats, Memory, Projects, Artifacts, Tasks, Cron jobs, Agents, Tools, Activity | pi `/search/settings` `sources` |
| **Archived chats**<br>`search.archived` | Includes archived chats in search results. (saved, not used yet) | off | owner settings |

### Search levels

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Exact text**<br>`search.exact_text` | Finds the exact words you type in messages and records. (applies right away) | on | pi `/search/settings` `exactText` |
| **Meaning search**<br>`search.semantic` | Finds records by meaning, not only exact words. (applies right away) | off | pi `/search/settings` `semantic` |
| **AI ranking**<br>`search.reranking` | Lets a model order results by how well they fit. (applies right away) | off | pi `/search/settings` `reranking` |
| **Recent searches** (this device)<br>`search.history` | Remembers your last searches on this device. (saved, not used yet) | on | this browser |

## Voice and calls

Talking to Conker and hearing it.

### Listening

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Speech language**<br>`voice.input_language` | The language Conker listens for. Choices: Same as the app, English, Hebrew, Russian. (saved, not used yet) | Same as the app | owner settings |
| **How you talk**<br>`voice.input_mode` | Hold to talk, or let Conker hear when you start and stop. Choices: Hold to talk, Automatic. (saved, not used yet) | Hold to talk | owner settings |
| **Listening models**<br>`voice.listen_models` | Which models turn speech into text, first choice first. (saved, not used yet) | none | owner settings |

### Speaking

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Conker's voice**<br>`voice.character` | The voice and look live in the companion's character. (applies right away) | its own screen | Settings screen |
| **Speaking speed**<br>`voice.speed` | How fast Conker speaks. 50 to 200 %. (applies from the next message) | `100` % | owner settings |
| **Pitch**<br>`voice.pitch` | How high or low Conker's voice is. -50 to 50. (saved, not used yet) | `0` | owner settings |

### Calls

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Interrupt Conker**<br>`voice.interrupt` | Speaking while Conker talks stops it and lets you go on. (saved, not used yet) | on | owner settings |
| **End after silence**<br>`voice.silence_end` | Ends a call after this much silence. 1 to 60 minutes. (saved, not used yet) | `5` minutes | owner settings |
| **Longest call**<br>`voice.max_length` | Ends a call after this long. 5 to 240 minutes. (saved, not used yet) | `60` minutes | owner settings |

### Voice notes

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Transcribe voice notes**<br>`voice.notes_transcribe` | Turns voice notes into text right away. (saved, not used yet) | on | owner settings |
| **Remember from voice notes**<br>`voice.notes_remember` | Saves key facts from voice notes to memory. (saved, not used yet) | off | owner settings |

## Files and answers

Uploads, answer shape and exports.

### Files

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Largest upload**<br>`files.upload_limit` | The largest file you can attach. 1 to 500 MB. (saved, not used yet) | `25` MB | owner settings |
| **Allowed files**<br>`files.types` | Which kinds of files you can attach. Choices: Images, Documents, Code, Audio, Video, Archives. (saved, not used yet) | Images, Documents, Code, Audio | owner settings |
| **Keep uploads**<br>`files.keep_days` | Deletes uploads after this long; 0 keeps them. 0 to 3650 days. (saved, not used yet) | `0` days | owner settings |
| **Add uploads to the project**<br>`files.to_project` | Files attached in a project chat join the project. (saved, not used yet) | on | owner settings |

### Answers

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Answer format**<br>`files.answer_format` | The shape of answers in new chats. Choices: Auto, Text, List, Table, Document, Code. (saved, not used yet) | Auto | owner settings |
| **Answer length**<br>`files.answer_length` | How long answers are in new chats. Choices: Auto, Short, Medium, Long. (saved, not used yet) | Auto | owner settings |
| **Where answers go**<br>`files.destination` | Whether long answers stay in the chat or become a file. Choices: In the chat, A file, An artifact. (saved, not used yet) | In the chat | owner settings |
| **Export as**<br>`files.export` | The file type for exported answers. Choices: Markdown, PDF, Word. (saved, not used yet) | Markdown | owner settings |

## Models

Which AI answers, thinks and helps, and how.

### Talking

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Talking model**<br>`models.talking` | The model that answers you; Auto lets your router choose for each request. (applies right away) | its own screen | Settings screen |
| **Thinking model**<br>`models.thinking` | Analyzes the conversation in the background while you keep talking. (applies right away) | its own screen | Settings screen |
| **Where models run**<br>`models.locality` | Whether Conker may use online models or only ones on your server. Choices: Auto, Only on my server, Online allowed. (saved, not used yet) | Auto | owner settings |
| **Think**<br>`models.think` | Whether Conker thinks before answering. Choices: Auto, On, Off. (saved, not used yet) | Auto | owner settings |
| **Creativity**<br>`models.creativity` | How varied answers are; low is steady, high is inventive. (saved, not used yet) | `50` | owner settings |
| **Longest answer**<br>`models.max_answer` | The most an answer may use. 256 to 32000 tokens. (saved, not used yet) | `4000` tokens | owner settings |
| **Complexity hint**<br>`models.complexity` | Tells the router how hard requests usually are. Choices: Auto, Low, Medium, High. (saved, not used yet) | Auto | owner settings |
| **Compare models**<br>`models.compare` | Sends each request to several models side by side. Choices: Off, 2 models, 3 models, 4 models. (saved, not used yet) | Off | owner settings |

### Providers

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Providers and models**<br>`models.providers` | Your subscriptions, API keys and local models, and which models Conker may use. (applies right away) | its own screen | Settings screen |

### Modes

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Show Auto's reasons**<br>`models.auto_reasons` | Shows why Auto chose each setting before you send. (saved, not used yet) | on | owner settings |
| **Fast mode models**<br>`models.mode_fast` | Models Fast mode uses, first choice first. (saved, not used yet) | none | owner settings |
| **Balanced mode models**<br>`models.mode_balanced` | Models Balanced mode uses, first choice first. (saved, not used yet) | none | owner settings |
| **Deep mode models**<br>`models.mode_deep` | Models Deep mode uses, first choice first. (saved, not used yet) | none | owner settings |

### AI jobs

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Model roles**<br>`models.roles` | Every role's model, backup, time limit and what happens on failure. (applies right away) | its own screen | Settings screen |
| **Judge models**<br>`models.jobs.judge` | Which models judge answers, first choice first. (saved, not used yet) | none | owner settings |
| **Fact-check models**<br>`models.jobs.fact_check` | Which models check facts, first choice first. (saved, not used yet) | none | owner settings |
| **Prompt-check models**<br>`models.jobs.prompt_check` | Which models advise on your requests, first choice first. (saved, not used yet) | none | owner settings |
| **Voice models**<br>`models.jobs.voice` | Which models speak Conker's answers, first choice first. (saved, not used yet) | none | owner settings |
| **Image making models**<br>`models.jobs.images_out` | Which models make pictures, first choice first. (saved, not used yet) | none | owner settings |
| **Document scanning models**<br>`models.jobs.scanning` | Which models read scanned documents, first choice first. (saved, not used yet) | none | owner settings |

### Local models

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Keep loaded**<br>`models.local.keep_loaded` | How long a local model stays in memory after use. 0 to 1440 minutes. (saved, not used yet) | `5` minutes | owner settings |
| **Local context size**<br>`models.local.context` | How much text a local model reads at once. Choices: 4,096, 8,192, 16,384, 32,768. (saved, not used yet) | 8,192 | owner settings |
| **CPU threads**<br>`models.local.threads` | How many processor threads local models use; 0 picks automatically. 0 to 64. (saved, not used yet) | `0` | owner settings |
| **Requests at once**<br>`models.local.parallel` | How many requests a local model handles together. 1 to 8. (saved, not used yet) | `1` | owner settings |
| **Warm up at start**<br>`models.local.warm_up` | Loads the talking model when the server starts. (saved, not used yet) | off | owner settings |

## Agents and character

Who works for you and how your companion behaves.

### Agents

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Your agents**<br>`agents.list` | Each agent's soul, skills, tools, access and model. (applies right away) | its own screen | Settings screen |
| **Agents passing work on**<br>`agents.handoff` | Whether one agent may hand work to another. Choices: Ask you, Allowed, Off. (saved, not used yet) | Ask you | owner settings |

### Companion

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Character**<br>`agents.character` | Your companion's name, look, voice, speaking style and backstory. (applies right away) | its own screen | Settings screen |

## Memory

What Conker remembers about you and for how long.

### Remembering

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Memory**<br>`memory.mode` | Whether Conker reads and adds memories. Choices: On, Read only, Off. (saved, not used yet) | On | owner settings |
| **What to remember**<br>`memory.kinds` | Kinds of things Conker may remember. Choices: Facts, Preferences, People, Places, Events, Decisions, Tasks, How-tos. (saved, not used yet) | Facts, Preferences, People, Places, Events, Decisions, Tasks, How-tos | owner settings |
| **Never remember**<br>`memory.never` | Topics Conker never saves to memory. (saved, not used yet) | Health, Money, Passwords, Other people's secrets | owner settings |

### Recall

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Remember across chats**<br>`memory.across_chats` | Conker uses what it learned in your other chats; off keeps each chat to itself. (applies from the next message) | on | owner settings |
| **Memories per answer**<br>`memory.per_answer` | The most memories one answer uses. 1 to 50. (saved, not used yet) | `8` | owner settings |

### Upkeep

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Review new memories**<br>`memory.review` | How you check what Conker remembered. Choices: Never, One by one, Weekly digest. (saved, not used yet) | Never | owner settings |
| **Forget events after**<br>`memory.event_days` | Forgets past events after this long; 0 keeps them. 0 to 3650 days. (saved, not used yet) | `0` days | owner settings |
| **When memories disagree**<br>`memory.conflicts` | What happens when a new memory contradicts an old one. Choices: Ask you, Keep the newer, Keep both. (saved, not used yet) | Ask you | owner settings |
| **Memory map**<br>`memory.map` | Shows memories as a map of connected things. (saved, not used yet) | on | owner settings |

## Proactivity and cron jobs

What Conker does on its own and on a schedule.

### Messaging first

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Proactivity**<br>`companion.proactivity` | When Conker may start suggestions or research of its own. Choices: When it matters, Only when urgent, Never. (applies right away) | When it matters | pi `/owner/preferences` `urgency` |
| **Ideas from Conker**<br>`proactivity.ideas` | Once a day Conker reads your recent chats and suggests what it could take off your plate. (applies right away) | its own screen | Settings screen |
| **Ideas time**<br>`proactivity.ideas_time` | When the daily ideas pass runs. (saved, not used yet) | `09:00` | owner settings |
| **Topics to skip**<br>`proactivity.skip_topics` | Topics Conker never suggests ideas about. (saved, not used yet) | none | owner settings |

### Daily limits

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Suggestions a day**<br>`companion.daily_budget.suggestions` | The most suggestions Conker makes on its own in one day. 0 to 100. (applies right away) | `4` | pi `/owner/preferences` `dailyBudget.suggestions` |
| **Research time a day**<br>`companion.daily_budget.research_minutes` | The most minutes of research Conker does on its own in one day. 0 to 1440 minutes. (applies right away) | `30` minutes | pi `/owner/preferences` `dailyBudget.researchMinutes` |
| **Spending a day**<br>`companion.daily_budget.cost_cents` | The most Conker spends on its own in one day. 0 to 100000 cents. (applies right away) | `0` cents | pi `/owner/preferences` `dailyBudget.costCents` |

### Cron jobs

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Access for new cron jobs**<br>`proactivity.jobs.access` | Whether a new cron job uses its agent's access or a stricter one. Choices: Agent's access, One step stricter. (saved, not used yet) | Agent's access | owner settings |
| **When a run is still going**<br>`proactivity.jobs.overlap` | What happens when a cron job is due while its last run still works. Choices: Skip the new run, Run it after. (saved, not used yet) | Skip the new run | owner settings |
| **Allowed triggers**<br>`proactivity.jobs.triggers` | What may start a cron job. Choices: A time, A tool's answer changing, A webhook, Something in Conker. (saved, not used yet) | A time, A tool's answer changing, A webhook, Something in Conker | owner settings |
| **Shortest interval**<br>`proactivity.jobs.min_interval` | How often a cron job may run at most. 1 to 1440 minutes. (saved, not used yet) | `5` minutes | owner settings |
| **Runs a day**<br>`proactivity.jobs.max_runs` | The most runs one cron job makes in a day. 1 to 1000. (saved, not used yet) | `100` | owner settings |
| **Results in the Inbox**<br>`proactivity.jobs.results` | When a cron job's result shows in the Inbox. Choices: Only when something needs you, Always, Never. (saved, not used yet) | Only when something needs you | owner settings |
| **When a cron job fails**<br>`proactivity.jobs.on_failure` | What happens after a failed run. Choices: Tell me, Try again, Pause the job. (saved, not used yet) | Tell me | owner settings |
| **Tries after a failure**<br>`proactivity.jobs.retries` | How many times a failed run is tried again. 0 to 5. (saved, not used yet) | `1` | owner settings |

### Webhooks

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Webhook calls an hour**<br>`proactivity.hooks.rate` | The most webhook calls one cron job accepts in an hour. 1 to 600. (saved, not used yet) | `60` | owner settings |
| **Largest webhook payload**<br>`proactivity.hooks.size` | The largest payload a webhook accepts. 1 to 16 KB. (saved, not used yet) | `16` KB | owner settings |
| **Keep webhook payloads**<br>`proactivity.hooks.keep_days` | How long webhook payloads are kept. 1 to 90 days. (saved, not used yet) | `7` days | owner settings |

## Tools

How Conker's tools, Terminal, browser and web search behave.

### Tools

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Tools that change your things**<br>`tools.defaults.change` | What new tools that change your things start with. Choices: Ask me, AI decides, Full access. (saved, not used yet) | AI decides | owner settings |
| **Tools that send or post**<br>`tools.defaults.outward` | What new tools that reach other people start with. Choices: Ask me, AI decides. (saved, not used yet) | Ask me | owner settings |
| **Tool time limit**<br>`tools.timeout` | How long one tool call may run. 5 to 600 seconds. (saved, not used yet) | `60` seconds | owner settings |
| **Largest tool result**<br>`tools.result_limit` | The most a tool result may hold. 1 to 1024 KB. (saved, not used yet) | `64` KB | owner settings |
| **Tool screens**<br>`tools.apps` | Whether tools may show their own small screens in a chat. Choices: Auto, Off. (saved, not used yet) | Auto | owner settings |
| **Tools Conker drafts**<br>`tools.drafts` | What happens to a tool Conker drafts for you. Choices: Ask you, Save as a draft. (saved, not used yet) | Ask you | owner settings |

### Terminal

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Command time limit**<br>`tools.terminal.time` | How long one Terminal command may run. 5 to 100 seconds. (saved, not used yet) | `30` seconds | owner settings |
| **Command memory**<br>`tools.terminal.memory` | How much memory one Terminal command may use. 128 to 8192 MB. (saved, not used yet) | `512` MB | owner settings |
| **Command CPUs**<br>`tools.terminal.cpu` | How many processors one Terminal command may use. 1 to 8. (saved, not used yet) | `1` | owner settings |
| **Workspace size**<br>`tools.terminal.workspace` | How much the agent's workspace may hold. 100 to 20000 MB. (saved, not used yet) | `2000` MB | owner settings |
| **Keep the workspace**<br>`tools.terminal.keep` | When the agent's workspace is cleared. Choices: Keep it, Clear daily, Clear after each chat. (saved, not used yet) | Keep it | owner settings |
| **Your own terminal**<br>`tools.terminal.owner` | A terminal for you on the server, apart from the agents' Terminal. (saved, not used yet) | off | owner settings |

### Browser

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Allowed sites**<br>`tools.browser.allowed` | Sites the browser tool may open; empty allows all but blocked ones. (saved, not used yet) | none | owner settings |
| **Blocked sites**<br>`tools.browser.blocked` | Sites the browser tool never opens. (saved, not used yet) | none | owner settings |
| **Sites that always ask**<br>`tools.browser.sensitive` | Sites where every action asks you first. (saved, not used yet) | bank, gov, health | owner settings |
| **Signing in**<br>`tools.browser.sign_in` | Whether the browser tool may sign in to sites. Choices: Never, Ask you, On allowed sites. (saved, not used yet) | Never | owner settings |
| **Keep screenshots**<br>`tools.browser.screenshots` | How long browser screenshots are kept. 0 to 90 days. (saved, not used yet) | `7` days | owner settings |

### Web search

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Safe search**<br>`tools.web.safe_search` | Filters adult results from web searches. Choices: Off, Moderate, Strict. (saved, not used yet) | Moderate | owner settings |
| **Results per search**<br>`tools.web.results` | How many results one web search returns. 3 to 8. (applies from the next message) | `8` | owner settings |
| **Search region**<br>`tools.web.region` | A region code for local results, such as il or us; empty searches everywhere. (saved, not used yet) | empty | owner settings |
| **Search engines**<br>`tools.web.engines` | Which engines web search asks; empty uses the defaults. (saved, not used yet) | none | owner settings |

## Money and limits

What Conker may spend and how close you are to plan limits.

### Spending

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Monthly budget**<br>`money.monthly` | The most Conker spends in a month; 0 means nothing paid. 0 to 10000 $. (saved, not used yet) | `0` $ | owner settings |
| **Ask before spending more than**<br>`money.confirm_above` | Any single request above this asks you first. 0 to 1000 $. (saved, not used yet) | `1` $ | owner settings |
| **Budget per chat**<br>`money.per_chat` | The most one chat may spend; 0 means no separate limit. 0 to 1000 $. (saved, not used yet) | `0` $ | owner settings |
| **Near a limit**<br>`money.near_limit` | What happens when a budget is almost used up. Choices: Ask you, Switch to local models, Switch to cheaper backups, Stop. (saved, not used yet) | Ask you | owner settings |
| **Show the cost before sending**<br>`money.show_cost` | Shows what a request will likely cost before it is sent. (saved, not used yet) | on | owner settings |

### Plan usage

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Plan usage alerts**<br>`plans.alerts` | Tells you when a Claude or ChatGPT plan window is nearly used up. (applies right away) | on | pi `/owner/preferences` `planAlerts.enabled` |
| **Alert at**<br>`plans.alert_percent` | How full a plan window is before you are told. 50 to 100 %. (applies right away) | `80` % | pi `/owner/preferences` `planAlerts.percent` |
| **Windows to watch**<br>`money.plan_windows` | Which plan windows count for alerts. Choices: 5-hour, Weekly. (applies from the next message) | 5-hour, Weekly | owner settings |

## Access and safety

What Conker may do without asking you, and what always asks.

### Who decides

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Let Conker decide by your settings**<br>`access.delegate` | Your chat switch, each agent's settings and each tool's own setting decide what runs without asking. (applies right away) | its own screen | Settings screen |
| **Your words count as approval**<br>`access.your_words` | When your own message asks for exactly this action, it goes ahead without a card. (saved, not used yet) | on | owner settings |

### Tools

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Tools Conker can use**<br>`access.tools` | Off: Conker cannot see or call the tool at all. (applies right away) | its own screen | Settings screen |
| **Always ask me**<br>`access.always_ask` | These tools ask you every time, whatever else says. (applies right away) | its own screen | Settings screen |

### Reviewer

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Reviewer model**<br>`access.reviewer_model` | The model that checks an action before it runs without you. (applies right away) | its own screen | Settings screen |
| **Strictness**<br>`access.reviewer.strictness` | How readily the reviewer lets an action go ahead. Choices: Strict, Balanced, Relaxed. (saved, not used yet) | Balanced | owner settings |
| **People and lasting changes ask you**<br>`access.escalate` | When an action that reaches a person or can't be undone asks you. Choices: When the AI decides, Also with Full access. (saved, not used yet) | When the AI decides | owner settings |
| **A real person means**<br>`access.real_person` | Who counts as a person for that rule. Choices: Anyone, Anyone not on your trusted list. (saved, not used yet) | Anyone | owner settings |
| **Trusted people**<br>`access.trusted_people` | People Conker may message without the extra ask; it still shows in Handled. (saved, not used yet) | none | owner settings |
| **Show the reviewer's reason**<br>`access.show_reason` | Shows on each card why the reviewer asked you. (saved, not used yet) | on | owner settings |

### Guards

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Always ask about**<br>`access.always_ask_kinds` | Kinds of actions that ask you every time. (saved, not used yet) | Banking, Passwords, Government, Health | owner settings |
| **Pause everything**<br>`access.pause` | Stops every cron job and anything that would run without you. (saved, not used yet) | off | owner settings |
| **Lockdown**<br>`access.lockdown` | Lets Conker only read until you turn it off. (saved, not used yet) | off | owner settings |
| **Ask for your password**<br>`access.reverify` | How often changes ask for your password again. Choices: Every time, Once every 10 minutes, Once per sign-in. (saved, not used yet) | Every time | owner settings |
| **After outside content**<br>`access.outside` | How long a chat stays stricter after it read someone else's text. Choices: For the whole chat, Until you clear it. (saved, not used yet) | For the whole chat | owner settings |

## Privacy and data

What is kept, for how long, and what leaves your server.

### Defaults

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Helper models in new chats**<br>`privacy.helpers` | Lets helper models (naming, summaries) see new chats. (saved, not used yet) | on | owner settings |
| **Hide secrets from online models**<br>`privacy.redact` | Removes passwords, keys and card numbers before anything goes to an online model. (saved, not used yet) | off | owner settings |

### How long things are kept

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Logs**<br>`privacy.keep.logs` | How long service logs are kept. 1 to 365 days. (saved, not used yet) | `30` days | owner settings |

## Account and security

Your sign-in, devices and how Conker protects them.

### Devices

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Signed-in browsers**<br>`account.devices` | Every browser signed in to Conker; sign one out. (applies right away) | its own screen | Settings screen |
| **Sign out**<br>`account.sign_out` | Ends this browser's session; your chats and settings stay on your server. (applies right away) | its own screen | Settings screen |
| **Sign out when idle**<br>`session.idle_timeout_minutes` | Signs this browser out after this long without use. Choices: 5 minutes, 15 minutes, 30 minutes, 1 hour. (saved, not used yet) | 15 minutes | pi `/owner/preferences` `idleTimeoutMinutes` |

### Security

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Renew access codes**<br>`account.rotation` | How often the codes the CLI and agents use are replaced. Choices: Never, Every 90 days, Every year. (saved, not used yet) | Never | owner settings |
| **Two-step sign-in**<br>`account.two_step` | Asks for a code from your phone when you sign in. (saved, not used yet) | off | owner settings |

## Integrations

How Conker may use the connectors you build.

### Calendar

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Calendar use**<br>`integrations.calendar` | What Conker may do with your calendars. Choices: Read events, Add events. (saved, not used yet) | Read events | owner settings |

### Email

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Email use**<br>`integrations.email` | What Conker may do with your email; sending always asks. Choices: Nothing, Read, Read and draft. (saved, not used yet) | Nothing | owner settings |
| **Signature**<br>`integrations.signature` | The signature on emails Conker drafts. (saved, not used yet) | empty | owner settings |

### Messengers

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Messengers**<br>`integrations.messengers` | Which messengers Conker may use once you connect them. Choices: Telegram, WhatsApp, Discord. (saved, not used yet) | none | owner settings |
| **Draft replies**<br>`integrations.draft_replies` | Conker drafts replies; sending always asks you. (saved, not used yet) | on | owner settings |

### Files, notes and code

| Setting | What it does | Default | Home |
|---|---|---|---|
| **File storage**<br>`integrations.storage` | Which file services Conker may read. Choices: Google Drive, OneDrive, Dropbox. (saved, not used yet) | none | owner settings |
| **Notes**<br>`integrations.notes` | Which note apps Conker may read. Choices: Notion, Obsidian. (saved, not used yet) | none | owner settings |
| **GitHub**<br>`integrations.github` | Lets Conker read your GitHub repositories. (saved, not used yet) | off | owner settings |

## Tasks and projects

How tasks and projects are tracked.

### Tasks

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Tasks on Home**<br>`projects.tasks_home` | Shows open tasks on Home. (saved, not used yet) | on | owner settings |
| **Tasks from chats**<br>`projects.tasks_from_chats` | Whether Conker turns things you say into tasks. Choices: Ask you, Never. (saved, not used yet) | Ask you | owner settings |

### Projects

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Archive finished projects after**<br>`projects.archive_after` | Archives a finished project after this long; 0 keeps it. 0 to 365 days. (saved, not used yet) | `0` days | owner settings |

## Server

Updates, backups, remote access and resources.

### Updates

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Updating**<br>`server.updates.mode` | Whether updates install on their own. Choices: Never, Tell me, Install at night. (saved, not used yet) | Tell me | owner settings |
| **Update time**<br>`server.updates.time` | When night updates install. (saved, not used yet) | `03:00` | owner settings |

### Backups

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Backups**<br>`server.backups.schedule` | How often your server is backed up. Choices: Off, Daily, Weekly. (saved, not used yet) | Weekly | owner settings |
| **Include local models**<br>`server.backups.models` | Adds local models to backups; they are large. (saved, not used yet) | off | owner settings |
| **Test restores**<br>`server.backups.test` | Checks once a month that a backup restores. (saved, not used yet) | off | owner settings |

### Remote access

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Remote access**<br>`server.remote` | Lets your devices reach Conker away from home through Tailscale. (saved, not used yet) | on | owner settings |
| **Domain**<br>`server.domain` | A web address for your server, if you have one. (saved, not used yet) | empty | owner settings |

### Resources

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Disk warning**<br>`server.disk_warning` | Warns you when the disk is this full. 50 to 99 %. (saved, not used yet) | `85` % | owner settings |
| **Clean up by itself**<br>`server.auto_clean` | Removes old images and caches when space runs low. (saved, not used yet) | on | owner settings |
| **Log detail**<br>`server.log_level` | How much the services write to their logs. Choices: Errors, Warnings, Normal, Everything. (saved, not used yet) | Normal | owner settings |
| **Health checks**<br>`server.health_interval` | How often the services are checked. 1 to 60 minutes. (saved, not used yet) | `5` minutes | owner settings |

## Logs and transparency

Seeing what Conker did and why.

### Transparency

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Watch Conker work**<br>`logs.watch` | A pane that shows searches, pages, commands and the browser live. (saved, not used yet) | off | owner settings |

## Labs

Experimental features and tools for fixing problems.

### Labs

| Setting | What it does | Default | Home |
|---|---|---|---|
| **API explorer**<br>`labs.api_explorer` | A screen for trying Conker's API. (saved, not used yet) | off | owner settings |

## Settings

How this screen works.

### This screen

| Setting | What it does | Default | Home |
|---|---|---|---|
| **Show advanced settings** (this device)<br>`settings.advanced` | Shows every setting, not only the common ones. (applies right away) | off | this browser |
| **Keep a history of changes**<br>`settings.history` | Records each change so you can see and undo it. (saved, not used yet) | on | owner settings |
| **Conker suggests settings**<br>`settings.conker_suggests` | Conker may suggest a setting change; it never changes one on its own. (saved, not used yet) | off | owner settings |
