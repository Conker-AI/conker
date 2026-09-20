# Artifact workspace

September 20, 2026. This increment is a fixture-backed output workspace. It does not establish server persistence, model generation or executable previews.

## Owner journey

- Save a completed assistant response through its message menu. The dialog explicitly copies response text and citations; activity and interactive cards remain in the conversation.
- Create an empty document, code file, table or chart in Artifacts. Source edits preview through trusted components and save as immutable versions. History can restore an earlier version by appending another version.
- Open beside the source chat or full-page. The selected history version follows the link. Narrow screens use a full-width sheet. Closing a canvas preserves its unsaved draft within the running preview.
- Link an output to an existing task. Activity shows valid linked outputs. Task moves and removals are rechecked rather than silently transferring ownership.
- Open Artifacts from an expanded call; the call becomes its existing mini view. No recording, transcript ingestion or live call backend is implied.

## Content and boundaries

The native formats are Markdown (including existing math/table/code rendering), inert code, bounded table data and native bar/line/area charts. No sample datasets are inserted. Structured chart/table source uses JSON in this increment. Arbitrary HTML, generated applications, uploaded media and model presentation/update protocols remain unimplemented P8/P11 work.

Source copies preserve bounded supplied citation metadata; edits keep it and restores preserve historical evidence. Source metadata is not a claim of verification. Markdown export carries a clearly labelled inert reference appendix. Code exports cannot silently become HTML/SVG applications, and spreadsheet formula-leading cells are escaped in CSV.

Raw versions stay inside the fixture client. Snapshot/list/get/export resolve source availability and privacy at read time. Redaction, removal, source text/citation changes or unknown privacy hide all bodies and titles derived from the source. Archived sources remain readable but cannot be edited. Unavailable records retain metadata-only archive/restore controls. Private-origin content stays owner-visible and explicitly labelled; there is no sharing/helper dispatch operation.

## Verification

`npm run check:artifacts` covers immutable history, stale revisions, source/task lifecycle, private/missing/redacted/changed origins, citation preservation, bounded payloads, safe exports, native rendering inputs, and concurrent snapshot refresh. Call and navigation checks also pass.

Browser checks exercised text-copy creation, editing, restore, exact historical links, full-page/chat switching, light desktop and 390px mobile layouts, keyboard Escape returning to the composer, empty chart creation and native chart rendering from entered QA data, and call-to-library navigation retaining the mini call. Browser console reported no errors in those checks. Screenshot review caught and corrected duplicate headings and a cramped narrow header. Changes still reset on reload.
