import { takeMutationError } from "./feedback"
import { useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Plus } from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"
import { CollectionEmpty, DetailPanel, FormActions, OverlayBody, RecordItem } from "@/components/design-system"
import { ReferenceSection } from "@/components/reference-section"
import { DataTable } from "@/components/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { conkerClient } from "@/lib/api"
import { useConker, useConkerStore } from "@/lib/api/store"
import type { AgentTeamInput, AgentTeamRecord, PreparedTeamConfiguration } from "@/lib/api/agent-collaboration-types"
import { TeamEditor } from "./team-editor"

function TeamDefinition({ definition, capturedAgents }: { definition: AgentTeamInput; capturedAgents?: PreparedTeamConfiguration["agents"] }) {
  const data = useConker(data => data)
  return <div className="space-y-5"><p className="text-sm whitespace-pre-wrap">{definition.objective}</p><p className="text-xs text-muted-foreground">Maximum {definition.budget.maxTurns} turns · {definition.budget.maxTokens.toLocaleString()} tokens · {definition.budget.maxCostCents} cents · {definition.budget.maxHandoffs} handoffs</p><ul className="space-y-4">{definition.roles.map(role => <li key={role.id} className="space-y-2"><p className="text-sm font-medium">{role.name} · {capturedAgents?.find(agent => agent.roleId === role.id)?.configuration.name ?? data.agents.find(agent => agent.id === role.agentId)?.name ?? "Unavailable agent"}</p><p className="whitespace-pre-wrap text-sm">{role.instructions}</p><p className="text-xs text-muted-foreground">Tools: {role.toolIds.map(id => data.tools.find(tool => tool.id === id)?.name ?? id).join(", ") || "None"}</p><p className="text-xs text-muted-foreground">Memory: {role.memory.scope} · {role.memory.memoryIds.length} explicit records. {role.memory.memoryIds.join(", ")} Context: {role.context.mode === "task_only" ? "task only" : role.context.sourceIds.join(", ")}.</p><p className="text-xs text-muted-foreground">Role budget: {role.budget.maxTurns} turns · {role.budget.maxTokens.toLocaleString()} tokens · {role.budget.maxCostCents} cents</p></li>)}</ul>{definition.handoffs.length > 0 && <ul className="space-y-3 border-t pt-4">{definition.handoffs.map(handoff => <li key={handoff.id}><p className="text-sm font-medium">{definition.roles.find(role => role.id === handoff.fromRoleId)?.name} → {definition.roles.find(role => role.id === handoff.toRoleId)?.name}</p><p className="text-sm">{handoff.condition}</p><p className="text-xs text-muted-foreground">{handoff.payload === "result_only" ? "Result only" : "Result and citations"} · at most {handoff.maxTransfers} transfers</p></li>)}</ul>}</div>
}

