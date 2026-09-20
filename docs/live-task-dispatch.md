# Work on a saved task

Live Activity task details now offer **Work on this task**. The centered review shows the current saved objective, completion criteria, fixed conversation and task revision. The exact generated message is inspectable. It is retained separately from an ordinary chat draft.

Sending uses the same verified conversation pipeline and shared operation lock. The browser rereads task and conversation eligibility, then binds the immutable request identity, text, task ID and expected revision. Pi checks that revision again when reserving and binding the turn. A concurrent task edit during the password prompt cannot silently execute the older reviewed task.

A successful binding links the actual run and increments the task revision. It does not mark criteria satisfied or complete the task. Owner-reported status remains independent of runtime completion.

## Recovery and boundaries

- A lost acknowledgement retains the exact task binding. Checking the submission is read-only; an explicitly permitted retry keeps the same request ID, task ID, revision and text.
- A received conflict followed by an absent saved submission allows explicit dismissal and review of the current task. Network uncertainty alone does not allow replacement with a new request.
- Preparation failure/interruption is inspectable. Task-bound automatic forks are intentionally unsupported and return an actionable explanation before model dispatch.
- Forgotten task content is cleared immediately on the canonical task read, before any later session read can fail. Known tombstones hide retained inputs synchronously.
- Archived, completed or cancelled tasks, closed/forgotten conversations, 100 linked runs, unresolved turns and active preparation block new task work.
- Only Companion is connected. Specialist/team execution, steering and cancellation remain separate integration work. Existing configuration determines available models/tools; this is not an answer-only execution boundary.

## Evidence

Focused domain, runtime, Activity, authentication and import-isolation checks pass. Independent review found and repaired the immediate-forgetting edge case. Production build, design checks and affected lint pass.

Chrome QA used the real local HTTPS gateway, Pi loop and SQLite with a clearly labeled stub provider. The owner created a task in a conversation containing an unrelated unsent draft. A second client edited that task while password verification was open: the stale request ran no model, and explicit recovery enabled review of the new revision. The accepted task then completed one stub-provider turn; its acknowledgement was deliberately dropped. Request lookup recovered the result and the single linked run, preserved the original chat draft, and left task status planned with no reviewed criteria. No external provider or ToolGate effect ran.
