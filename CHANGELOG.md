# Changelog

Conker's own releases. Each module keeps its own changelog in its own
repository; this one records the product — the installer, the compose, and
which module versions a release pins.

## Unreleased

- **A memory Conker saves on its own shows as a quiet "Remembered" note with Undo.** Under your
  message, only when Memory has acknowledged the save; every other state (pending, not added,
  excluded, removed) keeps its explained status. Undo runs the
  Memory screen's forget flow without its dialog (preview the current version, forget exactly that
  version, re-read the receipt); the note then reads "Forgotten", and a failure keeps Undo available
  with the usual plain message.
- **Gemini, xAI, Mistral, DeepSeek and Groq connect directly.** Pi 0.17.0 is pinned and
  `DIRECT_PROVIDERS_STATE` is active: Settings > Providers saves an API key for each (stored as a
  file the Pi container reads, like the other keys), and Advanced > Add provider lists them for
  model roles.
- **"Manage models" and "Connections" links open the right settings topic.** Seven links still
  written as `/settings?tab=models` or `?tab=connections` (chat composer, chat rail, chat header,
  Home, Server, Tools, daily news) opened "You", because the settings screen mapped only four old
  tabs. Both now open their topic (Models, Integrations), and the navigation check fails on any
  `/settings?tab=` link that opens no topic.
- **Claude plan answers no longer reach for Claude Code's own memory.** Claude Code's default
  prompt gives it a memory folder inside the sign-in directory, and Sonnet answered "remember
  this" with a read of that file (tools are off, so nothing ran, but the reply was lost and showed
  the path). The runtime now replaces that prompt with a fixed one.
- **A Claude model name can no longer read as a command-line option.** The native Claude runtime
  puts the model on argv after `--model`; a name such as `-p` passed the old pattern. Names now
  start with a letter or digit.
- **The local dev stack keeps its key files owner-only.** `local_stack.py` sets umask 077 for every
  command, and rewrites `.local-run/postgres/environment` as 0600 on POSIX even when an older run
  left it readable.
- **Owner terminal admits the real Gateway.** The terminal overlay let in UID 0, but the Gateway
  has run as the owner's UID since 27 October, so an activated terminal would have refused it. The
  overlay now admits `${CONKER_UID:-1000}`, the Gateway's own `user:`. The install log in the
  temporary folder is readable by the owner only.
- **Plainer chat wait, no tracker code.** After a reply finishes streaming, the chat says
  "Saving reply…" instead of "Preview ended. Waiting for saved history…". The dashboard no
  longer carries the template's dormant Google Tag Manager loader or its unused demo files.
- **Calmer, consistent motion.** Dialogs, sheets, menus, selects, tooltips, popovers and toasts
  share four durations and one enter and one exit curve; closing is quicker than opening, and the
  command palette opens instantly. Settings > Appearance > Animations: Reduced (and Follow this
  device, when the device asks for less motion) keeps fades and colour changes but nothing slides,
  grows or spins; Off makes every change instant.
- **Backup models per role.** Settings > Models: a role set to "Try backup models in order" lists
  its backups as numbered rows you add, move up or down, or remove; Pi tries them in that order when
  the model before fails. From the terminal, `conker models --role ROLE --model MODEL --backup
  MODEL...` does the same. The role card no longer runs past the screen edge on a phone.
- **Suggested next messages from the terminal.** `conker suggest SESSION [--count N]` asks the
  helper model for one to three messages you might send next; nothing is sent or saved.
- **Services says what is restarting.** While a restart runs, the summary on Server > Services
  names the restarting service and counts only the others, instead of repeating "All N services
  are running." from the last read.
- **Pi 0.16.0 is pinned.** A helper role can follow the answer model: saved with
  `followAnswer: true`, it takes the answer role's model and backups, refilled on every save, so
  Settings > Models shows side jobs on Auto. Off still turns a role off. The generated API types
  are regenerated from it.
- **Pi 0.15.1 is pinned.** Fixes only: a declined turn that already acted no longer blocks its
  queue, two webhook calls at once start one job, a repeated setup memory review answers instead of
  failing, a malformed local model settings document no longer fails an Ollama answer, a
  quiet-hours pause keeps the last failure, and one sent memory offer no longer hides another's
  failure. The generated gateway API types are regenerated from it.
