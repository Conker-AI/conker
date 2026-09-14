import { Link } from "react-router-dom"
import { ArrowRight, BookOpen, ChevronDown, Inbox, MessageCircle, PenLine } from "lucide-react"
import { CompanionPortrait } from "@/components/companion-portrait"
import { AgentIdentityPortrait, CollectionRow, CollectionSection } from "@/components/design-system"
import { Button } from "@/components/ui/button"
import { useConker } from "@/lib/api/store"
import { getDailyOverview } from "@/lib/daily-overview"
import { useConversationWorkspace } from "@/lib/conversation-workspace"

export function CompanionCheckIn({ preparePrompt, hasMessages }: {
  preparePrompt: (text: string) => void
  hasMessages: boolean
}) {
  const data = useConker(data => data)
  const openRail = useConversationWorkspace(state => state.openRail)
  const { briefing, pendingTickets, recentSessions, planSource } = getDailyOverview(data)
  const date = new Date(`${briefing.date}T12:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: briefing.timezone })

  return <section aria-label="Companion check-in" className="space-y-5">
    <div className="flex items-center gap-3">
      <CompanionPortrait profile={data.profile} className={hasMessages ? "size-10" : "size-14"} />
      <div className="min-w-0"><h2 className={hasMessages ? "text-base font-semibold" : "text-2xl font-semibold tracking-tight"}>Good to see you, {data.auth.ownerName}.</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{hasMessages ? "Your check-in is here whenever you need it." : "What’s on your mind? We can talk it through or make something happen."}</p>
      </div>
    </div>
    <details open={!hasMessages} className="group/check-in border-b pb-5">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <span>Your latest check-in</span><span className="ml-auto text-xs font-normal text-muted-foreground">{briefing.mode === "sample" ? "Sample · " : ""}{date}</span><ChevronDown className="size-4 shrink-0 transition-transform group-open/check-in:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="space-y-5 pt-3">
        <div className="space-y-3">
          <p className="text-[15px] leading-7">{briefing.summary}</p>
          <Link to={planSource} className="inline-flex min-h-8 items-center gap-2 rounded-md text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">Open the planning conversation<ArrowRight className="size-3.5" /></Link>
        </div>
        <div className="grid min-w-0 gap-5 lg:grid-cols-2">
          <CollectionSection title="Pick up where you left off" icon={<MessageCircle className="size-4" />}>
            {recentSessions.slice(0, 2).map(session => <CollectionRow key={session.id} to={`/chat/${session.id}`} title={session.title} description={session.agentId === data.agents.find(agent => agent.kind === "companion")?.id ? data.profile.name : session.agent} leading={<AgentIdentityPortrait name={session.agent} />} trailing={<ArrowRight className="size-4" />} />)}
            {!recentSessions.length && <li className="px-4 py-4 text-sm text-muted-foreground">Your first topic starts with the new-chat icon above.</li>}
          </CollectionSection>
          <CollectionSection title={pendingTickets.length ? `${pendingTickets.length} things need your decision` : "You’re caught up"} icon={<Inbox className="size-4" />}>
            {pendingTickets.slice(0, 2).map(ticket => <CollectionRow key={ticket.id} to={`/inbox/${ticket.id}`} title={ticket.request} description={ticket.effect === "Proposal" ? "A suggestion for you to review" : "Waiting for your permission"} trailing={<ArrowRight className="size-4" />} />)}
            {!pendingTickets.length && <li className="px-4 py-4 text-sm text-muted-foreground">Nothing is waiting for approval.</li>}
          </CollectionSection>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <Button variant="outline" size="sm" onClick={() => openRail(data.companionSessionId, "daily")}>Daily context<ArrowRight /></Button>
          {pendingTickets.length > 2 && <Link to="/inbox" className="underline underline-offset-4">See all {pendingTickets.length} requests</Link>}
          <span>{briefing.news.status === "unavailable" ? "Personal news isn’t connected yet." : `${briefing.news.items.length} headlines in Daily context.`}</span>
        </div>
      </div>
    </details>
    {!hasMessages && <div className="flex flex-wrap gap-2" aria-label="Start with an idea">
      <Button variant="outline" size="sm" onClick={() => preparePrompt("I have something on my mind. Help me think it through, one question at a time.")}><MessageCircle />Talk it through</Button>
      <Button variant="outline" size="sm" onClick={() => preparePrompt("I want to make something. Help me turn the idea into a concrete first step.")}><PenLine />Make something</Button>
      <Button variant="outline" size="sm" onClick={() => preparePrompt("Help me understand something new. Ask what I’m curious about and explain it with examples.")}><BookOpen />Learn something</Button>
    </div>}
  </section>
}
