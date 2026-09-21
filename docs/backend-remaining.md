# Backend remaining work — current source audit

September 21, 2026. This checklist organizes the remaining phase; it does not change
completion-plan.md or replace its acceptance requirements. backend-completion.md
is chronological and contains superseded statements. Frontend remains accepted
against fixtures; final transport wiring and deployment require the later review.

## Verified source distinctions

| Requirement | Current evidence | Remaining proof/work |
| --- | --- | --- |
| P2–P6 tasks, agents, teams, projects, context | Pi has committed runtime modules and focused acceptance evidence in backend-completion.md, including team execution and frozen character/context settings. | Final integrated regression and contract review; do not rebuild the existing ledgers or editors. |
| P3/P4 memory authority | Pi `9db4637` and `89065d7` add operator-owned specialist read clients and team reads with source privacy and narrowed selections. | Companion `8aa202cf` proves per-request key revocation and namespace enforcement through real handlers; 25 Pi team/authority and 17 MemoryGate scope/bootstrap tests pass. Deployment/PostgreSQL proof remains; no namespace provisioning has occurred. |
| P7 providers | Pi `1611240` adds opt-in direct OpenAI/Anthropic text adapters alongside Ollama/OpenRouter and role routing. | Integrated regression; live account verification and unsupported streaming/multimodal/effort capabilities remain explicit. |
| P8/P11 artifacts and files | Artifact persistence/versioning exists. Pi `c34342b`, `3b5d108`, and `4349d2f` add bounded text/Markdown/CSV/JSON/DOCX extraction, source passages and turn-bound citation identity validation. | Owner download routes now generate editable DOCX/XLSX plus native attachments, with 22 artifact/download checks passing. Final agreed-format audit remains; PDF/OCR/image model input remain unsupported. Citation source identity does not establish factual support. Rendering a fixture image is not multimodal model input. |
| P9 conversations | Durable drafts, submissions, context, source links and literal conversation search have committed evidence. | Pi `cbc7f0f` adds durable owner cancellation for running ordinary turns, checkpoint/final-commit guards and receipt-preserving reconciliation; 69 focused tests pass. Preparation cancellation is now implemented too: retained request-ID cancellation, late-helper discard, no late fork, and attachment reservation release; 58 focused checks pass. Owner-authorized reply-only recovery now preserves action receipts, claims a retained request ID atomically, exposes no tools and honors a new Stop; 67 focused checks pass. Durable queue lifecycle now includes five-entry cap, edit/remove/pause/resume, captured configuration and explicit review, plus forgetting cleanup (23 focused checks). Pi `3a12690` adds atomic submission admission, receipt reconciliation and opt-in automatic FIFO draining. 51 combined checks pass; 10 execution checks pass after adding worker fairness. Per-entry model selection now freezes eligible catalogue choices into submission snapshots with no fallback (52 focused checks). Pi `c4c6a14` binds exact reply targets, respects context exclusions/retrieval and exposes references on saved inputs. Research contracts and steer remain. New owner message-boundary fork creates idempotent children with exact source references, inherited privacy and paginated branch history. Legacy summary fork remains separate. Pi `4fa8b96` and `9423a65` now preserve and validate exact prepared retry inputs (49 capture checks and 31 combined replay checks). Pi `b42e7d9` and `a467183` implement durable retry admission, owner endpoint/receipt, response-family selection, exact input/citation references and no repeated effects. Full Pi regression: 911 passed, 8 skipped; final refinement: 28 focused checks. Steering and research-mode contracts are the remaining P9 priority. |
| P10 tools/jobs | Published pinned execution, nested workflows, deterministic schedule and receipts already exist. | Pi `ba49b98` binds an existing actor/root-scoped ToolGate budget to a held run; ToolGate `8c0780b` adds scoped metadata reads. Companion `d16de5a1` verifies the combined paid run/lost-receipt contract with fake provider and real handlers. Recurring delegated budget provisioning remains. Arbitrary code execution is explicitly deferred by P10's JSON-source rule. |
| P12 memory | Scoped retrieval and reviewed corrections already have Pi/MemoryGate implementations. | Remaining retention/recovery integration and namespace authority; do not replace MemoryGate with a duplicate store. |
| P13 calls | Typed/STT/model/TTS turns, pause/interruption and privacy exist. Pi `4839be7` passes authored character settings to opt-in Qwen3 VoiceDesign. | Reference cloning, supported browser audio/timing and integrated call acceptance remain. Camera/perception/GPU rendering remain deferred. No new recording-retention claim. |
| P14 system | Inventory, container/systemd lifecycle, directory metadata, owner-reviewed port replacement and verified lost-receipt recovery exist. | Pi `57486fe` adds opt-in authenticated terminal routes, lease limits and revocation; Pi `ae991b6` verifies the real Linux PTY through the gateway, including proof/CSRF and automatic revocation closure. Remaining: partial replacement recovery/cleanup; ordinary PID termination needs accepted identity/authority scope. Real Docker behavior has only synthetic verification so far. |
| P15 recovery/auth | Existing operation-bound gateway verification and action journals; `tests/test_backend_restore.py` exercises temporary Pi SQLite snapshots and no effect replay. | Existing Companion offline recovery suite passes 31 Linux tests; snapshots/restores remain held. Live Docker proof and post-backup deletion/effect reconciliation, independent fresh-verification coverage. Pi `73cba45` verifies explicit restored-session/proof revocation; normal startup is not a restore gate. A Pi snapshot test is not proof of cross-service recovery. |
| P16 continuity | Pi `d6cc22c` adds durable owner polling delivery with separate shown/read acknowledgement, stable IDs and quiet-hours/privacy filtering. | Pi `15eebbc` adds a grounded, source-linked summary of returned status updates. Remaining: urgency classification and proactive budget reservations; external push is unconfigured. Polling delivery does not prove final frontend notification behavior. |
| P17 deployment | Explicitly outside the present stopping point. | Owner review first; no deployment, final UI wiring, GitHub pushes or reset redemption during backend work. |

## Work order

1. Integrated Pi regression during `a467183`: 911 passed, 8 skipped (seven live-service
   checks plus Linux-only terminal on Windows), one existing test-client deprecation
   warning. ToolGate at `52ebf8e`: 586 passed, 8 skipped. Skipped/external-service
   checks remain unproven, not passed.
2. Close P9 steering versus queued future turns and research-mode contracts.
   Cancellation, queues, message forks and durable answer retries now have committed
   implementation and verification. Reconcile the missing frontend steering control
   against the agreed acceptance requirements rather than assume it exists.
   Then finish P14 recovery actions and recurring grant/budget admission.
3. Close agreed provider, attachment/deliverable and call-presentation gaps.
4. Implement remaining continuity delivery and coordinated recovery behavior.
5. Audit all P0–P16 requirements against current source, independent service
   tests and recorded fixture acceptance. Unknown/unverified items stay open.
6. Report backend completion only after that audit passes, and stop for review.

This is a source audit, not fresh verification of every earlier test. No backend
package is declared globally complete by this document. Larger optional roadmap
ideas (GPU bodies, camera perception, unrestricted code sandboxes) must not silently
grow this phase. Taste-only choices remain for the owner's review; engineering
defaults and already-authorized functionality should continue without another
permission interview.
