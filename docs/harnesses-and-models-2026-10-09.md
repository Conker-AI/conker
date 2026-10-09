# Conker harness and model architecture

The current local build adds subscription sign-in, learned model selection and an
independent background analyst to the connected workspace. This continues the
[chat and GitHub source review](conker-research-2026-10-09.md), using the existing
Pi, Gateway, ToolGate and MemoryGate services rather than replacing their state.

## What was learned from the other harnesses

| Harness | Useful architecture | Conker application |
| --- | --- | --- |
| Hermes | Separate provider authentication and native agent runtime; auxiliary models; memory, skills, delegation, toolsets and scheduled work | Separate subscription control from inference, role-based models, explicit capability boundaries |
| Codex | Official app-server with account/login/start, device-code login, account status, models and event-driven agent execution | Pinned unmodified Codex owns Conker's isolated ChatGPT sign-in; full native agent remains available through CLI and owner terminal |
| Claude Code | Official binary owns consumer subscription authentication; native interactive and print modes | Run the unmodified CLI; no importing another app's Claude tokens, no custom Claude.ai token proxy |
| OpenCode | Primary agents and subagents with model and permission choices; TUI, web, API/SDK | Keep model assignment independent of tool grants and expose shared runtime state through both CLI and UI |
| Pi coding agent | Minimal extensible harness, skills/packages, interactive/print/RPC/SDK modes; deliberately leaves some orchestration to extensions | Preserve replaceable adapters and explicit roles instead of tying the app to a single model vendor |

Conker's Python service named Pi is unrelated to the external Pi coding agent.
The Hermes source checkout reviewed here is `5f045f842a60184748dda30acb9fecbd961cc18b`.
No upstream agent code was executed during that review.

Primary references, checked 2026-10-09:

