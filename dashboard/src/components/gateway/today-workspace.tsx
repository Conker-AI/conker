import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowUpRight, Bot, CheckCheck, ChevronRight, CircleAlert, CircleDashed, Clock3, Lightbulb, MessageSquare, RefreshCw, SquarePen } from 'lucide-react'
import { InlineError } from '@/components/resilience/inline-error'
import { ListSkeleton } from '@/components/resilience/skeletons'
import { Link } from 'react-router-dom'
import { CollectionRow, OverviewSection, PageHeader, WorkspaceAction } from '@/components/design-system'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import type { GatewayActivityClient, GatewayTask } from '@/lib/gateway/activity'
import type { GatewayOwnerClient, OwnerRequest } from '@/lib/gateway/owner'
import type { GatewayProposalClient, Proposal } from '@/lib/gateway/proposals'
import type { GatewayRuntimeClient, RuntimeSession } from '@/lib/gateway/runtime'
import type { GatewayControlClient } from '@/lib/gateway/control'
import { buildTodaySnapshot } from './today-model'
import { summarizeSetup } from './setup-presentation'
import { useGatewaySetupStatus } from './setup-status-hook'
import { GatewayPageFrame } from './page-frame'
import '@/app/home/home.css'

type Props = { runtime: GatewayRuntimeClient; activity: GatewayActivityClient; owner: GatewayOwnerClient; proposals: GatewayProposalClient; control: GatewayControlClient }
const empty = { requests: [] as OwnerRequest[], tasks: [] as GatewayTask[], sessions: [] as RuntimeSession[], proposals: [] as Proposal[] }
const when = (value: string | number) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(typeof value === 'number' ? value * 1000 : value))
const taskStatus = (status: GatewayTask['status']) => status === 'in_progress' ? 'In progress' : status === 'planned' ? 'Planned' : status === 'blocked' ? 'Blocked' : 'Complete'

function EmptyLine({ children }: { children: string }) {
  return <p className="py-3 text-sm leading-6 text-muted-foreground">{children}</p>
}

function EmptyAction({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action: ReactNode }) {
  return <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-3 py-3 sm:flex sm:items-center">
    <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground">{icon}</span>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
    <div className="col-start-2 sm:ml-auto">{action}</div>
  </div>
}

