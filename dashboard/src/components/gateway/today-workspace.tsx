import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowUpRight, CalendarClock, CheckCheck, ChevronRight, CircleAlert, CircleDashed, Gauge, Inbox, Lightbulb, ListChecks, MessagesSquare, RefreshCw, RotateCcw, ShieldCheck, Sparkles, SquareTerminal, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, WorkspaceAction } from '@/components/design-system'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ErrorBoundary } from '@/components/resilience/error-boundary'
import { SectionError } from '@/components/resilience/error-fallbacks'
import { InlineError } from '@/components/resilience/inline-error'
import { Skeleton } from '@/components/ui/skeleton'
import type { GatewayActivityClient, GatewayActivityRun, GatewayTask } from '@/lib/gateway/activity'
import type { GatewayJob } from '@/lib/gateway/jobs'
import type { GatewayOwnerClient, OwnerRequest } from '@/lib/gateway/owner'
import type { GatewayProposalClient, Proposal } from '@/lib/gateway/proposals'
import type { GatewayRuntimeClient } from '@/lib/gateway/runtime'
import type { GatewayControlClient } from '@/lib/gateway/control'
import { useOwnerProfile } from '@/lib/owner-profile'
import { cn } from '@/lib/utils'
import { buildHome, HOME_CHART_DAYS, type HomeNeed, type PlanRow } from './home-model'
import { usePlanUsage } from './home-plan'
import { summarizeSetup } from './setup-presentation'
import { useGatewaySetupStatus } from './setup-status-hook'
import { GatewayPageFrame } from './page-frame'
import './home-bento.css'

type Props = { runtime: GatewayRuntimeClient; activity: GatewayActivityClient; owner: GatewayOwnerClient; proposals: GatewayProposalClient; control: GatewayControlClient }
type Source = 'requests' | 'proposals' | 'tasks' | 'runs' | 'jobs'
type Data = { requests: OwnerRequest[]; proposals: Proposal[]; tasks: GatewayTask[]; runs: GatewayActivityRun[]; jobs: GatewayJob[]; runsComplete: boolean }
const empty: Data = { requests: [], proposals: [], tasks: [], runs: [], jobs: [], runsComplete: true }
const sources: Source[] = ['requests', 'proposals', 'tasks', 'runs', 'jobs']

const time = (value: number) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(value)
const day = (value: number) => new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(value)
const when = (value: number) => new Date(value).toDateString() === new Date().toDateString() ? time(value) : day(value)
function greeting(now = new Date()) {
  const hour = now.getHours()
  return hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

/** A bento tile: a labelled card whose size follows its priority. */
function Tile({ area, label, icon, count, link, children, className }: {
  area: string; label: string; icon: ReactNode; count?: number | null; link?: ReactNode; children: ReactNode; className?: string
}) {
  const id = `home-${area}`
  return <Card render={<section aria-labelledby={id} />} className={cn('home-tile min-w-0 gap-3 p-4', className)} style={{ gridArea: area } as CSSProperties}>
    <div className="flex min-h-7 items-center justify-between gap-2">
      <h2 id={id} className="flex min-w-0 items-center gap-2 text-sm font-normal text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0">
        {icon}<span className="truncate">{label}</span>{count != null && <span className="tabular-nums">{count}</span>}
      </h2>
      {link}
    </div>
    <ErrorBoundary fallback={props => <SectionError {...props} label={label.toLowerCase()} />}>{children}</ErrorBoundary>
  </Card>
}

function TileLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to} className="inline-flex shrink-0 items-center gap-1 rounded-sm text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">{children}<ArrowUpRight className="size-3.5" /></Link>
}

function TileLoading({ rows = 2 }: { rows?: number }) {
  return <div role="status" aria-label="Loading" className="conker-reveal space-y-3">{Array.from({ length: rows }, (_, index) => <Skeleton key={index} className="h-4 w-full motion-reduce:animate-none" />)}</div>
}

