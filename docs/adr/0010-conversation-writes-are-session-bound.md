# ADR-0010 — Conversation writes need the signed-in session, not a fresh password

**Status:** accepted, 24 September 2026. Changes the browser verification rule described in
[reference/gateway-verification-recovery.md](../reference/gateway-verification-recovery.md).

## Context

Every browser write required an operation-bound password proof: the owner typed the full password,
the gateway ran scrypt and issued a single-use token for that exact request. That included sending a
chat message. A companion you have to re-authenticate to for every sentence is not one you use
daily, and daily use is what the whole product depends on.

## Decision

Five low-risk writes need only the signed-in browser session: **create a chat, send a message,
fork a chat, stop a running answer, and decide on a proposal** (added with the proposal engine; a
decision records a preference and grants nothing). The session cookie is `__Host-`, Secure, HttpOnly and
`SameSite=strict`; the gateway still requires the exact configured Origin and the session's CSRF
token, and still rejects query strings on writes.

Every other browser write keeps operation-bound verification: owner approval decisions, resuming an
approved action, tasks, settings and model configuration, workflows and their access, and anything
added later unless it is deliberately placed on this list.

The list lives in one place per side: `SESSION_ONLY_WRITES` in Pi's `browser_contract.py` (enforced
by the gateway) and `isConversationWrite` in the dashboard transport (which only decides whether to
ask for the password).

## Why this is safe enough

- A message can lead to a real-world effect only through ToolGate, and anything above the agent's
  autonomy needs an Inbox approval, which still requires the password.
- Stop only reduces what happens; it never grants anything.
- The remaining risk is someone with the unlocked browser chatting as the owner, which the idle
  timeout bounds, and which is the same risk every chat app accepts.

## Consequences

- Chat feels like chat: no prompt between messages.
- Adding a route to the session-only list is a security decision and needs this ADR updated.
