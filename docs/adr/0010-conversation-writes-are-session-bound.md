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

## Update, 6 November 2026: the session is enough; the password is the exception

The owner: having signed in a few minutes ago, being asked for the password again for something
that can be undone is friction with no protection. The rule is turned around.

- **Signing in gives access.** Every ordinary write needs only the session, CSRF and Origin: chats,
  tasks, proposals, job controls, tool runs, imports, tool settings, server actions, setup steps
  and settings that are not about security.
- **The password is asked only** for what cannot be undone or changes protection: forgetting,
  owner preferences (they hold the sign-in time), job hooks and adoption, budgets, setup
  protection, approval decisions that delete or pay (level 3), the owner terminal, turning
  lockdown off, giving a tool or identity access, and secrets sent to an MCP server.
- **Idle sign-out.** The sign-in stays unlocked while the owner uses the page: it sends
  `POST /auth/activity` on clicks and keys (about once a minute), and the window
  (Settings > Security, `idleTimeoutMinutes`) restarts. Polling, reads and writes never extend it,
  an expired sign-in stays expired, and nothing outlives the 24-hour absolute limit.
- The list now names the exceptions: `PASSWORD_WRITES` in Pi's `browser_contract.py`, plus the
  gateway routes marked "password" in Pi's docs/browser-auth.md. The dashboard keeps no mirror:
  it asks for the password only when the gateway answers 428.
- Adding a route to the password list, or taking one off, is a security decision and updates this
  ADR and Pi's `tests/test_password_scope.py`.
