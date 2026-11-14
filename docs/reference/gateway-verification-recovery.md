# Durable turn recovery

When the gateway asks for the password, and when the browser signs out after idle time, is set by [ADR-0010](../adr/0010-conversation-writes-are-session-bound.md). This page covers what happens to a turn whose response was lost. Preview fixtures have no live effect.

## Turn recovery

The composer generates a request identity before submitting a turn. Pi reserves it before automatic fork preparation, then atomically binds the effective conversation, input message, turn and optional task reference. Reusing an identical request reads its current result instead of running a model or tool again.

After a lost response, the browser checks that identity. A not-found result permits an explicit retry of the same retained request. It does not generate a replacement identity. Known preparation failure or interruption can be reviewed before allowing a new request. The saved input remains inspectable and can be restored into an empty composer without replacing a newer draft. Forgotten content is masked and cannot be restored or retried.

Reload discovers unresolved submissions through server records. The recovery list paginates older entries. Active or ambiguous turns, including an interrupted turn that already acted, block a new send. A recorded automatic fork opens its actual destination. An accepted receipt is followed by a canonical history read; the UI does not invent a reply from transport success.

Activity run inspectors link to exact input, intermediate, tool-result and final messages where Pi recorded those associations. Older history retains an explicit no-association state. Pending input and comparison hashes participate in physical forgetting.

## Limits

- A request identity prevents duplicate turn dispatch, not every possible external effect. Existing ToolGate action reconciliation remains necessary.
- Resume and manual fork do not yet have request identities. The live UI does not claim retry-safe controls for them.
- Task-to-turn binding and explicit live task dispatch are connected; see [live-task-dispatch.md](https://github.com/Conker-AI/conker/blob/5e71ee97a09bb2d5a7fcef73c8bf8bff87229d29/docs/archive/live-task-dispatch.md). Full specialist/team integration remains outstanding.

