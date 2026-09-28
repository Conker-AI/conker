import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowUpRight, Bot, CheckCheck, CircleAlert, Clock3, Lightbulb, MessageSquare, RefreshCw, SquarePen } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CollectionRow, OverviewSection, PageHeader } from '@/components/design-system'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import type { GatewayActivityClient, GatewayTask } from '@/lib/gateway/activity'
import type { GatewayOwnerClient, OwnerRequest } from '@/lib/gateway/owner'
import type { GatewayProposalClient, Proposal } from '@/lib/gateway/proposals'
import type { GatewayRuntimeClient, RuntimeSession } from '@/lib/gateway/runtime'
import type { GatewayControlClient } from '@/lib/gateway/control'
import { gatewayError } from '@/lib/gateway/transport'
import { buildTodaySnapshot } from './today-model'
import { SetupReadinessPrompt } from './setup-readiness-prompt'
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
  const [data, setData] = useState(empty), [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null)
  const generation = useRef(0)
  const load = useCallback(async (signal?: AbortSignal) => {
    const current = ++generation.current
    setLoading(true); setError(null)
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
    if (failures.length) setError(failures.length === results.length ? gatewayError((failures[0] as PromiseRejectedResult).reason).message : 'Some updates could not be loaded. The available sections are still current.')
    if (current === generation.current) setLoading(false)
  }, [activity, owner, proposals, runtime])
  useEffect(() => {
    const controller = new AbortController(); let active = true
    queueMicrotask(() => { if (active) void load(controller.signal) })
    return () => { active = false; controller.abort() }
  }, [load])
  const today = buildTodaySnapshot(data)
  return <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
    <div className="home-overview flex w-full min-w-0 flex-col gap-6">
      <PageHeader title="Today" description="Pick up where you left off and handle the few things that need you." actions={<div className="flex gap-2"><Button variant="ghost" size="icon" aria-label="Refresh today" title="Refresh today" disabled={loading} onClick={() => void load()}><RefreshCw className={loading ? 'animate-spin' : ''} /></Button><Button asChild><Link to="/chat"><SquarePen />New chat</Link></Button></div>} />
      {error && <p role="alert" className="flex items-start gap-2 rounded-lg border bg-muted p-3 text-sm text-muted-foreground"><CircleAlert className="mt-0.5 size-4 shrink-0" />{error}</p>}
      {loading && !data.sessions.length && !data.tasks.length && !data.requests.length && <p role="status" className="text-sm text-muted-foreground">Loading today…</p>}
      <SetupReadinessPrompt client={control} />
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
        <div className="min-w-0 space-y-6">
          <OverviewSection priority title="Waiting for you" description={today.waiting.length ? `${today.waiting.length} ${today.waiting.length === 1 ? 'decision needs' : 'decisions need'} your review before anything continues.` : 'Nothing needs your decision.'} action={<Button size="sm" variant="outline" asChild><Link to="/inbox">{today.waiting.length === 1 ? 'Review request' : 'Open inbox'}<ArrowUpRight /></Link></Button>}>
            {today.waiting.length ? <ul className="divide-y divide-border">{today.waiting.map(item => <CollectionRow key={item.id} to={`/inbox?request=${encodeURIComponent(item.id)}`} title={item.title || 'Review this action'} leading={<span className="flex size-8 items-center justify-center rounded-lg border bg-background"><CircleAlert className="size-4 text-warning" /></span>} descriptionTitle={item.details} description={<span className="line-clamp-2">{item.details || `${item.actor} is waiting for your decision.`}</span>} trailing={<span>{when(item.updatedAt)}</span>} />)}</ul>
              : <div className="flex items-start gap-3 py-5"><CheckCheck className="mt-0.5 size-5 shrink-0 text-success" /><p className="text-sm leading-6 text-muted-foreground">You’re caught up. New approval requests will appear here.</p></div>}
          </OverviewSection>
          <OverviewSection title="Continue work" action={<Button size="sm" variant="ghost" asChild><Link to="/activity">All activity<ArrowUpRight /></Link></Button>}>
            {today.activeTasks.length ? <ul className="divide-y divide-border">{today.activeTasks.map(task => <CollectionRow key={task.id} to={`/activity?tab=tasks&task=${encodeURIComponent(task.id)}`} title={task.outcome} leading={<Clock3 className="size-4 text-muted-foreground" />} description={<span className="min-w-0 truncate">{task.criteria.length} completion {task.criteria.length === 1 ? 'check' : 'checks'}</span>} trailing={<StatusBadge tone={task.status === 'blocked' ? 'warning' : 'neutral'}>{taskStatus(task.status)}</StatusBadge>} />)}</ul> : !loading && <EmptyAction icon={<SquarePen className="size-4" />} title="Nothing in progress" description="Start with a conversation when an idea is ready to become work." action={<Button size="sm" variant="outline" asChild><Link to="/chat">Start a chat</Link></Button>} />}
          </OverviewSection>
          <OverviewSection title="Continue a conversation" action={<Button size="sm" variant="ghost" asChild><Link to="/chat">All chats<ArrowUpRight /></Link></Button>}>
            {today.conversations.length ? <ul className="divide-y divide-border">{today.conversations.map(session => <CollectionRow key={session.id} to={`/chat?session=${encodeURIComponent(session.id)}`} title={session.title || 'New chat'} leading={<MessageSquare className="size-4 text-muted-foreground" />} description={<span className="min-w-0 truncate">{session.summary || 'Continue this conversation'}</span>} trailing={<span>{when(session.createdAt)}</span>} />)}</ul> : !loading && <EmptyAction icon={<MessageSquare className="size-4" />} title="No conversations yet" description="Your recent conversations will stay within reach here." action={<Button size="sm" variant="outline" asChild><Link to="/chat">New chat</Link></Button>} />}
          </OverviewSection>
        </div>
        <div className="min-w-0 space-y-6">
          <OverviewSection title="Suggested" description="Ideas from your conversations. Nothing runs until you choose." action={<Button size="sm" variant="ghost" asChild><Link to="/inbox">Review all<ArrowUpRight /></Link></Button>}>
            {today.suggestions.length ? <ul className="divide-y divide-border">{today.suggestions.map(item => <CollectionRow key={item.id} to="/inbox" title={item.title} leading={<Lightbulb className="size-4 text-muted-foreground" />} description={<span className="line-clamp-2">{item.suggestion}</span>} trailing={<span>{when(item.createdAt)}</span>} />)}</ul> : !loading && <EmptyLine>Nothing useful to suggest right now.</EmptyLine>}
          </OverviewSection>
          <OverviewSection title="Completed" action={<Button size="sm" variant="ghost" asChild><Link to="/activity?tab=tasks">Task history<ArrowUpRight /></Link></Button>}>
            {today.completedTasks.length ? <ul className="divide-y divide-border">{today.completedTasks.map(task => <CollectionRow key={task.id} to={`/activity?tab=tasks&task=${encodeURIComponent(task.id)}`} title={task.outcome} leading={<CheckCheck className="size-4 text-success" />} description={<span>{task.completedCriterionIds.length}/{task.criteria.length} checks recorded</span>} trailing={<span>{when(task.updatedAt)}</span>} />)}</ul> : !loading && <EmptyLine>No completed tasks yet.</EmptyLine>}
          </OverviewSection>
          <div className="border-t pt-5"><Button variant="ghost" asChild className="justify-start"><Link to="/agents"><Bot />Manage agents<ArrowUpRight /></Link></Button></div>
        </div>
      </div>
    </div>
  </main>
}
