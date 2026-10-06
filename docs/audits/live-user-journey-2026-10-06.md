# Live owner journey: 6 October 2026

## Scope and Evidence Rules

Restore the UI to `43a028fa0e8ff7d756178bd7d51133b2f1b001dd`.
Keep the rejected design recoverable on its existing branch. Preserve existing
server data, credentials, service isolation and Tailscale-only access.

Use a fictional adult, not an impersonated real person. Test records are explicitly
QA-labelled. Do not send real messages, enable paid providers, or widen tool grants.
Distinguish observed browser behavior, service receipts, source inspection and
unverified expectations. Passing unit tests is not a successful live user journey.

## Persona and Natural Journey

Maya Rowan is a fictional independent designer. She works Monday to Thursday,
09:00-16:00, prefers short checklists and has climbing classes on Tuesdays and
Thursdays at 18:30. Her fictional Northstar presentation is due Friday. A quiet
morning preparation block is useful; scheduling over her classes is not.

1. Sign in and complete or inspect setup as an ordinary owner.
2. Introduce the above facts naturally in a QA-labelled conversation.
3. Discuss an unrelated everyday topic, then start a new conversation.
4. Ask for a realistic weekly plan without repeating the facts or requesting recall.
5. Inspect memory sources and any actual memory use reported by the answer.
6. Correct one preference and test whether later answers use the correction.
7. Observe spontaneous proposals without prompting the system to remember or suggest.
8. Ask for a local recurring preparation reminder; distinguish a proposal from an
   admitted schedule and a completed scheduled run. Pause test schedules afterward.
9. Try an existing skill/tool through chat and inspect approval, execution and history.
10. Check projects, artifacts, search, model selection, cancellation and reload continuity.
11. Record visual friction, ambiguous copy, missing recovery and misleading success.

## Findings Before Live Journey

- **Confirmed release gap:** the default Conker branch and pinned application images
  lagged behind the connected UI. Updating browser assets alone would not install
  the newer owner contracts. A release must pin matching tested service revisions.
- **Fixed installer origin:** cloning used the former GitHub owner rather than
  `Conker-AI/conker`.
- **Fixed false installation success:** a failed `git pull --ff-only` was ignored
  and reported as updated. Dirty checkouts now stop before provisioning; failed
  pulls fail explicitly. Regression tests cover both cases.
- **Fixed stale dashboard identity:** the manifest did not match the restored UI tree.
- **Confirmed old host launcher defect:** the existing source-exported `conker`
  command lacks executable mode, and the older launcher only lists containers for
  status instead of proving service health. The updated launcher must be installed.
- **Fixed coordinated backup defects:** authentication was omitted from the writer
  stop list; SQLite could not open the read-only source mount; ordinary in-store
  Hugging Face model-cache links were rejected. Private-copy SQLite capture retains
  committed WAL and validated internal regular-file links are flattened. External,
  dangling and directory links remain rejected. Regression tests cover these paths.
- **Fixed Linux test race:** terminal fixture waited for socket creation instead of
  actual listener readiness. It now waits for the post-listen health heartbeat,
  without consuming the single accepted connection or relaxing reconnect rules.
- **Confirmed release distribution gap:** new `Conker-AI` GHCR packages defaulted
  to private despite public repositories. Anonymous installer pulls are denied.
  Package visibility needs owner action before claiming a usable public release.
- **Confirmed sign-in UX weakness on the old host UI:** the saved installation
  password is rejected with generic "gateway declined" copy instead of a clear
  password-specific recovery message. No password was reset and no authentication
  was bypassed. The owner has been asked to sign in directly.

## Validation In Progress

The restored dashboard builds and all 29 check suites pass, including Dashboard
CI. Root tests pass locally (220 passed, 36 Windows skips). All five matching
backend candidates passed Linux CI before tagging. Latest assembled Linux CI has
250 passing tests, 5 skips and one image-access failure; the separate recovery
drill also cannot pull private images. Those failures remain release blockers.

Verified coordinated pre-update snapshot:
`snapshot-20261006T080229Z-bfc70ac1` in the server's private recovery directory.
Integrity verification is not a restore drill. Prior exported sources and Compose
configuration are separately retained. Existing PostgreSQL, Qdrant and Ollama
image identities are retained during the application update.

Main-server owner sign-in is pending; the initial installation credential was
rejected. Natural conversations below ran through the actual browser on the
isolated QA installation. No autonomous proposal or completed scheduled run is
claimed as tested. Privileged diagnostics are not presented as user interactions.

## Installation Observations