- [Hermes providers](https://hermes-agent.nousresearch.com/docs/integrations/providers)
- [Hermes native Codex runtime](https://hermes-agent.nousresearch.com/docs/user-guide/features/codex-app-server-runtime)
- [Hermes tools and toolsets](https://hermes-agent.nousresearch.com/docs/user-guide/features/tools/)
- [Hermes scheduled tasks](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron/)
- [Codex app-server](https://learn.chatgpt.com/docs/app-server)
- [Sign in with ChatGPT using app-server](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server)
- [Claude Code authentication and integration terms](https://code.claude.com/docs/en/legal-and-compliance)
- [Claude Code CLI](https://code.claude.com/docs/en/cli-reference)
- [OpenCode agents](https://opencode.ai/docs/agents/) and [permissions](https://opencode.ai/docs/permissions/)
- [Pi coding agent](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md)
- [Laya source](https://github.com/NandhaKishorM/laya) and [checkpoint](https://huggingface.co/convaiinnovations/laya)

Hermes documentation describes some direct subscription routes that differ from
provider guidance. Conker follows the official provider boundary. In particular,
Claude.ai subscriptions are used through the unmodified Claude Code program, not
by extracting its credentials into an Anthropic API adapter. A registered external
Sign in with ChatGPT application is also a different integration from this local,
Codex-managed account flow.

## Working model lanes

- **Talking / answers:** manual model lock or Auto. The per-chat override remains
  authoritative and cannot silently fall back to a different model.
- **Thinking:** a separate model call begins concurrently with each ordinary
  companion turn when enabled. It produces findings, not a raw reasoning trace,
  and runs no tools. The talking response does not wait for it. The UI provides
  status, cancellation, findings and “Discuss these findings.”
- **Routing:** Laya chooses among the owner's eligible answer models using model
  descriptions and a bounded conversation projection. Long requests carry marked
  excerpts and length/turn metrics. System prompts, recalled memory and tools
  are excluded from the classifier.
- **Context selection, summarization, memory ranking, search ranking and daily
  proposals:** existing independent model roles remain configurable. Their
  enablement does not imply every optional service is installed.
- **Task-specific agents:** the existing agent studio retains per-agent model
  choices and tool selection. Background thinking currently applies to companion
  conversations, not autonomous team or scheduled-job turns.

Laya is a classifier, not an oracle. Its score is normalized entropy separation
(`1 - H(p)/log(k)`), not correctness probability. The local profile uses a 0.01
minimum separation; an unavailable, too-large or near-tied decision uses only the
configured fallback. This is a starting policy, not a measured optimal router.
Evaluation against the owner's tasks is still needed before claiming best-model
selection. The service accepts 2–8 choices and rejects input beyond its token
window instead of silently clipping it.

Thinking has two concurrent slots and a configured timeout, at most 120 seconds.
There is no unbounded queue. New input supersedes unfinished findings; cancel
discards a late result. An already-dispatched provider request can still finish
and consume allowance. Restart marks pending work interrupted without retrying.
No-harness conversations skip the analyst. Forgetting removes stored findings.
The lane has separate model usage receipts and cannot grant or execute tools.

## Login and native execution

Open Settings → Providers for **Sign in with ChatGPT** or **Sign in with Claude
subscription**. The owner finishes provider authentication personally. Status,
cancel and disconnect use the same private service from CLI and UI. Authentication
does not select a model, prove inference access, or grant tools.

Codex is pinned to 0.160.1. Claude Code is the installed official executable
(2.1.270 on this host); both have separate Conker-owned auth directories. Existing
desktop/CLI account stores are not imported. The private Windows bridge binds
only 127.0.0.1 and has distinct control and inference keys. Browser access goes
through Gateway session, CSRF and exact operation-bound owner verification.

Claude model-role calls use print mode with native tools, MCP and slash commands
disabled. Full native tools, plugins, interactive prompts and native sessions are
available through `conker.py native` and the Windows owner terminal under
**System → Terminal**. This is host-account access, not a filesystem sandbox.
Terminal creation requires the existing password verification, permits one active
lease, expires after 15 minutes, and closes on browser-session revocation. Conker
does not store its input/output; native apps may retain their own sessions.

## Reproduce and operate

From the Conker repository after the base workspace install:

```powershell
ollama pull qwen3:4b
python scripts/workspace.py down
python scripts/workspace.py enhance
python scripts/workspace.py build
python scripts/workspace.py up
```

`enhance` applies the reviewed backend patch to the exact pinned clean Pi source,
installs the separate Laya and Codex runtimes, and configures the private bridge.
Use `--pi-source C:/path/to/conker-pi` for a reviewed development checkout. Existing
model choices are preserved; a fresh configuration enables Auto over Qwen 2.5 3B
and Qwen 3 4B and uses Qwen 3 for background analysis. Both models must be installed.

```powershell
python scripts/conker.py new "A new conversation"
python scripts/conker.py sessions
python scripts/conker.py chat SESSION_ID "My question" --model local-fast
python scripts/conker.py show SESSION_ID
python scripts/conker.py thinking SESSION_ID
python scripts/conker.py thinking SESSION_ID --cancel TURN_ID
python scripts/conker.py models
python scripts/conker.py models --save role-update.json
python scripts/conker.py auth chatgpt login
python scripts/conker.py auth chatgpt status
python scripts/conker.py auth claude login
python scripts/conker.py auth claude status
python scripts/conker.py native codex
python scripts/conker.py native claude
python scripts/conker.py api pi /agents
```

`models --save` accepts the same revision-bound update as the UI, containing
`expected_revision` and `configuration`. `api pi` and `api toolgate` expose service
operations to the local host owner; `--body file.json` supplies POST data. ToolGate
continues enforcing execution grants. The native command keeps the caller's
working directory. Normal Conker chats and native-agent sessions are separate.

## Capability coverage and remaining work

| Capability | Current local coverage |
| --- | --- |
| Persistent chats, projects, artifacts, memory | Connected existing services; semantic retrieval still needs embeddings/Qdrant |
| Custom agents, teams, schedules, proposals | Existing shared service/UI contracts; CLI has direct access; grants and per-job budgets remain explicit |
| Role-specific models, Auto, separate talking/thinking | Implemented; local inference and real Laya selection exercised |
| Subscription sign-in | Both native runtimes detected; real Codex device flow and Claude authorization-link start/cancel exercised; final user authorization and hosted inference pending |
| Full Codex / Claude native CLI commands | Native command passthrough and Windows browser terminal; native permissions retained |
| Native agent events in Conker's structured Activity and approval views | Remaining integration; terminal output is not a structured Conker run |
| Hermes/Pi/OpenCode plugin and skill package interoperability | Research complete for architecture; no universal importer or compatibility claim |
| Voice conversation and speech models | Existing call UI and browser speech surfaces; dedicated speech service and per-stage speech-model routing remain unconfigured |
| Multimodal perception, messaging channels, remote sandboxes | No blanket parity claim; separate adapters and service setup remain |

This release establishes the requested model/authentication/concurrency path and
native harness access. It does not claim complete feature-for-feature equivalence
with every harness.

## Verification record

Validated on this Windows host against the production dashboard at
`https://localhost:18550`. The portable backend patch contains commits
`142b67e` and `4a69639`, based on Pi
`865b74b86db808a50ad487231009a21a301b3a96`. Its application was checked against
the unchanged pinned source checkout.

- The production build, TypeScript, design guard and lint passed. The final
  Gateway entry is 691,007 bytes; no fixture chunk is included. Existing Vite
  large-chunk and dependency annotation warnings remain.
- The dashboard's 32 check suites passed across the full run and targeted
  reruns after fixing two changed expectations. Gateway, terminal, provider,
  rich-answer, chat-adapter and workspace checks cover the affected contracts.
- Backend runs passed 54 model, routing, transport and loop checks; 30 forgetting
  and terminal checks; and two native Claude owner-verification/domain checks.
  The launcher/native-provider test run passed 23 tests. Ruff and whitespace
  checks passed. The test client's existing httpx deprecation warning remains.
- Real Laya routing selected `local-fast` for ordinary conversation, then Pi
  returned an Ollama `qwen2.5:3b` answer. A recorded decision took 789 ms with
  separation 0.3962. This is an execution receipt, not an accuracy benchmark.
- A separate `qwen3:4b` analysis completed and remained available after a full
  restart. Other local analyses reached their 120-second timeout. UI cancellation
  discarded findings while the talking request still completed. Shared local
  hardware can affect both models' latency despite independent execution.
- Browser tests exercised running/canceled thinking, retained older findings,
  discussion without overwriting a draft, and one copy of a submitted message
  during background polling. The owner terminal ran `codex --version` and
  `claude --version`, then closed its shell lease.
- Real Codex sign-in produced a pending device code and canceled cleanly.
  Real Claude Code sign-in produced its official
  `claude.com/cai/oauth/authorize` link and canceled cleanly. Both remain signed
  out. No hosted model response or completed subscriber authorization is claimed.
- Inspected desktop and 390-pixel mobile views in light/dark themes, including
  provider controls, model settings, thinking results and the native terminal.
  Local screenshots and acceptance scripts are in the ignored
  `dashboard/output/playwright/` directory.
- Stopped and restarted the complete workspace, preserving chats, findings and
  settings. All seven service readiness checks passed. The final UI assets and
  provider-domain fix were then loaded through controlled service restarts.
