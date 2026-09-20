# Protected writes and durable turn recovery

The live gateway requires a fresh owner password for each runtime write or owner decision. Login alone does not authorize the next protected change. This extends the existing authenticated workspace; preview fixtures still have no live effect.

## Verification boundary

The browser freezes the exact operation before showing its target and a password prompt. Cancel keeps the operation unsent and preserves the original form. A wrong password allows another explicit password attempt without discarding the same owner's draft. Password fields clear before verification; proof tokens remain private to the request pipeline.

The gateway derives the binding from the method, exact allowed path and full canonical JSON body. Its short-lived proof is bound to the browser session and credential generation, and is consumed once before forwarding. Changed bodies, revisions, targets, expired proofs and concurrent replay fail. A failed upstream response does not restore the proof. The browser never automatically repeats a mutation.

`GATEWAY_IDLE_TIMEOUT_SECONDS` defaults to 1,800 seconds. The server enforces a password-verified unlock window: only login or successful fresh verification extends it. Polling does not extend access. The browser hides protected content at the reported deadline and rechecks on foregrounding. This is a bounded verified window, not a claim that browser events prove continuous human presence. Signing out revokes the browser session; it cannot recall an operation already admitted by the server.

The direct Pi recovery-key API is unchanged. Fresh verification authorizes the submitted operation; ToolGate remains responsible for tool grants, effect approvals and action receipts.

## Turn recovery

The composer generates a request identity before submitting a turn. Pi reserves it before automatic fork preparation, then atomically binds the effective conversation, input message, turn and optional task reference. Reusing an identical request reads its current result instead of running a model or tool again.

After a lost response, the browser checks that identity. A not-found result permits an explicit retry of the same retained request after fresh password verification. It does not generate a replacement identity. Known preparation failure or interruption can be reviewed before allowing a new request. The saved input remains inspectable and can be restored into an empty composer without replacing a newer draft. Forgotten content is masked and cannot be restored or retried.

Reload discovers unresolved submissions through server records. The recovery list paginates older entries. Active or ambiguous turns, including an interrupted turn that already acted, block a new send. A recorded automatic fork opens its actual destination. An accepted receipt is followed by a canonical history read; the UI does not invent a reply from transport success.

Activity run inspectors link to exact input, intermediate, tool-result and final messages where Pi recorded those associations. Older history retains an explicit no-association state. Pending input and comparison hashes participate in physical forgetting.

## Limits

- A request identity prevents duplicate turn dispatch, not every possible external effect. Existing ToolGate action reconciliation remains necessary.
- Resume and manual fork do not yet have request identities. The live UI does not claim retry-safe controls for them.
- Unsent drafts remain in the open workspace. Ordinary unsent text is not yet persisted across reload; reserved preparation input is durable on Pi.
- Task-to-turn binding is implemented in the API. The live UI still needs task dispatch controls and full specialist/team integration.
- Streaming, steering, cancellation, owner decision UI, durable full-shell features and deployment acceptance remain separate launch work.

## Verification

Pi checkpoints: `f42c1a7` adds operation proofs and the unlock window; `3be2f22` adds submission recovery and exact message associations. The backend suites cover replay, changed operation bindings, logout/reset races, deadline expiry, interrupted preparation, concurrent reservations, atomic fork/task binding, failed final commits and physical forgetting. Independent review probed stale task revisions, changed source history and late preparation after startup recovery.

Frontend checks cover frozen operation bodies, cancelled and queued prompts, late verification responses, same-session draft preservation, deadline locking, proof isolation, rejected versus uncertain writes, bounded receipt parsing, exact message identities, pending-record pagination and saved-input recovery. Browser QA uses actual local HTTPS gateway/Pi/SQLite with a labeled stub provider and no external gate or model.

Chrome QA on 20 September 2026 restored saved preparation input after reload, preserved it through cancelled verification and a wrong password, then completed a real Pi loop turn using the stub provider. A deliberately dropped acknowledgement left a recoverable request; checking its saved identity loaded the actual answer with exactly one provider invocation. Mobile task edits required fresh verification and persisted their revised record. Run inspection navigated to the exact final message. Advancing the QA session near its verified deadline made the browser hide protected content and show sign-in when that deadline elapsed. No live credential, external model, tool or deployed service was used.
