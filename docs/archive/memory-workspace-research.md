# Memory workspace: research and implementation boundary

19 September 2026. Scope: frontend exploration and fixture editing, not a MemoryGate migration.

## Research translated into features

- [Obsidian Graph](https://obsidian.md/help/plugins/graph): color groups distinguish collections, the text fade threshold controls label visibility, hover highlights connections, and local graph depth exposes successive neighbors. Conker adapts these ideas into category colors, zoom-dependent labels, immediate selection and one/two-hop focus. These are implementation choices, not claims of identical behavior or copied dimensions.
- [Neo4j Bloom exploration](https://neo4j.com/blog/developer/scoobygraph-3/): inspect properties and selectively expand relationships. Adopt an evidence inspector with navigable linked records; distinguish relationship kinds.
- [Qdrant Web UI](https://qdrant.tech/documentation/web-ui/): inspecting stored points and payloads is a separate task from visual exploration. Keep a sortable database view, raw JSON, copy, and filtered JSON export alongside the graph.
- [Cognee visualization](https://docs.cognee.ai/api-reference/visualize/visualize-multi): dataset context matters when combining graphs. Keep source origin visible and distinguish the illustrative dataset from the editable sample snapshot.
- [React Flow](https://reactflow.dev/learn): use its supported React canvas for pan, zoom, pointer dragging, keyboard-accessible nodes and fitting the viewport. Its [layouting guide](https://reactflow.dev/learn/layouting/layouting) separates rendering from layout algorithms and discusses hierarchy and force-layout options. Conker supplies deterministic positions in `memory-layout.ts`; it does not run a live force simulation.

## This pass

The owner-approved direction is a spacious, maximizable canvas with immediate inspection. `BaseLayout variant="canvas"` fills the available viewport below the appbar without a separate page heading. The appbar remains application navigation. A local toolbar selects Network, Hierarchy or Database through the `view` URL parameter; legacy `tab` links remain accepted, and `sources` maps to Hierarchy. The same URL-backed text/category filters apply across modes. A searchable point picker finds currently available memories, topics, folders and sources and focuses the selected point. Maximize temporarily fills the viewport; Restore returns to the application frame.

The shared nonmodal `WorkspaceInspector` appears immediately on selection, docked at the right on desktop and at the bottom on mobile. The user can keep selecting graph points while inspecting evidence, linked records, topic connections or JSON. It replaces Memory's previous modal `DetailPanel` workflow; creation/editing still use `TaskDialogContent` and deletion still uses `ConfirmationDialog`. Database retains `DataTable` sorting, column selection and `RecordItem` on narrow screens.

The graph uses small filled record points, outlined topics, source symbols and labeled category folders. Five existing chart tokens encode categories, with graph-local dark-theme lightness bounds. Labels reveal with zoom or selection/neighbor emphasis; folder labels remain visible. Thin curved edges distinguish dotted topic membership from solid parent/source links. Dragging, pan/zoom, fit/reset, source-point visibility and one/two-hop focus remain available. Reduced motion disables optional transitions.

`dashboard/src/lib/memory-layout.ts` derives Library → category → record parent-child organization. Network positions are deterministic organic clusters with a bounded spacing-relaxation pass. Hierarchy uses category columns, with related topics and sources below the records. The expandable folder browser provides another way to inspect that category organization. This is UI hierarchy, not actual file storage. Topic membership is not semantic similarity or evidence that claims agree; spatial distance has no semantic meaning. Original source references are preserved independently. Dragging changes local presentation, not records or relationships.

`dashboard/src/lib/memory-demo.ts` supplies 50 fictional read-only records in five categories, giving the canvas enough content to inspect a realistic-size example. This dataset is isolated from the user's memory store and labeled Illustrative demo throughout the relevant UI; its records explicitly say they are fictional. Never merge it into editable or production memory. The separate Sample records dataset retains the original four claims and their source URLs, and source-hash links select that dataset.

Only Sample records supports new/edit/delete through `ConkerClient`'s fixture adapter. Mutations are tab-local and reset on reload. Editing retains original text and source; it does not rewrite evidence or silently raise confidence. Manual notes have no fabricated external source. JSON inspection/copy and filtered export describe the selected demo or preview dataset. No actual vector search, media processing, filesystem operation, graph-database connection or backend write is implemented here.

## Actual MemoryGate audit

MemoryGate is more than a text table. Current code includes memories with revisions/conflicts, source/evidence objects, entities and edges, episodes, observations, patterns, transcripts, and generic typed object links/lineage. Its embeddings service can degrade to lexical search. Dashboard configuration currently does not install an HTTP client; Memory remains fixture-only.

Relevant backend files in the sibling gates repository: `memorygate/services/api/app/models/evidence_object.py`, `models/object_link.py`, `routes/lineage.py`, and `services/embeddings.py`.

There is no dedicated media asset model, upload API, blob-store integration, playback endpoint or native folder hierarchy in the audited implementation. A source tree is a UI grouping, not a filesystem claim. The production graph adapter should project paginated typed objects and bounded lineage, preserve source IDs, and support server-side filtering. Do not download the whole database into the browser.

## Next: multimodal integration, not implemented

Keep the ownership established in workspace-control-plan.md: Pi owns canonical sessions and timelines; media storage owns selected recordings; MemoryGate owns references, evidence and selected claims.

Add a managed asset descriptor: stable ID, owner/scope, media kind, MIME type, original filename, hash, byte size, storage reference, duration/dimensions, retention and availability. Raw bytes belong in controlled media storage. Link evidence to exact page/character/time intervals. Transcripts, OCR and captions are derived objects with processor/version and provenance, not replacements for the originals.

Later UX: authorized upload and processing status, playable audio/video with anchored transcript, page preview, memory revisions/conflicts, real typed relationships and relationship editing. Emotional/body-language annotations must remain uncertain observations with provenance and confidence, separately stored from the user's exact words.

Production mutation prerequisites: connected authenticated API, permissions/step-up verification for protected changes, validation, audit trail, conflict handling, deletion/retention semantics and server-owned pagination. A frontend confirmation dialog is not authorization enforcement.

## Verification

- Build/design guard and affected-file ESLint pass. The existing large conversation chunk warning remains.
- Memory CRUD/provenance, isolated demo/layout, navigation, and daily-overview checks pass. `npm run check:memory` runs both memory suites.
- Actual desktop dark/light and 390×844 mobile captures reviewed. Search narrowing and point selection, docked inspection, Network/Hierarchy/Database switching, folder browsing, fit, and maximize/restore were exercised.
- Independent review found two material issues: stale close-up zoom on layout change, and a selected point hidden beneath the mobile inspector. Both were fixed and visually retested in the same scenarios. Browser console error log was empty.
- Final verdict covered those fixes. This is a frontend preview: demo read-only, sample writes temporary, no production MemoryGate adapter or media ingestion. Export uses the existing download helper; downloaded-file receipt remains unverified from the earlier pass.
