# 3 · Using Conker

A short guide to each screen. **Live** means it works with the real backend. **Preview** means the
screen is designed and clickable but uses sample data. Screens in preview say so on the page.
Details are in [Status](status.md).

## Signing in

Open your Conker address (for example `https://your-server:8443`) and enter the owner password set on
the server. Chatting needs no further password. Risky changes (approvals, settings, workflows) ask
for it again, for that one change only ([ADR-0010](adr/0010-conversation-writes-are-session-bound.md)).
Forgot it? Reset it on the server: see [4 · Running Conker](4-running.md#reset-the-password).

## The screens

### Companion and Chats: talk to it · **Live**

![A conversation showing what Conker read and a suggested plan](images/conversation.png)

- **Companion** is your ongoing conversation. **Chats** are separate topic conversations.
- Under each answer you can open **what it did**: memories used, tools called, and which model
  answered.
- Answers appear as they are written; **Stop** ends one early and keeps what already happened.
- Choose a model in the composer, or let routing pick one.
- An action waiting for approval shows up as a card in the conversation, linked to the Inbox.

### Inbox: things waiting for you · **Live for approvals**

- **Approval requests:** the exact action, its arguments and when it expires. Approve or deny.
- **Proposals:** things Conker noticed in your messages and offers to take on, with the messages
  that prompted each one. **Accept**, **Not now** (hidden for 30 days) or **Never suggest this**.
  Accepting records your choice; nothing runs by itself. Turn it on by assigning a model to the
  Proposals role in Settings.

### Home: overview · **Partly live**

![Home with requests needing attention and recent activity](images/home.png)

What needs your attention, recent activity and shortcuts. Sections that aren't connected yet say so.

### Memory: what it knows about you · **Live**

Search memories and see each one's source conversation. **Forget this memory** shows the exact text,
then removes it everywhere Conker stored it (confirm with your password); the chat it came from
stays until you forget that chat too. Correcting from this screen is planned. Search by meaning
needs the Embeddings service. Without it, Conker falls back to word search and tells you.

### Journal: what happened · **Partly live**

Everything Conker did, in order: turns, tool calls, approvals, failures.

### Tools and workflows: what it can do · **Live**

See registered tools, and build workflows (branches, loops, steps) in the editor. Publish a workflow
and allow the companion to use it. Runs that need approval pause in the Inbox.

### Agents and Jobs · **Preview**

Agents behind the companion, and scheduled work. Designed, not yet connected.

### System: is the machine OK? · **Partly live**

Service health is live. Terminal, files and some telemetry are samples.

### Settings · **Live for models**

Model providers and which model does what (answering, routing, memory ranking), theme and layout.
**Character Studio** (`Settings → Companion`) sets your companion's name, personality, style and
voice. Voice cloning and 3D appearance are not connected yet.

### Calls · **Preview**

Call screen with microphone, camera, captions and a mini view. Real-time AI voice is not connected.

## Common tasks

| I want to… | Do this |
|---|---|
| Ask something | Companion, type, Enter |
| Start a separate topic | Chats, then **New chat** |
| See why it said something | Open **what it did** under the answer |
| Approve an action | Inbox, open the request, **Approve**, confirm your password |
| Keep a conversation out of memory | Turn on **Incognito** for that chat |
| Use a stronger model | Settings, Models: add a provider, then assign it to *answering* |
| Let it run a workflow | Tools: publish the workflow, allow the companion to use it |
