import { useConker, useConkerStore } from "@/lib/api/store"
import { conkerClient } from "@/lib/api"
import { agentReferences } from "@/lib/api/agent-config"
import { collaborationReferences } from "@/lib/api/agent-collaboration-preview"
import { BaseLayout } from "@/components/layouts/base-layout"
import { DataTable } from "@/components/data-table"
import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { MessageCircle, Settings, SquarePen, Plus, Archive, Trash2 } from "lucide-react"
import { AgentIdentityPortrait, DetailPanel, OverlayBody, FormActions, RecordItem, ConfirmationDialog, RouteSection } from "@/components/design-system"
import { ReferenceSection } from "@/components/reference-section"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/status-badge"
import type { Agent } from "@/lib/api/models"
import { agentColumns } from "./columns"
import { CreateAgent } from "./create-agent"
import { TeamsPanel } from "./collaboration/teams"
import { TemplatesPanel } from "./collaboration/templates"

export default function AgentsPage() {
  const agents = useConker(data => data.agents)
  const sessions = useConker(data => data.sessions)
  const companionId = useConker(data => data.companionSessionId)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = agents.find(agent => agent.id === selectedId)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Agent | null>(null)
  const [error, setError] = useState("")
  const { mutate, pending, notice } = useConkerStore()
  const navigate = useNavigate()
  const data = useConker(data => data)
  const references = selectedId ? [...agentReferences(data, selectedId), ...collaborationReferences(data.collaboration, "agent", selectedId)] : []
  const open = (agent: Agent) => { setSelectedId(agent.id); setError("") }
  const columns = useMemo(() => agentColumns(agent => { setSelectedId(agent.id); setError("") }), [setSelectedId, setError])
  const history = sessions.filter(session => selected && session.id !== companionId && (session.agentId === selected.id || session.agent === selected.name) && !session.isDraft && !session.archived).sort((a, b) => a.minutesAgo - b.minutesAgo)
  return (
    <BaseLayout variant="collection"
      title="Agents"
      description="Choose and configure your specialists. Preview changes reset on reload."
    >
      <RouteSection value="agents">
      <div>
        <DataTable
          columns={columns}
          data={agents}
          toolbarAction={<Button onClick={() => setCreating(true)}><Plus />New agent</Button>}
          itemLabel="agents"
          renderItem={agent => <RecordItem title={agent.name} description={agent.role} leading={<AgentIdentityPortrait name={agent.name} />} onOpen={() => open(agent)}
            meta={<><StatusBadge tone={!agent.archivedAt && agent.status === "active" ? "live" : "neutral"}>{agent.archivedAt ? "Archived" : agent.status === "active" ? "Active" : "Idle"}</StatusBadge><span>{agent.model}</span><span>{agent.grants} sample grants · {agent.cost}</span></>}
            actions={!agent.archivedAt && <Button size="sm" variant="outline" asChild><Link to={`/chat/new?agent=${agent.id}`}><SquarePen />New chat</Link></Button>} />}
          searchColumn="name"
          searchPlaceholder="Search agents…"
        />
      </div>
      <DetailPanel open={!!selected} busy={pending} onOpenChange={open => { if (!open) setSelectedId(null) }} title={selected?.name ?? "Agent details"} description={selected?.role ?? "Agent details"}>
        {selected && <><OverlayBody>
          <ReferenceSection title="Agent"><div className="flex items-center gap-3"><AgentIdentityPortrait name={selected.name} /><StatusBadge tone={selected.status === "active" ? "live" : "neutral"}>{selected.status === "active" ? "Active" : "Idle"}</StatusBadge></div><dl className="grid grid-cols-2 gap-3"><div><dt className="text-xs text-muted-foreground">Sample model</dt><dd>{selected.model}</dd></div><div><dt className="text-xs text-muted-foreground">Recorded cost</dt><dd>{selected.cost}</dd></div><div><dt className="text-xs text-muted-foreground">Standing grants</dt><dd>{selected.grants}</dd></div></dl><p className="text-xs text-muted-foreground">Fixture status. Conversation model choices come from Settings.</p></ReferenceSection>
          {selected.kind === "companion" && <Button size="sm" variant="outline" asChild><Link to="/companion"><MessageCircle />Open companion</Link></Button>}
          {selected.kind === "agent" && <ReferenceSection title="Configuration"><p className="text-sm">Version {selected.version || 0} · {selected.configuration?.toolIds.length || 0} tools selected · {selected.configuration?.memory.scope || "conversation"} memory</p><p className="text-xs text-muted-foreground">Selection is configuration only, never an execution grant. {references.length ? `Referenced by ${references.join(", ")}; archive preserves these records.` : "No references. This agent can be deleted."}</p>{selected.archivedAt && <StatusBadge>Archived</StatusBadge>}</ReferenceSection>}
          <ReferenceSection title="Recent conversations" icon={<MessageCircle />}>
            {history.length ? <ul className="divide-y">{history.map(session => <li key={session.id}><Link to={`/chat/${session.id}`} className="block rounded-md py-3 hover:underline focus-visible:outline-2 focus-visible:outline-ring"><span className="block font-medium">{session.title}</span><span className="text-xs text-muted-foreground">{session.updated}</span></Link></li>)}</ul> : <p className="text-muted-foreground">No conversations yet. Start one with this agent.</p>}
          </ReferenceSection>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </OverlayBody><FormActions inset>
          {selected.kind === "companion" && <Button asChild variant="outline"><Link to="/settings/companion"><Settings />Edit companion</Link></Button>}
          {selected.kind === "agent" && <><Button disabled={pending || references.length > 0} variant="outline" onClick={() => { setDeleting(selected); setSelectedId(null); setError("") }}><Trash2 />Delete</Button><Button disabled={pending} variant="outline" onClick={async () => { const success = await mutate(() => conkerClient.archiveAgent(selected.id, !selected.archivedAt), selected.archivedAt ? "Agent restored in preview." : "Agent archived in preview. History retained."); if (!success) setError(useConkerStore.getState().error); else setError("") }}><Archive />{selected.archivedAt ? "Restore" : "Archive"}</Button>{!selected.archivedAt && <Button asChild variant="outline"><Link to={`/agents/${selected.id}/edit`}><Settings />Edit agent</Link></Button>}</>}
          {!selected.archivedAt && <Button asChild><Link to={`/chat/new?agent=${selected.id}`}><SquarePen />New chat</Link></Button>}
        </FormActions></>}
      </DetailPanel>
      {creating && <CreateAgent onClose={() => setCreating(false)} onCreated={id => { setCreating(false); navigate(`/agents/${id}/edit`) }} />}
      <ConfirmationDialog open={!!deleting} onOpenChange={open => { if (!open) { setSelectedId(deleting?.id || null); setDeleting(null) } }} title="Delete this preview agent?" description={`“${deleting?.name || ""}” has no references. Deletion removes its configuration from this preview; reloading restores sample data.`} actionLabel="Delete preview agent" pending={pending} error={error} onConfirm={async () => { if (!deleting) return; const success = await mutate(() => conkerClient.deleteAgent(deleting.id), "Agent deleted from preview."); if (success) setDeleting(null); else setError(useConkerStore.getState().error) }} />
      </RouteSection>
      <RouteSection value="teams"><TeamsPanel /></RouteSection>
      <RouteSection value="templates"><TemplatesPanel /></RouteSection>
      {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    </BaseLayout>
  )
}
