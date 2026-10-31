import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Ban, CalendarClock, CirclePause, CirclePlay, MessagesSquare, Play, Plus, RefreshCw, RotateCcw } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmationDialog, FilterChip, ListCard, ListLine, PageHeader, WorkspaceAction, RecordItem } from '@/components/design-system'
import { InlineError } from '@/components/resilience/inline-error'
import { ListSkeleton } from '@/components/resilience/skeletons'
import { GatewayPageFrame } from './page-frame'
import { IdentityMark } from '@/components/brand/identity-mark'
import { serviceIn } from '@/components/brand/service'
import type { GatewayControlClient } from '@/lib/gateway/control'
import { createJobRunRequestId, GatewayJobMutationError, isAiJob, type GatewayJob, type GatewayScheduledRun, type GatewayScheduledRunStatus } from '@/lib/gateway/jobs'
import { NewAgentJobDialog } from './new-agent-job-dialog'
import { AgentJobWebhook } from './agent-job-webhook'
import { gatewayError } from '@/lib/gateway/transport'
import { jobStarters, type JobStarter, type JobStarterWhen } from '@/lib/job-starters'

const statusLabels: Record<GatewayScheduledRunStatus, string> = {
  ready: 'Queued', awaiting_budget: 'Waiting for budget', dispatching: 'Starting', completed: 'Completed', failed: 'Failed',
  awaiting_approval: 'Waiting for approval', outcome_unknown: 'Outcome unknown', cancelled: 'Cancelled',
}
const executionLabels: Record<GatewayScheduledRun['execution'], string> = {
  'admitted-only': 'Not started', waiting: 'Waiting', dispatched: 'Started', resolved: 'Finished', uncertain: 'Outcome unknown',
}
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function mutationMessage(error: unknown) { return error instanceof GatewayJobMutationError ? error.message : gatewayError(error).message }
const problems = { needs_approval: 'This tool asks for your OK each time, so it can’t start the job on its own. Pick a tool that only reads.', no_credential: 'This agent has no tool access for scheduled work.', failed: 'The tool didn’t answer at the last look; Conker tries again at the next one.' } as const
function describeTiming(job: GatewayJob) {
  const watch = job.definition.watch
  if (watch) return `When ${watch.toolId} has something new · looks every ${watch.everyMinutes} min`
  if (job.definition.target.kind === 'agent' && job.definition.target.clock === false) return 'When its webhook is called'
  const timing = job.definition.timing
  if (timing.kind === 'interval') return `Every ${timing.hours} ${timing.hours === 1 ? 'hour' : 'hours'}`
  if (timing.kind === 'weekly') return `${days[timing.day]} at ${timing.time}`
  return `Daily at ${timing.time}`
}
/** A starter's timing in the same words as a saved job's. */
function describeStarter(value: JobStarterWhen) {
  if (value.kind === 'hours') return value.every === 1 ? 'Every hour' : `Every ${value.every} hours`
  return value.kind === 'weekly' ? `${days[value.day]} at ${value.time}` : `Daily at ${value.time}`
}
function when(seconds: number, timeZone?: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', ...(timeZone ? { timeZone } : {}) }).format(new Date(seconds * 1000))
}
/** Short form for list lines: no year, so the name keeps the room on a phone. */
function soon(seconds: number, timeZone?: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', ...(timeZone ? { timeZone } : {}) }).format(new Date(seconds * 1000))
}