export function GatewayTodayWorkspace({ runtime, activity, owner, proposals, control }: Props) {
  const [data, setData] = useState(empty), [loading, setLoading] = useState(true), [failure, setFailure] = useState<{ error: unknown; partial: boolean; missing: Set<'requests' | 'tasks' | 'sessions' | 'proposals'> } | null>(null)
  const generation = useRef(0)
  const load = useCallback(async (signal?: AbortSignal) => {
    const current = ++generation.current
    setLoading(true); setFailure(null)
    const results = await Promise.allSettled([
      owner.listRequests({ limit: 50, signal }), activity.listTasks({ limit: 50, signal }), runtime.listSessions({ signal }), proposals.list({ signal }),
    ])
    if (signal?.aborted || current !== generation.current) return
    setData(current => ({
      requests: results[0].status === 'fulfilled' ? results[0].value.results : current.requests,
      tasks: results[1].status === 'fulfilled' ? results[1].value.results : current.tasks,
      sessions: results[2].status === 'fulfilled' ? results[2].value : current.sessions,
      proposals: results[3].status === 'fulfilled' ? results[3].value : current.proposals,
    }))
    const failures = results.filter(item => item.status === 'rejected')
    if (failures.length) setFailure({ error: (failures[0] as PromiseRejectedResult).reason, partial: failures.length < results.length, missing: new Set((['requests', 'tasks', 'sessions', 'proposals'] as const).filter((_, index) => results[index].status === 'rejected')) })
    if (current === generation.current) setLoading(false)
  }, [activity, owner, proposals, runtime])
  useEffect(() => {
    const controller = new AbortController(); let active = true
    queueMicrotask(() => { if (active) void load(controller.signal) })
    return () => { active = false; controller.abort() }
  }, [load])
  const today = buildTodaySnapshot(data)
  // Unfinished setup is the first thing to fix; it disappears once verified setup is complete.
  const { status: setupStatus, error: setupError } = useGatewaySetupStatus(control)
  const setupSummary = setupStatus && setupStatus.state !== 'complete' ? summarizeSetup(setupStatus) : null
  // A section whose source failed says so instead of claiming it is empty.
  const unknown = (source: 'requests' | 'tasks' | 'sessions' | 'proposals') => !!failure?.missing.has(source)
  const notLoaded = <EmptyLine>Not loaded. Use Try again above.</EmptyLine>
  return <GatewayPageFrame>
    <div className="home-overview flex w-full min-w-0 flex-col gap-6">
      <PageHeader actionsOnly title="Today" description="Pick up where you left off and handle the few things that need you." density="compact" actions={<><WorkspaceAction iconOnly aria-label="Refresh today" title="Refresh today" disabled={loading} onClick={() => void load()}><RefreshCw className={loading ? 'animate-spin motion-reduce:animate-none' : ''} /></WorkspaceAction></>} />
      {(setupSummary || setupError) && <Link to="/setup" className="flex min-w-0 items-center gap-3 rounded-xl border px-4 py-3 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
        <CircleDashed className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1"><span className="block truncate font-medium">{setupError ? 'Review setup status' : setupSummary?.attention ? 'Setup needs attention' : 'Finish setup'}</span>
          <span className="block truncate text-muted-foreground">{setupError ? 'Status unavailable' : setupSummary && setupStatus ? `${setupSummary.resolved} of ${setupStatus.steps.length} steps resolved` : 'Checking setup…'}</span></span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>}
      {failure && <InlineError error={failure.error} onRetry={() => load()} {...(failure.partial ? { title: 'Some sections didn’t update', description: 'The sections shown are current. Try again to load the rest.' } : {})} />}
      {loading && !data.sessions.length && !data.tasks.length && !data.requests.length && <ListSkeleton rows={4} label="Loading today…" />}
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
        <div className="min-w-0 space-y-6">
          <OverviewSection priority={today.waiting.length > 0} title="Waiting for you" description={today.waiting.length ? `${today.waiting.length} ${today.waiting.length === 1 ? 'decision needs' : 'decisions need'} your review before anything continues.` : unknown('requests') ? 'Couldn’t check for decisions.' : 'Nothing needs your decision.'} action={<Button size="sm" variant="outline" render={<Link to="/inbox" />}>{today.waiting.length === 1 ? 'Review request' : 'Open inbox'}<ArrowUpRight /></Button>}>
            {today.waiting.length ? <ul className="divide-y divide-border">{today.waiting.map(item => <CollectionRow key={item.id} to={`/inbox?request=${encodeURIComponent(item.id)}`} title={item.title || 'Review this action'} leading={<span className="flex size-8 items-center justify-center rounded-lg border bg-background"><CircleAlert className="size-4 text-warning-foreground" /></span>} descriptionTitle={item.details} description={<span className="line-clamp-2">{item.details || `${item.actor} is waiting for your decision.`}</span>} trailing={<span>{when(item.updatedAt)}</span>} />)}</ul>
              : unknown('requests') ? notLoaded : <div className="flex items-start gap-3 py-5"><CheckCheck className="mt-0.5 size-5 shrink-0 text-success-foreground" /><p className="text-sm leading-6 text-muted-foreground">You’re caught up. New approval requests will appear here.</p></div>}
          </OverviewSection>
          <OverviewSection title="Continue work" action={<Button size="sm" variant="ghost" render={<Link to="/activity" />}>All activity<ArrowUpRight /></Button>}>
            {today.activeTasks.length ? <ul className="divide-y divide-border">{today.activeTasks.map(task => <CollectionRow key={task.id} to={`/activity?tab=tasks&task=${encodeURIComponent(task.id)}`} title={task.outcome} leading={<Clock3 className="size-4 text-muted-foreground" />} description={<span className="min-w-0 truncate">{task.criteria.length} completion {task.criteria.length === 1 ? 'check' : 'checks'}</span>} trailing={<StatusBadge tone={task.status === 'blocked' ? 'warning' : 'neutral'}>{taskStatus(task.status)}</StatusBadge>} />)}</ul> : unknown('tasks') ? notLoaded : !loading && <EmptyAction icon={<SquarePen className="size-4" />} title="Nothing in progress" description="Start with a conversation when an idea is ready to become work." action={<Button size="sm" variant="outline" render={<Link to="/chat" />}>Start a chat</Button>} />}
          </OverviewSection>
          <OverviewSection title="Continue a conversation" action={<Button size="sm" variant="ghost" render={<Link to="/chats" />}>All chats<ArrowUpRight /></Button>}>
            {today.conversations.length ? <ul className="divide-y divide-border">{today.conversations.map(session => <CollectionRow key={session.id} to={`/chat?session=${encodeURIComponent(session.id)}`} title={session.title || 'New chat'} leading={<MessageSquare className="size-4 text-muted-foreground" />} description={<span className="min-w-0 truncate">{session.summary || 'Continue this conversation'}</span>} trailing={<span>{when(session.createdAt)}</span>} />)}</ul> : unknown('sessions') ? notLoaded : !loading && <EmptyAction icon={<MessageSquare className="size-4" />} title="No conversations yet" description="Your recent conversations will stay within reach here." action={<Button size="sm" variant="outline" render={<Link to="/chat" />}>New chat</Button>} />}
          </OverviewSection>
        </div>
        <div className="min-w-0 space-y-6">
          <OverviewSection title="Suggested" description="Ideas from your conversations. Nothing runs until you choose." action={<Button size="sm" variant="ghost" render={<Link to="/inbox" />}>Review all<ArrowUpRight /></Button>}>
            {today.suggestions.length ? <ul className="divide-y divide-border">{today.suggestions.map(item => <CollectionRow key={item.id} to="/inbox" title={item.title} leading={<Lightbulb className="size-4 text-muted-foreground" />} description={<span className="line-clamp-2">{item.suggestion}</span>} trailing={<span>{when(item.createdAt)}</span>} />)}</ul> : unknown('proposals') ? notLoaded : !loading && <EmptyLine>Nothing useful to suggest right now.</EmptyLine>}
          </OverviewSection>
          <OverviewSection title="Completed" action={<Button size="sm" variant="ghost" render={<Link to="/activity?tab=tasks" />}>Task history<ArrowUpRight /></Button>}>
            {today.completedTasks.length ? <ul className="divide-y divide-border">{today.completedTasks.map(task => <CollectionRow key={task.id} to={`/activity?tab=tasks&task=${encodeURIComponent(task.id)}`} title={task.outcome} leading={<CheckCheck className="size-4 text-success-foreground" />} description={<span>{task.completedCriterionIds.length}/{task.criteria.length} checks recorded</span>} trailing={<span>{when(task.updatedAt)}</span>} />)}</ul> : unknown('tasks') ? notLoaded : !loading && <EmptyLine>No completed tasks yet.</EmptyLine>}
          </OverviewSection>
          <div className="border-t pt-5"><Button variant="ghost" className="justify-start" render={<Link to="/agents" />}><Bot />Manage agents<ArrowUpRight /></Button></div>
        </div>
      </div>
    </div>
  </GatewayPageFrame>
}