- The main server was updated from tested tagged backend sources and the exact
  restored dashboard tree, using local source-built application images. This is
  not a claim that anonymous registry installation or assembled release acceptance
  passed. The changes are on `fix/conker-user-journey-2026-10-06`, not promoted to
  default `main` while private registry packages block its required Linux checks.
- A restrictive staging umask initially made copied application code unreadable
  to container UID 1000. The prior services were restored, only public source and
  build assets had their read permissions corrected, images were rebuilt and a
  non-root import check passed before reapplying. Private state was not chmodded.
- Main server `conker doctor` reports 7 healthy areas and one unconfigured optional
  hosted model. Actual `conker status` also reports missing SearXNG and unavailable
  Docker telemetry. These are degraded capabilities, not working tools.
- Existing answer-role configuration remains revision 1 with local Qwen 2.5 3B,
  local memory ranking enabled and proposals disabled. No existing job definitions
  were found. Existing infrastructure image IDs match the pre-update identities.
- Linux CI revealed a real piped-bootstrap defect (`BASH_SOURCE[0]` unset under
  `bash -s`) and stale installer fixture paths. Both are fixed. The last checked
  Linux run reached 250 passing tests, with registry access still blocking the
  image-existence test and separate recovery drill; no guard was disabled.
- An isolated real-backend QA installation is available temporarily on tailnet
  port 8444. It has fresh owner credentials and stores, separate container networks
  and no production records. Only public local-model caches are mounted read-only.
  Initial sign-in and Companion default acceptance succeeded through the browser.
  QA records must not be presented as evidence of the existing owner's profile.

## Live QA Findings

### Observed in the Browser

- **Setup has competing status snapshots.** After accepting the memory choice,
  the sidebar showed 4/8 resolved while the page progress showed 3/8 and memory
  "Needs attention". Capture: `setup-inconsistent-progress.png`. Both may represent
  different moments of fluctuating service health, but displaying both as current
  prevents the owner from knowing which state is authoritative.
- **A setup action does not explain the next repair.** "Use memory" opens an
  "Include optional setup" password prompt whose explanation says it does not
  configure the service. When memory is unavailable, the page offers the same
  button again without an actionable cause. A choice, a service repair and an
  evidence check need distinct semantics.
- **The first streaming turn looks unsaved and omits the user's message.** The
  assistant streamed while history said "No saved messages" and the sent text
  remained in the disabled composer. Once completed, both messages appeared.
  Capture: `first-turn-streaming.png`. This is a pending/persisted presentation
  race, not proof of actual lost data.
- **The companion ignores conversational workload.** Maya asked for "a manageable
  next step" and stated her preference for short checklists. Local Qwen 2.5 3B
  returned eight expanded generic recommendations, roughly a minute of generation.
  It used the current-turn facts, but that does not prove long-term recall.
  Capture: `first-answer-too-long.png`. Stronger routing/harness and evaluation
  matter here more than cosmetic chat polishing.
- **Cross-chat recall fails in the ordinary fresh-install journey (high priority).**
  After introducing Maya, discussing basil care, and opening a fresh chat, the
  prompt "Help me plan the rest of this week so I feel ready and don't overbook
  myself" produced a request for her schedule, commitments and preferences.
  None of the known Friday deadline, working hours or climbing commitments was
  used. The profile was independently visible as an admitted memory. The answer
  receipt reported `Memory: ok`, **0 records supplied**, `explicit-scope`.
  Captures: `cross-chat-recall-failed.png`, `cross-chat-memory-zero.png`,
  `profile-memory-saved.png`. Healthy retrieval is not evidence of useful recall.
- **Memory organization works, but its labels do not explain the person.** Map,
  Tree, List and the record inspector loaded real QA records and relationships.
  The tree contains repeated "Owner conversation evidence" and "Admission value
  0.00; no inference or generalization" labels. These expose processing artifacts
  more prominently than recognizable topics or source conversations. Keep the
  evidence available, but improve human-readable summaries in a later UX change.
  Capture: `memory-tree-real-records.png`.
- **A recurring-reminder request is not an actual job.** In a separate chat, Maya
  requested a local Wednesday 08:00 Asia/Jerusalem presentation reminder and
  explicitly asked whether it was created. Conker declined; Jobs still showed
  **0 schedules**. No approval, job identity or run receipt appeared. The reply
  misleadingly described Conker as a "fictional digital assistant" instead of
  explaining the current tool/publication limitation. The Jobs screen has no
  creation command and says schedules need authoritative published procedures.
  Captures: `chat-reminder-unavailable.png`, `jobs-no-create.png`.