function JobDetail({ initial, control, onChanged }: { initial: GatewayJob; control: GatewayControlClient; onChanged: (job: GatewayJob) => void }) {
  const [job, setJob] = useState(initial), [runs, setRuns] = useState<GatewayScheduledRun[] | null>(null)
  const target = job.definition.target, check = target.kind === 'agent' ? target : null, tool = target.kind === 'agent' ? null : target
  const [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null)
  const [adopting, setAdopting] = useState(false), [adoptNote, setAdoptNote] = useState<{ ok: boolean; text: string } | null>(null)
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
  const applySaved = (saved: GatewayJob, message: string) => { setJob(saved); onChanged(saved); setNotice(message); setError(null) }
  // "Make this job mine": the success line is only said after the server answers; a changed revision reloads the job and asks again.
  const makeMine = async () => {
    setAdopting(true); setAdoptNote(null)
    try { const saved = await control.jobs.adoptJob(job.id, job.revision); applySaved(saved, ''); setNotice(null); setAdoptNote({ ok: true, text: saved.definition.turnedOff ? 'This job is yours now. It is still off: use Resume schedule to turn it back on.' : 'This job is yours now. It keeps running even if the chat that made it is forgotten.' }) }
    catch (cause) {
      if (cause instanceof GatewayJobMutationError && cause.outcome === 'conflict') {
        try { const fresh = await control.jobs.get(job.id); setJob(fresh); onChanged(fresh); setAdoptNote({ ok: false, text: 'This job changed while you were looking, so nothing was changed. It is reloaded: check it, then try again.' }) }
        catch (reload) { setAdoptNote({ ok: false, text: `This job changed, and reloading it failed (${gatewayError(reload).message}). Refresh, then try again.` }) }
      } else setAdoptNote({ ok: false, text: cause instanceof GatewayJobMutationError && cause.outcome === 'unknown' ? 'Not sure it went through. Refresh the job to see whether it is yours now.' : `Could not make it yours: ${mutationMessage(cause)}` })
    } finally { setAdopting(false) }
  }
  const toggle = async () => {
    setPending(true); setError(null); setNotice(null)
    try { applySaved(await control.jobs.setEnabled(job.id, !job.definition.enabled, job.revision), job.definition.enabled ? 'Future automatic admission is paused.' : 'Future automatic admission is enabled.') }
    catch (cause) { setError(mutationMessage(cause)) }
    finally { setPending(false) }
  }
  const admit = async () => {
    const requestId = runRequest ?? createJobRunRequestId()
    setRunRequest(requestId); setReviewedUnknown(false); setPending(true); setError(null); setNotice(null)
    try {
      const saved = await control.jobs.runNow(job.id, requestId)
      setRuns(current => [saved, ...(current ?? []).filter(item => item.id !== saved.id)])
      setRunRequest(null); setConfirmRun(false); setNotice(saved.replayed ? 'That run was already queued, so it was not queued twice.' : 'Run queued. It still follows its budget and your approval rules; Run history shows the result.')
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
      setNotice(action === 'cancel' ? 'Run cancelled. Future runs are unchanged.' : action === 'reconcile' ? 'Checked the result without running it again.' : action === 'resume' ? 'The run continued.' : 'Budget added for this run.')
    } catch (cause) { setError(mutationMessage(cause)) }
    finally { setPending(false) }
  }
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div className="shrink-0 border-b px-4 py-4 sm:px-6 sm:py-6"><PageHeader title={job.definition.name} description={check ? 'An AI job: each time it starts, Conker carries out your instructions with its tools, then tells you what needs you.' : 'What it does, when it runs, and how each run went.'} density="compact" actions={<div className="flex flex-wrap gap-2"><Button variant="outline" render={<Link to="/jobs" />}><ArrowLeft />Cron jobs</Button>{check?.sessionId && <Button variant="outline" render={<Link to={`/chat?session=${encodeURIComponent(check.sessionId)}`} />}><MessagesSquare />Open its chat</Button>}<Button variant="outline" disabled={pending} onClick={() => void toggle()}>{job.definition.enabled ? <CirclePause /> : <CirclePlay />}{job.definition.enabled ? 'Pause schedule' : 'Resume schedule'}</Button><Button disabled={pending || !!runRequest} onClick={() => setConfirmRun(true)}><Play />Run now</Button></div>} /></div>
    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8"><div className="max-w-4xl space-y-8">
      {(check || job.definition.instructions) && <section className="space-y-3" aria-labelledby="job-instructions-heading"><h2 id="job-instructions-heading" className="text-lg font-semibold">What it does</h2>
        {job.definition.instructions ? <p className="max-w-prose whitespace-pre-wrap break-words text-sm leading-6">{job.definition.instructions}</p>
          : <p className="max-w-prose text-sm leading-6 text-muted-foreground">Your server keeps this job’s instructions but doesn’t send them to this page yet. Each run starts with them as the first message in its chat.</p>}
      </section>}
      <section className="space-y-4" aria-labelledby="job-definition-heading"><div className="flex flex-wrap items-center gap-2"><h2 id="job-definition-heading" className="text-lg font-semibold">Schedule</h2><Badge variant={job.definition.enabled ? 'default' : 'secondary'}>{job.definition.state === 'enabled' ? 'Enabled' : 'Paused'}</Badge></div>
        <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Timing</dt><dd className="mt-1">{describeTiming(job)} · {job.definition.timeZone}</dd></div><div><dt className="text-xs text-muted-foreground">{job.definition.watch ? 'Last look' : check?.clock === false ? 'Starts' : 'Next run'}</dt><dd className="mt-1">{!job.definition.enabled ? 'Paused: it won’t run until you resume it' : check?.clock === false && !job.definition.watch ? 'Only from its webhook or Run now' : job.definition.watch ? job.definition.watch.lastCheckedAt ? when(job.definition.watch.lastCheckedAt, job.definition.timeZone) : 'Not yet' : when(job.nextAt, job.definition.timeZone)}</dd></div><div><dt className="text-xs text-muted-foreground">Agent</dt><dd className="mt-1 break-all">{job.definition.agentName ?? job.definition.agentId}</dd></div>{(job.definition.createdBy === 'conker' || job.definition.adoptedAt) && <div><dt className="text-xs text-muted-foreground">Made by</dt><dd className="mt-1">{job.definition.createdBy === 'conker' ? 'Conker' : 'you'}</dd></div>}{job.definition.turnedOff === 'chat_forgotten' && <div><dt className="text-xs text-muted-foreground">Turned off</dt><dd className="mt-1">The chat that made it was forgotten</dd></div>}</dl>
        {(job.definition.createdBy === 'conker' || adoptNote) && <div className="space-y-1">
          {job.definition.createdBy === 'conker' && <><Button type="button" variant="outline" disabled={pending || adopting} onClick={() => void makeMine()}>{adopting ? 'Making it yours…' : 'Make this job mine'}</Button>
          <p className="max-w-prose text-sm leading-6 text-muted-foreground">{job.definition.turnedOff === 'chat_forgotten' ? 'Treats it as your own job: it keeps running even if the chat that made it is forgotten. It can be turned back on after.' : 'Treats it as your own job: it keeps running even if the chat that made it is forgotten.'}</p></>}
          {adoptNote && <p role={adoptNote.ok ? 'status' : 'alert'} className={adoptNote.ok ? 'text-sm leading-6' : 'text-sm leading-6 text-destructive-foreground'}>{adoptNote.text}</p>}</div>}
        {job.definition.watch?.problem && <p role="alert" className="text-sm leading-6 text-warning-foreground">{problems[job.definition.watch.problem]}</p>}
        <p className="text-sm leading-6 text-muted-foreground">{check ? 'Each run uses tools that need no confirmation on its own. Anything that would change, send or create something waits for your OK in the Inbox. What it was asked and what it found are in its chat.' : job.definition.instructionsConfigured ? 'Its instructions are saved on your server.' : 'It has no instructions.'}</p>
      </section>
      {tool && <details className="group space-y-4"><summary className="w-fit cursor-pointer rounded-sm text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">More details</summary><dl className="mt-4 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Runs</dt><dd className="mt-1 break-all">{tool.kind} · {tool.id} · v{tool.publishedVersion}</dd></div><div><dt className="text-xs text-muted-foreground">Inputs</dt><dd className="mt-1">{tool.inputsConfigured ? 'Set on your server' : 'None'}</dd></div><div><dt className="text-xs text-muted-foreground">Budget</dt><dd className="mt-1">{job.definition.requireBudget ? job.definition.budgetAllowanceConfigured ? 'Required; recurring allowance configured' : 'Required for every run' : 'No dedicated spending budget required'}</dd></div><div><dt className="text-xs text-muted-foreground">If a run is still going</dt><dd className="mt-1">The next one is skipped</dd></div><div><dt className="text-xs text-muted-foreground">Permissions</dt><dd className="mt-1">Your approval rules check everything it does</dd></div></dl><p className="mt-4 break-all font-mono text-xs text-muted-foreground">SHA-256 {tool.digest}</p></details>}
      {check && <AgentJobWebhook jobId={job.id} configured={!!check.webhook} clockless={check.clock === false} client={control.jobs} onChanged={configured => { const next = { ...job, definition: { ...job.definition, target: { ...check, webhook: configured } } }; setJob(next); onChanged(next) }} />}
      <section className="space-y-4" aria-labelledby="job-history-heading"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="job-history-heading" className="text-lg font-semibold">Run history</h2><p className="mt-1 text-sm text-muted-foreground">Inputs and results stay on your server; this shows how each run went.</p></div><Button size="sm" variant="outline" disabled={pending} onClick={() => void loadRuns(Boolean(runRequest))}><RefreshCw />Refresh</Button></div>
        {error && <p role="alert" className="text-sm text-destructive-foreground">{error}</p>}{notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
        {runRequest && <div className="space-y-3 rounded-lg border p-4"><p className="text-sm font-medium">Run now may have gone through</p><p className="text-sm leading-6 text-muted-foreground">Nothing was sent twice. Check run history for the newest run. If it isn’t there, Try again resends the same request, so it can’t run twice.</p><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={pending} onClick={() => void loadRuns(true)}>Check run history</Button><Button size="sm" disabled={pending || !reviewedUnknown} onClick={() => void admit()}>Try again</Button></div></div>}
        {!runs && !error ? <p role="status" className="text-sm text-muted-foreground">Loading run history…</p> : runs?.length ? <div className="divide-y rounded-lg border">{runs.map(item => <RecordItem key={item.id} title={statusLabels[item.status]} description={`${item.manual ? 'Manual' : 'Scheduled'} · ${when(item.startedAt, job.definition.timeZone)}`} meta={<><span>Job revision {item.jobRevision}</span><span>{executionLabels[item.execution]}</span>{item.outcomeCode && <span>{item.outcomeCode}</span>}{item.budgetBound && <span>Budget set</span>}{item.receiptRecorded && <span>Result saved</span>}</>} actions={<>{['ready', 'awaiting_budget', 'awaiting_approval'].includes(item.status) && <Button size="sm" variant="outline" disabled={pending} onClick={() => void runAction(item, 'cancel')}><Ban />Cancel</Button>}{item.status === 'awaiting_budget' && job.definition.budgetAllowanceConfigured && <Button size="sm" variant="outline" disabled={pending} onClick={() => void runAction(item, 'provisionBudget')}>Add budget</Button>}{item.status === 'awaiting_approval' && <Button size="sm" variant="outline" disabled={pending} onClick={() => void runAction(item, 'resume')}><RotateCcw />Continue</Button>}{item.status === 'outcome_unknown' && <Button size="sm" variant="outline" disabled={pending} onClick={() => void runAction(item, 'reconcile')}><RefreshCw />Check result</Button>}</>} />)}</div> : <p className="text-sm text-muted-foreground">No runs yet. It runs on its own while the scheduler is on for your server.</p>}
      </section>
    </div></div>
    <ConfirmationDialog open={confirmRun} onOpenChange={setConfirmRun} title={`Run ${job.definition.name} now?`} description={tool ? `Runs ${tool.id} (version ${tool.publishedVersion}) once now. It still follows its saved inputs, budget and your approval rules. Queued is not finished: Run history shows the result.` : 'Runs this AI job once now. Anything that would change something waits for your OK in the Inbox. Queued is not finished: Run history shows the result.'} actionLabel="Run now" pending={pending} error={error} onConfirm={() => void admit()} />
  </div>
}

export function GatewayJobsWorkspace({ control }: { control: GatewayControlClient }) {
  const location = useLocation(), navigate = useNavigate(), match = location.pathname.match(/^\/jobs\/(job_[0-9a-f]{32})$/)
  const [jobs, setJobs] = useState<GatewayJob[] | null>(null), [details, setDetails] = useState<Record<string, GatewayJob>>({})
  const [query, setQuery] = useState(''), [filter, setFilter] = useState<'all' | 'enabled' | 'paused'>('all'), [loading, setLoading] = useState(false), [error, setError] = useState<string | null>(null)
  const [listError, setListError] = useState<unknown>(null)
  // Each opening of the form gets a new key, so it starts blank or from the chosen idea.
  const [creating, setCreating] = useState(false), [form, setForm] = useState<{ key: number; starter: JobStarter | null }>({ key: 0, starter: null })
  const startNew = (starter: JobStarter | null = null) => { setForm(current => ({ key: current.key + 1, starter })); setCreating(true) }
  const load = useCallback(async () => { setLoading(true); setError(null); setListError(null); try { setJobs((await control.jobs.list({ limit: 100 })).results) } catch (cause) { setListError(cause); setError(gatewayError(cause).message) } finally { setLoading(false) } }, [control])
  useEffect(() => { let active = true; control.jobs.list({ limit: 100 }).then(page => active && setJobs(page.results)).catch(cause => { if (active) { setListError(cause); setError(gatewayError(cause).message) } }); return () => { active = false } }, [control])
  const selected = match ? details[match[1]] : undefined
  useEffect(() => { if (!match || selected) return; let active = true; control.jobs.get(match[1]).then(item => active && setDetails(current => ({ ...current, [item.id]: item }))).catch(cause => active && setError(gatewayError(cause).message)); return () => { active = false } }, [control, match, selected])
  const update = (job: GatewayJob) => { setDetails(current => ({ ...current, [job.id]: job })); setJobs(current => current?.map(item => item.id === job.id ? job : item) ?? current) }
  if (match) {
    if (selected) return <JobDetail key={selected.id} initial={selected} control={control} onChanged={update} />
    return <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">{error ? <><InlineError error={listError} title="Cron job didn’t load" description={listError ? undefined : error} onRetry={() => { setError(null); return load() }} /><Button variant="outline" onClick={() => navigate('/jobs')}><ArrowLeft />Cron jobs</Button></> : <ListSkeleton rows={3} label="Loading schedule…" />}</div>
  }
  const visible = (jobs ?? []).filter(job => (filter === 'all' || job.definition.state === filter) && `${job.definition.name} ${job.definition.target.kind === 'agent' ? 'AI job' : job.definition.target.id}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const enabled = (jobs ?? []).filter(job => job.definition.enabled).length
  const chip = (value: typeof filter, text: string, count: number) => <FilterChip key={value} active={filter === value} count={count} onClick={() => setFilter(value)}>{text}</FilterChip>
  return <GatewayPageFrame><div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-4">
    <PageHeader actionsOnly title="Cron jobs" description="Review schedules, pause or resume them, and recover interrupted runs." density="compact" actions={<><WorkspaceAction iconOnly aria-label="Refresh cron jobs" title="Refresh cron jobs" disabled={loading} onClick={() => void load()}><RefreshCw className={loading ? 'animate-spin motion-reduce:animate-none' : ''} /></WorkspaceAction><WorkspaceAction keepVisible onClick={() => startNew()}><Plus />New AI job</WorkspaceAction></>} />
    {jobs && <p className="text-sm text-muted-foreground">{enabled} active · {jobs.length - enabled} paused</p>}
    {error && (jobs ? <p role="alert" className="text-sm text-destructive-foreground">{error}</p> : <InlineError error={listError} title="Cron jobs didn’t load" onRetry={() => load()} />)}
    {!jobs && !error ? <ListSkeleton rows={4} label="Loading cron jobs…" /> : jobs && <ListCard query={query} onQueryChange={setQuery} label="Search cron jobs" placeholder="Search schedules…" count={visible.length} unit={visible.length === 1 ? 'schedule' : 'schedules'}
      filters={<>{chip('all', 'All', jobs.length)}{chip('enabled', 'Enabled', enabled)}{chip('paused', 'Paused', jobs.length - enabled)}</>}
      emptyTitle={query ? 'No matching schedules' : filter !== 'all' ? `No ${filter} schedules` : 'No connected schedules'} emptyDescription={query ? 'Try another name or tool.' : 'Make an AI job: tell Conker what to do and when, and it works with its tools on that schedule. Or start from an idea below.'} emptyAction={query ? undefined : <Button onClick={() => startNew()}><Plus />New AI job</Button>} icon={<CalendarClock />}>
      {visible.map(job => <ListLine key={job.id} to={`/jobs/${job.id}`} icon={<IdentityMark brand={serviceIn(job.definition.name, job.definition.watch?.toolId)} kind="job" name={job.definition.name} size="sm" />} title={job.definition.name}
        sub={`${isAiJob(job) ? 'AI job · ' : ''}${describeTiming(job)} · ${job.definition.timeZone}`} meta={!job.definition.enabled ? 'Paused' : job.definition.watch ? job.definition.watch.problem ? 'Needs a look' : 'Watching' : job.definition.target.kind === 'agent' && job.definition.target.clock === false ? 'On webhook' : `Next ${soon(job.nextAt, job.definition.timeZone)}`} />)}
    </ListCard>}
    <p className="text-xs text-muted-foreground">AI jobs use tools that need no confirmation on their own and ask before changing anything. Other cron jobs run tools published on your server.</p>
    <section aria-labelledby="job-starters-heading" className="space-y-3 pt-2">
      <div><h2 id="job-starters-heading" className="text-base font-semibold">Start from an idea</h2><p className="mt-1 max-w-prose text-sm leading-6 text-muted-foreground">Ready-made AI jobs. Picking one fills in the New AI job form; change anything, then create it as usual.</p></div>
      <Card className="min-w-0 gap-0 overflow-hidden p-0"><ul className="flex flex-col divide-y">{jobStarters.map(starter => <li key={starter.id}>
        <button type="button" onClick={() => startNew(starter)} className="flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left outline-none hover:bg-accent focus-visible:bg-accent">
          <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{starter.name}</span><span className="block text-sm text-muted-foreground">{starter.summary}</span></span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{describeStarter(starter.when)}</span>
        </button></li>)}</ul></Card>
    </section>
    <NewAgentJobDialog key={form.key} starter={form.starter} open={creating} onOpenChange={setCreating} client={control.jobs} loadTools={control.tools} loadAgents={control.agents} onCreated={created => { setJobs(current => [...(current ?? []), created]); setCreating(false); navigate(`/jobs/${created.id}`) }} />
  </div></GatewayPageFrame>
}
