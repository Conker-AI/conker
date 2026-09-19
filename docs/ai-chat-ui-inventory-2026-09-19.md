# AI conversation UI inventory

Research date: September 19, 2026. Scope: desktop web conversation interactions, with separately identified voice/mobile documentation. This is a selection catalogue, not an implementation commitment.

## Read this first

The floating Conker control has been reduced from 48px to a 32px visible circle, with a 16px arrow and a 44px pointer target. The active orb/portrait fits inside it. Light/dark screenshots, a narrow viewport, active generation, and jump-to-latest behavior were checked in Chrome. Build and targeted lint passed. No features from the catalogue below were implemented in this research pass.

**We do not yet have the complete activity history in the supplied Codex screenshot.** Conker has Thinking/Writing, a scroll-aware activity indicator, stop, and expandable recorded tool receipts. It does not have a live event timeline covering tool lifecycle, progress commentary, named subagent lifecycle/messages, elapsed working time, or a changed-files summary.

The practical direction is one compact activity summary that can expand into useful evidence. Character artwork provides expression; the activity state tells the truth about execution. A spinning ring alone cannot explain whether a run is reading, waiting for permission, executing, failing, or finished.

This is a broad audit of 12 external chat products plus the supplied Codex example. It is **not a claim that every feature in every plan, region, mobile app, and experiment has been exercised**. Several sites require your authentication or browser verification. Those gaps are explicit below. Product labels and availability can change; model names seen in menus are not integration recommendations.

## Evidence and selection key

- **Browser:** inspected with Chrome DevTools; menus and screenshots were examined. A visible menu does not prove its underlying service works.
- **Docs:** an official product/help page confirms the behavior; it was not necessarily exercised in our account.
- **Screenshot:** your supplied Codex image confirms the visible presentation only.
- **Proposal:** an idea for Conker, not a claim about another product.
- **Local:** implemented interaction in Conker's current frontend. This does not mean a live AI/server integration exists.
- **Preview:** a fixture, placeholder, local approximation, or incomplete implementation.
- **Missing:** no corresponding behavior found in the active conversation path.
- **Unverified:** not enough evidence to mark it working or missing.

Each item has an ID. Choose **Keep / Add / Later / Skip** by ID or group. Decisions are intentionally unassigned. “Local” features can still need refinement; “Missing” does not mean we should build everything.

## What was actually inspected

