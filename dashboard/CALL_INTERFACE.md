# Call interface

Scope: frontend call preview with sample replies, optional real browser speech captions and manual browser read-aloud. English first; Russian and Hebrew later. No GPU is required for this interface. ConkerClient owns the sample session and events. Camera/microphone previews stay local; opted-in captions use a browser speech service that may process audio online. Character voice, live AI, perception and server execution are not connected.

## Direction contract

THESIS: A call is a continuing conversation with independent channels. A dedicated stage minimizes into a usable floating call, without losing the session or chat drafts.

OWN-WORLD: Extend Conker's existing shadcn New York interface, direct semantic surfaces, green accent, compact controls, theme-derived corners, and full padded character artwork. No new palette or typography.

STORY: Start from the composer's phone action or conversation title menu, choose how each participant communicates, type without a microphone, change Focus/Character, return to work, expand again, and hang up explicitly.

FIRST VIEWPORT: Equal 50/50 participant sides: Conker's conversation by default, and the user's full camera frame with optional live captions at its bottom and typing below. Appearance is optional. Participant labels and audio controls sit at the bottom; the main dock owns mic/camera/keyboard and hang-up. The header owns Call, model/provider choice, privacy, settings, fullscreen and minimize. Centered settings hold Focus/Character and device/session details. Mobile stacks equal participant rows in a scrollable region.

FORM: Operate; ordinary extension of the owner-approved visual world. No new visual-world selection or generated raster is needed. The signature interaction is expanded-stage to persistent mini-call; animation respects reduced motion.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Implemented frontend

The global `CallHost` and `useCallWorkspace` retain one active session across dashboard routes. The expanded stage uses the shared Dialog; Minimize or Escape opens an in-app mini call with three corner positions, and Expand returns to the same session. Browser fullscreen is optional. End call releases local devices and opens a bounded summary with duration, sent-message count, transcript copying, Call again and Return to conversation. Closing the summary restores the invoker or a visible enabled shell control; minimizing focuses Expand.

The composer microphone remains browser dictation. Its separate phone action appears for an empty draft; the title menu also starts or returns to a call while a chat draft exists. Call text has its own draft. Starting from the appbar during dictation preserves received words, cancels capture and pending permission, and keeps focus in the call. Voice typing cannot start during an active call. Starting a call or local capture stops browser read-aloud.

| Area | Implemented behavior |
| --- | --- |
| User channels | Independent microphone, camera and keyboard controls. Devices start off and require an explicit action. Muted camera video preserves the full frame with `object-contain`; audio bars reflect measured microphone level. Selectors and permission/disconnection notices provide recovery. Cleanup/remount clears device flags; only active streams are exposed. |
| Companion channels | Independent voice preference, appearance and text/captions. Conversation is the default (`avatar: false`); optional Studio appearance also applies to mini and ended states. Hiding companion text retains the user's sent messages. Play manually reads the latest sample reply with the browser's device voice, with Stop and mute; its audio bars indicate playback, not measured output amplitude. |
| Conversation | Typed turns, timestamped sample replies, thinking/responding states, interruption and a session timeline. Enter sends; Shift+Enter adds a line; the draft limit is 4,000 characters. Live captions are separate from these sent messages. |
| Identity and delivery | Existing Studio portrait/activity media; Focus/Character in centered `TaskDialogContent` settings. The header's enabled-model choices include provider names and set a call-level preference. Character voice and real reasoning remain unconnected. |
| Privacy | Existing Incognito dialog with independent No memory and No harness exclusions, inherited from the conversation and adjustable for this call. Details report both; conversation preferences remain separate. |
| Responsive behavior | Equal desktop columns; equal stacked mobile rows with a 20rem minimum and scrolling, preserving access to the dock. Mini call survives route navigation and preserves call/chat drafts, appearance and optional caption display. |

