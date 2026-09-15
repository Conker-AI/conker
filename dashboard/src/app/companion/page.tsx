import { useEffect, useRef } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { ArrowRight, CalendarDays, Inbox, Newspaper } from "lucide-react"
import { BaseLayout } from "@/components/layouts/base-layout"
import { Conversation } from "@/app/chat/conversation"
import { CompanionCheckIn } from "./check-in"
import { DailyNews } from "@/components/daily-news"
import { Button } from "@/components/ui/button"
import { ReferenceSection } from "@/components/reference-section"
import { CollectionEmpty } from "@/components/design-system"
import { useConker, useConkerStore } from "@/lib/api/store"
import { getDailyOverview } from "@/lib/daily-overview"

function DailyContext() {
  const data = useConker(data => data)
  const { briefing, agenda, pendingTickets } = getDailyOverview(data)
  return <div className="space-y-5">
    <ReferenceSection title="Coming up" icon={<CalendarDays />}>
      <ul className="divide-y divide-border">{agenda.map(item => <li key={item.day} className="flex gap-3 py-3 first:pt-0">
        <span className="w-12 shrink-0 text-xs leading-5 text-muted-foreground">{item.day}{item.date && <span className="block text-lg font-medium text-foreground">{item.date}</span>}</span>
        <div className="min-w-0"><p className="text-sm font-medium">{item.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p></div>
      </li>)}</ul>
      <p className="text-xs leading-5 text-muted-foreground">{briefing.mode === "sample" ? "From the sample plan. Suggested blocks are not booked events." : "From your latest briefing."}</p>
    </ReferenceSection>
    <ReferenceSection title={`Your decisions · ${pendingTickets.length}`} icon={<Inbox />}>
      {pendingTickets.length ? <ul className="space-y-1">{pendingTickets.slice(0, 3).map(ticket => <li key={ticket.id}><Link to={`/inbox/${ticket.id}`} className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"><span className="min-w-0">{ticket.request}</span><ArrowRight className="size-4 shrink-0 text-muted-foreground" /></Link></li>)}</ul> : <p className="text-sm text-muted-foreground">Nothing waiting on you.</p>}
    </ReferenceSection>
    <ReferenceSection title="News & breakthroughs" icon={<Newspaper />}><DailyNews news={briefing.news} compact /></ReferenceSection>
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
    <Conversation key={companionSession.id} session={companionSession} companionWorkspace intro={CompanionCheckIn} reference={<DailyContext />} />
  </BaseLayout>
}