| Product | Chrome result | Strongest evidence from this pass | Remaining gap |
| --- | --- | --- | --- |
| [ChatGPT](https://chatgpt.com/) | Browser-verification gate | Official Search, Deep Research, Voice, Temporary Chat and Canvas material | Authenticated conversation and current visual details |
| [Claude](https://claude.ai/) | Browser-verification gate | Official thinking/effort, artifacts, research, voice and incognito material | Current menus, running state and artifact interactions |
| [Gemini](https://gemini.google.com/app) | Completed a guest conversation | Composer, citations, source preview, Copy, Redo menu, response-details rail; screenshots inspected | Signed-in tools, uploads, Research/Canvas execution and microphone behavior |
| [Grok](https://grok.com/) | Guest home and model menu; selection reached verification gate | Fast/Auto/Expert/Heavy choices visible | Actual response, search timeline, voice and post-response controls |
| [DeepSeek](https://chat.deepseek.com/) | Login screen | Official historical DeepThink description | Entire current signed-in UI, especially the voice-typing experience you like |
| [Z.ai](https://chat.z.ai/) | Guest composer and model menu; request reached slider CAPTCHA | Deep Think control, tool controls, waiting dots, Stop, disabled model selection during request | Completed response, citations, detailed activity and retry |
| [Qwen](https://chat.qwen.ai/) | Guest prompt initially failed; Regenerate succeeded | Tool menu, removable Search chip, model/mode selection, inline failure, Thinking completed, activity rail, response versions, Read aloud, follow-ups; screenshots inspected | Actual uploads, paid tools, voice session and ongoing tool execution |
| [Kimi](https://www.kimi.com/) | Home/tool entry points; prompt required login | Swarm/Deep Research/Slides/Docs/etc. visible; official Swarm execution documentation | Running agents, execution detail and deliverable interactions |
| [Perplexity](https://www.perplexity.ai/) | Browser-verification gate | Official Pro Search and Advanced Deep Research documentation | Current source cards, research animations and report editor in browser |
| [Le Chat](https://chat.mistral.ai/) | Browser-verification gate | Official Le Chat announcements and Mistral Work files/Canvas docs | Consumer UI fidelity; Work and consumer features are not assumed identical |
| [Microsoft Copilot](https://copilot.microsoft.com/) | “Not available in your region” | Official conversation-mode documentation | Any live interaction; M365 and consumer Copilot must be audited separately |
| [Meta AI](https://www.meta.ai/) | Sign-in dialog | Navigation and official voice/social interaction announcements | Chat, voice, generated-media interactions and current regional availability |
| Codex | Supplied screenshot | Working duration, commentary, tool groups, subagent events/messages, changed-file summary | No new claim about unseen Codex controls |

Only neutral test prompts about `prefers-reduced-motion` were submitted. No private files, paid research job, publication, or microphone/camera recording was used for this audit. Qwen's completed answer appeared on its second attempt, with a visible `2/2` version control. Z.ai's CAPTCHA was not bypassed. No login credentials were requested or handled.

### Notable browser findings

1. **Qwen gives activity its own inspectable surface.** Clicking “Thinking completed” opened a “Thinking and Search” rail with titled stages and completion marks. The response remained in the main pane. This demonstrates a presentation pattern, not proof that the displayed text is a complete internal reasoning trace.
2. **Gemini separates answer actions from evidence.** Redo offered Longer, Shorter and Try again. More offered View sources and response details. A citation opened a source preview with an excerpt. Response details opened a closable rail with the model used.
3. **Tool activation can stay compact.** Qwen's menu selection became a removable Web search chip in the composer. A chip conveys the next turn's enabled capability without leaving the entire tools menu open.
4. **Failure states are part of the design.** Qwen preserved the prompt, attached a service error to the failed turn, and offered Regenerate. The later success retained version navigation. A generic toast would have lost that context.
5. **Labels need evidence.** Gemini's generated source-link prose did not always name the same publisher as the attached grounding preview. In Conker, a source card should identify the actual evidence item, not simply repeat generated link text.
6. **Anonymous access is an incomplete picture.** A disabled option in a guest menu may be account/plan gating, not an unsupported product capability. DeepSeek's exact voice waveform/transcript design is still unverified here.

## The selection catalogue

The placement column follows Conker's existing ownership rules. “Thread” includes the response's expandable activity group. “Rail” is reference/detail opened from a relevant action. Substantial creation/editing remains a dedicated workspace or shared dialog.

### A. Presence, thinking and scroll behavior

| ID | Selectable behavior | Evidence | Conker now | Home / detail |
| --- | --- | --- | --- | --- |
| A01 | Immediate acknowledgement after Send | Browser: Z.ai waiting dots | Local | Thread; phase starts before text arrives |
| A02 | Compact animated working mark | Browser: Z.ai; supplied orb references | Local | Thread and floating scroll control |
| A03 | Meaningful current phase such as Thinking or Writing | Browser: Qwen; [Claude thinking][C1] | Local | Only these two phases currently |
| A04 | Different states for Searching, Reading, Running code, Waiting | Screenshot; [research progress][P2] | Missing | Thread; must follow execution events |
| A05 | Elapsed “Working for…” timer | Screenshot; [Claude thinking][C1] | Missing | Activity summary, frozen at completion |
| A06 | Completed “Worked for…” group that can reopen | Screenshot; Browser: Qwen completed disclosure | Missing | Thread; preserve the run's history |
| A07 | Provider-supplied reasoning summary disclosure | Browser: Qwen; [Claude thinking][C1] | Missing | Thread/rail; label as summary |
| A08 | Honest unavailable/incomplete summary state | [Claude thinking][C1] | Missing | Summary detail; do not invent missing text |
| A09 | Short progress commentary interleaved with work | Screenshot | Missing | Activity group, separate from final answer |
| A10 | Floating activity indicator while reading older messages | Conker browser/code; user reference | Local | 32px control at thread bottom-center, above composer |
| A11 | Finished generation turns that control into a down arrow | Conker browser/code; user reference | Local | Jump to latest; never hijack manual scroll |
| A12 | Inline activity only where the latest reply is visible | Conker code/browser | Local | Avoid two competing attention signals |
| A13 | Unread response count or “New reply” hint | Proposal | Missing | Floating control; optional, not a permanent badge |
| A14 | Reduced-motion and hidden-tab animation handling | Conker code | Local | Orb/ring animation respects these conditions |

### B. Tool and agent execution

| ID | Selectable behavior | Evidence | Conker now | Home / detail |
| --- | --- | --- | --- | --- |
| B01 | Compact tool-call summary row | Screenshot; Conker receipts | Preview | Thread; existing receipt is recorded fixture data |
| B02 | Tool states: queued/running/succeeded/failed/cancelled | Proposal; [Kimi execution][K1] supports progress inspection | Missing | Activity group; state needs backend events |
| B03 | Expand tool inputs and returned result | Screenshot; existing Conker receipt | Preview | Thread/rail; redact secrets in future real data |
| B04 | Group repetitive calls into a quiet summary | Screenshot: “Used the browser…” | Missing | Thread; expand to individual events |
| B05 | Visible active tool name and target | [Kimi execution][K1] | Missing | Activity summary; distinguish tool from model |
| B06 | Per-step start/end time and duration | Proposal | Missing | Rail; useful for slow or stuck work |
| B07 | Live terminal or execution-output preview | Screenshot context; Proposal for Conker | Missing in chat | Thread preview opening System/detail, not a second terminal product |
| B08 | Inspect visited pages and evidence during work | [Kimi execution][K1], [Research][O1] | Missing | Activity detail/rail |
| B09 | Plan checklist updates during execution | [Kimi execution][K1] | Preview | Existing static plan card is not an updating task list |
| B10 | Named subagent started/working/finished events | Screenshot; [Kimi Swarm][K1] | Missing | Activity group |
| B11 | Parent/child task and parallel branch inspection | [Kimi Swarm][K1] | Missing | Rail or focused workspace; keep chat compact |
| B12 | Agent-to-agent handoff/message events | Screenshot | Missing | Activity detail; distinguish from user messages |
| B13 | Inspect a subagent's output and failure | [Kimi Swarm][K1] | Missing | Rail with return to parent run |
| B14 | Explicit “Waiting for you” approval event | Proposal; current Inbox flow | Preview | Thread links to existing Inbox decision |
| B15 | File change summary with affected files and diff | Screenshot | Missing | Response receipt; detailed diff in inspector |
| B16 | Completed deliverables with preview/download | [Kimi outputs][K1] | Missing | Thread artifact card, not tool-log text |

### C. Model, mode and routing controls

| ID | Selectable behavior | Evidence | Conker now | Home / detail |
| --- | --- | --- | --- | --- |
| C01 | Model/provider picker with current selection | Browser: Gemini, Qwen, Grok | Local / fixture catalogue | Composer; full provider setup remains Settings |
| C02 | Model capability descriptions | Browser: Qwen and Grok menus | Preview | Picker; don't promise unsupported capabilities |
| C03 | Auto versus faster/deeper response mode | Browser: Qwen/Grok; [Copilot modes][MS1] | Missing | Composer; separate from character mode |
| C04 | Reasoning-effort choice where supported | [Claude effort][C1] | Missing | Model submenu, model-dependent |
| C05 | Thinking toggle where the provider allows it | Browser: Z.ai; [DeepSeek][D1] | Missing | Composer; respect model constraints |
| C06 | Inspect which model actually answered | Browser: Gemini response details | Preview | Per-message Info/rail; fixture metadata today |
| C07 | Next-turn override versus conversation default | Conker code | Local | Composer selection versus conversation menu |
| C08 | Retry a message with another model | Conker code | Local / preview generation | Per-message retry submenu |
| C09 | Model-specific unavailable/limit/fallback explanation | Browser: Qwen service error; Proposal for fallback | Missing | Near failed turn or model control |
| C10 | Study/tutoring as a distinct interaction mode | [Copilot modes][MS1] | Missing | Optional composer mode; not just a personality label |

### D. Composer and context preparation

| ID | Selectable behavior | Evidence | Conker now | Home / detail |
| --- | --- | --- | --- | --- |
| D01 | Draft preserved per conversation | Conker code | Local | Composer |
| D02 | Enter sends; Shift+Enter inserts newline | Conker code/browser | Local | Composer with quiet hint |
| D03 | Plus/Tools menu for capabilities | Browser: Gemini, Qwen, Z.ai | Preview | Tools currently has disabled Attach; not a full catalogue |
| D04 | Activated tool shown as removable chip | Browser: Qwen Web search | Missing | Composer; state survives menu closing |
| D05 | Attach images/documents/audio/video | Browser: Qwen upload menu; [Mistral files][M3] | Preview | Attach is not connected |
| D06 | Paste/drop files directly into input | [Mistral files][M3] | Missing | Composer drop target |
| D07 | File chips with remove/preview affordances | Proposal | Missing | Composer; separate file selection from successful upload |
| D08 | Upload progress/error/retry and unsupported-file feedback | Proposal | Missing | On each attachment; never a silent failure |
| D09 | Select connected source or folder for a turn | [Research sources][O1], [Gemini Research][G1] | Missing | Composer source selector; credentials stay in Settings |
| D10 | Reply-to excerpt with clear cancel | Conker code | Local | Composer |
| D11 | Contextual starter suggestions on an empty chat | Browser: Qwen, Z.ai, Kimi | Preview | Existing start/scenario UI; not a live suggestion service |
| D12 | Submit clarifying choices before running a large task | [Research][O1], [Perplexity Research][P2] | Missing | Thread choice card rather than a settings detour |
| D13 | Add an instruction while work is underway | [Perplexity Research][P2], [Research][O1] | Missing | Composer; requires steer/queue semantics |
| D14 | Visible queued prompt with edit/remove | Proposal | Missing | Above composer; different from an active message |

### E. Per-message actions and response navigation

| ID | Selectable behavior | Evidence | Conker now | Home / detail |
| --- | --- | --- | --- | --- |
| E01 | Copy with temporary success feedback | Browser: Gemini/Qwen; Conker code | Local | Under message |
| E02 | Edit a submitted user message | Browser: Gemini; Conker code | Local / preview | Shared edit dialog; branch consequences need clear treatment |
| E03 | Regenerate response | Browser: Gemini/Qwen | Local / preview | Response toolbar |
| E04 | Previous/next response versions and index | Browser: Qwen `2/2` | Missing | Under response; retry alone is not version history |
| E05 | Quick rewrite: shorter/longer | Browser: Gemini Redo | Missing | Response menu |
| E06 | Read aloud with stop state | Browser: Qwen button; Conker code | Local | Device/browser voice, not the selected character TTS model |
| E07 | Positive/negative rating | Conker code | Local / preview feedback | Response toolbar |
| E08 | Feedback reason/report action | Browser: Qwen More; Gemini legal report | Missing | Response menu; private feedback distinct from public sharing |
| E09 | Share message/conversation | Screenshot; Conker code | Preview | Current local link is not a published share service |
| E10 | Fork at a selected message | Conker code | Local / preview sessions | Per-message menu; fork tree in rail |
| E11 | Pin a useful message | Conker code | Local | Per-message menu |
| E12 | Redact/delete a message with consequence explained | Conker code | Local / preview | Per-message menu + shared confirmation |
| E13 | Timestamp and response information | Conker browser/code | Local / fixture metadata | Quiet toolbar; detailed metadata in rail |
| E14 | Suggested follow-up questions | Browser: Qwen after response | Missing | Optional thread suggestions; never masquerade as user prompts |

### F. Search, citations and research

| ID | Selectable behavior | Evidence | Conker now | Home / detail |
| --- | --- | --- | --- | --- |
| F01 | Explicit Web search for next turn | Browser: Qwen; [ChatGPT Search][O2] | Missing | Composer Tools; unrelated to app-page search |
| F02 | Citation anchored to the supported statement | Browser: Gemini; [Search][O2] | Missing as general renderer | Thread; fixture source list is insufficient |
| F03 | Hover/click source preview with publisher/excerpt | Browser: Gemini; [Search][O2] | Missing | Citation popover leading to rail/source |
| F04 | Sources list separate from related reading | [Search][O2] | Preview | Existing source rail needs real evidence IDs |
| F05 | Open cited passage or original source | Browser: Gemini | Preview | Source action; preserve actual URL and provenance |
| F06 | Deep Research mode as a distinct workflow | [Research][O1], [Perplexity][P2] | Missing | Composer entry; thread progress |
| F07 | Review/edit research plan before execution | [Research][O1], [Gemini Research][G1] | Missing | Thread plan card; substantial editing in shared surface |
| F08 | Restrict/prioritize websites and data sources | [Research][O1] | Missing | Research setup; visible active scope |
| F09 | Live sources read and findings emerging | [Perplexity Research][P2] | Missing | Activity summary + rail |
| F10 | Steer/interrupt a research run | [Research][O1], [Perplexity][P2] | Missing | Composer/run control; preserve completed evidence |
| F11 | Leave a research run and get completion feedback | [Gemini Research][G1] | Missing | App activity/notification; requires durable run state |
| F12 | Navigable report with export/edit/share | [Research][O1], [Perplexity][P2] | Missing | Artifact workspace with references |

### G. Rich answers and generated media

| ID | Selectable behavior | Evidence | Conker now | Home / detail |
| --- | --- | --- | --- | --- |
| G01 | Markdown headings, lists, emphasis, links and quotes | Browser: Gemini/Qwen | Missing in general conversation renderer | Thread; current answer text is a plain paragraph |
| G02 | Inline code and syntax-highlighted code blocks | Browser: inline code; Proposal for full block UX | Missing | Thread with independent horizontal scroll |
| G03 | Code-block Copy and language label | Proposal | Missing | Code block, not global message toolbar |
| G04 | Readable wide tables | [Kimi deliverables][K1]; Proposal for chat rendering | Missing as general renderer | Thread with local overflow, optional expansion |
| G05 | Mathematical notation | [Gemini Canvas][G2] supports LaTeX work | Missing | Thread rendering; formula source available on demand |
| G06 | Generated document/download card | [Kimi outputs][K1], [Mistral files][M3] | Missing | Thread; link a real artifact, not invented filenames |
| G07 | Diagram/SVG preview | [Claude artifacts][C2] | Missing | Artifact card; expanded workspace |
| G08 | Interactive chart/data preview | [Kimi outputs][K1], [Mistral Canvas][M3] | Missing | Artifact workspace; underlying data accessible |
| G09 | Image-generation progress and result gallery | Browser: Qwen entry; [Mistral features][M1] | Missing | Composer tool + thread result; execution not tested |
| G10 | Image editing with reference image and revision | [Mistral features][M1] | Missing | Image artifact; distinct from portrait configuration |
| G11 | Video creation entry and result controls | Browser: Qwen entry disabled in guest | Missing | Candidate only; service and availability unverified |
| G12 | Selection-to-ask about part of an answer | Proposal, inspired by [Canvas selection][O4] | Missing | Lightweight selection action; preserve selected context |

### H. Artifact and coding workspace interactions

| ID | Selectable behavior | Evidence | Conker now | Home / detail |
| --- | --- | --- | --- | --- |
| H01 | Open an artifact beside the conversation | [Claude artifacts][C2], [Canvas][O4] | Missing | Dedicated artifact workspace; ordinary metadata remains rail |
| H02 | Preview/source switch | [Claude artifacts][C2] | Missing | Artifact toolbar |
| H03 | Direct text editing and selection-based AI edits | [Canvas][O4], [Gemini Canvas][G2] | Missing | Artifact editor |
| H04 | Version history with restore | [Claude artifacts][C2], [Mistral Canvas][M3] | Missing | Artifact history; independent from response variants |
| H05 | Multiple artifact tabs or selector | [Claude artifacts][C2], [Mistral Canvas][M3] | Missing | Workspace tabs |
| H06 | Running preview plus console errors | [Gemini Canvas][G2] | Missing | Workspace; needs execution/isolation boundary |
| H07 | “Fix this error” sends relevant error context | [Claude artifacts][C2] | Missing | Artifact failure UI |
| H08 | Download/copy/export without publishing | [Claude artifacts][C2], [Mistral Canvas][M3] | Missing | Artifact toolbar; separate Share/Publish action |

### I. Dictation, read-aloud and live calls

| ID | Selectable behavior | Evidence | Conker now | Home / detail |
| --- | --- | --- | --- | --- |
| I01 | Dictation button separate from live call | Browser: Gemini Dictate; Conker code | Local | Composer |
| I02 | Listening waveform driven by actual microphone level | Conker code; user preference | Local | Dictation/call; not a fabricated volume animation |
| I03 | Interim and final transcript while speaking | Conker code and earlier user verification | Local, browser-dependent | Dictation/call; not retested with your mic this pass |
| I04 | Review/edit transcript before sending | Conker code | Local | Dictation Use text returns to draft |
| I05 | Discard recording/transcript cleanly | Conker code | Local | Dictation surface |
| I06 | Listening language and permission/error feedback | Conker code | Local, browser-dependent | Dictation; English first, other language quality unverified |
| I07 | Empty input offers Call; text offers Send; streaming offers Stop | Conker browser/code | Local | Composer; different controls have distinct accessible names |
| I08 | Realtime voice with interruption/barge-in | [ChatGPT Voice][O3], [Claude Voice][C4] | Preview | Call UI exists; frontier realtime service is not connected |
| I09 | Hands-free versus push-to-talk | [Claude Voice][C4] | Missing as explicit mode | Call controls |
| I10 | Switch between typed and spoken turns in one session | [ChatGPT Voice][O3], [Claude Voice][C4] | Local UI / preview agent | Call; preserve the same conversation identity |
| I11 | Independent mic, camera and AI-audio controls | Conker code | Local UI / preview agent | Call toolbar; user and agent sides stay distinct |
| I12 | Live caption toggle and current-word highlighting | Conker code; user design requirement | Local approximation | Word timing depends on browser speech boundaries/fallback timing |
| I13 | Pause/resume and minimize to an in-app mini call | Conker code | Local UI | Not an OS picture-in-picture window or independent browser tab |
| I14 | Voice choice, preview and pace | [Claude Voice][C4]; Conker character settings | Preview | Character setup holds intended voice; browser playback is not voice cloning |
| I15 | Background voice session and return to transcript | [ChatGPT Voice][O3] | Preview | No durable cross-device live-call service |
| I16 | Video/screenshare awareness as an optional call input | [ChatGPT Voice][O3], availability varies | Preview | User camera preview exists; perception pipeline/screenshare not established |

**DeepSeek-specific gap:** the animated live transcript and typing/voice transition you described remain a desired reference, not something this audit could verify behind its login. I have not substituted another product's waveform and called it DeepSeek's.

### J. Conversation context, privacy and continuity

| ID | Selectable behavior | Evidence | Conker now | Home / detail |
| --- | --- | --- | --- | --- |
| J01 | Rename/pin/archive/delete conversation | Conker code | Local / fixture persistence | Conversation menu in appbar |
| J02 | Search within current conversation | Proposal | Missing | Conversation action; current search finds app pages |
| J03 | Agent/project context visible before sending | Conker code; Browser: Kimi projects | Local / preview | Appbar identity; composer for next-turn overrides |
| J04 | Inspect session/fork tree | Conker code | Local / preview | Rail opened from View forks |
| J05 | Temporary/incognito conversation mode | [ChatGPT Temporary][O5], [Claude Incognito][C5] | Preview | Conker has two local switches; server retention is not enforced |
| J06 | Separate memory-use and harness/session controls | Conker-specific requirement | Local UI / preview semantics | Appbar Incognito dialog; don't equate with other apps' retention policy |
| J07 | See which memory/context sources influenced a response | Proposal | Preview | Sources/Info rail; real retrieval provenance missing |
| J08 | Resume an active run after navigation/reload | Proposal; [background Research][G1] | Missing durable execution | Requires persisted run identity; current stream is client state |
| J09 | Usage/cost/model details on demand | Conker code | Preview | Rail; current cost is not metered |
| J10 | Publish/remix a prompt or generated result | [Meta AI][META1] | Missing | Optional share flow; likely lower priority for personal Conker |

### K. Small quality details and recovery

These are proposed acceptance behaviors, not claims that every surveyed product implements them well.

| ID | Selectable behavior | Evidence | Conker now | Home / detail |
| --- | --- | --- | --- | --- |
| K01 | Preserve prompt when request fails; retry in place | Browser: Qwen | Preview | Conker has error notice/stop; equivalent failure recovery needs end-to-end validation |
| K02 | Keep partial output and label interrupted completion | Proposal | Unverified | Thread; stop must not imply successful completion |
| K03 | Network disconnected/reconnecting state | Proposal | Missing | Quiet run status with recovery action |
| K04 | Distinguish rate limit, auth expiry, provider outage and tool failure | Proposal; Browser: Qwen service error | Missing | Actionable, local error explanation |
| K05 | Completion notification only for meaningful background work | [Gemini Research][G1]; Proposal for policy | Missing | App activity/notification preference |
| K06 | Keyboard access and focus restoration for all new controls | Existing Conker shared primitives; Proposal | Local baseline; full new-feature audit pending | Menus/dialogs/rail; no hover-only essential actions |
| K07 | Screen-reader announcement of phase, not every token | Conker live region; Proposal | Local baseline | Activity status; verify noise before adding more phases |
| K08 | Stable reading position as answers/cards resize | Conker scroll fix; Proposal for rich content | Local text path; rich media unverified | Thread; test near-bottom threshold and image load |
| K09 | Compact icon visuals with usable target and tooltip | Current arrow change | Local for arrow | Shared control sizing; not arbitrary tiny hit areas |
| K10 | Clear disabled capability with reason and next action | Browser: guest gating; Proposal | Preview | Tool/model picker; distinguish unavailable from broken |

### L. Character expression and delight

These are Conker proposals based on your references, not features claimed across frontier apps.

| ID | Selectable behavior | Evidence | Conker now | Home / detail |
| --- | --- | --- | --- | --- |
| L01 | Focus mode uses an orb; Character uses assigned thinking artwork | Existing Conker component | Local | Same activity component, different visual treatment |
| L02 | Small expressive portrait with a subtle activity ring | Your reference; Conker code | Local | Readable silhouette; no need to force a full-body chibi into 24px |
| L03 | Artwork variants for listening/searching/writing/waiting/done | Proposal | Preview | Studio has media slots; complete mapped artwork pack/events are missing |
| L04 | One brief completion animation, then quiet | Proposal | Missing | Activity summary; never endless celebration |
| L05 | Pause character motion independently of functional status | Existing mode settings; Proposal for unified preference | Preview | Character settings; respect reduced motion everywhere |
| L06 | Hover/focus expands the tiny indicator into a short status hint | Proposal | Missing | Floating control; click still jumps to latest |
| L07 | Emotion/tone styling supplied explicitly by character runtime | Earlier user direction | Missing | Treat as authored performance; don't infer real human feelings from a spinner |
| L08 | Fall back to a neutral portrait/orb when artwork is unavailable | Existing CharacterMedia/activity | Local | Missing art must not break the activity indicator |

## Comparison to the second screenshot

| Screenshot element | Current equivalent | What is needed |
| --- | --- | --- |
| Working for 7m 44s | No elapsed timer | Persisted start/end times; A05–A06 |
| Progress paragraphs during work | Only answer text stream | Separate commentary events; A09 |
| Named reviewer started/finished | No subagent event UI | Parent/child events and task links; B10–B13 |
| Used browser / ran commands | Expandable fixture tool receipt | Grouped real tool lifecycle; B01–B08 |
| Sent message to an agent | None | Message event with sender/target and inspectable payload; B12 |
| Brief current-action label | Thinking/Writing only | State/event mapping; A04 |
| Five files changed and line counts | None | Structured change summary and actual diff references; B15 |
| Completed history can be inspected | Stream disappears into final message | Durable activity record; A06 and J08 |

The missing foundation is an **activity event feed**, not a larger spinner. A future event should identify its run, message, parent task, timestamp, type/status, concise public label, and optional input/output/source/artifact references. Use events supplied by ConkerClient and the eventual executor. Fixtures can demonstrate this behind that boundary, clearly labeled Preview.

Keep three things distinct:

1. **Activity facts:** tool started, source opened, task failed, approval requested.
2. **Model-provided summaries:** a public explanation of an approach, if the provider supplies one. Not a promise to reveal all hidden reasoning.
3. **Character expression:** artwork, animation and tone. It must not fabricate activity facts.

Do not create random “Searching… Calculating… Summoning agents…” rotations to make a slow text stream look busy. “Working” is appropriate when more specific evidence is absent.

## Proposed placement and visual rules

These refine presentation without changing the established four homes.

| Surface | Contains | Stays elsewhere |
| --- | --- | --- |
| Appbar | Conversation identity/menu, Incognito, existing search/theme placement | No second conversation header or permanent wall of run controls |
| Composer | Model/effort, enabled tool chips, attachments, dictation/call, send/stop | Provider credentials and complete agent configuration in Settings/Studio |
| Under each response | Small action toolbar, compact activity disclosure, artifact/source entry points | Full raw execution data opens in detail |
| Right rail | Selected source, public reasoning summary, tool input/output, run details, forks, usage | Creation/editing forms use existing shared dialogs or a dedicated workspace |
| Expanded workspace | Long artifacts, code preview, document editing | Not required for a two-line tool receipt |

Suggested activity anatomy: small mark + one short current verb + optional elapsed time + disclosure. On completion: a restrained summary with elapsed duration. While scrolled away: the compact floating control carries current status; when finished, it becomes the down arrow. Status wording should be literal and brief.

Color remains semantic: ordinary work uses foreground/muted text; primary accents denote active interaction; errors and approvals get their own existing semantic treatments. Do not assign arbitrary brand colors to every tool or make every event a bordered card. Collapse repetitive work; expose detail when requested. Use one motion vocabulary for the orb, character ring and waiting dots. Do not flash full rows on every token.

## Suggested first batch, only if you choose it

1. **A04–A07, A09, B01–B04:** one coherent working history with elapsed time, real phase labels and inspectable tool events. This directly addresses your screenshot.
2. **G01–G05:** a reliable answer renderer. Today, complex formatting is a larger practical gap than another decorative animation.
3. **E04, K01–K04:** response variants and understandable stop/retry/error recovery.
4. **D03–D08, F01–F05:** usable tools/attachments/search/citations once their data paths exist.
5. **L03–L06:** a small, high-quality character animation pack layered onto truthful status.

No approval for this batch is assumed. You can choose, for example: “Add A05–A07, B04 and E04; keep the current orb; later all of H.”

## Verification still needed with your accounts

Requests to complete Chrome verification for ChatGPT/Claude and sign in to DeepSeek were sent during this audit. No successful authentication was assumed.

For each unlocked product, use the same small test set so differences are meaningful:

1. Send a plain text prompt; inspect pending, streaming and completion states.
2. Enable thinking; inspect live label, elapsed time, disclosure and completed summary.
3. Search for a neutral topic; inspect tool steps, citations and source details.
4. Ask for a code block, formula and table; inspect per-block controls and overflow.
5. Scroll away during generation, stop a response, retry and inspect version navigation.
6. Attach a non-sensitive test file; inspect upload, removal, preview and error states.
7. Inspect dictation UI; with you present, test real speech, interim words, silence, Use text/Cancel, and text/voice transitions.
8. Inspect artifact and agent modes only within the account's available allowance; no expensive autonomous run or publishing action is implied.

Priority: **DeepSeek voice typing**, **ChatGPT working/search**, **Claude thinking/artifacts**, then **Grok voice/search**, **Kimi Swarm**, **Perplexity Research**, **Z.ai completed responses**. Mobile apps and OS picture-in-picture remain a separate audit; a desktop guest web session cannot verify them.

## Conker code evidence

Audit followed the active route, not unused template demo components:

- `dashboard/src/lib/conversation-workspace.ts`: stream currently exposes text/model and only `thinking` / `streaming` phases.
- `dashboard/src/app/chat/conversation.tsx`: message rendering, activity placement, scroll ownership and floating control. General response text currently renders in a whitespace-preserving paragraph.
- `dashboard/src/components/conversation-activity.tsx` and `.css`: orb/portrait/ring, reduced motion, hidden-tab animation behavior and compact dimensions.
- `dashboard/src/components/tool-activity.tsx`: recorded tool summary and expandable details; not a running event stream.
- Composer, message-action, reference-rail and call modules were inspected for existing UI and fixture boundaries. Browser speech recognition/synthesis are local/browser integrations, not proof of frontier model, emotion, cloned-voice or perception services.

Verification for the small arrow change: `npm run build`, targeted ESLint for `conversation.tsx`, and `git diff --check`. Chrome checked desktop and a narrow 500px viewport (the browser tool clamped the requested 390px width), light/dark appearance, compact active orb and jump-to-latest. The jump reached the bottom and returned focus to the conversation thread. No warning/error console messages were reported on the checked Conker page. Screenshots were reviewed inline; no saved screenshot path is claimed.

## Primary source register

Browser evidence is linked in the product table. These official sources support the Docs entries; announcements are historical interaction references, not proof that today's account has the same layout or entitlement.

- [O1 — ChatGPT Deep Research][O1]: plan, source scope, progress and reports.
- [O2 — ChatGPT Search][O2]: search activation and citations.
- [O3 — ChatGPT Voice][O3]: voice/text interaction and availability-dependent call features.
- [O4 — Introducing Canvas][O4]: historical 2024 editing/workspace reference.
- [O5 — ChatGPT Temporary Chat][O5]: temporary conversation semantics.
- [C1 — Claude model, effort and thinking][C1]: controls, timer and public summary.
- [C2 — Claude artifacts][C2]: artifact workspace, revisions and error recovery.
- [C3 — Claude search, thinking and research][C3]: distinction between these capabilities.
- [C4 — Claude voice mode][C4]: hands-free/push-to-talk, voice controls and continuity.
- [C5 — Claude incognito][C5]: temporary context/history behavior.
- [G1 — Gemini Deep Research][G1]: plans, sources and background completion.
- [G2 — Gemini Canvas][G2]: document/code workspace behavior.
- [X1 — Grok overview][X1]: high-level product capabilities; not evidence for exact control placement.
- [X2 — Grok user guide][X2]: workspace/business features; not generalized to guest consumer chat.
- [D1 — DeepSeek V3.1 announcement][D1]: historical 2025 DeepThink reference; does not verify current dictation design.
- [K1 — Kimi Agent Swarm][K1]: execution inspection, subagents and deliverables.
- [P1 — Perplexity Pro Search][P1]: search workflow and research detail.
- [P2 — Perplexity Advanced Deep Research][P2]: live findings, follow-ups and editable reports; page dated September 15, 2026.
- [M1 — Le Chat dives deep][M1]: historical 2025 research/thinking/voice and media features.
- [M2 — Mistral Chat announcement][M2]: historical 2024 Canvas/search reference.
- [M3 — Mistral Work files and Canvas][M3]: current Work documentation; consumer UI parity is unverified.
- [MS1 — Copilot conversation modes][MS1]: mode behavior; exact availability varies.
- [META1 — Meta AI app introduction][META1]: historical 2025 voice and explicit social sharing reference.

[O1]: https://help.openai.com/en/articles/10500283-deep-research
[O2]: https://help.openai.com/en/articles/9237897-chatgpt-search
[O3]: https://help.openai.com/en/articles/20001274
[O4]: https://openai.com/index/introducing-canvas/
[O5]: https://help.openai.com/en/articles/8914046-temporary-chat-in-chatgpt
[C1]: https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings
[C2]: https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them
[C3]: https://support.claude.com/en/articles/11095361-when-should-i-use-web-search-extended-thinking-and-research
[C4]: https://support.claude.com/en/articles/11101966-use-voice-mode
[C5]: https://support.claude.com/en/articles/12260368-use-incognito-chats
[G1]: https://support.google.com/gemini/answer/15719111?hl=en
[G2]: https://support.google.com/gemini/answer/16047321
[X1]: https://docs.x.ai/grok/overview
[X2]: https://docs.x.ai/grok/user-guide
[D1]: https://www.deepseek.com/en/news/deepseek-v3-1/
[K1]: https://www.kimi.com/en/help/agent/agent-swarm
[P1]: https://www.perplexity.ai/help-center/en/articles/10352903-what-is-pro-search
[P2]: https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research
[M1]: https://mistral.ai/news/le-chat-dives-deep/
[M2]: https://mistral.ai/news/mistral-chat/
[M3]: https://docs.mistral.ai/vibe/work/files-and-canvas
[MS1]: https://support.microsoft.com/en-us/microsoft-copilot/conversation-modes-in-microsoft-copilot
[META1]: https://about.fb.com/news/2025/04/introducing-meta-ai-app-new-way-access-ai-assistant/
