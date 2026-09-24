# Artifact workspace

September 21, 2026. This is a fixture-backed output workspace with explicitly started local HTML previews. It does not establish server persistence, model generation or backend execution.

## Owner journey

- Save a completed assistant response through its message menu. The dialog explicitly copies response text and citations; activity and interactive cards remain in the conversation.
- Create an empty document, code file, table, chart, diagram, media reference or HTML app in Artifacts. Source edits save as immutable versions. HTML requires an explicit Run preview; changing source or version stops it. History can restore an earlier version by appending another version.
- Open beside the source chat or full-page. The selected history version follows the link. Narrow screens use a full-width sheet. Closing a canvas preserves its unsaved draft within the running preview.
- Link an output to an existing task. Activity shows valid linked outputs. Task moves and removals are rechecked rather than silently transferring ownership.
- Open Artifacts from an expanded call; the call becomes its existing mini view. No recording, transcript ingestion or live call backend is implied.

## Content and boundaries

The native formats are Markdown (including existing math/table/code rendering), inert code, bounded table data, native bar/line/area charts, diagrams and external media references. HTML apps use a separate sandboxed renderer. No sample datasets are inserted. Structured chart/table/diagram/media source uses JSON. Uploaded media, generated-app delivery and model presentation/update protocols remain unimplemented P8/P11 work.

Source copies preserve bounded supplied citation metadata; edits keep it and restores preserve historical evidence. Source metadata is not a claim of verification. Markdown export carries a clearly labelled inert reference appendix. Code exports cannot silently become HTML/SVG applications, and spreadsheet formula-leading cells are escaped in CSV.

Raw versions stay inside the fixture client. Snapshot/list/get/export resolve source availability and privacy at read time. Redaction, removal, source text/citation changes or unknown privacy hide all bodies and titles derived from the source. Archived sources remain readable but cannot be edited. Unavailable records retain metadata-only archive/restore controls. Private-origin content stays owner-visible and explicitly labelled; there is no sharing/helper dispatch operation.

## Verification

`npm run check:artifacts` covers immutable history, stale revisions, source/task lifecycle, private/missing/redacted/changed origins, citation preservation, bounded payloads, safe exports, native rendering inputs, and concurrent snapshot refresh. Call and navigation checks also pass.

Browser checks exercised text-copy creation, editing, restore, exact historical links, full-page/chat switching, light desktop and 390px mobile layouts, keyboard Escape returning to the composer, empty chart creation and native chart rendering from entered QA data, and call-to-library navigation retaining the mini call. Browser console reported no errors in those checks. Screenshot review caught and corrected duplicate headings and a cramped narrow header. Changes still reset on reload.

## Diagram and media increment

Native formats additionally include bounded diagrams (100 nodes / 200 connections) and external HTTPS image, audio and video references. Diagrams allow pan/zoom, node inspection and an accessible list; they do not execute tools. Positions are edited in structured Source. Media references require explicit Load, expose native playback controls, and can be unloaded or retried. No remote media is fetched on initial rendering. Changing versions unmounts the previous media. Uploaded media ingestion and model-generated application delivery remain deferred.

## Explicit HTML preview

HTML apps store up to 200,000 characters of source in the existing immutable version model. Initial rendering, creation and historical navigation never mount an executable iframe. Run preview starts a fresh app; Stop, source changes, version changes and leaving Preview unmount it. Runtime DOM state is temporary and never overwrites the saved source. Exports preserve exact source as inert `.html.txt` with a text MIME type.

The renderer nests an untrusted srcdoc inside a trusted srcdoc wrapper. Both frames have exactly `sandbox="allow-scripts"`, with no same-origin, forms, popups, downloads or ancestor-navigation permissions. The wrapper's CSP denies external frame destinations; both documents deny default resources, connections, workers, objects, media, fonts, forms and base URLs, while permitting inline scripts/styles and data images. Source is attribute-escaped inside the wrapper, so supplied closing tags cannot replace its policy or frame attributes. There is no message bridge, host data, ConkerClient access or tool invocation API. External libraries and network-backed apps are unsupported.

Automated HTML checks cover the inert initial renderer, exact source escaping, fixed sandbox/CSP, schema bounds, plain-text export, history preservation and source-redaction blocking. Chrome verified create/edit/save version 2, explicit Run, a working inline button, and Stop. A source probe reported parent DOM, localStorage and fetch blocked. A separate harness using the exact document builder verified self-frame navigation was blocked by the outer frame-src policy, with a CSP violation and no external document request. These are bounded browser checks, not a universal confinement proof. An iframe is not a CPU/memory quota and does not guarantee recovery from a hostile infinite loop. This is an explicit local preview, not a general secure execution service.

The artifact checks now include diagram bounds/endpoint validation, media URL validation and inert initial media rendering. Browser QA verified diagram version editing and node selection, plus media load failure/recovery with an intentionally unavailable URL. Successful remote audio/video playback was not tested in this pass.
