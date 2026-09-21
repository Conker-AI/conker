# Backend remaining work — current source audit

September 21, 2026. This checklist organizes the remaining phase; it does not change
completion-plan.md or replace its acceptance requirements. backend-completion.md
is chronological and contains superseded statements. Frontend remains accepted
against fixtures; final transport wiring and deployment require the later review.

## Verified source distinctions

| Requirement | Current evidence | Remaining proof/work |
| --- | --- | --- |
| P2–P6 tasks, agents, teams, projects, context | Pi has committed runtime modules and focused acceptance evidence in backend-completion.md, including team execution and frozen character/context settings. | Final integrated regression and contract review; do not rebuild the existing ledgers or editors. |
| P3/P4 memory authority | `pi/team_execution.py` explicitly rejects role memory scopes other than `none`. | Authorized specialist/team namespaces and tests showing scope cannot widen. Configuration alone is insufficient. |
| P7 providers | `pi/api.py` constructs Ollama and OpenRouter providers; model-role routing/configuration is already implemented. | Reconcile direct-provider selections offered by Settings with supported adapters; implement missing agreed adapters, preserve manual locks and helper privacy. |
| P8/P11 artifacts and files | Artifact persistence/versioning exists. `pi/attachment_turns.py` feeds only extracted UTF-8 plaintext into model input and rejects other content. | Required richer processing/deliverable behavior, explicit format capability states, actual citations/provenance and focused output checks. Rendering a fixture image is not multimodal model input. |
| P9 conversations | Durable drafts, submissions, context, source links and literal conversation search have committed evidence. | Integrated acceptance review of queue/steer/cancel, branches/retry model and intended search scope; no blanket claim from storage tests. |
| P10 tools/jobs | Published pinned execution, nested workflows, deterministic schedule and receipts already exist. | Remaining grant/spending admission and end-to-end independent service contract checks. Arbitrary code execution is explicitly deferred by P10's JSON-source rule. |
| P12 memory | Scoped retrieval and reviewed corrections already have Pi/MemoryGate implementations. | Remaining retention/recovery integration and namespace authority; do not replace MemoryGate with a duplicate store. |
| P13 calls | `pi/calls.py` has actual typed/STT/model/TTS turns, pause/interruption, transcript association and privacy. Its capabilities explicitly say characterVoice is not implemented. `pi/speech.py` accepts bounded PCM WAV. | Character voice settings must affect synthesis; reconcile supported browser audio, timing and interactive call requirements. Camera/perception/GPU character rendering remain explicitly deferred. Do not make new audio-retention promises. |
| P14 system | ToolGate/Pi inventory, configured-container lifecycle, scoped systemd service lifecycle and directory metadata are implemented. Files UI source only expands/selects/copies paths. | Reviewed container port create/change/delete and authenticated terminal behavior; ordinary PID termination needs its own identity/authority design if retained by accepted controls. Directory metadata does not satisfy terminal or content editing. |
| P15 recovery/auth | Existing operation-bound gateway verification and action journals; `tests/test_backend_restore.py` exercises temporary Pi SQLite snapshots and no effect replay. | Coordinated restore across services, post-backup deletion/effect reconciliation, gateway session invalidation, independent fresh-verification coverage. A Pi snapshot test is not proof of cross-service recovery. |
| P16 continuity | `pi/continuity.py` derives real task/run/job feed and acknowledgements, but explicitly returns `notificationDelivery=not-configured` and `summaryGeneration=none`. | Meaningful result notification/briefing behavior, quiet hours/urgency and budget reservations without duplicate delivery. Configured preferences are not delivery. |
| P17 deployment | Explicitly outside the present stopping point. | Owner review first; no deployment, final UI wiring, GitHub pushes or reset redemption during backend work. |

## Work order

1. Finish remaining P14 actions using existing ToolGate authority and receipts;
   next inspect Docker's actual port-reconfiguration constraints before choosing
   an implementation. Preserve the accepted editor's create/edit/remove behavior.
2. Complete namespace authority and grant/budget admission shared by teams and
   proactivity. Reuse existing MemoryGate/ToolGate authorization.
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
