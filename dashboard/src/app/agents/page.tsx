import { useConker } from "@/lib/api/store"
import { BaseLayout } from "@/components/layouts/base-layout"
import { DataTable } from "@/components/data-table"
import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { MessageCircle, Settings, SquarePen } from "lucide-react"
import { AgentIdentityPortrait, DetailPanel, OverlayBody, FormActions, RecordItem } from "@/components/design-system"
import { ReferenceSection } from "@/components/reference-section"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/status-badge"
import type { Agent } from "@/lib/api/models"
import { agentColumns } from "./columns"

export default function AgentsPage() {
  const agents = useConker(data => data.agents)
  const sessions = useConker(data => data.sessions)
  const companionId = useConker(data => data.companionSessionId)
  const [selected, setSelected] = useState<Agent | null>(null)
  const columns = useMemo(() => agentColumns(setSelected), [])
  const history = sessions.filter(session => selected && session.id !== companionId && (session.agentId === selected.id || session.agent === selected.name) && !session.isDraft && !session.archived).sort((a, b) => a.minutesAgo - b.minutesAgo)
  return (
    <BaseLayout variant="collection"
      title="Agents"
      description="Choose who you want to work with. Each agent can have its own conversations."
    >
      <div className="">
        <DataTable
          columns={columns}
          data={agents}
          itemLabel="agents"
          renderItem={agent => <RecordItem title={agent.name} description={agent.role} leading={<AgentIdentityPortrait name={agent.name} />} onOpen={() => setSelected(agent)}
            meta={<><StatusBadge tone={agent.status === "active" ? "live" : "neutral"}>{agent.status === "active" ? "Active" : "Idle"}</StatusBadge><span>{agent.model}</span><span>{agent.grants} grants · {agent.cost}</span></>}
            actions={<Button size="sm" variant="outline" asChild><Link to={`/chat/new?agent=${agent.id}`}><SquarePen />New chat</Link></Button>} />}
          searchColumn="name"
          searchPlaceholder="Search agents…"
        />
      </div>
      <DetailPanel open={!!selected} onOpenChange={open => { if (!open) setSelected(null) }} title={selected?.name ?? "Agent details"} description={selected?.role ?? "Agent details"}>
        {selected && <><OverlayBody>
          <ReferenceSection title="Agent"><div className="flex items-center gap-3"><AgentIdentityPortrait name={selected.name} /><StatusBadge tone={selected.status === "active" ? "live" : "neutral"}>{selected.status === "active" ? "Active" : "Idle"}</StatusBadge></div><dl className="grid grid-cols-2 gap-3"><div><dt className="text-xs text-muted-foreground">Sample model</dt><dd>{selected.model}</dd></div><div><dt className="text-xs text-muted-foreground">Recorded cost</dt><dd>{selected.cost}</dd></div><div><dt className="text-xs text-muted-foreground">Standing grants</dt><dd>{selected.grants}</dd></div></dl><p className="text-xs text-muted-foreground">Fixture status. Conversation model choices come from Settings.</p></ReferenceSection>
          {selected.kind === "companion" && <Button size="sm" variant="outline" asChild><Link to="/companion"><MessageCircle />Open companion</Link></Button>}
          <ReferenceSection title="Recent conversations" icon={<MessageCircle />}>
            {history.length ? <ul className="divide-y">{history.map(session => <li key={session.id}><Link to={`/chat/${session.id}`} className="block rounded-md py-3 hover:underline focus-visible:outline-2 focus-visible:outline-ring"><span className="block font-medium">{session.title}</span><span className="text-xs text-muted-foreground">{session.updated}</span></Link></li>)}</ul> : <p className="text-muted-foreground">No conversations yet. Start one with this agent.</p>}
          </ReferenceSection>
        </OverlayBody><FormActions inset>
          {selected.kind === "companion" && <Button asChild variant="outline"><Link to="/settings/companion"><Settings />Edit companion</Link></Button>}
          <Button asChild><Link to={`/chat/new?agent=${selected.id}`}><SquarePen />New chat</Link></Button>
        </FormActions></>}
      </DetailPanel>
    </BaseLayout>
  )
}
