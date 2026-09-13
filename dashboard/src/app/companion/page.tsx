import { useEffect, useRef } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { ArrowRight, CalendarDays, Inbox, ListTodo, Newspaper, Search } from "lucide-react"
import { BaseLayout } from "@/components/layouts/base-layout"
import { Conversation } from "@/app/chat/conversation"
import { CompanionPortrait } from "@/components/companion-portrait"
import { DailyNews } from "@/components/daily-news"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CollectionEmpty } from "@/components/design-system"
import { useConker, useConkerStore } from "@/lib/api/store"
import { getDailyOverview } from "@/lib/daily-overview"

function DailyContext() {
  const data = useConker(data => data)
  const { briefing, agenda, pendingTickets } = getDailyOverview(data)
  return <div className="space-y-6">
    <section aria-label="Upcoming events" className="space-y-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><CalendarDays className="size-4 text-muted-foreground" />Coming up</h2>
      <ul className="divide-y divide-border/60">{agenda.map(item => <li key={item.day} className="flex gap-3 py-3 first:pt-0">
        <span className="w-12 shrink-0 text-xs leading-5 text-muted-foreground">{item.day}{item.date && <span className="block text-lg font-medium text-foreground">{item.date}</span>}</span>
        <div className="min-w-0"><p className="text-sm font-medium">{item.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p></div>
      </li>)}</ul>
      <p className="text-xs leading-5 text-muted-foreground">{briefing.mode === "sample" ? "From the sample plan. Suggested blocks are not booked events." : "From your latest briefing."}</p>
    </section>
    <section className="space-y-3 border-t pt-5" aria-label="Requests needing your decision">
      <div className="flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-semibold"><Inbox className="size-4 text-muted-foreground" />Your decisions</h2><Badge variant="outline">{pendingTickets.length}</Badge></div>
      {pendingTickets.length ? <ul className="space-y-1">{pendingTickets.slice(0, 3).map(ticket => <li key={ticket.id}><Link to={`/inbox/${ticket.id}`} className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"><span className="min-w-0">{ticket.request}</span><ArrowRight className="size-4 shrink-0 text-muted-foreground" /></Link></li>)}</ul> : <p className="text-sm text-muted-foreground">Nothing waiting on you.</p>}
    </section>
    <section className="space-y-4 border-t pt-5" aria-label="News and breakthroughs"><h2 className="flex items-center gap-2 text-sm font-semibold"><Newspaper className="size-4 text-muted-foreground" />News & breakthroughs</h2><DailyNews news={briefing.news} compact /></section>
  </div>
}

function Briefing({ preparePrompt }: { preparePrompt: (text: string) => void }) {
  const data = useConker(data => data)
  const { briefing, pendingTickets, planSource } = getDailyOverview(data)
  const date = new Date(`${briefing.date}T12:00:00Z`).toLocaleDateString("en", { weekday: "long", day: "numeric", month: "long", timeZone: briefing.timezone })
  return <div className="space-y-6">
    <div className="flex items-start gap-4">
      <CompanionPortrait profile={data.profile} className="size-14" />
      <div className="min-w-0"><h2 className="text-2xl leading-8 font-semibold tracking-tight">Good to see you, {data.auth.ownerName}.</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">One place to think things through, catch up, and get started.</p></div>
    </div>
    <section aria-label="Daily briefing" className="space-y-4 rounded-xl border p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-base font-medium">Your daily briefing</h3><span className="text-xs text-muted-foreground">{briefing.mode === "sample" ? "Sample briefing · " : ""}{date}</span></div>
      <p className="text-[15px] leading-7">{briefing.summary}</p>
      <p className="text-sm leading-6 text-muted-foreground">{pendingTickets.length ? `${pendingTickets.length} requests need your decision. You can review them before anything moves forward.` : "You're caught up on decisions. There's nothing waiting for approval."}</p>
      <div className="flex flex-wrap items-center gap-3"><Button variant="outline" size="sm" asChild><Link to={planSource}>View the planning conversation<ArrowRight /></Link></Button><Link to="/inbox" className="text-sm underline underline-offset-4">Review requests</Link></div>
    </section>
    <section aria-label="Start a request" className="space-y-3">
      <h3 className="text-sm font-medium">What would you like to work on?</h3>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => preparePrompt("Help me plan my day around my priorities and upcoming events.")}><CalendarDays />Plan my day</Button>
        <Button variant="outline" onClick={() => preparePrompt("Help me research a topic. First, ask me what I want to understand and which sources matter.")}><Search />Research something</Button>
        <Button variant="outline" onClick={() => preparePrompt("I have something to get done. Help me clarify the outcome and work out the next steps.")}><ListTodo />Get something done</Button>
      </div>
    </section>
  </div>
}

export default function CompanionPage() {
  const data = useConker(data => data)
  const { companionSession } = getDailyOverview(data)
  const location = useLocation()
  const navigate = useNavigate()
  const consumed = useRef<string | null>(null)

  useEffect(() => {
    const prompt = (location.state as { prompt?: unknown } | null)?.prompt
    if (!companionSession || typeof prompt !== "string" || !prompt.trim() || consumed.current === location.key) return
    consumed.current = location.key
    const store = useConkerStore.getState()
    const current = store.drafts[companionSession.id] || ""
    const next = current.trim() ? `${current}\n\n${prompt.trim()}` : prompt.trim()
    if (next.length <= 4000) store.setDraft(companionSession.id, next)
    else useConkerStore.setState({ error: "Your draft is full. Send or shorten it before adding another request." })
    navigate(location.pathname, { replace: true, state: null })
  }, [companionSession, location.key, location.pathname, location.state, navigate])

  if (!companionSession) return <BaseLayout title="Companion" description="Your main AI workspace."><CollectionEmpty title="Your companion conversation is unavailable" description="Open Chats to find an existing conversation, or reload the dashboard." /><Button asChild variant="outline" className="self-start"><Link to="/chat">Open chats</Link></Button></BaseLayout>

  return <BaseLayout variant="conversation">
    <Conversation key={companionSession.id} session={companionSession} companionWorkspace intro={Briefing} reference={<DailyContext />} />
  </BaseLayout>
}
