# Character Studio implementation

Character Studio is a frontend editor at `/settings/companion`, extending the existing Conker dashboard. Its purpose is to author a companion's identity, appearance, voice configuration and delivery modes. The current fixture client saves in memory. It does not connect a language model, speech engine, image generator or avatar runtime.

## Surface and ownership

`src/app/settings/companion/page.tsx` owns the draft form, import review, export and save/discard actions. `src/config/navigation.ts` declares the shared appbar sections and `RouteSection` selects their content:

| Section | URL value | Content |
| --- | --- | --- |
| Identity & soul | `identity` (default) | Name, profile line, personality, soul/values, backstory, relationship and custom details |
| Speaking style | `speaking` | Writing instructions and user-authored Focus/Character examples |
| Appearance | `appearance` | Main portrait, artwork library, activity assignments and named expressions |
| Voice | `voice` | Voice description, language, reference recording/transcript and pronunciation notes |
| Expression & modes | `modes` | Default mode, per-mode text/voice instructions, intensity and artwork motion |

Sections use `?tab=` links in the existing appbar. The page uses `BaseLayout`, shared cards/fields and `FormActions`; import uses `TaskDialogContent`. The editor and preview form two columns on large screens and stack below that breakpoint. Existing semantic colors, density, corners and portrait treatment remain authoritative in [DESIGN.md](DESIGN.md).

`src/components/character-studio/` owns the reusable editors, fields, media preview and authored-example preview. `src/lib/api/character.ts` owns schemas, validation, draft cloning, equality, import/export, asset removal and authored examples. `character-defaults.ts` supplies missing Studio data for legacy profiles. `src/lib/character-workspace.ts` keeps an unsaved draft across internal routes.

## Drafts, save and packages

Editing updates a separate draft. Save validates and deep-copies it through `ConkerClient.saveCharacter`, then clears the draft; Discard restores the saved profile. Both saved profiles and drafts reset on a full reload. A dirty draft registers a browser unload warning. Export downloads the current validated draft, including embedded artwork and voice reference, whether or not it has been saved.

Native packages use `{ "format": "conker-character", "version": 1, "character": ... }` and round-trip the full supported character configuration. JSON packages are limited to 32 MB. The schema validates field lengths, allowed media sources, unique IDs and asset references. Import also checks that embedded media can be decoded by the browser before offering **Import into draft**. Accepting an import replaces the current draft; it leaves the saved profile unchanged until Save.

Character Card V2/V3 JSON imports are intentionally text-only:

| Card field | Studio destination |
| --- | --- |
| `name` | Name |
| `personality` | Personality |
| `description` | Backstory |
| `scenario` | Relationship |
| `mes_example` | Speaking instructions |
| `first_mes` | Character example |

Other current fields, artwork and voice remain in place. Embedded PNG cards, CHARX archives, system prompts and other card instructions are not imported. Import is neither execution nor model configuration.

## Identity, artwork and preview

Personality, values, lore, relationship and speaking instructions remain user-authored. Defaults are editable starting content, not a personality-selection system. Backstory is fictional character context and remains separate from conversation memory.

Activities are `idle`, `listening`, `thinking` and `speaking`. Expressions are user-named entries with independent guidance and optional artwork. In `CharacterMedia`, an expression's assigned asset wins over the current activity asset; if neither supplies an asset, the main portrait appears. Removing an asset clears every activity/expression reference to it.

The library accepts up to 16 assets: still PNG/JPEG/WebP images up to 2 MB each and MP4/WebM videos up to 8 MB each. Main portraits use still images. Animated PNG/WebP files are rejected so motion remains controllable. Artwork keeps its aspect ratio and complete frame; inset ranges from 12.5% to 25% per side. Videos loop silently. A mode with motion disabled, or the browser's reduced-motion preference, replaces selected video artwork with the main portrait; assigned still images remain visible. Reduced-motion changes are observed while the page is open.

**Preview example** returns the selected written example and delivery instructions with `kind: "authored-example"`. It does not infer a response or run tools. Changing the draft or preview mode marks the displayed example stale. Activity/expression selectors preview artwork only; automatic expression selection, live animation in conversations, 3D models and lip sync remain future work.

## Voice decision and limits

The configured engine is `qwen3-tts`, with two future entry paths: describe a new voice or supply a reference recording. Qwen's VoiceDesign model accepts descriptive instructions; its Base models clone from reference audio and transcript. The project documents a design-then-clone workflow for reusing a designed identity across lines. These capabilities support keeping one voice identity with separate delivery guidance. [Qwen3-TTS documentation](https://github.com/QwenLM/Qwen3-TTS#voice-design-then-clone)

The ten language choices follow Qwen's published list: English, Chinese, Japanese, Korean, German, French, Russian, Portuguese, Spanish and Italian. VoiceDesign and CustomVoice instruction controls are model-specific; stored expressiveness percentages are application guidance, not a validated Qwen parameter. A later adapter must map only capabilities supported by its selected model. [Qwen released models](https://github.com/QwenLM/Qwen3-TTS#released-models-description-and-download)

No Qwen process or transport is connected. Generate voice samples stays disabled. The browser can play an uploaded WAV/MP3/OGG/WebM/M4A reference up to 8 MB; this is the original recording, not cloned or generated speech. Conversation read-aloud continues to use browser speech synthesis independently of Studio voice configuration. Cloning, generated read-aloud, emotion control and real-time speech require later integration.

## Focus and Character isolation

Each mode stores text instructions, voice delivery, expression intensity and an artwork-motion preference. Focus starts with restrained delivery and motion off; Character starts with fuller expression and motion on. Both use the same identity. Intensity and instructions are saved guidance for a future engine.

`ConversationAppbar` exposes **Response mode · preview** in the title menu. `presentationMode` is stored per conversation and affects future fixture replies only. Switching it does not change model routing, tools, privacy/harness preferences, memory or execution grants; it cannot change during streaming. Forks copy the mode independently. Newly created companion chats use the saved Studio default; other agents start in Focus. Saving a different default does not rewrite existing conversations. Clearing the permanent Companion reapplies the saved default.

Fixture replies use explicit, deterministic simulated text for each mode and record the mode on the reply. They do not apply personality instructions through a model, synthesize the character voice or execute tools.

## Verification boundary

`scripts/check-character.cjs` covers validation, independent saved copies, native round-trip, text-card import, asset-reference cleanup, authored previews, mode/privacy independence, fork isolation and fixture reset. It does not decode media or validate rendered behavior. Run `npm run check:character`, the design guard, relevant lint and build checks when changing this feature; media handling and responsive/keyboard behavior also need browser verification.

This documentation pass inspected the staged source. No new screenshot, browser-console or rendered interaction verification was available. The existing screenshot reference was checked only for the incumbent design, so it is not evidence of visual approval for Character Studio. Desktop/mobile layout, light/dark themes, keyboard focus, upload/playback, reduced motion and import/save interactions still require a rendered check.
