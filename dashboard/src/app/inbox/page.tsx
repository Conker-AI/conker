import { useState } from "react"
import { Inbox } from "lucide-react"
import { BaseLayout } from "@/components/layouts/base-layout"
import { Badge } from "@/components/ui/badge"
import { useConker } from "@/lib/api/store"
import type { Ticket } from "@/lib/api/models"
import {
  AgentIdentityPortrait, CollectionPanel, CollectionRow, CollectionSection,
  RouteSection,
} from "@/components/design-system"

function RequestList({ tickets, history = false, query, setQuery }: { tickets: Ticket[]; history?: boolean; query: string; setQuery: (value: string) => void }) {
  const profile = useConker(data => data.profile)
  const agents = useConker(data => data.agents)
  const displayName = (name: string) => agents.find(agent => agent.name === name)?.kind === "companion" ? profile.name : name
  const filtered = tickets.filter(ticket => `${ticket.request} ${ticket.agent} ${displayName(ticket.agent)} ${ticket.service} ${ticket.effect} ${ticket.status}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  return <CollectionPanel query={query} onQueryChange={setQuery} count={filtered.length}
    label={history ? "Search decisions" : "Search requests"} placeholder={history ? "Search decisions" : "Search requests"}
    unit={history ? "decisions" : "requests"} icon={<Inbox />}
    emptyTitle={query.trim() ? history ? "No decisions found" : "No requests found" : history ? "No decisions yet" : "You're all caught up"}
    emptyDescription={query.trim() ? "Try a different request, service, or agent name." : history ? "Requests you review will appear here." : "Your reviewed requests are in Decision history."}>
    <CollectionSection title={history ? "Reviewed requests" : "Pending requests"}>
      {filtered.map(ticket => <CollectionRow key={ticket.id} to={`/inbox/${ticket.id}`} title={ticket.request}
        leading={<AgentIdentityPortrait name={ticket.agent} />}
        descriptionTitle={`${displayName(ticket.agent)} · ${ticket.service} · ${ticket.effect}`}
        description={<><span className="max-w-24 shrink-0 truncate">{displayName(ticket.agent)}</span><span aria-hidden="true">·</span><span className="min-w-0 truncate">{ticket.service}{history ? ` · ${ticket.effect}` : ""}</span></>}
        trailing={<><Badge variant="outline" className="font-normal">{history ? ticket.status : ticket.effect}</Badge>{!history && <span title={`Decide by ${ticket.decideBy} · Spend window: ${ticket.spendWindow}`}>{ticket.decideBy}</span>}</>}
      />)}
    </CollectionSection>
  </CollectionPanel>
}

export default function InboxPage() {
  const [query, setQuery] = useState("")
  const [historyQuery, setHistoryQuery] = useState("")
  const tickets = useConker(state => state.tickets)
  const pending = tickets.filter(ticket => ticket.status === "Needs you")
  return <BaseLayout title="Inbox" description="Review requests and revisit your decisions.">
      <RouteSection value="pending"><RequestList tickets={pending} query={query} setQuery={setQuery} /></RouteSection>
      <RouteSection value="history"><RequestList tickets={tickets.filter(ticket => ticket.status !== "Needs you")} query={historyQuery} setQuery={setHistoryQuery} history /></RouteSection>
    <p className="text-xs text-muted-foreground">Preview decisions reset on reload.</p>
  </BaseLayout>
}
