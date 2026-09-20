import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { canReleaseTaskConflict, type UncertainTurn } from './runtime-state'

export function SubmissionRecovery({ attempt, pending, forgotten, draftEmpty, onRestore, onCheck, onRetry, onRelease }: {
  attempt: UncertainTurn; pending: boolean; forgotten: boolean; draftEmpty: boolean; onRestore: () => void; onCheck: () => void; onRetry: () => void; onRelease: () => void
}) {
  const status = attempt.submission?.state
  const conflict = canReleaseTaskConflict(attempt)
  const unstarted = status === 'preparation_failed' || status === 'preparation_interrupted'
  return <div className="space-y-3 rounded-lg border bg-muted p-3">
    <p className="text-sm font-medium">{status === 'forgotten' ? 'Submission source forgotten' : conflict ? 'Task request was not accepted' : unstarted ? 'Preparation stopped before the turn started' : attempt.accepted ? 'Recorded turn awaiting history' : status === 'preparing' ? 'Preparing this turn' : 'Checking the send outcome'}</p>
    <p className="text-xs leading-5 text-muted-foreground">{forgotten ? 'The request identity is retained, but its private content cannot be reused.' : unstarted ? 'The server reserved this request but did not start its turn. Review the result before starting a new request.' : 'This request has a permanent identity. Checking it reads the saved result without repeating model or tool execution.'}</p>
    <p className="break-all text-xs text-muted-foreground">Request {attempt.requestId}{attempt.turnId ? ` · Turn ${attempt.turnId}` : ''}</p>
    {!forgotten && conflict && <p className="text-xs leading-5 text-muted-foreground">The server rejected this request and its saved identity is absent. Dismiss it, then review the current task before starting a new request.</p>}
    {!forgotten && attempt.submission?.failureCode === 'task_fork_required' && <p className="text-xs leading-5 text-muted-foreground">This conversation needs a fork, but task-linked work must stay in its original conversation. Create a follow-up task in a new conversation; this request did not start a turn.</p>}
    {!forgotten && (attempt.taskBinding?.taskId || attempt.submission?.taskId) && <Button asChild size="sm" variant="link" className="h-auto p-0"><Link to={`/activity?tab=tasks&task=${encodeURIComponent(attempt.taskBinding?.taskId ?? attempt.submission!.taskId!)}`}>Review linked task</Link></Button>}
    {!forgotten && attempt.submission?.pendingText && <details><summary className="cursor-pointer text-xs font-medium">Saved input</summary><p className="mt-2 whitespace-pre-wrap break-words text-sm">{attempt.submission.pendingText}</p>{!attempt.submission.taskId && draftEmpty ? <Button size="sm" variant="outline" className="mt-2" disabled={pending} onClick={onRestore}>Restore input to composer</Button> : <p className="mt-2 text-xs text-muted-foreground">{attempt.submission.taskId ? 'Task input stays separate. Review the linked task before starting another task request.' : 'Your current draft is preserved. Clear it to restore this saved input.'}</p>}</details>}
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={pending} onClick={onCheck}>Check saved submission</Button>
      {attempt.notFound && !conflict && !!attempt.text && !forgotten && <Button size="sm" variant="outline" disabled={pending} onClick={onRetry}>Retry same request</Button>}
      {(unstarted || conflict) && !forgotten && <Button size="sm" variant="outline" className="h-auto min-h-(--control-height-sm) whitespace-normal" disabled={pending} onClick={onRelease}>{attempt.taskBinding || attempt.submission?.taskId ? 'Dismiss this unstarted request' : 'Keep draft and allow a new request'}</Button>}
    </div>
  </div>
}
