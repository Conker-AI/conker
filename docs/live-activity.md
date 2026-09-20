# Recorded tasks and Activity

Pi is the owner of durable AI-work tasks. This increment connects its SQLite task ledger and actual turn/event projections to the authenticated dashboard. The preview Activity workspace remains separately labeled and uses fixtures.

## Meaning of each record

- A task records the desired outcome, completion criteria and the owner's reported progress. Creating one does not schedule or execute work.
- A run is an existing Pi turn. Its actual status is preserved, including approval/budget waits, interrupted work, unknown effects and acted-without-reply.
- An event records a task, run or action state change. It contains identities and states, not a reconstructed account of model reasoning or copied private prose.

Only Companion assignment is supported by the durable ledger today. The specialist/team editors still need a persistent agent registry and dispatcher. Exact output-message associations are also missing from older turns, so the run API returns no inferred outputs. Conversation links open the actual source session.

## Task lifecycle

The owner chooses an open source conversation, describes the outcome and writes 1–20 completion criteria. Parent tasks and any explicitly linked existing runs must belong to that conversation. The source stays fixed after creation. Task metadata may be edited for a closed source, but new or reopened work requires an open source. Forgotten sources are read-only tombstones.

Progress is explicitly owner-reported. Completion requires reviewing every current criterion. Terminal tasks must be reopened before editing; completed or cancelled tasks may be archived and restored. Active child tasks block closing their parent. Cancelling a task does not claim cancellation of a running effect.

## Writes, evidence and recovery

Pi validates source/parent/run references and compares revisions within the same transaction as the change and its event. Stale writes return a conflict instead of overwriting newer state. Creation has a retained request identity: the browser can look it up after an uncertain response without sending another creation. A request reused with different content is rejected. Other uncertain writes require reading the current task and reviewing its state; the browser does not replay them automatically.

The database enforces append-only events. Schema upgrades preserve existing turns without inventing old events. Task-filtered events show direct task changes and runtime events from the currently linked runs; this view does not imply those runs historically belonged to the task before linking.

Task text remains in Pi and is not automatically ingested into MemoryGate. Offline conversation forgetting scrubs task outcomes, criteria, review notes and creation comparison hashes across the same source/descendant scope. IDs and content-free metadata remain inspectable. The frontend masks tombstones and clears related drafts when it learns that the source was forgotten.

## Scope of verification

Backend tests exercise real SQLite reopen, schema upgrades, competing edits, creation replay/conflict, lifecycle/parent/run constraints, event immutability and rollback, approval/unknown-effect state preservation, authentication/CSRF and physical forgetting. Connector tests cover bounded DTOs, fixed source acknowledgements, privacy masking, pagination and ambiguous writes with a single dispatch followed by explicit lookup.

Browser verification uses a local HTTPS gateway and the real Pi task API/database with clearly identified seeded conversation/run history. No model or external tool is connected to this QA target. A successful metadata edit is not evidence of an executed task.

Chrome verification on 20 September 2026 covered creation with a linked turn, in-progress review, reload, criterion-by-criterion completion, archive/restore, recorded-event inspection and source navigation. A second database client changed an open task: saving the stale browser draft produced a revision conflict, retained its text, and allowed explicit recovery to the current record. A dropped creation acknowledgement was injected after the real server committed; request lookup recovered the saved task with exactly one creation request. Restarting the QA gateway/Pi process preserved all task records. Conversation drafts survived navigation to Activity and back, and the seeded approval-wait turn continued to block new sends.

Desktop light/dark and 390px dark layouts were inspected through screenshots and interaction. The final build also verifies source-specific run selection and no-source feedback. There was no horizontal document overflow or console error on the final QA navigation. The temporary QA runtime uses a detached Pi checkpoint so concurrent backend development cannot change the version under test.

## Remaining launch work

Task execution, atomic turn request identities, exact input/output association, fresh privileged verification, unattended-screen locking, durable specialists/teams, and full preview-to-live feature integration remain separate work. Server deployment, real provider/gate effects, approval/recovery and backup/restore acceptance are still required. See [completion-plan.md](completion-plan.md) for the active ledger and [gateway-workspace.md](gateway-workspace.md) for the authentication boundary.
