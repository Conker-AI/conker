# Owner Inbox checkpoint — unfinished frontend

Work stopped for an owner-requested scope/usage discussion on 20 September 2026.

Backend prerequisites are committed and independently reviewed:

- ToolGate `dd24b4a`: dedicated hashed owner credential, bounded verification-only list/detail, exact arguments and atomic decisions. 62 focused regression checks; independent numeric/origin/pagination probes passed.
- Pi `c393cd3`: owner detail proxy and validated list pagination; 40 gateway/API verification checks passed.

The dashboard's new `lib/gateway/owner.ts`, `components/gateway/owner-state.ts`, `owner-workspace.tsx` and `scripts/check-gateway-owner.cjs` are a **work-in-progress backup**, not a shipped Inbox. They are not wired into the gateway entry, navigation or authentication-reset boundary. No configured owner credential or live service was used.

The client uses the new fixed projection. The UI reviews exact arguments, keeps notes and uncertain decisions, reads canonical state after a lost response and permits only an explicit identical retry. Approval never auto-resumes execution. Review caught unsafe JSON integers, stale-read overwrite after a decision, and an expired approval retry loop; fixes are present but the latter two still require rendered deferred-response QA. The focused owner script passes. The owner UI currently has one React effect-cleanup lint warning to resolve.

Next bounded work: wire owner client/state/reset and Inbox navigation; add the owner script to check:gateway; validate current projection end-to-end using isolated real ToolGate and gateway with test-only credentials; test lost acknowledgements, expiry, stale reads, rejected decisions and desktop/mobile/light/dark layouts. Build, document and commit only after verification. Pi resume controls remain a separate increment: resume has no durable request identity and a dispatched 409 must not be classified as definitely unsent.

The verified task-dispatch increment is separate. Its browser evidence used real Pi SQLite and a stub provider, including a concurrent revision conflict, one committed turn with a dropped acknowledgement, preserved ordinary draft, and no automatic task completion.
