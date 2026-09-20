import { Link } from "react-router-dom"
import { ArrowUpRight, Bot, Brain, CheckCheck, MessageSquare, Plug, SquarePen, Workflow, Wrench } from "lucide-react"
import { conkerClient } from "@/lib/api"
import { useConker } from "@/lib/api/store"
import { getWorkspaceOverview } from "@/lib/workspace-overview"
import { BaseLayout } from "@/components/layouts/base-layout"
import { AgentIdentityPortrait, CollectionRow, OverviewSection } from "@/components/design-system"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import "./home.css"

/** Keep relative fixture timestamps anchored to their recorded date. */
function activityTime(value: string, sourceDate: string, sample: boolean) {
  if (!sample) return value
  const date = new Date(`${sourceDate}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  const yesterday = new Date(date)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const format = (day: Date) => day.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
  return value.replace(/^Today\b/i, format(date)).replace(/^Yesterday\b/i, format(yesterday))
}

export default function HomePage() {
  const data = useConker(snapshot => snapshot)
  const { pendingTickets, recentActivity, recentSessions, enabledJobs, pausedJobs } = getWorkspaceOverview(data)
  const companionName = data.profile.name || "Conker"
  const preview = conkerClient.mode === "fixture"
  const resources = [
    { to: "/agents", label: "Agents", value: data.agents.length, detail: "In your workspace", icon: Bot },
    { to: "/tools", label: "Tools", value: data.tools.length, detail: "In the catalogue", icon: Wrench },
    { to: "/memory", label: "Memories", value: data.memories.length, detail: "Source records", icon: Brain },
    { to: "/jobs", label: "Jobs enabled", value: enabledJobs, detail: `${pausedJobs} paused`, icon: Workflow },
  ]

  return <BaseLayout title="Home" description="Your agents, their work, and what needs your attention." status={preview && <Badge variant="outline">Preview data</Badge>} actions={<>
    <Button variant="outline" asChild><Link to="/chat/new"><SquarePen aria-hidden="true" />New chat</Link></Button>
    <Button asChild><Link to="/companion"><MessageSquare aria-hidden="true" />Open companion</Link></Button>
  </>}>
    <div className="home-overview flex min-w-0 flex-col gap-(--page-section-gap)">
      <div className="grid min-w-0 items-start gap-(--page-section-gap) xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-(--page-section-gap)">
          <OverviewSection priority title="Needs your attention"
            description={pendingTickets.length ? `${pendingTickets.length} ${pendingTickets.length === 1 ? "request is" : "requests are"} waiting for your decision.` : "No requests waiting for your decision."}
            action={<Button size="sm" variant="outline" asChild><Link to="/inbox">Review inbox<ArrowUpRight aria-hidden="true" /></Link></Button>}>
              {pendingTickets.length ? <ul className="divide-y divide-border">{pendingTickets.slice(0, 3).map(ticket => <CollectionRow key={ticket.id}
                to={`/inbox/${ticket.id}`} title={ticket.request} leading={<AgentIdentityPortrait name={ticket.agent} />}
                description={<><span className="max-w-24 shrink-0 truncate">{ticket.agent}</span><span aria-hidden="true">·</span><span className="min-w-0 truncate">{ticket.service}</span></>}
                trailing={<Badge variant="outline">{ticket.effect === "Proposal" ? "Review" : "Approval"}</Badge>} />)}</ul>
                : <div className="flex items-start gap-3 py-5"><CheckCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" /><p className="text-sm leading-6 text-muted-foreground">You’re all caught up. Decisions from your agents will appear here.</p></div>}
          </OverviewSection>

          <OverviewSection title="Recent activity" action={<Button size="sm" variant="ghost" asChild><Link to="/activity?tab=events">Activity<ArrowUpRight aria-hidden="true" /></Link></Button>}>
              <ul className="divide-y divide-border">{recentActivity.map(entry => {
                const [date, ...time] = activityTime(entry.time, data.dailyBriefing.date, preview).split(" · ")
                return <CollectionRow key={entry.id} to={entry.source} title={entry.event}
                  description={<span className="min-w-0 truncate">{entry.actor} · {entry.detail}</span>}
                  descriptionTitle={`${entry.actor} · ${entry.detail}`}
                  trailing={<><span>{date}</span><span>{time.join(" · ")}</span></>} />
              })}</ul>
              {!recentActivity.length && <p className="py-5 text-sm leading-6 text-muted-foreground">Your agents’ actions and results will appear here.</p>}
          </OverviewSection>
        </div>

        <div className="min-w-0 space-y-(--page-section-gap)">
          <OverviewSection title="Your workspace">
            <div className="grid grid-cols-2 overflow-hidden rounded-xl border bg-card text-card-foreground">
              {resources.map(({ to, label, value, detail, icon: Icon }) => <Link key={to} to={to}
                className="group min-w-0 border-b p-4 transition-colors odd:border-r hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring [&:nth-last-child(-n+2)]:border-b-0">
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Icon className="size-4 shrink-0" aria-hidden="true" /><span>{label}</span></div>
                <p className="mt-2 text-2xl leading-8 font-semibold tabular-nums">{value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
              </Link>)}
            </div>
          </OverviewSection>
          <OverviewSection title="Your agents" action={<Button size="sm" variant="ghost" asChild><Link to="/agents">All agents<ArrowUpRight aria-hidden="true" /></Link></Button>}>
              <ul className="divide-y divide-border">{data.agents.slice(0, 3).map(agent => <CollectionRow key={agent.id}
                to={agent.kind === "companion" ? "/companion" : `/chat/new?agent=${encodeURIComponent(agent.id)}`}
                title={agent.kind === "companion" ? companionName : agent.name} leading={<AgentIdentityPortrait name={agent.name} />}
                description={<span className="min-w-0 truncate">{agent.role}</span>} descriptionTitle={agent.role}
                trailing={<StatusBadge tone={agent.status === "active" ? "live" : "neutral"}>{agent.status === "active" ? "Active" : "Idle"}</StatusBadge>} />)}</ul>
              {!data.agents.length && <p className="py-5 text-sm leading-6 text-muted-foreground">No agents in this workspace yet.</p>}
          </OverviewSection>

          <OverviewSection title="Continue a conversation" action={<Button size="sm" variant="ghost" asChild><Link to="/chat">Chats<ArrowUpRight aria-hidden="true" /></Link></Button>}>
              <ul className="divide-y divide-border">{recentSessions.map(session => <CollectionRow key={session.id}
                to={`/chat/${session.id}`} title={session.title} leading={<AgentIdentityPortrait name={session.agent} />}
                description={<span className="min-w-0 truncate">{session.agent} · {session.subtitle}</span>}
                descriptionTitle={session.subtitle} />)}</ul>
              {!recentSessions.length && <p className="py-5 text-sm leading-6 text-muted-foreground">Start a chat to give your next idea its own space.</p>}
          </OverviewSection>
        </div>
      </div>

      <div className="border-t pt-6"><OverviewSection title="System status" description={preview ? "Sample service checks. Live connections are not active." : "Latest recorded service checks."}
        action={<div className="flex flex-wrap gap-1"><Button size="sm" variant="ghost" asChild><Link to="/settings?tab=connections"><Plug aria-hidden="true" />Connections</Link></Button><Button size="sm" variant="ghost" asChild><Link to="/system">System<ArrowUpRight aria-hidden="true" /></Link></Button></div>}>
          <ul className="grid divide-y divide-border lg:grid-cols-3 lg:divide-x lg:divide-y-0">{data.services.map(service => <li key={service.name} className="min-w-0">
            <Link to="/system" className="flex min-w-0 items-center justify-between gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring">
              <div className="min-w-0"><p className="text-sm font-medium">{service.name}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{service.purpose}</p></div>
              <StatusBadge tone={service.status === "Degraded" ? "warning" : "neutral"}>{service.status === "Live" ? "Responding" : service.status}</StatusBadge>
            </Link>
          </li>)}</ul>
          {!data.services.length && <p className="py-3 text-sm leading-6 text-muted-foreground">No service checks recorded yet.</p>}
      </OverviewSection></div>
    </div>
  </BaseLayout>
}
