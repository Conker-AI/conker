# Call interface

Scope: frontend call preview, English first; Russian and Hebrew later. No GPU is required for this interface. ConkerClient owns the sample session and events. Media capture is local preview only, requested by an explicit microphone/camera action. No AI speech, transcription, perception, or server execution is implied.

## Direction contract

THESIS: A call is a continuing conversation with independent channels. A dedicated stage minimizes into a usable floating call, without losing the session or chat drafts.

OWN-WORLD: Extend Conker's existing shadcn New York interface, direct semantic surfaces, green accent, compact controls, theme-derived corners, and full padded character artwork. No new palette or typography.

STORY: Start from the composer's phone action or conversation title menu, choose how each participant communicates, type without a microphone, change Focus/Character, return to work, expand again, and hang up explicitly.

FIRST VIEWPORT: A compact call header, a broad companion stage, a smaller local participant tile, an optional transcript column, and a dock with mic/camera/keyboard plus a separate hang-up action. Companion channels sit beside its identity. Secondary session/device/privacy details open inside the call. Mobile switches between the participant stage and transcript/details panel while keeping the controls reachable.

FORM: Operate; ordinary extension of the owner-approved visual world. No new visual-world selection or generated raster is needed. The signature interaction is expanded-stage to persistent mini-call; animation respects reduced motion.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Implemented frontend

The global `CallHost` and `useCallWorkspace` retain one active session across dashboard routes. The expanded stage uses the shared Dialog; Minimize or Escape opens an in-app mini call with three corner positions, and Expand returns to the same session. Browser fullscreen is optional. End call releases local devices and opens a bounded summary with duration, sent-message count, transcript copying, Call again and Return to conversation. Closing the summary restores the invoker or a visible enabled shell control; minimizing focuses Expand.

The composer microphone remains browser dictation. Its separate phone action appears for an empty draft; the title menu also starts or returns to a call while a chat draft exists. Call text has its own draft. Starting from the appbar during dictation preserves received words, cancels capture and pending permission, and keeps focus in the call. Voice typing cannot start during an active call. Starting a call or local capture stops browser read-aloud.

| Area | Implemented behavior |
| --- | --- |
| User channels | Independent microphone, camera and keyboard controls. Devices start off and require an explicit action. Camera preview is muted; microphone uses a local level meter. Input selectors and permission/disconnection notices provide recovery. |
| Companion channels | Independent voice preference, avatar visibility and text/captions. Voice is visibly unconnected. Avatar visibility also applies to mini and ended states. Hiding companion text retains the user's sent messages. |
| Conversation | Typed turns, timestamped sample replies, thinking/responding states, interruption and a session timeline. Enter sends; Shift+Enter adds a line; the draft limit is 4,000 characters. |
| Identity and delivery | Existing Studio portrait/activity media and Focus/Character mode selection. The enabled model catalogue supplies a call-level model preference. These settings do not connect a reasoning or voice service. |
| Privacy | Existing Incognito dialog with independent No memory and No harness exclusions, inherited from the conversation and adjustable for this call. Details report both; conversation preferences remain separate. |
| Responsive behavior | Desktop stage with transcript/details alongside; mobile stage or panel with persistent dock. Mini call survives route navigation and preserves the call and chat drafts. |

`src/lib/api/call-types.ts` defines the replacement transport boundary, and `call-fixture.ts` supplies sample events through `ConkerClient.calls`. `use-call-media.ts` owns local capture and cleanup. None of this sends media to a service. Call events and drafts are memory-only; the summary offers copying before dismissal, not saved call history.

## Review and validation

The independent call review on September 17 returned **SHIP** after resolving all three findings: appbar call start cancels hidden dictation without losing received words or stealing focus; mini view respects the hidden-avatar setting; summary dismissal restores the invoker or a visible enabled shell control.

Chrome review covered desktop at 1920 × 889 in dark and light themes, mobile at 390 × 844 in stage and transcript views, minimize/navigation/expand with drafts, channel/mode/privacy controls, typed sample turns, hang-up, summary and focus restoration. The final fresh-tab path from start through a typed sample reply, end and summary dismissal had no console warnings or errors and restored focus to Start call. Local devices were off at the end of review. This is call-focused QA, not a final audit of the whole dashboard.

Screenshots are browser captures of the implemented UI: [desktop](.impeccable/review/desktop.png), [desktop light](.impeccable/review/desktop-light.png), [mobile](.impeccable/review/mobile.png), [mobile transcript](.impeccable/review/mobile-transcript.png), [mini](.impeccable/review/mini.png), [mini with avatar hidden](.impeccable/review/mini-avatar-hidden.png), and [ended summary](.impeccable/review/ended.png). No generated artwork was added; character visuals reuse the existing Studio media.

Passing checks reported for this implementation: `check:calls` lifecycle checks, all 10 `check:voice` checks, `check:conversation`, `check:character`, `check:navigation`, and the design guard over 163 sources with 16 self-checks. The final production build (design guard, TypeScript and Vite) and affected-file ESLint passed after the last focus adjustment. The build retained two existing upstream Zod annotation warnings.

Local camera video rendering and turning the camera off were observed during review; final screenshots exclude the local camera imagery. Physical microphone capture and permission races were not exercised. Browser fullscreen fell back gracefully under automation; native fullscreen behavior remains unverified. Automated lifecycle coverage does not establish that external speech services work.

## Remaining work and limits

| Area | Missing work |
| --- | --- |
| Frontend scope | Incoming/proactive call UI is not built. The floating mini call stays inside the dashboard tab; OS picture-in-picture and a separate call window/tab are not implemented. Saved call history and reconnect UI are not implemented. |
| Real conversation services | Streaming speech recognition, frontier-model reasoning, TTS/character voice, emotion and camera perception are not wired. Typed responses and response phases are fixtures. Interrupt currently cancels that sample flow. |
| Timeline and media | There is no recording or precise audio/video and word alignment. The current timeline records sent messages and mode events; service-backed perception and synchronized playback remain future work. |
| Session and privacy backend | Persistence, reconnect, server-side memory/harness exclusion enforcement and usage/cost metering are not connected. Incognito is a preview preference, not a production privacy guarantee. |
| Language and rendering | English is the launch target; Russian and Hebrew are planned. The interface needs no GPU; future media/model integration must account for weak GPUs. 3D character rendering is deferred. |

The frontend is reviewable as a local call preview. Completing a live call requires both the missing service integrations and device/service validation; the SHIP verdict applies to the implemented frontend scope above.
