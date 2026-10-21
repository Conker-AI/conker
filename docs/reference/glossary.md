# Glossary

Every kind of thing in Conker, in plain words. The **bold** word is the one screens and docs use. When
the code or an older screen uses another name for it, that name appears under
[Same thing, other names](#same-thing-other-names).

## Your companion and agents

| Word | Meaning |
|---|---|
| **Owner** | The one person an installation serves. |
| **Companion** | The agent you talk to by default, named Conker unless you rename it. |
| **Agent** | A saved assistant: instructions, a model choice and the tools it may ask for. The companion is one agent; you can make more. |
| **Character** | How an agent comes across: soul, backstory, speaking style, look, voice and expression modes. Edited in Character Studio. A character never grants permissions. |
| **Team** | Several agents working on one piece of work, started by you. |
| **Team template** | A starter for a team that you copy and adjust. |
| **Skill** | A bundle of instructions an agent can be given, such as how to write a report. Instructions only: a skill cannot run anything. |

## Talking

| Word | Meaning |
|---|---|
| **Chat** | One conversation with an agent. |
| **Message** | One thing you or the agent said in a chat. |
| **Turn** | The agent's work on one of your messages: read the context, maybe use tools, answer. |
| **Draft** | An unsent message the server has saved for you. Drafts never reach a model or memory. |
| **Fork** | A new chat that branches from a message in an old one. Editing an earlier message makes a fork, so the original stays as it was. |
| **Summary** | A short version of older messages that stands in for them, so a long chat fits the model. A helper model proposes it; you review it. |
| **Decisions and open threads** | Points from a chat that are kept as context for it. |
| **Project** | A place that groups chats, files and context about one subject. It points at things; it does not copy them. |
| **Artifact** | A finished piece of output saved from a chat, such as a document. It can be exported to Word or Excel. |
| **Attachment** | A file you add to a message. |
| **Call** | A spoken conversation with an agent. |
| **Native session** | A Codex or Claude Code session. It keeps its own history and permissions, separate from Conker chats. |

## Message controls

| Word | Meaning |
|---|---|
| **Think** | Ask for a separate background analysis. You can keep talking meanwhile. Its findings join the chat only when you bring them in, and it never runs tools. |
| **Research** | Let the answer search: off, web, or deep. |
| **Auto** | Let a helper model pick the model and settings for your next message. Its pick is a suggestion you can inspect, not proof it chose best. |
| **Output settings** | The answer's format, length and language for one chat. |
| **Privacy** | Per chat: keep memory off, keep tools off, or both. |

## Models

| Word | Meaning |
|---|---|
| **Talking model** | The model that writes the answer you read. |
| **Helper models** | Models with side jobs: choosing the model (Auto), thinking, picking context, summaries, ranking memories and search results, and proposals. New side jobs start switched off. |
| **Provider** | Where a model runs: on your machine (Ollama), through a subscription (ChatGPT, Claude) or through a paid API (OpenRouter, OpenAI, Anthropic). |
| **Plan limits** | How much of your ChatGPT or Claude plan is left, in percent (`conker limits`). |
| **Paid models** | Models that cost money per use. They stay off until you allow them. |

## Memory

| Word | Meaning |
|---|---|
| **Memory** | What the companion keeps about you between chats, stored in MemoryGate. |
| **Evidence** | The message or record a memory comes from. |
| **Memory delivery** | Whether a message actually reached memory: saved, filtered or still pending. A saved chat alone does not mean it was remembered. |
| **Retrieval** | Which memories were given to one answer. A memory in the library may not have been used. |
| **Correction** | A change to a memory's text that you review before it is applied. |
| **Forget** | Delete a memory or a whole chat, including everything made from it. |

## Doing things

| Word | Meaning |
|---|---|
| **Tool** | One action Conker can take, such as reading a folder or calling a web service. Tools live in ToolGate. |
| **Workflow** | Fixed steps that chain tools together. You write and publish it; agents can run a published workflow but cannot change it. |
| **Job** | A tool or workflow that runs on a schedule: daily, weekly or every few hours. |
| **Task** | A to-do with an outcome and what counts as done: planned, in progress, blocked, completed or cancelled. Making a task never starts work by itself. |
| **Run** | One time something actually ran: a turn, a job, a team or a workflow. |
| **Approval** | Your yes or no for one exact action with its exact arguments. It is used once. |
| **Spending budget** | How much paid actions may spend. An action that would go over waits for you. |
| **Vault** | Where ToolGate keeps the keys its tools use. Models and the browser never see them. |
| **Lockdown** | ToolGate stops running tools, when you switch it on or after repeated forged requests, until you release it. |

## What needs you

| Word | Meaning |
|---|---|
| **Inbox** | Everything that needs you (approvals, proposals, questions) and the decisions you made. |
| **Proposal** | Something Conker noticed you keep doing and offers to take on, with its evidence. A declined idea is not offered again for 30 days; "never" stops it for good. |
| **Activity** | What actually happened: runs and events, in order. |
| **Receipt** | The saved result of a request, including pending, failed and unknown results. |

## Behind the scenes

| Word | Meaning |
|---|---|
| **Pi** | The conversation engine: chats, turns, agents, models and scheduling. |
| **Gateway** | The signed-in front door the browser talks to. Service keys stay on the server. |
| **ToolGate** | The only way anything gets done: tools, workflows, approvals and spending. |
| **MemoryGate** | Long-term memory: what is kept, where it came from, and forgetting. |
| **SystemGate** | Read-only view of the server: processes, services, containers, health numbers and error logs. |
| **Embeddings** | Optional service that lets memory search by meaning, not only exact words. |
| **Laya** | The optional model picker behind Auto. It cannot grant permissions or write the answer. |

## Where a sent message can end up

[How it works](../2-how-it-works.md#a-message-start-to-finish) follows a message step by step.
While Pi works on a message, the message is in one of these states:

| State | What it means | What you do |
|---|---|---|
| Running | The agent is working on it. | Wait, or stop it. |
| Complete | The answer arrived. | Nothing. |
| Waiting for approval | The agent asked for an action that needs your yes. | Approve or decline in the Inbox. |
| Waiting for budget | The action would spend more than the budget allows. | Raise the budget or decline. |
| Action in progress | A tool is running. | Wait. |
| Acted, no reply | The action ran, but the answer was lost. | Read the action's result; do not send again, because that would repeat the action. |
| Outcome unknown | Conker cannot tell whether the action happened. | Check the action first; never repeat it blindly. |
| Stopped | You stopped it. If an action had already run, that shows. | Nothing, or send again. |
| Failed | Something broke and no action ran. | Send it again. |

## Same thing, other names

| Use | Also seen as | Where |
|---|---|---|
| Chat | session, conversation | Pi API `/sessions`, older docs |
| Workflow | automation | ToolGate API `/v2/automations` |
| Team | collaboration | Pi API `/collaboration` |
| Job | cron job, scheduled job, schedule | Pi API `/jobs`, the Schedule screen |
| Proposal | suggestion | AgentGate (August) |
| Activity events | journal | the old `/journal` page, which now redirects to Activity |
| Approval | request, verification | ToolGate API `/v2/requests`, AgentGate |
| Helper models | harness | the Harness tab in companion settings |

## Words with two meanings

| Word | Meanings | Say instead |
|---|---|---|
| Mode | 1. Think, Research and Auto on a message. 2. A character's Focus or Character expression. | "message controls", "expression mode" |
| Harness | 1. Helper models. 2. The program that runs an agent (Pi, Codex, Claude Code). | "helper models", "runtime" |
| Template | 1. A team template. 2. A prompt template, a built-in starter message. | Name which one. |
| Run | A turn, a job run, a team run or a workflow run. | Name which one when it matters. |
