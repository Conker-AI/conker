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

The restored dashboard builds and all 29 check suites pass. Root tests pass locally
(220 passed, 36 Windows skips). All five matching backend candidates passed Linux
CI before tagging. Installer execution tests still need Linux evidence.

Verified coordinated pre-update snapshot:
`snapshot-20261006T080229Z-bfc70ac1` in the server's private recovery directory.
Integrity verification is not a restore drill. Prior exported sources and Compose
configuration are separately retained. Existing PostgreSQL, Qdrant and Ollama
image identities are retained during the application update.

Live owner sign-in is pending; the initial installation credential was rejected.
No natural conversation or autonomous memory/proposal behavior is yet claimed
as tested. Persona execution must use the actual browser, not privileged scripts
presented as a user interaction.
