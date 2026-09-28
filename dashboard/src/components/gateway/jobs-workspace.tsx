import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Ban, CalendarClock, CirclePause, CirclePlay, History, Play, RefreshCw, RotateCcw } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CollectionPanel, CollectionRow, CollectionSection, ConfirmationDialog, PageHeader, RecordItem } from '@/components/design-system'
import type { GatewayControlClient } from '@/lib/gateway/control'
import { createJobRunRequestId, GatewayJobMutationError, type GatewayJob, type GatewayScheduledRun, type GatewayScheduledRunStatus } from '@/lib/gateway/jobs'
import { gatewayError } from '@/lib/gateway/transport'

const statusLabels: Record<GatewayScheduledRunStatus, string> = {
  ready: 'Admitted', awaiting_budget: 'Waiting for budget', dispatching: 'Dispatching', completed: 'Completed', failed: 'Failed',
  awaiting_approval: 'Waiting for approval', outcome_unknown: 'Outcome unknown', cancelled: 'Cancelled',
}
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function mutationMessage(error: unknown) { return error instanceof GatewayJobMutationError ? error.message : gatewayError(error).message }
function describeTiming(job: GatewayJob) {
  const timing = job.definition.timing
  if (timing.kind === 'interval') return `Every ${timing.hours} ${timing.hours === 1 ? 'hour' : 'hours'}`
  if (timing.kind === 'weekly') return `${days[timing.day]} at ${timing.time}`
  return `Daily at ${timing.time}`
}
function when(seconds: number, timeZone?: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', ...(timeZone ? { timeZone } : {}) }).format(new Date(seconds * 1000))
}