export function TeamsPanel() {
  const data = useConker(data => data)
  const records = data.collaboration.teams
  const [params, setParams] = useSearchParams()
  const selected = records.find(record => record.id === params.get("team"))
  const [editing, setEditing] = useState<AgentTeamRecord | "new" | null>(null)
  const [filter, setFilter] = useState("active")
  const [error, setError] = useState("")
  const { mutate, pending } = useConkerStore()
  const open = (record: AgentTeamRecord) => { const next = new URLSearchParams(params); next.set("team", record.id); setParams(next); setError("") }
  const close = () => { const next = new URLSearchParams(params); next.delete("team"); setParams(next, { replace: true }); setError("") }
  const columns: ColumnDef<AgentTeamRecord>[] = [
    { id: "name", header: "Team", accessorFn: record => `${record.definition.name} ${record.definition.objective}`, cell: ({ row }) => <button type="button" onClick={() => open(row.original)} className="rounded-sm text-left font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring">{row.original.definition.name}</button> },
    { id: "roles", accessorFn: record => record.definition.roles.length, header: "Roles" },
    { accessorKey: "revision", header: "Revision" },
    { id: "state", accessorFn: record => record.archivedAt ? "Archived" : "Configuration only", header: "State" },
  ]
  if (editing) return <TeamEditor key={editing === "new" ? "new" : editing.id} record={editing === "new" ? undefined : records.find(record => record.id === editing.id)} onClose={() => setEditing(null)} />
  const snapshots = data.collaboration.teamPreparations.filter(prepared => prepared.teamId === selected?.id)
  return <div className="space-y-4"><p className="text-xs text-muted-foreground">Teams define roles and bounded handoffs. This preview has no team executor and combines no grants.</p>{records.length ? <DataTable columns={columns} data={records.filter(record => filter === "all" || (filter === "archived" ? !!record.archivedAt : !record.archivedAt))} searchColumn="name" searchPlaceholder="Search teams or objectives…" itemLabel="teams" toolbarAction={<><Select value={filter} onValueChange={setFilter}><SelectTrigger size="sm" aria-label="Filter teams"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active teams</SelectItem><SelectItem value="archived">Archived teams</SelectItem><SelectItem value="all">All teams</SelectItem></SelectContent></Select><Button onClick={() => setEditing("new")}><Plus />New team</Button></>} renderItem={record => <RecordItem title={record.definition.name} description={record.definition.objective} onOpen={() => open(record)} meta={<><Badge variant="outline">{record.archivedAt ? "Archived" : "Preview"}</Badge><span>{record.definition.roles.length} roles · revision {record.revision}</span></>} />} /> : <CollectionEmpty title="Give each specialist a clear role" description="Define responsibilities, handoffs, scoped context and budgets. Prepare a reviewable snapshot without starting work." action={<Button onClick={() => setEditing("new")}><Plus />New team</Button>} />}
    <DetailPanel open={!!selected} onOpenChange={value => { if (!value) close() }} title={selected?.definition.name ?? "Team"} description="Configuration and immutable preparations · preview" busy={pending}>{selected && <><OverlayBody><ReferenceSection title={`Definition · revision ${selected.revision}`}><TeamDefinition definition={selected.definition} /></ReferenceSection><ReferenceSection title="Prepared snapshots">{snapshots.length ? <div className="space-y-3">{snapshots.slice().reverse().map(prepared => <details key={prepared.id} className="rounded-md border p-3"><summary className="cursor-pointer rounded-sm text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">Revision {prepared.teamRevision} · {new Date(prepared.createdAt).toLocaleString()}</summary><div className="mt-4 space-y-4"><p className="text-xs text-muted-foreground">Prepared only · no authority · no execution started. Later team or agent edits do not rewrite this snapshot.</p><TeamDefinition definition={prepared.definition} capturedAgents={prepared.agents} /><ul className="space-y-2">{prepared.agents.map(agent => <li key={agent.roleId} className="text-xs text-muted-foreground">Captured {agent.configuration.name} · agent version {agent.agentVersion ?? "unknown"} · model {agent.configuration.modelId ?? "default route"}</li>)}</ul></div></details>)}</div> : <p className="text-sm text-muted-foreground">Prepare a snapshot when the definition is ready for review. Preparation does not start a run.</p>}</ReferenceSection>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</OverlayBody><FormActions inset><Button variant="outline" disabled={pending} onClick={async () => { const saved = await mutate(() => conkerClient.collaboration.archiveTeam(selected.id, !selected.archivedAt, selected.revision), "Team archive state saved in preview."); setError(saved ? "" : takeMutationError()) }}>{selected.archivedAt ? "Restore" : "Archive"}</Button>{!selected.archivedAt && <><Button variant="outline" disabled={pending} onClick={() => setEditing(selected)}>Edit team</Button><Button disabled={pending} onClick={async () => { const saved = await mutate(() => conkerClient.collaboration.prepareTeam(selected.id, selected.revision), "Team configuration snapshot prepared. No run or handoff started."); setError(saved ? "" : takeMutationError()) }}>Prepare snapshot</Button></>}</FormActions></>}</DetailPanel>
    {!data.agents.some(agent => !agent.archivedAt && agent.configuration) && <p className="text-xs text-muted-foreground">Need a configured specialist? <Link className="underline underline-offset-4" to="/agents">Open Agents</Link> to create or edit one. Team drafts are kept.</p>}
  </div>
}
