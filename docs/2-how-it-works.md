# 2 · How it works

Conker is six small services plus a web dashboard. Each service lives in its own repository and can
be used without the others.

## The pieces

```mermaid
flowchart TB
    You([You, on phone or PC]) -->|private network, HTTPS| GW[Gateway<br/>login and sessions]
    GW --> Pi[Pi<br/>conversations, model choice, tool calls]
    GW -->|your approvals| TG
    Pi -->|remember and recall| MG[MemoryGate<br/>evidence and memories]
    Pi -->|do something| TG[ToolGate<br/>tools, workflows, approvals]
    Pi -->|check the machine| SG[SystemGate<br/>read-only health]
    Pi -->|which model?| DS[Decisions<br/>optional, Laya]
    Pi --> M[Models<br/>local Ollama or a hosted provider]
    MG --> EM[Embeddings<br/>text to vectors]
    MG --> DB[(PostgreSQL + Qdrant)]
    TG --> World[Outside world<br/>mail, files, APIs]
```

| Service | Job | Never does |
|---|---|---|
| **Gateway** | Password login, browser sessions, serves the dashboard | Hand service keys to the browser |
| **Pi** | Runs each conversation turn, picks a model, calls tools | Store memories or act on the world directly |
| **MemoryGate** | Stores evidence, builds memories, finds relevant ones | Execute anything |
| **ToolGate** | Runs tools and workflows, asks for approval, keeps receipts | Decide what you value |
| **SystemGate** | Reports machine health (CPU, disk, containers, backups) | Run commands |
| **Embeddings** | Turns text into vectors for meaning-based search | Keep any data |
| **Decisions** *(optional)* | Picks between options with probabilities (routing, ranking) | Write answers or grant permissions |

**The one rule:** anything that touches the outside world goes through ToolGate. The browser only
ever talks to the Gateway.

## One message, start to finish

```mermaid
sequenceDiagram
    participant You
    participant Gateway
    participant Pi
    participant MemoryGate
    participant Model
    participant ToolGate
    You->>Gateway: "Plan my week"
    Gateway->>Pi: turn (logged-in owner)
    Pi->>MemoryGate: what's relevant?
    MemoryGate-->>Pi: memories + their sources
    Pi->>Model: context + your message + available tools
    Model-->>Pi: answer, maybe a tool call
    opt tool call
        Pi->>ToolGate: run calendar.read
        ToolGate-->>Pi: result + receipt
    end
    Pi->>MemoryGate: record evidence from this turn
    Pi-->>You: answer, with what it read and did
```

Every turn is saved in order and never edited. When a conversation gets too long, Pi closes it,
writes a summary and continues in a linked child conversation.

## When an action needs your approval

```mermaid
sequenceDiagram
    participant Pi
    participant ToolGate
    participant Inbox as Your Inbox
    Pi->>ToolGate: send email to coach
    ToolGate-->>Pi: needs approval (request id, expires in 5 min)
    ToolGate->>Inbox: "Send this exact email?"
    Inbox->>ToolGate: approve (after password check)
    Pi->>ToolGate: resume the same action
    ToolGate-->>Pi: sent + receipt
```

An approval is bound to that exact action and its arguments. It works once. A replay or an expired
approval is refused.

## What may happen without asking

| Kind of action | Example | Default |
|---|---|---|
| **Observe** | read, search, draft, propose | Free |
| **Prepare** | build or stage something, not run it | Free |
| **Act locally** | run a script, start a service | Asks |
| **Act outward** | send, post, spend money | Asks, with hard limits |

You can loosen or tighten each kind separately. Why these choices were made: [decisions](adr/).

## Where it runs

Everything runs in Docker on one machine. Only the Gateway is reachable, and only from your private
network (for example Tailscale). Databases and service APIs are not exposed. Local models keep
conversations on the machine; if you add a hosted model, each turn shows which provider answered.
