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
    <p className="text-sm font-medium">{status === 'forgotten' ? 'Saved request content removed' : conflict ? 'Task request was not accepted' : unstarted ? 'Stopped before work began' : attempt.accepted ? 'Waiting for saved history' : status === 'preparing' ? 'Getting ready' : 'Checking what happened'}</p>
    <p className="text-xs leading-5 text-muted-foreground">{forgotten ? 'The saved request can still be checked, but its private content cannot be reused.' : unstarted ? 'This request was reserved but did not start work. Review the result before starting a new request.' : 'Checking reads the saved result without repeating model or tool work.'}</p>
    <details className="text-xs text-muted-foreground"><summary className="cursor-pointer font-medium">Technical details</summary><p className="mt-1 break-all">Request {attempt.requestId}{attempt.turnId ? ` · Attempt ${attempt.turnId}` : ''}</p></details>
    {!forgotten && conflict && <p className="text-xs leading-5 text-muted-foreground">The request was rejected and its saved identity is absent. Dismiss it, then review the current task before starting a new request.</p>}
    {!forgotten && attempt.submission?.failureCode === 'task_fork_required' && <p className="text-xs leading-5 text-muted-foreground">This conversation needs a fork, but task-linked work must stay in its original conversation. Create a follow-up task in a new conversation; this request did not start work.</p>}
    {!forgotten && (attempt.taskBinding?.taskId || attempt.submission?.taskId) && <Button asChild size="sm" variant="link" className="h-auto p-0"><Link to={`/activity?tab=tasks&task=${encodeURIComponent(attempt.taskBinding?.taskId ?? attempt.submission!.taskId!)}`}>Review linked task</Link></Button>}
    {!forgotten && attempt.submission?.pendingText && <details><summary className="cursor-pointer text-xs font-medium">Saved input</summary><p className="mt-2 whitespace-pre-wrap break-words text-sm">{attempt.submission.pendingText}</p>{!attempt.submission.taskId && draftEmpty ? <Button size="sm" variant="outline" className="mt-2" disabled={pending} onClick={onRestore}>Restore input to composer</Button> : <p className="mt-2 text-xs text-muted-foreground">{attempt.submission.taskId ? 'Task input stays separate. Review the linked task before starting another task request.' : 'Your current draft is preserved. Clear it to restore this saved input.'}</p>}</details>}
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={pending} onClick={onCheck}>Check saved request</Button>
      {attempt.notFound && !conflict && !!attempt.text && !forgotten && <Button size="sm" variant="outline" disabled={pending} onClick={onRetry}>Retry same request</Button>}
      {(unstarted || conflict) && !forgotten && <Button size="sm" variant="outline" className="h-auto min-h-(--control-height-sm) whitespace-normal" disabled={pending} onClick={onRelease}>{attempt.taskBinding || attempt.submission?.taskId ? 'Dismiss this unstarted request' : 'Keep draft and allow a new request'}</Button>}
    </div>
  </div>
}