function TileFailed({ onRetry }: { onRetry: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
    <CircleAlert className="size-4 shrink-0 text-destructive-foreground" aria-hidden="true" />Not loaded.
    <Button type="button" size="xs" variant="outline" onClick={onRetry}><RotateCcw />Try again</Button>
  </div>
}

function Need({ item }: { item: HomeNeed }) {
  const Icon = item.kind === 'decision' ? ShieldCheck : Lightbulb
  return <li><Link to={item.href} className="group flex min-w-0 items-start gap-3 rounded-lg px-2 py-2.5 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
    <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium">{item.title}</span>
      <span className="line-clamp-1 text-sm text-muted-foreground">{item.kind === 'decision' ? 'Decision' : 'Idea'} · {item.detail}</span>
    </span>
    <span className="shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">{when(item.at)}</span>
    <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 motion-reduce:transition-none" aria-hidden="true" />
  </Link></li>
}

/** One plan window: what it is, how much is used, when it resets. Color is always paired with the number. */
function PlanLine({ row }: { row: PlanRow }) {
  return <li className="min-w-0">
    <div className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
      <span className="min-w-0 truncate">{row.name}</span>
      <span className={cn('shrink-0 font-medium tabular-nums', row.near && 'text-warning-foreground')}>{row.usedPercent}% used</span>
    </div>
    <div role="meter" aria-label={`${row.name} used`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={row.usedPercent} aria-valuetext={`${row.usedPercent}% used`} className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
      <div className={cn('h-full rounded-full', row.near ? 'bg-warning' : 'bg-foreground/70')} style={{ width: `${row.usedPercent}%` }} />
    </div>
    {row.resetsAt && <p className="mt-1 text-xs tabular-nums text-muted-foreground">Resets {when(row.resetsAt)}</p>}
  </li>
}

export function GatewayTodayWorkspace({ activity, owner, proposals, control }: Props) {
  const [data, setData] = useState<Data>(empty)
  const [loaded, setLoaded] = useState<Set<Source>>(new Set())
  const [failed, setFailed] = useState<{ sources: Set<Source>; error: unknown } | null>(null)
  const [loading, setLoading] = useState(true)
  const generation = useRef(0)
  const profile = useOwnerProfile()
  const load = useCallback(async (signal?: AbortSignal) => {
    const current = ++generation.current
    setLoading(true); setFailed(null)
    const results = await Promise.allSettled([
      owner.listRequests({ limit: 50, signal }), proposals.list({ signal }), activity.listTasks({ limit: 50, signal }),
      activity.listRuns({ limit: 100, signal }), control.jobs.list({ limit: 50, signal }),
    ] as const)
    if (signal?.aborted || current !== generation.current) return
    const [requests, ideas, tasks, runs, jobs] = results
    setData(previous => ({
      requests: requests.status === 'fulfilled' ? requests.value.results : previous.requests,
      proposals: ideas.status === 'fulfilled' ? ideas.value : previous.proposals,
      tasks: tasks.status === 'fulfilled' ? tasks.value.results : previous.tasks,
      runs: runs.status === 'fulfilled' ? runs.value.results : previous.runs,
      runsComplete: runs.status === 'fulfilled' ? runs.value.nextCursor === null : previous.runsComplete,
      jobs: jobs.status === 'fulfilled' ? jobs.value.results : previous.jobs,
    }))
    setLoaded(previous => new Set([...previous, ...sources.filter((_, index) => results[index].status === 'fulfilled')]))
    const missing = new Set(sources.filter((_, index) => results[index].status === 'rejected'))
    if (missing.size) setFailed({ sources: missing, error: (results.find(item => item.status === 'rejected') as PromiseRejectedResult).reason })
    setLoading(false)
  }, [activity, control, owner, proposals])
  useEffect(() => {
    const controller = new AbortController(); let active = true
    queueMicrotask(() => { if (active) void load(controller.signal) })
    return () => { active = false; controller.abort() }
  }, [load])
  // Unfinished setup is the first thing to fix; it disappears once verified setup is complete.
  const { status: setupStatus, error: setupError } = useGatewaySetupStatus(control)
  const [plan, reloadPlan] = usePlanUsage(control.plans)
  const setupSummary = setupStatus && setupStatus.state !== 'complete' ? summarizeSetup(setupStatus) : null

  const home = buildHome(data)
  const missing = (source: Source) => !!failed?.sources.has(source) && !loaded.has(source)
  const waiting = (source: Source) => loading && !loaded.has(source)
  const retry = () => { void load(); void reloadPlan() }
  const allFailed = !!failed && failed.sources.size === sources.length && loaded.size === 0
  const peak = Math.max(1, ...home.runDays.map(item => item.count))
  const name = profile.name && profile.name !== 'You' ? `, ${profile.name}` : ''

  return <GatewayPageFrame>
    <div className="home-overview mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-5">
      <PageHeader actionsOnly title="Home" actions={<WorkspaceAction iconOnly aria-label="Refresh Home" title="Refresh Home" disabled={loading} onClick={retry}><RefreshCw className={loading ? 'animate-spin motion-reduce:animate-none' : ''} /></WorkspaceAction>} />
      <div className="min-w-0">
        <p className="text-xl font-semibold leading-7">{greeting()}{name}</p>
        <p className="mt-1 text-sm text-muted-foreground">{new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p>
      </div>
      {(setupSummary || setupError) && <Link to="/setup" className="flex min-w-0 items-center gap-3 rounded-xl border px-4 py-3 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
        <CircleDashed className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1"><span className="block truncate font-medium">{setupError ? 'Review setup status' : setupSummary?.attention ? 'Setup needs attention' : 'Finish setup'}</span>
          <span className="block truncate text-muted-foreground">{setupError ? 'Status unavailable' : setupSummary && setupStatus ? `${setupSummary.resolved} of ${setupStatus.steps.length} steps resolved` : 'Checking setup…'}</span></span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>}
      {allFailed && <InlineError error={failed.error} onRetry={() => Promise.all([load(), reloadPlan()])} />}

      <div className="home-bento">
        <Tile area="needs" label="Needs you" icon={<Inbox />} count={missing('requests') ? null : home.needsTotal}
          link={home.needsTotal > 0 && <TileLink to="/inbox">{home.needsTotal > home.needs.length ? `All ${home.needsTotal} in Inbox` : 'Open Inbox'}</TileLink>} className="home-needs">
          {waiting('requests') ? <TileLoading rows={3} /> : missing('requests') ? <TileFailed onRetry={retry} />
            : home.needs.length ? <ul className="-mx-2 flex flex-col">{home.needs.map(item => <Need key={`${item.kind}:${item.id}`} item={item} />)}</ul>
              : <div className="flex flex-1 items-center gap-3 py-2 text-sm text-muted-foreground"><CheckCheck className="size-5 shrink-0 text-success-foreground" aria-hidden="true" />Nothing needs you right now.</div>}
          {missing('proposals') && !missing('requests') && <p className="text-xs text-muted-foreground">Ideas didn’t load; decisions above are current.</p>}
        </Tile>

        <Tile area="plan" label="Plan allowance" icon={<Gauge />}>
          {plan.status === 'loading' ? <TileLoading rows={3} /> : plan.status === 'failed' ? <TileFailed onRetry={() => void reloadPlan()} />
            : plan.status === 'unsupported' ? <><p className="text-sm font-medium">Not connected yet</p><p className="text-sm text-muted-foreground">Your server doesn’t report plan limits yet. They show here after the next Conker update.</p></>
              : !plan.rows.length ? <><p className="text-sm font-medium">No readings yet</p><p className="text-sm text-muted-foreground">Limits show here once Conker reads a connected Claude or ChatGPT plan.</p></>
                : <>
                  <ul className="flex flex-col gap-3">{plan.rows.map(row => <PlanLine key={row.key} row={row} />)}</ul>
                  {plan.checkedAt !== null && <p className="mt-auto text-xs text-muted-foreground">{plan.stale ? `Last checked ${when(plan.checkedAt)} · may be out of date` : `Checked ${when(plan.checkedAt)}`}</p>}
                </>}
        </Tile>

        <Tile area="coming" label="Coming up" icon={<CalendarClock />} link={<TileLink to="/jobs">Cron jobs</TileLink>}>
          {waiting('jobs') ? <TileLoading /> : missing('jobs') ? <TileFailed onRetry={retry} />
            : home.coming.length ? <ul className="flex flex-col gap-2">{home.coming.map(job => <li key={job.id} className="flex min-w-0 items-baseline gap-3 text-sm">
              <span className="min-w-0 flex-1 truncate">{job.name}</span><span className="shrink-0 tabular-nums text-muted-foreground">{when(job.at)}</span>
            </li>)}</ul>
              : <p className="text-sm text-muted-foreground">No cron jobs are scheduled.</p>}
        </Tile>

        <Tile area="work" label="Conker’s work" icon={<Sparkles />} link={<TileLink to="/activity?tab=runs">Runs</TileLink>}>
          {waiting('runs') ? <TileLoading rows={3} /> : missing('runs') ? <TileFailed onRetry={retry} /> : <>
            <p className="flex items-baseline gap-2"><span className="text-3xl font-semibold tabular-nums leading-none">{home.runsToday}</span><span className="text-sm text-muted-foreground">{home.runsToday === 1 ? 'run today' : 'runs today'}</span></p>
            <div className="mt-auto flex h-20 items-end gap-1" aria-hidden="true">
              {home.runDays.map((item, index) => <div key={item.day} title={`${day(item.day)}: ${item.count}`}
                className={cn('min-h-1 flex-1 rounded-sm', index === home.runDays.length - 1 ? 'bg-foreground' : 'bg-muted-foreground', item.count === 0 && 'opacity-30')}
                style={{ height: `${Math.max(4, Math.round(item.count / peak * 100))}%` }} />)}
            </div>
            <p className="text-xs text-muted-foreground">Runs per day, last {HOME_CHART_DAYS} days{home.runDaysPartial ? ' (from the latest 100 runs)' : ''}</p>
            <ul className="sr-only">{home.runDays.map(item => <li key={item.day}>{day(item.day)}: {item.count} runs</li>)}</ul>
          </>}
        </Tile>

        <Tile area="done" label="Completed" icon={<ListChecks />} count={missing('tasks') ? null : home.completed.filter(item => item.today).length || null} link={<TileLink to="/activity">Tasks</TileLink>}>
          {waiting('tasks') ? <TileLoading rows={4} /> : missing('tasks') ? <TileFailed onRetry={retry} />
            : home.completed.length ? <ul className="flex flex-col divide-y">{home.completed.map(task => <li key={task.id}>
              <Link to={`/activity?tab=tasks&task=${encodeURIComponent(task.id)}`} className="flex min-w-0 items-start gap-3 py-2.5 text-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
                <CheckCheck className="mt-0.5 size-4 shrink-0 text-success-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 line-clamp-2">{task.title}</span>
                <span className="shrink-0 tabular-nums text-xs text-muted-foreground">{when(task.at)}</span>
              </Link>
            </li>)}</ul>
              : <p className="text-sm text-muted-foreground">No completed tasks yet.</p>}
        </Tile>

        <Tile area="decided" label="Decided by you" icon={<ShieldCheck />}>
          {waiting('requests') ? <TileLoading rows={1} /> : missing('requests') ? <TileFailed onRetry={retry} /> : <>
            <p className="flex items-baseline gap-2"><span className="text-3xl font-semibold tabular-nums leading-none">{home.decidedToday}</span><span className="text-sm text-muted-foreground">today</span></p>
            <p className="text-sm text-muted-foreground">{home.needsTotal ? `${home.needsTotal} still waiting` : 'Nothing waiting'}</p>
          </>}
        </Tile>

        <Tile area="quick" label="Quick actions" icon={<Zap />}>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" render={<Link to="/chat" />}><MessagesSquare />New chat</Button>
            <Button variant="outline" size="sm" render={<Link to="/jobs" />}><CalendarClock />Cron jobs</Button>
            <Button variant="outline" size="sm" render={<Link to="/system?tab=terminal" />}><SquareTerminal />Terminal</Button>
          </div>
        </Tile>
      </div>
    </div>
  </GatewayPageFrame>
}
