# 1 · What Conker is

**Conker is a personal AI companion you host yourself.** Start with a conversation,
choose the models it uses, and decide what it may remember or do. The connected
browser app and host CLI work with the same saved conversations and service state.

The current local build supports chat, private saved drafts, memory inspection,
tools, approvals, projects, agents, teams and scheduled work. Optional services
add model routing, background thinking and speech. Availability depends on the
installation; [Status](status.md) records what has actually been verified.

## The core behavior

- **Talking stays available.** The talking model answers your messages. An explicit
  **Think** request starts separate background analysis; you can keep talking,
  cancel the analysis or bring its findings into the conversation yourself.
- **Models have separate jobs.** Choose a talking model directly, or configure
  Auto to choose among eligible models. Thinking, summarization and other roles
  have separate settings. A router's choice is a decision to inspect, not proof
  that it found the best model.
- **Continuity is visible.** Chats, drafts and long-term memory are different
  records. A saved message does not prove that memory accepted it. Receipts show
  delivery, retrieval and recorded model/tool activity.
- **Actions follow configured authority.** Conker tools pass through ToolGate's
  grants and approval policy. An approval authorizes its exact action and
  arguments; a model choice or subscription sign-in grants no tools.
- **Failures remain visible.** An unavailable service, pending save or uncertain
  operation needs its own recovery path. Reconnecting must not silently repeat
  an action whose outcome is unknown.

Local models run on your machine. Hosted models receive the context supplied to
their selected role. Native Codex and Claude Code sessions have their own
permissions and history; they are separate from ordinary Conker conversations.

## The direction

Conker should reduce the work of supervising an assistant. Useful memory should
make later conversations easier. Proposals should cite their evidence and leave
you a clear choice. Declining one should help avoid repeated noise.

Some of that loop is connected today, but long-term usefulness and routing quality
still need evaluation. These are design goals, not guarantees of accurate memories,
flawless answers or complete parity with every other harness.

## Words you'll see

| Word | Meaning |
|---|---|
| **Owner** | The person an installation serves. |
| **Companion** | The supplied assistant profile, named Conker by default. |
| **Pi** | Conker's conversation engine: turns, model selection and tool coordination. |
| **Gateway** | The authenticated front door used by the browser. |
| **ToolGate** | The service that checks grants and executes Conker tools. |
| **MemoryGate** | The service that records evidence and retrieves long-term memory. |
| **Evidence** | A source record used to support a memory or proposal. |
| **Receipt** | A saved account of a request's outcome, including pending or failed outcomes. |
| **Proposal** | Suggested work for you to consider; accepting it records your decision. |
| **Approval** | Permission for one exact action under the configured policy. |

Every other word, in plain language: [Glossary](reference/glossary.md).

## Where to go next

- [2 · How it works](2-how-it-works.md): the services and boundaries.
- [3 · Using Conker](3-using.md): conversations, models, memory and recovery.
- [Connected workspace](connected-workspace.md): run this local build.
- [4 · Running Conker](4-running.md): deployment and host operations.
- [Status](status.md): verified source behavior and release limitations.
