# Backend remaining work — current source audit

September 21, 2026. This checklist organizes the remaining phase; it does not change
completion-plan.md or replace its acceptance requirements. backend-completion.md
is chronological and contains superseded statements. Frontend remains accepted
against fixtures; final transport wiring and deployment require the later review.

## Verified source distinctions

| Requirement | Current evidence | Remaining proof/work |
| --- | --- | --- |
| P2–P6 tasks, agents, teams, projects, context | Pi has committed runtime modules and focused acceptance evidence in backend-completion.md, including team execution and frozen character/context settings. | Final integrated regression and contract review; do not rebuild the existing ledgers or editors. |
| P3/P4 memory authority | Pi `9db4637` and `89065d7` add operator-owned specialist read clients and team reads with source privacy and narrowed selections. | Final integrated regression, live key revocation behavior, and complete authority review; no namespace provisioning has occurred. |
| P7 providers | Pi `1611240` adds opt-in direct OpenAI/Anthropic text adapters alongside Ollama/OpenRouter and role routing. | Integrated regression; live account verification and unsupported streaming/multimodal/effort capabilities remain explicit. |
| P8/P11 artifacts and files | Artifact persistence/versioning exists. Pi `c34342b`, `3b5d108`, and `4349d2f` add bounded text/Markdown/CSV/JSON/DOCX extraction, source passages and turn-bound citation identity validation. | Final agreed-format/deliverable audit; PDF/OCR/image model input remain unsupported. Citation source identity does not establish factual support. Rendering a fixture image is not multimodal model input. |
| P9 conversations | Durable drafts, submissions, context, source links and literal conversation search have committed evidence. | Integrated acceptance review of queue/steer/cancel, branches/retry model and intended search scope; no blanket claim from storage tests. |
| P10 tools/jobs | Published pinned execution, nested workflows, deterministic schedule and receipts already exist. | Remaining grant/spending admission and end-to-end independent service contract checks. Arbitrary code execution is explicitly deferred by P10's JSON-source rule. |
| P12 memory | Scoped retrieval and reviewed corrections already have Pi/MemoryGate implementations. | Remaining retention/recovery integration and namespace authority; do not replace MemoryGate with a duplicate store. |
| P13 calls | Typed/STT/model/TTS turns, pause/interruption and privacy exist. Pi `4839be7` passes authored character settings to opt-in Qwen3 VoiceDesign. | Reference cloning, supported browser audio/timing and integrated call acceptance remain. Camera/perception/GPU rendering remain deferred. No new recording-retention claim. |
| P14 system | Inventory, container/systemd lifecycle, directory metadata, owner-reviewed port replacement and verified lost-receipt recovery exist. | Pi `57486fe` adds opt-in authenticated terminal routes, lease limits and revocation; Linux PTY and gateway tested separately. Remaining: partial replacement recovery/cleanup and combined Linux gateway acceptance; ordinary PID termination needs accepted identity/authority scope. Real Docker behavior has only synthetic verification so far. |
| P15 recovery/auth | Existing operation-bound gateway verification and action journals; `tests/test_backend_restore.py` exercises temporary Pi SQLite snapshots and no effect replay. | Coordinated restore across services, post-backup deletion/effect reconciliation, independent fresh-verification coverage. Pi `73cba45` verifies explicit restored-session/proof revocation; normal startup is not a restore gate. A Pi snapshot test is not proof of cross-service recovery. |
| P16 continuity | Pi `d6cc22c` adds durable owner polling delivery with separate shown/read acknowledgement, stable IDs and quiet-hours/privacy filtering. | Pi `15eebbc` adds a grounded, source-linked summary of returned status updates. Remaining: urgency classification and proactive budget reservations; external push is unconfigured. Polling delivery does not prove final frontend notification behavior. |
| P17 deployment | Explicitly outside the present stopping point. | Owner review first; no deployment, final UI wiring, GitHub pushes or reset redemption during backend work. |

## Work order

1. Integrated Pi regression at `15eebbc`: 812 passed, 7 skipped; ToolGate at
   `52ebf8e`: 586 passed, 8 skipped. Bootstrap test module-reload contamination
   repaired. Skipped/external-service checks remain unproven, not passed.
2. Finish remaining P14 terminal/recovery actions and grant/budget admission;
   reuse existing ToolGate/MemoryGate authority and receipts.
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