The user's CC control opts into real browser recognition through `ConkerClient.voiceInput`, in English with the system-default microphone only. A 4,000-character internal buffer supplies the latest 40 words to a bottom-anchored two-line subtitle tail without a text scrollbar. Waiting captions and settings disclose possible online speech processing. Captions never send a turn or change a draft. Mute, caption-off and hang-up cancel recognition; normal/silence endings restart and other errors offer Retry. Any browser read-aloud pauses captions, including while minimized. The adapter borrows the call capture stream for level analysis without stopping its tracks.

`src/lib/api/call-types.ts` defines the replacement call-transport boundary; `call-fixture.ts` supplies sample events through `ConkerClient.calls`. `use-call-media.ts` owns local capture and cleanup, and `use-call-captions.ts` owns browser recognition. Conker does not record media or send caption text as messages. Call events and drafts are memory-only; the summary offers copying before dismissal, not saved call history.

## Review and validation

Independent review of the refinement returned **SHIP** at the source-review boundary; final small-viewport validation is complete. The existing lifecycle fixes remain part of the contract: starting from the appbar cancels hidden dictation without losing words or stealing focus, mini respects appearance, and summary dismissal restores useful shell focus. This is call-focused QA, not a final dashboard audit.

Current visual evidence: [balanced desktop light](.impeccable/review/balanced-desktop-light.png), [balanced desktop dark](.impeccable/review/balanced-desktop-dark.png), and [balanced mobile](.impeccable/review/balanced-mobile.png). Earlier `desktop`, `desktop-light`, `mobile`, `mobile-transcript`, `mini`, `mini-avatar-hidden` and `ended` captures in `.impeccable/review/` document the earlier call layout, not the balanced refinement. All are browser screenshots; no generated artwork was added. Final captures use sample messages with devices off; private camera footage and speech were not retained in these artifacts.

The updated `check:calls` defaults/lifecycle checks and all 12 `check:voice` checks pass, including borrowed-stream ownership and the silence error code. The final production build passed the design guard over 165 sources, TypeScript and Vite, and affected-file lint passed after the subtitle adjustment. Broader conversation/character/navigation checks have not been rerun for this refinement.

Hardware review and user confirmation verified real English captions and an active microphone meter. Desktop participant tiles measured an identical 748 × 725; camera video preserved its full 640 × 480 frame inside a 746 × 553 area using `object-contain`. Final 375 × 667 and 320 × 667 checks showed no horizontal page overflow, with the dock accessible and busy controls wrapping at 320px. Manual browser playback changed the speaking indicator and stopped correctly; minimizing/expanding and ending the call were checked. Browser console warnings/errors were empty. Native browser fullscreen remains unverified after graceful automation fallback. Recognition was hardware-tested before the final two-line subtitle styling; final captures verify its waiting state, not a fresh long-speech sample.

## Remaining work and limits

| Area | Missing work |
| --- | --- |
| Frontend scope | Incoming/proactive call UI is not built. The floating mini call stays inside the dashboard tab; OS picture-in-picture and a separate call window/tab are not implemented. Saved call history and reconnect UI are not implemented. |
| Real conversation services | Browser speech captions and manual device-voice playback are connected at the frontend; English recognition was observed on hardware. The real-time speech-to-model turn pipeline, frontier-model reasoning, character TTS, emotion and camera perception are not wired. Typed responses and response phases are fixtures; Interrupt cancels that sample flow. |
| Timeline and media | There is no recording or precise audio/video and word alignment. The timeline records sent messages and mode events, not live captions; service-backed perception and synchronized playback remain future work. |
| Session and privacy backend | Persistence, reconnect, server-side memory/harness exclusion enforcement and usage/cost metering are not connected. Incognito is a preview preference, not a production privacy guarantee. |
| Language and rendering | English is the launch target; Russian and Hebrew are planned. The interface needs no GPU; future media/model integration must account for weak GPUs. 3D character rendering is deferred. |

The frontend is a call preview with optional browser speech features. Completing a live AI call still requires the missing service integrations and device/service validation; the source-review verdict does not establish those capabilities.