- **Pi 0.15.0 is pinned.** Artifacts can be exported at an earlier version (an optional `version`,
  1 to 100, on the gateway's artifact download), and `conker apply tools` takes a `run_tool`
  operation that runs any published tool by hand, as the browser's Run does, with the owner's and
  the chat's keys. The dashboard's generated gateway API types are regenerated from this release.
- **Search everything has no setting of its own.** Settings > Keyboard no longer shows a "Search
  everything" choice with only Ctrl+K in it; Ctrl+K (Cmd+K) always opens search while keyboard
  shortcuts are on.
- **Server keeps its pages in the sidebar.** The tab row on top of Server repeated the sidebar's
  sub-items, so it now shows only while the sidebar is collapsed. Services replaced Containers in
  that list; every container on the server is one link away at the bottom of Services. A service
  you restart says "Restarting…" right away instead of "Running" until the list is read again.
- **One time zone setting.** Settings > Notifications no longer has its own quiet-hours time zone row,
  which edited the same value as Settings > You > Time zone; quiet hours follow that one.
- **Make a job Conker made your own.** A cron job page now has a "Make this job mine" button for
  jobs Conker created. It asks for your password, then treats the job as yours: it keeps running
  even if the chat that made it is forgotten, and "Made by" says "you". If the job changed in the
  meantime, it reloads and asks you to try again.
- **Pi 0.14.0 and ToolGate 0.11.0 are pinned.** Pi 0.14.0 brings the gateway routes the new screens use (file downloads and chat imports, server actions through the host helper, ToolGate settings and lockdown, owner tool runs, making a Conker job your own), the drafter asking its question in the chat, job runs kept out of memory, and the old workflow-proposal routes removed. ToolGate 0.11.0 ships with a new agent sandbox image, pinned by digest. The dashboard's generated Pi and gateway API types are regenerated from these releases.

- **Export answers and artifacts, import old chats.** Every finished answer has an Export menu
  next to Copy: Word, PDF, PowerPoint, and Excel when the answer holds a table. Artifacts have the
  same menu, plus their CSV, JSON or source text. When Pi can't make a file, the menu says why in
  plain words ("Tables over 10,000 cells export only as Excel"). "Import from ChatGPT or Claude"
  under the Chats list brings in an export: choose conversations.json (a .zip gets told how to
  open it), see how many chats, from when and some titles, then Import (asks for your password).
  Imported chats live in their own read-only list under Chats, with no message box, and say how
  many of your messages are waiting to be offered to memory.
- **Answer the drafter in the Inbox.** When Conker asks a question while drafting a tool
  (`needs_detail`), its Inbox card shows the question, a box and an Answer button, plus an
  "Open the chat" link when the question was also posted in that chat. The card turns into
  "drafting" from Pi's reply; a failed send keeps your text, and a question already answered says
  so. "Details" lists what Conker asked and what you said. Needs Pi with drafter questions.
- **Server actions in the app.** Server > Services lists every service with its state, health,
  start time and automatic restarts; a service's details have Restart, which asks for the password
  in a sheet that says what it pauses ("Conker can't recall or save memories until it is back").
  Server > Backups says where the backups are and what that place does not protect against ("Same
  computer: lost if this PC dies"), the free space and the backups in the folder, with Back up now
  (Conker pauses for a few minutes) and Check this backup. Each action shows the host helper's
  receipt: working, done, failed with its reason, or can't tell with a Check that only reads. One
  runs at a time and nothing is retried by itself. Overview lists recent server actions, also the
  ones run with `conker ops run`. When the helper isn't running, the pages say so and give the
  commands that still work on the server.

- **More settings work, and tool settings live in ToolGate.** New-chat privacy, chat names, the
  message queue, the largest upload ("No limit" by default), signing out, new-chat access and the
  local model settings now do what they say. Tool and Terminal limits, safe search, the search
  region, sites to skip, the time an approved action has to start, and lockdown are saved in
  ToolGate's own settings (asking for the password; turning lockdown on does not), from Settings
  and from `conker config` alike. Wake, sleep, units and local model settings start as "Not set";
  the sidebar heading says Server.
- **Workflow drafting goes through tool requests.** `python scripts/conker.py workflow draft` is
  now `conker tool draft` under its older name (Pi drafts in the background; the draft waits in
  the Inbox), and `workflow from-chat SESSION MESSAGE_ID` files a tool request from your own
  message. Gone: the terminal questions, `--all-tools`, `--id`, `workflow accept` (Pi's offers)
  and the `wfp_`/`wfo_` Inbox items; `workflow dismiss creq_...` declines a tool request, and
  `workflow publish ... --request creq_...` tells Pi the requested tool is live. Needs Pi with
  the old workflow routes retired (Pi `## Unreleased`).
- **`conker tool answer creq_... "..."`** answers the drafter's question on a tool request
  (`needs_detail`, asked in the chat that made it), as the chat and the Inbox do, and waits for
  the draft. `conker tool draft` exits 4 when the drafter asks.
- **Deploy follow-ups.** Pi now knows the server's Ollama context length in both server layouts
  (`PI_OLLAMA_CONTEXT_LENGTH`, the same value as `OLLAMA_CONTEXT_LENGTH`), so the local context
  setting is capped to what the machine was sized for. `conker restart pi`, `conker restart` and
  the host helper's `services.restart` of Pi restart the services sharing Pi's network namespace
  (the Claude plan runtime, Laya) after it, instead of leaving them without a network. Imported
  chats can reach memory: every installer makes the key of MemoryGate's listener for imported chats
  and gives it to Pi, and creates the listener once MemoryGate answers (`./install.sh`,
  `workspace.py up`; on the Ubuntu layout `conker setup import-listener` after start, because
  MemoryGate creates listeners only through its admin API).

- **Release pins:** Pi 0.13.0, ToolGate 0.10.0 (with its sandbox image), MemoryGate 0.7.0. The
  dashboard reads the new job fields (who made a job, whether forgetting a chat turned it off, the
  agent's name) and shows the agent's name on the job page.

- **A calmer message box.** The composer shows the text box, Agent, Mode, voice typing and Send.
  Template, model, skills, Think, this chat's access and Incognito (and the call notes on a new chat)
  sit behind one plain More, which names anything not at its default ("More · Think · Incognito";
  on a phone, in a line above the bar). Nothing was removed. Access and Incognito say their state in
  words. New-chat starters are words ("Plan my day") instead of five bare icons. The square box and
  resize grip around the text box are gone, and Auto no longer names an unset "Jev".

- **The Inbox and Server tell the truth.** The Inbox shows "Loading your Inbox…" and a placeholder
  until every source has answered, and a source that failed says it didn't load; it never says
  "All clear" before that. After Send it (or Do it), the line says "Approved. Sending now…" and
  follows the saved request until ToolGate has run it ("ran at 14:02; the chat shows how it
  went"), shows when it can no longer run, and after a minute without word says it isn't
  confirmed yet, with Check again. A fresh device follows its own light or dark setting. Healthy
  Server checks say OK, and messages point to Server, not System.
- **"Check what happened" for an action whose result was never confirmed.** When something stopped
  while an action was running, the chat card now has a Check what happened button: Pi asks your
  tools about the same action and never sends it again. The card says what it found in plain
  words: checking, done (the reply appears), still unknown or still running (check again later),
  or why it could not check.

- **`conker context budget` works on an installed stack.** A chat starts with no context settings,
  and the error said to run a command only the development CLI had. Now `./conker context budget
  CHAT_ID --window TOKENS --reserve TOKENS` starts them through the pi container, like `conker
  config`, and the error names the chat.

- **The Claude plan on the repository install, ready for its image.** `./install.sh --claude-plan`
  adds the Claude plan runtime (`docker-compose.subscriptions.yml`, with its own two keys and the
  sign-in in `.conker/subscriptions`), and `./conker providers claude login|status|logout` then
  works there as on the Ubuntu layout. It needs a release that pins
  `ghcr.io/conker-ai/subscriptions` by digest; `.github/workflows/publish-subscriptions.yml`
  builds, checks, scans and publishes it for a `subscriptions-vX.Y.Z` tag, and until then
  `SUBSCRIPTIONS_STATE=deferred` keeps it off. `conker update`, backups and the spending switch
  now run the same overlays as `./conker`, so an update also keeps the agent sandbox's services,
  which it used to remove. See [docs/reference/claude-plan-runtime.md](docs/reference/claude-plan-runtime.md).

- **Server actions with receipts (the host helper, ADR-0014).** The private provider-control
  service now also runs a fixed list of server actions: service status, restart one service,
  list, verify and take backups. One at a time, never a shell, refused during a backup or a held
  recovery, each with a receipt that survives restarts and holds no secrets or output. An action
  cut off mid-way shows as unknown with a check, and is never retried by itself. `conker ops`
  lists and runs them from the server, with or without the helper; `conker restart SERVICE`
  restarts one service. The UI comes next.

- **Cron jobs: start from an idea.** Twelve ready-made AI jobs (morning brief, homework and
  deadlines, evening wrap-up, proactive check, event reminders, email triage, study group digest,
  freelance gig watcher, check-in, break reminder, weekly review, monthly spending report) sit
  under the Cron jobs list. Picking one only fills in the New AI job form with its name,
  instructions and timing; you change what you like and create it as usual, with your password.
  The form can now pick the agent when you have more than one. A job's page shows what it does at
  the top: its instructions when Pi sends them, otherwise a plain note that Pi keeps them.
- **`conker import chatgpt|claude PATH`** previews a ChatGPT or Claude data export (the zip, its
  folder or `conversations.json`; only that file is read) and with `--yes` imports exactly that
  file into Pi: archived, read-only chats labelled with where they came from, and your own words
  offered to memory as outside content. Re-importing adds nothing. Works in the installed launcher
  and `scripts/conker.py`; needs the Pi with `/imports` (docs/reference/import.md).

- **Interactive answers.** An answer can hold a table, a chart, choices to tap, a short form,
  steps, progress or a callout, drawn with Conker's own components from an `openui` block
  ([OpenUI](https://github.com/thesysdev/openui), `@openuidev/react-lang` 1.0.2). A tapped choice or
  a sent form is your next message, sent like the composer's; nothing else runs. A part that cannot
  be drawn says "Couldn't show this part" with its source one tap away. Settings, Chats,
  Interactive answers: Auto (hosted models only), On, Off. Needs the Pi with the pinned catalog
  prompt; CI checks the two match. The dashboard installs with `ignore-scripts`, so no dependency
  runs code (or install telemetry) at install time.

- **Eleven shell settings now change the screen they name, at once.** Corners, how the sidebar
  starts, which places it shows, bigger focus outlines, keyboard shortcuts and the search keys,
  how many waiting items Home shows, the Home greeting (with an "encouraging" line only when you
  decided something today), the plan allowance tile and ring, the completed tasks on Home, and the
  memory map. Screens read them through one `useServerSetting` hook that checks each saved value
  against the settings registry and falls back to its default.

- **19 more settings work now.** About you (what Conker calls you, pronouns, about you, people,
  goals, units, wake, sleep, your week, focus), instructions for every chat, simpler wording,
  project sources, research depth and recency, results per search, web page size, which plan
  windows alert you, and voice speed. They apply from the next answer. Results per search go up to
  8 and a web page to 12,000 characters, the most Pi uses.

- **The Claude plan on the server.** The source-built Ubuntu layout now runs a Claude plan
  runtime, the `subscriptions` service: the official Claude Code CLI (2.1.310, checked by SHA-512)
  behind the private bridge, sharing Pi's network namespace, with the sign-in in its own folder
  that snapshots leave out. Sign in once with `conker providers claude login` in the server's
  terminal, then pick Claude models in Settings > Models. ChatGPT answers pass through it to the
  host ChatGPT worker as before. The repository install has no such runtime yet (it runs only
  published images); connect Claude there with an Anthropic API key, which answers only after
  `conker providers spending on`. How each layout connects Claude is in docs/4-running.md.

- **MemoryGate and ToolGate ask Pi for model text with their own keys.** `install.sh`,
  `deploy/ubuntu/prepare.py` and the Windows workspace generate `MEMORYGATE_PI_SERVICE_KEY` and
  `TOOLGATE_PI_SERVICE_KEY` (with `MEMORYGATE_PI_URL` / `TOOLGATE_PI_URL`, Pi at `http://pi:8050`)
  and give Pi only their hashes, `PI_SERVICE_KEYS_SHA256`. Existing installs get them the next
  time `./install.sh` or `prepare.py` runs (the workspace on its next `up`); no other key changes.

- **`conker tool draft "..."`** files a tool request in Pi, waits while Pi drafts it in the
  background and prints its steps and issues, or why it failed (`--no-wait` to return at once).
  The draft waits in the Inbox. Works in both installed layouts and the development CLI.

- **Local models stay loaded for a day** after their last use instead of five minutes
  (`OLLAMA_KEEP_ALIVE=24h`), so the first answer after a pause does not wait for a reload. Change
  it with `CONKER_OLLAMA_KEEP_ALIVE` (in `.env`, or when running `prepare.py`).

- **Conker on the phone.** It can be added to the home screen as an app (manifest, icons, and a
  service worker that starts it from the build files and shows a plain "You're offline" page; it
  never stores API, sign-in or chat data). In a chat on a phone the composer stays above the
  on-screen keyboard (Android and iOS) with the latest message in view, and a back arrow or a
  swipe right returns to Chats. On a phone, Enter adds a new line and the Send button sends.
  Installing needs Pi's gateway to allow the manifest (`manifest-src 'self'`).

- **Conker remembers across chats.** What it learned in one chat can come up in any other, the
  same in every chat. Turn it off in Settings, Memory, Remember across chats (`memory.across_chats`),
  which replaces the unused "Recall in new chats". Before, a chat stopped recalling other chats once
  any of its settings was saved. Pins Pi 0.12.0.

- Pins Pi 0.11.1: two more small-model mistakes get one retry (request JSON that does not
  parse, and a tool's arguments without the tool request), so scheduling and tool drafts from chat
  work more often on a local model and raw JSON no longer reaches you as an answer.
  Settings and plan usage are listed with their screens in `capabilities.json`.

- Pins ToolGate 0.9.1: the Terminal takes a working folder of `/` as the workspace and a null time
  limit as the default, the arguments small local models send.

- **`conker config` on an installed server.** `./conker config list|get|set|reset` now works on a
  Docker install (repository and Ubuntu layouts), not only in development: the same registry and
  checks, and every read or write reaches Pi inside its own container, so no key leaves it.
  Settings kept in each browser (theme, text size, motion) say so instead of changing.

- **Settings, rebuilt around topics.** Every setting (401, in 31 topics such as Appearance, Inbox,
  Models, Memory, Access and Server) now comes from one registry, one file per topic in
  `dashboard/src/settings/registry/`, and every one uses the same row: title, one sentence, its
  control, Reset when changed, and Saving / Saved. Search, "Show advanced" and "Changed only" work
  across all topics; on a phone the topic list comes first. Rows for features still being built say
  "Not used yet": your choice is saved for them. New: accent color (Neutral, Blue, Indigo, Purple,
  Magenta), text size and animations. `conker config` and `docs/reference/settings.md` read the
  same registry, which replaces `settings-registry.json`. Settings with no other home live in Pi's
  new owner settings document; quiet hours, proactivity and budgets now show in Settings and ask
  for your password when saved. Pins Pi 0.11.0.

- **A separate, stronger reviewer.** The check before Conker acts without asking you has its own
  model in Settings, Models (Checking actions), so it can be stronger than the model that answers,
  for example Jev; `conker models --role reviewer --model ID` does the same. When the AI decides,
  anything that reaches a real person or can't be undone now always asks you. Every Inbox item
  also uses the same answer row (ideas: Accept / Not now; AI-job notes: Open chat / Got it).
  Pins Pi 0.10.0.

- **One Inbox card, and your answer continues the work.** Every decision shows its answers in one
  row: the tool's own yes and no (Send it / Don't send, Publish / Not yet, ...) and Change, which
  sends your words to Conker instead. Do it runs the exact action at once; you no longer open the
  chat to continue it, and a no frees that chat. Conker can ask you questions (`conker.ask`) with
  options it writes; your answer goes to that chat as your next message. Pick each tool's buttons
  in Settings, Access or with `conker tool-card`; answer from the CLI with `conker apply asks`.
  Pins Pi 0.9.0 and ToolGate 0.9.0.

- Pins ToolGate 0.8.1: the Terminal tells models never to wrap a whole command in quotes.

- **Requests wait until you see them.** An Inbox request no longer runs out after minutes: it
  shows "Waiting for you" with its age and stays until you answer. Once you allow it, the exact
  action has 15 minutes to run. Pins ToolGate 0.8.0.

- **Pins Pi 0.8.0 and ToolGate 0.7.0:** the owner tool switch end to end, owner confirmations
  that wait 15 minutes, the Terminal accepting `/workspace` and telling the model how to quote,
  and a sandbox runner that reports out-of-memory kills reliably.

- **A fresh `./install.sh` now starts on Linux.** Found by installing the release for real: keys
  were sometimes shorter than the gateway accepts (now always 32 characters, and a short one
  from an older install is replaced); Pi could not read your provider key files (Pi and the
  gateway now run as your user, like the source-built layout, and a one-time step hands their
  data over); and the local model never loaded (Ollama now uses an 8192-token context,
  `CONKER_MODEL_CONTEXT` to raise it).

- The source-built Ubuntu layout now runs SearXNG (the pinned image, as `toolgate-searxng`), so
  web search works there too; before, ToolGate reported it missing and general search had no
  local engine.

- **Tools Conker can use:** Settings, Access lists every tool with a switch; off means Conker
  cannot see or call it at all (asks for your password). Same from the CLI:
  `python scripts/conker.py tool-access ID`. A new install starts with Conker's built-in tools
  on (web search and reading, Terminal, Install packages); before this, a fresh install's Conker
  could use no tool and nothing in Conker could change that.

- **Agents have a terminal:** the Terminal and Install packages tools are on. Each command runs
  in a fresh locked-down container that sees only that agent's own workspace folder and has no
  network; installs come from PyPI and npm through a download-only proxy. Default access: AI
  decides. Pins Pi 0.7.0, ToolGate 0.6.0 (with its `toolgate-sandbox` image by digest) and
  MemoryGate 0.6.0, which also carry the access and change-request entries below.

- **Access by your settings:** Conker no longer waits for you on what your own settings already
  answer. The most specific setting wins: this chat's access switch (the shield in the composer:
  Agent's settings, Ask me, AI decides, Full access), the agent's setting per tool (agent page,
  Access per tool), then the tool's own. Tools you mark **Always ask me** (Settings, Access), and
  system controls, always ask; after a chat reads outside content it is one step stricter. When
  you typed the request yourself, an action that matches your words goes ahead. Settings, Access
  has the switch that lets Conker decide by your settings at all. Inbox, **Handled** lists what
  ran without asking you and who decided. Memories and cron jobs Conker makes now happen at once.

- **Plan usage ring:** next to the model in the composer, a small ring shows how much of the
  selected model's Claude or ChatGPT plan window is used; tap it for every window, its percent
  and when it resets. Local and API-key models show none.

- **Conker asks, you verify:** in chat (or from an AI job) Conker can ask for a cron job, a
  new tool or a memory. Each request lands in the Inbox showing exactly what would be made;
  **Create job**, **Save as draft** or **Remember** makes it real (asks for your password),
  **Decline** makes nothing. A tool request is saved as a draft in Tools for you to check
  and publish. Same from the CLI: `conker inspect change-requests`, `conker apply requests`.
  You can do the same by hand: **Add memory** (the plus on the Memory screen, or
  `conker apply memory` with `"operation": "remember"`), a new cron job, a tool draft in Tools.
- **Pi 0.6.1:** pin it for the drafting model role above, a 10-minute wait for the workflow
  builder, and the owner's read of plan usage, which fills Home's **Plan allowance** tile
  (Claude and ChatGPT percent used per window and when each resets). Pi is now licensed
  AGPL-3.0-only. `conker update` moves a server to it with its staged, health-checked rollback.
- **A model for drafting:** `conker models --role drafting --model ID` gives the workflow
  builder its own model (Pi's new `drafting` role) while chat keeps its own;
  `--role ROLE --off` switches a role off. The dashboard now keeps model roles it does not
  list when it saves, so a role set from the command line is never switched off by the page.
- **Clean images:** the weekly security check scans every image `versions.env` pins with
  Trivy. Its first run moved ToolGate and MemoryGate to 0.5.1 (their images no longer carry
  the base image's setuptools and wheel) and the third-party pins to PostgreSQL 16.15,
  Qdrant 1.19.2, Ollama 0.40.6 and SearXNG 2026.10.19, which clear most of what it found.
- **Module release:** pin Pi 0.6.0, ToolGate 0.5.0, MemoryGate 0.5.0, SystemGate 0.4.0 and
  Embeddings 0.1.4, which carry everything the connected workspace has used since the
  0.5.6 pins (see each module's changelog). `conker update` moves a server to them with
  its staged, health-checked rollback.
- **Workflow offers from chat:** when you ask the companion for something recurring, Pi
  puts an offer in the Inbox; `conker workflow accept wfo_...` drafts from that message as
  `from-chat` does, and `workflow dismiss wfo_...` declines it. Needs Pi with offers
  (pi#52).
- **Weekly security check:** `.github/workflows/security.yml` audits the dashboard's npm
  packages and the decisions sidecar's pins against the public advisory databases each
  Monday and whenever they change. Each module repository runs the same check on what it
  ships.
- **Guided first run:** `conker setup` walks a new installation through Pi's verified
  setup steps one plain question at a time: browser password, companion, answer model,
  memory, tools and their limits, backups and the short test run. It runs the same
  `conker setup run STEP` commands scripts use, lets Pi decide whether each step took,
  approves only the test run's own harmless request, and continues where it stopped.
  The installer offers it at the end of an interactive install.
- **Live-journey patch release:** pin Pi 0.5.1 and MemoryGate 0.4.1, and bind the
  dashboard build to its exact tree. Cancelled requests are annotated in replayable
  model context; Companion can explicitly opt into admitted cross-chat memory
  without widening other agents or private-chat scope. Repair pending-message
  rendering and operation confirmations without changing the restored visual UI.

- **Host-only provider credentials:** installer reruns migrate OpenRouter, OpenAI and
  Anthropic keys out of `.env` into owner-only files. `conker providers` now stages hidden
  input, assigns opaque revisions, performs fixed-endpoint verification with a 15-minute
  freshness bound, activates by recreating and health-checking Pi, rolls back interrupted
  transitions, and records operator-confirmed issuer revocation. Pi receives read-only key
  files and exposes only configured identities. Backups omit keys, retain bounded metadata
  and keep restore under credential review; browser key entry remains intentionally absent.
- **Durable typed calls:** the chat header now reconnects or starts a focused call
  conversation through strict owner routes. Text turns use retained request identities,
  bounded transcripts, explicit uncertain-result recovery, pause, interrupt and end
  controls. The browser contract carries no audio or device authority; live voice remains
  deferred until media transport and deployment acceptance exist.
- **Read-only owner files:** connected System file browsing now uses explicit
  operator-configured ToolGate roots, durable Pi listing requests, strict owner DTOs,
  and exact browser routes. It exposes relative names and kinds only: no contents,
  editing, uploads, deletes, recursive crawl, shell access, or hidden redispatch.
- **Read-only host inventory:** connected System process, port and container views
  now use durable, explicit ToolGate samples and strict redacted owner DTOs. The
  browser receives no raw PID, command line, user, container image/ID, host address,
  terminal, file, secret or mutation authority; every refresh creates a new request.
- **Connected team definitions:** owners can create, edit, archive, restore and inspect
  immutable revisions of canonical Pi team configurations. Roles narrow saved agents;
  no preparation, team execution, credential, grant, or implicit handoff authority is
  exposed through the browser.

- **Chat completion milestone:** shared Markdown/code/table/math/citation rendering,
  editable paused queues with captured model/privacy, response versions and explicit
  earlier-turn forks. Added inspectable tool/agent/plan/receipt fixtures, bounded
  evidence and character activity fallbacks. All execution remains frontend Preview;
  transcripts and queues remain memory-only. See `docs/chat-delivery-progress.md`.

- **Product dashboard preview:** the active `dashboard/` app now includes Home,
  Companion and Chats, Inbox, character and call interfaces, Memory, Journal,
  Agents, Tools, Jobs, System and Settings. Data remains behind the fixture
  `ConkerClient`; backend integration is not implied by these screens.
- **Conversation activity:** retained response activity, elapsed duration and
  inspectable steps, with scroll-aware working/jump-to-latest feedback.
- **Repository documentation:** product overview, local screenshots, current
  route/setup guide, module map, contribution guide and source-audited integration
  limits. Added a proposal for cross-repository planning without coupling modules.

- **Design system foundation:** React/TypeScript/Vite package with Tailwind v4 OKLCH
  semantic pairs, registry-sourced Radix primitives, shared eight-state status with evidence
  validation and aging, theme controls, fixtures and browser/mutation tests. This
  earlier package is separate from the active product dashboard above.

- **Backup and held recovery (B1/B2):** replace live SQLite file copying and false-success
  backups with coordinated snapshots, required-store checks, vault-key verification, file hashes,
  and exact image identities. Capture ToolGate's complete volume and MemoryGate's otherwise
  unmounted runtime key, plus index/model and image-declared volumes.
- **`restore`, `verify-backup`, `recovery-status`:** recovery uses fresh volumes and no networking
  or application startup. Old pending approvals are cancelled, ToolGate is locked down, and
  unfinished work is held. Exit 3 means **held**, not usable. Deletion replay and complete
  external-effect reconciliation remain blocked by B3/C2 and B6; no promotion command is shipped.
- Add offline behavioral tests and a separate Linux/Docker recovery drill. Gate code and B7/B8
  are unchanged. See `docs/recovery.md` for the validation boundary and recovery procedure.

Installer implementation (deployment readiness still requires the checks in
[`docs/current-state.md`](https://github.com/Conker-AI/conker/blob/5e71ee97a09bb2d5a7fcef73c8bf8bff87229d29/docs/archive/current-state.md)):

- **`./install.sh`** — checks the machine, asks three questions in plain
  language, generates every secret, writes `.env` at `0600`, pulls pinned
  images, starts them, reports honestly which came up, and prints one URL.
  Re-running repairs rather than duplicates: existing keys are kept, because
  regenerating them would lock the owner out of their own vault and database.
- **`./conker`** — `status`, `tailscale`, `backup`, `logs`, `model`,
  `start`/`stop`/`restart`, `update`, `key`. Each named as the thing you want
  rather than the mechanism: `conker status` asks every service what it thinks
  of itself, because a running container that cannot reach its database is not
  a working service.
- **Every image pinned**, ours by version tag and third-party by digest. Never
  `latest` — a moving tag is a supply chain attack that needs no attacker.
- **Every port binds to `127.0.0.1`**, asserted in a test. There is no
  direct public inbound bind; outbound downloads, providers and tools are separate.
  `conker tailscale` supports private connectivity, while remote gateway access
  still needs the HTTPS setup described in `docs/browser-auth.md`.
- **One Ollama, shared** by Pi and Embeddings. The gates' own compose files each
  ran their own, which stores every model twice for no benefit.

Found by running it, rather than by reasoning about it:

- **ToolGate shipped a developer's `.env` and database inside its image.** Fixed
  upstream in ToolGate 0.2.2; see the security note below.
- **MemoryGate crash-looped** because its read key needs an `mg_read_` prefix.
  ToolGate demands `tgx_`. Both shapes are now applied where the key is made,
  since getting it wrong fails minutes later at container start rather than at
  the point of the mistake.
- **ToolGate had no persistent data volume** — its tools, secrets and audit
  trail would have vanished on the first `docker compose down`.
- **A pre-existing `conker_net` broke the install.** Compose refuses to adopt a
  network it did not create, and reports it as an "incorrect label" error that
  says nothing about what to do. An empty one is now cleared; one still in use
  names what is on it and what to run.
- **A port conflict was reported as a 500 from an internal Docker forwarding
  API.** True, and no use to anyone. Now it names the port and the two ways
  out. The preflight check cannot always catch it — under Docker Desktop the
  port is bound on the host, which a check inside the VM cannot see.

### Security

**`ghcr.io/alexeybe1kin/toolgate:v0.2.0` and `v0.2.1` contain real
credentials** — ToolGate's admin key and vault salt, MemoryGate's read key, a
GitHub token and a Tavily key — plus a working `toolgate.db`. `COPY toolgate
./toolgate` swept the package directory, and ToolGate keeps its data inside it.

Git history was never affected; the packages were never public. Both versions
are being deleted from the registry and the credentials rotated. Fixed in
ToolGate 0.2.2, and every module now builds its image in CI and searches it,
because the ignore file that prevents this is exactly the kind that silently
stops matching when a path moves.

### Pinned in this release

| Module | Version |
|---|---|
| Pi | v0.17.0 |
| ToolGate | v0.11.0 |
| MemoryGate | v0.7.0 |
| SystemGate | v0.4.0 |
| Embeddings | v0.1.4 |
