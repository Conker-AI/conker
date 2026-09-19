# Memory workspace: research and implementation boundary

19 September 2026. Scope: frontend exploration and fixture editing, not a MemoryGate migration.

## Research translated into features

- [Obsidian Graph](https://obsidian.md/help/plugins/graph): hover highlights neighbors, click selects a record, pan/zoom, filtering, and a local graph with controllable depth. Adopt selection, one/two-hop focus, source visibility, and reset/fit controls. Avoid an unreadable graph of everything.
- [Neo4j Bloom exploration](https://neo4j.com/blog/developer/scoobygraph-3/): inspect properties and selectively expand relationships. Adopt an evidence inspector with navigable linked records; distinguish relationship kinds.
- [Qdrant Web UI](https://qdrant.tech/documentation/web-ui/): inspecting stored points and payloads is a separate task from visual exploration. Keep a sortable database view, raw JSON, copy, and filtered JSON export alongside the graph.
- [Cognee visualization](https://docs.cognee.ai/api-reference/visualize/visualize-multi): dataset context matters when combining graphs. Keep source origin visible and use a source tree as an alternate projection.
- [React Flow](https://reactflow.dev/learn): use its supported React canvas for pan, zoom, pointer dragging, keyboard-accessible nodes and fitting the viewport. Theme it with Conker's semantic tokens.

## This pass

One collection, shared text/category filters, three appbar-addressed views: Graph, Database, Source tree. Source nodes and topic nodes explain their links. Topic edges are metadata membership, never an invented semantic similarity score or evidence of agreement. Spatial distance has no semantic meaning.

Retain the existing four sample claims and their source URLs. Add sample titles/topics for exploration. New/edit/delete actions go through ConkerClient's fixture adapter. Mutations are tab-local and reset on reload. Editing retains the original text and source; it does not rewrite evidence or silently raise confidence. Manual notes have no fabricated external source. No embeddings, graph database, filesystem, or remote memory writes are claimed.

Graph controls: select, highlight neighbors, inspect, drag points, pan, zoom, fit/reset, source-node visibility, one/two-hop neighborhood. Database: sort, column selection, structured/mobile record rows, copy JSON and export current filtered records. Source tree: expand/collapse by origin and source path, inspect the same records.

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

- Production build and design-system guard passed; the existing large conversation chunk warning remains.
- Affected-file ESLint, memory contract tests, navigation checks and daily-overview checks passed.
- Inspected desktop dark/light screenshots and mobile graph, source tree and editor screenshots. Verified node selection (including keyboard), dragging, neighbor focus, depth expansion, source visibility, shared filters, empty search recovery, create/edit/delete preview records, evidence preservation and reset on reload.
- No browser console errors observed. Hot reload emitted a React Flow node-types warning during development; node types are declared at module scope.
- JSON export uses the existing download helper. The browser automation download event timed out, so receipt of the exported file is not independently verified.