- **Fresh installs have no usable tool/skill execution path out of the box.**
  Tools showed **0 tools**, while explaining that ToolGate is reachable. This is
  not a service outage or proof that workflow execution is broken. A QA draft
  could be created through owner verification. Its Run action correctly refused
  execution before publication. Publishing and caller access remain separate;
  do not count a saved draft as a skill the Companion can use.
- **Workflow grant explanations contradict each other.** The published workflow
  activity says called workflows need their own access. The owner confirmation
  says it grants access to this workflow **and its pinned nested workflows**.
  These describe different scopes. The QA workflow has no nested steps, but the
  copy must match the actual scope before users authorize complex workflows.
  Publication of the inert QA Input -> Return workflow succeeded as version 1,
  with approval required on every run. Caller access was left unchanged pending
  explicit approval; no run success is claimed.
- **Routine authoring confirmations show plumbing rather than intent.** Creating
  and linking a project prompted "Confirm gateway operation" with an API path,
  without the project/conversation names in the primary confirmation. "Request
  details" exposes the verb and endpoint, not a useful before/after change.
  Keep the owner boundary, but explain the operation being authorized. Do not
  lower security to solve copy friction. Capture: `project-confirmation-technical.png`.
- **A cancelled request resurfaced in the next answer.** After cancelling the
  private 30-day guide, reloading and asking "What is 2 + 2? Answer with only the
  number", the model streamed `4` and then continued a long version of the old
  guide. Stop cancelled this second turn too (`trn_789432f044554663`), without a
  saved assistant completion. The backend did not claim the old turn was still
  running; this is an answer/context quality failure, not an observed scheduler
  restart. Source shows retained user messages are passed as ordinary message
  text without a cancellation annotation. Preserve history while making cancelled
  intent explicit, then evaluate with stronger models as well as local Qwen 3B.

### Verified Useful Paths

- Scoped memory search for `Northstar` found the retained profile and connected
  source/analysis records. This confirms discoverability, not automatic recall.
  Capture: `memory-search-northstar.png`. Its footer said "2 of 2 records loaded"
  while the graph said "3 visible records"; clarify loaded hits versus linked
  context rather than treating different counts as the same concept.
- Project `project_964c9ab16a894e8586625cef067420b6` was created, its existing
  fictional-profile chat was linked, and revision 2 plus the link survived
  a browser reload. No conversation content or grants were copied into it.
  Capture: `project-reference-persisted.png`.
- QA-only "Ideas from Conker" was enabled through normal owner verification using
  the existing local Qwen answer model. Main-server configuration was not changed.
  No model pass or spontaneous suggestion has yet been observed. Source shows
  hourly checks and a 24-hour interval; disabled/skipped passes also advance the
  eligibility clock. Do not manually invoke the worker and call that autonomy.
  Capture: `qa-ideas-enabled.png`.
- A memory-disabled QA turn was accepted, cancelled via Stop, and retained as
  `trn_7fb6423c40164922`. Its receipt says `cancelled` and `Memory: disabled`.
  After reload the saved user message and active privacy setting remained, with
  no assistant completion shown. This tests early cancellation, not cancellation
  during external side effects. Capture: `cancelled-memory-disabled.png`.
- A subsequent scoped memory search for `QUIET-CEDAR-2026` returned 0 matches.
  Together with the disabled receipt, this supports correct exclusion in the
  tested path; it is not a claim to have inspected every log, cache or backup.
  Capture: `private-marker-excluded.png`.
- Artifact `artifact_0a44d3c1784b47339ac664e1cb7c0b7e` was created through owner
  verification, edited in Source, and saved as immutable version 2. Reload showed
  the authored checklist and revision 2; History retained both versions. This
  verifies creation, versioning and readback, not export or restoration.
  Capture: `artifact-version-persisted.png`.
- A natural profile correction moved climbing to Wednesday at 19:00 and changed
  rehearsal preference to afternoons. The completed local-model answer scheduled
  rehearsal at Wednesday 19:00, directly conflicting with the updated class.
  Receipt completion is not planning correctness. Cross-chat correction conflict
  resolution remains unverified. Capture: `profile-correction-scheduling-conflict.png`.

### Supporting Runtime Evidence

- The QA first conversation is `ses_70a5402a60f44c07`. The first answer's Ollama
  request took 54.7 seconds with 460 generated tokens, about 9.2 tokens/second.
  This measures the actual CPU setup, not general Conker or model performance.
