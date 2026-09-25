import { useId, useState } from 'react'
import { SearchableSelect } from '@/app/activity/searchable-select'
import { CollectionSearch } from '@/components/design-system/primitives'
import { FormActions, OverlayBody } from '@/components/design-system/overlays'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { GatewayActivityRun, GatewayTask } from '@/lib/gateway/activity'
import type { RuntimeSession } from '@/lib/gateway/runtime'
import { eligibleTaskParents, taskStatusLabels, taskTitle, validateTaskDraft, type ReviewDraft, type TaskDraft } from './activity-state'
import { plainStatus } from './plain-status'

export function GatewayTaskEditor({ draft, task, sessions, tasks, runs, referencesPending, referencesError, moreRuns, onMoreRuns, onRetryRuns, onChange, onSave, onClose, onDiscard, disabled, error }: {
  draft: TaskDraft; task?: GatewayTask; sessions: RuntimeSession[]; tasks: GatewayTask[]; runs: GatewayActivityRun[]
  referencesPending: boolean; referencesError: string | null; moreRuns: boolean; onMoreRuns: () => void; onRetryRuns: () => void
  onChange: (draft: TaskDraft) => void; onSave: () => void; onClose: () => void; onDiscard: () => void; disabled: boolean; error: string | null
}) {
  const id = useId(), [runQuery, setRunQuery] = useState(''), [validation, setValidation] = useState<string | null>(null)
  const stale = task && task.revision !== draft.revision
  const source = sessions.find(session => session.id === draft.sessionId)
  const availableRuns = runs.filter(run => run.sessionId === draft.sessionId && run.contentStatus === 'available')
  const matchingRuns = availableRuns.filter(run => `${run.id} ${run.status} ${run.model ?? ''}`.toLocaleLowerCase().includes(runQuery.toLocaleLowerCase()))
  const parents = eligibleTaskParents(tasks, draft.sessionId, task?.id)
  const missingParent = !!draft.parentTaskId && !parents.some(parent => parent.id === draft.parentTaskId)
  const missingRuns = draft.runIds.filter(runId => !availableRuns.some(run => run.id === runId))
  const update = (patch: Partial<TaskDraft>) => onChange({ ...draft, ...patch })
  return <form className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={event => { event.preventDefault(); const invalid = validateTaskDraft(draft); setValidation(invalid); if (!invalid && !disabled && !stale) onSave() }}>
    <OverlayBody><fieldset disabled={disabled} className="min-w-0 space-y-5">
      <p className="text-xs leading-5 text-muted-foreground">This records an outcome for Companion. It does not start work or change permissions.</p>
      <div className="space-y-2"><Label htmlFor={`${id}-outcome`}>Desired outcome</Label><Textarea id={`${id}-outcome`} autoFocus required value={draft.outcome} onChange={event => update({ outcome: event.target.value })} /></div>
      <div className="space-y-2"><Label htmlFor={`${id}-criteria`}>Completion criteria</Label><Textarea id={`${id}-criteria`} required rows={4} value={draft.criteria} onChange={event => update({ criteria: event.target.value })} /><p className="text-xs text-muted-foreground">One criterion per line, up to 20. Completion requires your review of every current criterion.</p></div>
      <div className="space-y-2"><Label htmlFor={`${id}-session`}>Source conversation</Label>{task ? <p className="break-words text-sm">{source?.title || 'Selected conversation'}<span className="mt-1 block text-xs text-muted-foreground">The source conversation stays fixed after creation.</span><details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Technical details</summary><span className="break-all">{task.sessionId}</span></details></p> : <SearchableSelect id={`${id}-session`} label="Source conversations" disabled={disabled} value={draft.sessionId} onChange={value => update({ sessionId: value, parentTaskId: '', runIds: [] })} options={sessions.filter(session => session.status === 'open').map(session => ({ value: session.id, label: session.title || session.id }))} />}</div>
      <div className="space-y-2"><Label htmlFor={`${id}-parent`}>Parent task</Label><SearchableSelect id={`${id}-parent`} label="Parent tasks" disabled={disabled || !draft.sessionId} value={draft.parentTaskId || 'none'} onChange={value => update({ parentTaskId: value === 'none' ? '' : value })} options={[{ value: 'none', label: 'No parent task' }, ...parents.map(parent => ({ value: parent.id, label: taskTitle(parent) })), ...(missingParent ? [{ value: draft.parentTaskId, label: 'Current link is not eligible or not loaded' }] : [])]} /><p className="text-xs text-muted-foreground">Choose an active task in this conversation from the loaded records. Load more tasks from the list if needed.</p></div>
      <fieldset className="space-y-3"><legend className="mb-2 text-sm font-medium">Link existing attempts</legend><p className="text-xs text-muted-foreground">Only recorded attempts from this conversation can be linked. Linking does not start or resume work.</p><CollectionSearch label="Search attempts to link" placeholder="Search status or model…" disabled={!draft.sessionId} value={runQuery} onChange={event => setRunQuery(event.target.value)} />
        {referencesPending && <p role="status" className="text-xs text-muted-foreground">Loading conversation attempts…</p>}{referencesError && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{referencesError}</p><Button type="button" size="sm" variant="outline" disabled={referencesPending} onClick={onRetryRuns}>Retry loading attempts</Button></div>}
        <div className="max-h-52 space-y-3 overflow-y-auto rounded-lg border p-3">{matchingRuns.map((run, index) => <Label key={run.id} className="flex items-start gap-3 text-xs leading-5"><Checkbox checked={draft.runIds.includes(run.id)} onCheckedChange={checked => update({ runIds: checked ? [...draft.runIds, run.id] : draft.runIds.filter(value => value !== run.id) })} /><span className="min-w-0">Attempt {index + 1}<span className="block text-muted-foreground">{plainStatus(run.status)}{run.model ? ` - ${run.model}` : ''}</span><details className="text-muted-foreground"><summary className="cursor-pointer">Technical details</summary><span className="break-all">{run.id}</span></details></span></Label>)}{!draft.sessionId ? <p className="text-xs text-muted-foreground">Choose a source conversation to load its attempts.</p> : !matchingRuns.length && !referencesPending && !referencesError && <p className="text-xs text-muted-foreground">No matching attempts in the loaded records.</p>}{missingRuns.map(runId => <div key={runId} className="space-y-1"><p className="text-xs text-muted-foreground">{referencesPending ? 'Loading linked attempt' : 'Linked attempt not loaded or unavailable'}</p><details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Technical details</summary><p className="break-all">{runId}</p></details><Button type="button" size="sm" variant="ghost" onClick={() => update({ runIds: draft.runIds.filter(value => value !== runId) })}>Remove link</Button></div>)}</div>{moreRuns && <Button type="button" size="sm" variant="outline" disabled={referencesPending} onClick={onMoreRuns}>Load more attempts</Button>}
      </fieldset>
      {!task && source && source.status !== 'open' && <p role="alert" className="text-sm text-destructive">Choose an open conversation to create a task.</p>}
      {stale && <p role="alert" className="text-sm text-destructive">The task changed since this draft opened. Your draft is retained. Review the current record, then discard this draft before editing the new version.</p>}
      {(validation || error) && <p role="alert" className="text-sm text-destructive">{validation || error}</p>}
    </fieldset></OverlayBody>
    <FormActions inset description="Draft retained in this browser session until saved or discarded."><Button type="button" variant="ghost" disabled={disabled} onClick={onDiscard}>Discard draft</Button><Button type="button" variant="outline" onClick={onClose}>Close</Button><Button type="submit" disabled={disabled || !!stale || (task ? task.contentStatus !== 'available' : !source || source.status !== 'open')}>{task ? 'Save task' : 'Create task'}</Button></FormActions>
  </form>
}

