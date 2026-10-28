# Settings registry

Every setting in Conker is one entry in one of these files, one file per topic. The Settings
screen, `conker config` and `docs/reference/settings.md` (`python scripts/settings_docs.py`) all read
them. To add a setting, add one entry to the right section; nothing else is needed for it to show,
search, save and reset.

## A topic file

```json
{
  "schemaVersion": 2, "id": "appearance", "title": "Appearance",
  "description": "How Conker looks on your screens.",
  "icon": "palette", "category": "you", "order": 20,
  "sections": [{ "id": "theme", "title": "Theme", "settings": [ ... ] }]
}
```

`category` places the topic under a heading in the side list (`you`, `inbox`, `talk`, `brain`,
`safety`, `system`); `icon` is a name from `src/settings/icons.ts`; `order` sorts the topics.

## A setting

```json
{ "id": "appearance.accent", "title": "Accent color",
  "description": "The color of main buttons and of things that need you.",
  "type": "select", "default": "neutral", "tier": "basic", "scope": "global", "effect": "live",
  "options": [{ "value": "neutral", "label": "Neutral" }, { "value": "blue", "label": "Blue" }] }
```

- **type:** `toggle`, `select`, `list` (several from options), `number` (with `min`, `max`, `step`,
  `unit`), `slider` (0-100 with `ends`), `time`, `date`, `timezone`, `text`, `textarea`
  (`max_length`), `tags` (free short items), `models` (a priority list of models, first choice
  first), or `custom` (a screen of its own, named by `component`, drawn by `src/settings/blocks.tsx`).
- **tier:** `basic` shows by default; `advanced` shows with "Show advanced".
- **scope:** `global` (saved on the server), `device` (this browser; needs `"home": {"service":
  "browser"}`), `chat` or `agent` (set in each chat or agent; listed here for search).
- **effect:** `live`, `next-turn`, `restart`, or `stored`: saved now, read by a feature still being
  built. Stored settings show "Not used yet". Change it to `live` in the same change that makes a
  feature read the value (`pi.owner.settings.value`).
- **home:** leave it out and the setting lives in Pi's owner settings document under its id. Give
  one only when the value already lives elsewhere (`/owner/preferences`, `/search/settings`, a chat);
  `"verify": true` marks homes whose saves ask for the password.
- **dependsOn:** `{ "id": ..., "value": ... }` greys the row until that setting has that value.

## Wording (checked by `tests/test_settings_registry.py`)

- Titles: sentence case, at most 40 characters, a noun phrase, no period ("Accent color",
  "Quiet hours start"). Names keep their capitals (Conker, Inbox, ChatGPT, Jev).
- Descriptions: one plain sentence, 20-140 characters, ending with a period. Say what changes for
  the owner, in his words: "you" for him, "Conker" for the app. Never "This setting", "Enable" or
  "Allows".
- Option labels: sentence case, at most 32 characters, the outcome not the mechanism ("Until you
  answer", not "null").
- Units go in `unit`, never in the title. Ids are `topic.name`, lowercase, and never contain
  key, token, password, secret or credential: secrets keep their own write-only screens.