function JobDetail({ initial, control, onChanged }: { initial: GatewayJob; control: GatewayControlClient; onChanged: (job: GatewayJob) => void }) {
  const [job, setJob] = useState(initial), [runs, setRuns] = useState<GatewayScheduledRun[] | null>(null)
  const [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null)
  const [confirmRun, setConfirmRun] = useState(false), [runRequest, setRunRequest] = useState<string | null>(null), [reviewedUnknown, setReviewedUnknown] = useState(false)
  const loadRuns = useCallback(async (markReviewed = false) => {
    setPending(true); setError(null)
    try { setRuns((await control.jobs.runs(job.id, { limit: 100 })).results); if (markReviewed) setReviewedUnknown(true) }
    catch (cause) { setError(gatewayError(cause).message) }
    finally { setPending(false) }
  }, [control, job.id])
  useEffect(() => {
    let active = true
    control.jobs.runs(job.id, { limit: 100 }).then(page => active && setRuns(page.results)).catch(cause => active && setError(gatewayError(cause).message))
    return () => { active = false }
  }, [control, job.id])
  const adoptJob = (saved: GatewayJob, message: string) => { setJob(saved); onChanged(saved); setNotice(message); setError(null) }
  const toggle = async () => {
    setPending(true); setError(null); setNotice(null)
    try { adoptJob(await control.jobs.setEnabled(job.id, !job.definition.enabled, job.revision), job.definition.enabled ? 'Future automatic admission is paused.' : 'Future automatic admission is enabled.') }
    catch (cause) { setError(mutationMessage(cause)) }
    finally { setPending(false) }
  }
  const admit = async () => {
    const requestId = runRequest ?? createJobRunRequestId()
    setRunRequest(requestId); setReviewedUnknown(false); setPending(true); setError(null); setNotice(null)
    try {
      const saved = await control.jobs.runNow(job.id, requestId)
      setRuns(current => [saved, ...(current ?? []).filter(item => item.id !== saved.id)])
      setRunRequest(null); setConfirmRun(false); setNotice(saved.replayed ? 'The existing manual run was found. No duplicate was admitted.' : 'A manual run was admitted. Execution remains subject to the saved publication, budget and approval policy.')
    } catch (cause) {
      const failure = cause instanceof GatewayJobMutationError ? cause : null
      setError(mutationMessage(cause)); if (failure?.outcome !== 'unknown') setRunRequest(null)
    } finally { setPending(false) }
  }
  const runAction = async (run: GatewayScheduledRun, action: 'cancel' | 'provisionBudget' | 'resume' | 'reconcile') => {
    setPending(true); setError(null); setNotice(null)
    try {
      const saved = await control.jobs[action](run.id)
      setRuns(current => current?.map(item => item.id === saved.id ? saved : item) ?? current)
      setNotice(action === 'cancel' ? 'The waiting run was cancelled. Future schedule slots are unchanged.' : action === 'reconcile' ? 'The saved ToolGate outcome was checked without repeating execution.' : action === 'resume' ? 'The saved run continued with its original identity.' : 'A scoped budget was provisioned for this run.')
    } catch (cause) { setError(mutationMessage(cause)) }
    finally { setPending(false) }
  }
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div className="shrink-0 border-b px-4 py-4 sm:px-6"><PageHeader title={job.definition.name} description="A pinned schedule definition with redacted run evidence." density="compact" actions={<div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link to="/jobs"><ArrowLeft />Jobs</Link></Button><Button variant="outline" disabled={pending} onClick={() => void toggle()}>{job.definition.enabled ? <CirclePause /> : <CirclePlay />}{job.definition.enabled ? 'Pause schedule' : 'Resume schedule'}</Button><Button disabled={pending || !!runRequest} onClick={() => setConfirmRun(true)}><Play />Run now</Button></div>} /></div>
    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"><div className="mx-auto max-w-4xl space-y-8">
      <section className="space-y-4" aria-labelledby="job-definition-heading"><div className="flex flex-wrap items-center gap-2"><h2 id="job-definition-heading" className="text-lg font-semibold">Schedule</h2><Badge variant={job.definition.enabled ? 'default' : 'secondary'}>{job.definition.state === 'enabled' ? 'Enabled' : 'Paused'}</Badge></div>
        <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Timing</dt><dd className="mt-1">{describeTiming(job)} · {job.definition.timeZone}</dd></div><div><dt className="text-xs text-muted-foreground">Next slot</dt><dd className="mt-1">{job.definition.enabled ? when(job.nextAt, job.definition.timeZone) : 'Paused; no automatic run will be admitted'}</dd></div><div><dt className="text-xs text-muted-foreground">Agent reference</dt><dd className="mt-1 break-all">{job.definition.agentId}</dd></div><div><dt className="text-xs text-muted-foreground">Overlap policy</dt><dd className="mt-1">Skip while an earlier run is unresolved</dd></div></dl>
        <div className="space-y-1"><p className="text-xs text-muted-foreground">Instructions</p><p className="whitespace-pre-wrap text-sm leading-6">{job.definition.instructions}</p></div>
      </section>
      <section className="space-y-4" aria-labelledby="job-target-heading"><h2 id="job-target-heading" className="text-lg font-semibold">Pinned target</h2><dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Publication</dt><dd className="mt-1 break-all">{job.definition.target.kind} · {job.definition.target.id} · v{job.definition.target.publishedVersion}</dd></div><div><dt className="text-xs text-muted-foreground">Inputs</dt><dd className="mt-1">{job.definition.target.inputsConfigured ? 'Configured server-side' : 'No inputs configured'}</dd></div><div><dt className="text-xs text-muted-foreground">Budget</dt><dd className="mt-1">{job.definition.requireBudget ? job.definition.budgetAllowanceConfigured ? 'Required; recurring allowance configured' : 'Required for every run' : 'No dedicated spending budget required'}</dd></div><div><dt className="text-xs text-muted-foreground">Authority</dt><dd className="mt-1">None from this record; ToolGate checks every effect</dd></div></dl><p className="break-all font-mono text-xs text-muted-foreground">SHA-256 {job.definition.target.digest}</p></section>
      <section className="space-y-4" aria-labelledby="job-history-heading"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="job-history-heading" className="text-lg font-semibold">Run history</h2><p className="mt-1 text-sm text-muted-foreground">Receipts and inputs stay server-side. This list reports durable state only.</p></div><Button size="sm" variant="outline" disabled={pending} onClick={() => void loadRuns(Boolean(runRequest))}><RefreshCw />Refresh</Button></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
        {runRequest && <div className="space-y-3 rounded-lg border p-4"><p className="text-sm font-medium">A manual admission may have been accepted</p><p className="text-sm leading-6 text-muted-foreground">Nothing was retried. Refresh history and review the newest run. If it is absent, retrying uses the same durable request identity.</p><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={pending} onClick={() => void loadRuns(true)}>Check run history</Button><Button size="sm" disabled={pending || !reviewedUnknown} onClick={() => void admit()}>Retry same request</Button></div></div>}
        {!runs && !error ? <p role="status" className="text-sm text-muted-foreground">Loading run history…</p> : runs?.length ? <div className="divide-y rounded-lg border">{runs.map(item => <RecordItem key={item.id} title={statusLabels[item.status]} description={`${item.manual ? 'Manual' : 'Scheduled'} · ${when(item.startedAt, job.definition.timeZone)}`} meta={<><span>Job revision {item.jobRevision}</span><span>{item.execution.replaceAll('-', ' ')}</span>{item.outcomeCode && <span>{item.outcomeCode}</span>}{item.budgetBound && <span>Budget bound</span>}{item.receiptRecorded && <span>Receipt recorded</span>}</>} actions={<>{['ready', 'awaiting_budget', 'awaiting_approval'].includes(item.status) && <Button size="sm" variant="outline" disabled={pending} onClick={() => void runAction(item, 'cancel')}><Ban />Cancel</Button>}{item.status === 'awaiting_budget' && job.definition.budgetAllowanceConfigured && <Button size="sm" variant="outline" disabled={pending} onClick={() => void runAction(item, 'provisionBudget')}>Provision budget</Button>}{item.status === 'awaiting_approval' && <Button size="sm" variant="outline" disabled={pending} onClick={() => void runAction(item, 'resume')}><RotateCcw />Continue</Button>}{item.status === 'outcome_unknown' && <Button size="sm" variant="outline" disabled={pending} onClick={() => void runAction(item, 'reconcile')}><RefreshCw />Reconcile</Button>}</>} />)}</div> : <p className="text-sm text-muted-foreground">No runs recorded. Automatic admission happens only while the scheduler is enabled on the host.</p>}
      </section>
    </div></div>
    <ConfirmationDialog open={confirmRun} onOpenChange={setConfirmRun} title={`Run ${job.definition.name} now?`} description={`This admits one manual run of ${job.definition.target.id} version ${job.definition.target.publishedVersion}. ToolGate still enforces its saved inputs, budget and approval policy. A successful admission is not a claim that execution completed.`} actionLabel="Admit manual run" pending={pending} error={error} onConfirm={() => void admit()} />
  </div>
}