export function GatewayTaskReview({ task, draft, onChange, onSave, onClose, onDiscard, disabled, error }: {
  task: GatewayTask; draft: ReviewDraft; onChange: (draft: ReviewDraft) => void; onSave: () => void; onClose: () => void; onDiscard: () => void; disabled: boolean; error: string | null
}) {
  const id = useId(), complete = draft.status === 'completed', stale = draft.revision !== task.revision
  const valid = !!draft.note.trim() && [...draft.note].length <= 2000 && (!complete || task.criteria.every(criterion => draft.checked.includes(criterion.id)))
  return <form className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={event => { event.preventDefault(); if (valid && !disabled && !stale) onSave() }}><OverlayBody><fieldset disabled={disabled} className="space-y-5">
    <p className="break-words text-sm font-medium">{taskTitle(task)}</p><p className="text-sm leading-6 text-muted-foreground">Record your review as {taskStatusLabels[draft.status].toLocaleLowerCase()}. This reports task progress; it does not start, stop or resume linked work.</p>
    {complete && <fieldset className="space-y-3"><legend className="mb-2 text-sm font-medium">Confirm each completion criterion</legend>{task.criteria.map(criterion => <Label key={criterion.id} className="flex items-start gap-3 leading-5"><Checkbox checked={draft.checked.includes(criterion.id)} onCheckedChange={checked => onChange({ ...draft, checked: checked ? [...draft.checked, criterion.id] : draft.checked.filter(value => value !== criterion.id) })} /><span className="break-words">{criterion.text}</span></Label>)}</fieldset>}
    <div className="space-y-2"><Label htmlFor={`${id}-note`}>Review note</Label><Textarea id={`${id}-note`} autoFocus={!complete} rows={4} required value={draft.note} onChange={event => onChange({ ...draft, note: event.target.value })} /><p className="text-xs text-muted-foreground">Explain the result or reason for this change, up to 2,000 characters.</p></div>
    {stale && <p role="alert" className="text-sm text-destructive">This task changed after the review started. Discard this review and inspect its current criteria before trying again.</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </fieldset></OverlayBody><FormActions inset><Button type="button" variant="ghost" disabled={disabled} onClick={onDiscard}>Discard review</Button><Button type="button" variant="outline" onClick={onClose}>Close</Button><Button type="submit" disabled={disabled || stale || !valid}>Record {taskStatusLabels[draft.status].toLocaleLowerCase()}</Button></FormActions></form>
}