- QA MemoryGate logged a `KeyError: reason` from `embedding_health()` during
  fluctuating embedding availability. The helper returns a shared mutable cached
  dictionary and assumes its `reason` key still exists. A concurrent cache clear
  was reproduced in isolated concurrency tests and repaired in MemoryGate 0.4.1.
  Six new regression cases failed against the old code and all passed after the
  fix; the full 122-test suite, Linux CI, and release publication passed.
  Later health/context and conversation-ingest requests succeeded, so this is
  intermittent degradation rather than proof that every memory write failed.
- Existing main-server proposals remain disabled and its job list is empty.
  Idle suggestions must not be mistaken for failed autonomy until a proposals
  model and actual schedules are configured. No provider or authority was changed
  on the existing owner's installation.
- The failed cross-chat turn is `trn_16f5147de16d4cd0` in
  `ses_94b1e542e98447fc`. The recurrence request is in
  `ses_e3e03adad05d418d`. All are isolated QA records, not production records.
- **Source-supported recall cause:** `pi/agents.py` defaults the Companion memory
  scope to `conversation`; its authored scope schema accepts only `none`,
  `conversation`, or `selected`, not owner-wide automatic retrieval.
  `dashboard/src/components/gateway/runtime-workspace.tsx` sends an explicit
  agent selection when creating a chat. `pi/store.py` persists that selection as
  session-settings revision 1. `pi/memory.py` preserves owner-wide retrieval only
  for revision-0 legacy Companion sessions; normal saved settings use the profile
  scope. Setup's optional memory choice can also create revision-1 settings.
  This matches the observed zero-record receipt. Fix the explicit owner-consent
  and scope contract rather than bypassing privacy or querying all records blindly.

## Remaining Gates

The five approved code-only packages (`pi`, `toolgate`, `memorygate`, `systemgate`,
`embeddings`) are public. The temporary organization public-publishing permission
was restored to disabled; `pi-owner-terminal` remains private. Anonymous registry
access succeeded for all five pinned images and for the MemoryGate 0.4.1 patch.
Conker Linux CI on `2b5480a0` passed both installer checks and the actual recovery
drill after the auth-mutation targeting fix. A coordinated writer-stopped backup
including auth was created at `snapshot-20261006T090958Z-83f0b3f6` and its integrity
verified. Latest-candidate checks and post-installation testing are still required.

Main Conker sign-in is still required to inspect the existing owner's environment.
The isolated journey does not validate existing records, grants or credentials.
Correction resolution, spontaneous proposals, completed scheduled runs, broad
skill coverage, real communications and a full restore drill remain unverified.
Do not silently configure paid models, widen authority or reset credentials to
make those gates appear passed.

## Patch Candidate

- Pi cancellation context annotates retained cancelled input as history, not
  pending instructions, and freezes the annotation for exact turn replay.
- Pi adds an explicit owner-saved Companion `owner` memory scope. Defaults remain
  unchanged; private messages, custom agents, team roles, namespace credentials
  and immutable snapshots retain their boundaries. It has not been silently
  enabled on either installation. The targeted agent/session/team/context suite
  passed 69 tests; final Linux CI remains the release gate.
- The dashboard exposes that Companion-only choice and explains the scope in the
  password confirmation without echoing instructions or selected record content.
- The transcript displays submitted input as pending, never as a fabricated saved
  record. It retires by exact saved input identity, excludes forgotten content,
  suppresses the empty-history claim during generation, and retains failed drafts.
- Workflow access and confirmation use the same published-version/nested-workflow
  scope. Project and artifact confirmations describe authoring rather than just
  API endpoints; content remains inert and password requirements are unchanged.
- These are source and regression-test results until deployed and exercised in
  the live QA account. Restored UI styling is preserved; this is not a redesign.

## Next Fix Order

1. Restore intentional, owner-consented cross-chat memory in the saved Companion
   contract and test new chats, exclusions, corrections and forgetting together.
   Never widen arbitrary agent or team scopes as a shortcut.
2. Make capabilities explicit to the model and owner. A reachable backend, saved
   draft, grant, approved action, recorded schedule and completed run are separate
   facts. Provide an authoritative path for job creation rather than generating
   promises in chat.
3. Reproduce and fix the embedding-health cache failure, then use one current
   setup-status snapshot across the page and sidebar.
4. Repair pending-message rendering and truthful memory-use evidence before
   further visual polish. Match answer length to the user's actual request and
   make cancelled intent explicit in later context.
5. Use human-readable memory/source labels and operation-specific confirmations;
   keep technical evidence and owner control available through disclosure.

Screenshots are local QA evidence under
`C:/Users/The1a/dev/companion/.cache/live-user-journey-2026-10-06/`.
They are not credential-bearing production captures or release assets.