export function GatewayJobsWorkspace({ control }: { control: GatewayControlClient }) {
  const location = useLocation(), navigate = useNavigate(), match = location.pathname.match(/^\/jobs\/(job_[0-9a-f]{32})$/)
  const [jobs, setJobs] = useState<GatewayJob[] | null>(null), [details, setDetails] = useState<Record<string, GatewayJob>>({})
  const [query, setQuery] = useState(''), [filter, setFilter] = useState<'all' | 'enabled' | 'paused'>('all'), [loading, setLoading] = useState(false), [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => { setLoading(true); setError(null); try { setJobs((await control.jobs.list({ limit: 100 })).results) } catch (cause) { setError(gatewayError(cause).message) } finally { setLoading(false) } }, [control])
  useEffect(() => { let active = true; control.jobs.list({ limit: 100 }).then(page => active && setJobs(page.results)).catch(cause => active && setError(gatewayError(cause).message)); return () => { active = false } }, [control])
  const selected = match ? details[match[1]] : undefined
  useEffect(() => { if (!match || selected) return; let active = true; control.jobs.get(match[1]).then(item => active && setDetails(current => ({ ...current, [item.id]: item }))).catch(cause => active && setError(gatewayError(cause).message)); return () => { active = false } }, [control, match, selected])
  const update = (job: GatewayJob) => { setDetails(current => ({ ...current, [job.id]: job })); setJobs(current => current?.map(item => item.id === job.id ? job : item) ?? current) }
  if (match) {
    if (selected) return <JobDetail key={selected.id} initial={selected} control={control} onChanged={update} />
    return <div className="space-y-4 p-6">{error ? <><PageHeader title="Schedule unavailable" description={error} density="compact" /><Button variant="outline" onClick={() => navigate('/jobs')}>Back to jobs</Button></> : <p role="status" className="text-sm text-muted-foreground">Loading schedule…</p>}</div>
  }
  const visible = (jobs ?? []).filter(job => (filter === 'all' || job.definition.state === filter) && `${job.definition.name} ${job.definition.instructions} ${job.definition.target.id}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  return <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"><div className="space-y-6"><PageHeader title="Jobs" description="Review schedules, pause or resume them, and recover interrupted runs." density="compact" actions={<Button variant="ghost" size="icon" aria-label="Refresh jobs" title="Refresh jobs" disabled={loading} onClick={() => void load()}><RefreshCw /></Button>} />
    <div className="flex flex-wrap items-center gap-3"><Select value={filter} onValueChange={value => setFilter(value as typeof filter)}><SelectTrigger className="w-44" aria-label="Filter jobs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All schedules</SelectItem><SelectItem value="enabled">Enabled</SelectItem><SelectItem value="paused">Paused</SelectItem></SelectContent></Select><p className="text-xs text-muted-foreground">Targets and inputs can only come from pinned server publications. This view never grants authority.</p></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!jobs && !error ? <p role="status" className="text-sm text-muted-foreground">Loading jobs…</p> : <CollectionPanel query={query} onQueryChange={setQuery} label="Search jobs" placeholder="Search schedules…" count={visible.length} unit={visible.length === 1 ? 'schedule' : 'schedules'} emptyTitle={query ? 'No matching schedules' : 'No connected schedules'} emptyDescription={query ? 'Try another name or pinned target.' : 'Schedules appear here after they are created from an authoritative published procedure.'} icon={<CalendarClock />}><CollectionSection title={filter === 'all' ? 'Schedules' : filter === 'enabled' ? 'Enabled schedules' : 'Paused schedules'}>{visible.map(job => <CollectionRow key={job.id} to={`/jobs/${job.id}`} title={job.definition.name} description={`${describeTiming(job)} · ${job.definition.timeZone} · ${job.definition.target.id}`} leading={<span className="flex size-8 items-center justify-center rounded-lg border bg-background"><History className="size-4" /></span>} trailing={<><span>{job.definition.state === 'enabled' ? 'Enabled' : 'Paused'}</span><span>Revision {job.revision}</span></>} />)}</CollectionSection></CollectionPanel>}
  </div></main>
}
