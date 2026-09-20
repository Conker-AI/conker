import { takeMutationError } from "./feedback"
import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Plus } from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"
import { CollectionEmpty, DetailPanel, FormActions, OverlayBody, RecordItem, TaskDialogContent } from "@/components/design-system"
import { ReferenceSection } from "@/components/reference-section"
import { DataTable } from "@/components/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { conkerClient } from "@/lib/api"
import { useConker, useConkerStore } from "@/lib/api/store"
import type { AgentInput } from "@/lib/api/models"
import type { AgentTemplateInput, AgentTemplateRecord } from "@/lib/api/agent-collaboration-types"
import { SearchableSelect } from "../../activity/searchable-select"
import { ConfigurationFields } from "./fields"
import { useCollaborationDraft } from "./use-draft"

const emptyTemplate: AgentTemplateInput = { name: "", description: "", agent: { name: "", role: "", instructions: "", modelId: null, toolIds: [], memory: { scope: "none", memoryIds: [] } } }

function TemplateEditor({ record, onClose }: { record?: AgentTemplateRecord; onClose: () => void }) {
  const { value, setValue, revision, stale, clear } = useCollaborationDraft(`template:${record?.id ?? "new"}`, record?.draft ?? emptyTemplate, record?.revision)
  const allAgents = useConker(data => data.agents)
  const agents = allAgents.filter(agent => !agent.archivedAt && agent.configuration)
  const [importId, setImportId] = useState("")
  const [error, setError] = useState("")
  const { mutate, pending } = useConkerStore()
  return <form className="space-y-6" onSubmit={async event => {
    event.preventDefault()
    const saved = await mutate(() => record ? conkerClient.collaboration.updateTemplate(record.id, value, revision!) : conkerClient.collaboration.createTemplate(value), "Template draft saved in preview. Publish a version before using it.")
    if (saved) { clear(); onClose() } else setError(takeMutationError())
  }}><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{record ? "Edit template draft" : "New template"}</h2><p className="mt-1 text-sm text-muted-foreground">Reusable configuration authored by you. Published versions remain unchanged.</p></div><Badge variant="outline">Preview</Badge></div>
    <fieldset disabled={pending || !!record?.archivedAt} className="space-y-6">
      <div className="grid gap-5 lg:grid-cols-2"><div className="space-y-2"><Label htmlFor="template-name">Template name</Label><Input id="template-name" required maxLength={80} value={value.name} onChange={event => setValue({ ...value, name: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="template-description">Purpose</Label><Textarea id="template-description" required maxLength={1000} value={value.description} onChange={event => setValue({ ...value, description: event.target.value })} /></div></div>
      <ReferenceSection title="Copy a configured specialist"><div className="flex flex-col gap-3 sm:flex-row"><div className="min-w-0 flex-1"><SearchableSelect id="template-import" label="Configured agents" options={agents.map(agent => ({ value: agent.id, label: agent.name }))} value={importId} onChange={setImportId} disabled={pending} /></div><Button type="button" variant="outline" disabled={!importId} onClick={() => { const agent = agents.find(item => item.id === importId); if (agent?.configuration) setValue({ ...value, agent: structuredClone(agent.configuration) }) }}>Copy configuration</Button></div><p className="text-xs text-muted-foreground">Copy replaces the configuration fields below. The original agent stays unchanged.</p></ReferenceSection>
      <ReferenceSection title="Agent defaults"><ConfigurationFields value={value.agent} onChange={agent => setValue({ ...value, agent })} /></ReferenceSection>
    </fieldset>
    {stale && <p role="alert" className="text-sm text-destructive">This template changed while the draft was open. Discard the draft and reopen it before saving.</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <FormActions description="Draft kept across navigation. Resets on reload."><Button type="button" variant="ghost" disabled={pending} onClick={() => { clear(); onClose() }}>Discard draft</Button><Button type="button" variant="outline" disabled={pending} onClick={onClose}>Back to templates</Button><Button type="submit" disabled={pending || stale || !!record?.archivedAt}>{pending ? "Saving…" : "Save draft"}</Button></FormActions>
  </form>
}

function InstantiateTemplate({ record, version, onClose }: { record: AgentTemplateRecord; version: number; onClose: () => void }) {
  const published = record.versions.find(item => item.version === version)!
  const { value, setValue, revision, stale, clear } = useCollaborationDraft(`instantiate:${record.id}:${version}`, { ...published.definition.agent, name: `${published.definition.agent.name} copy`.slice(0, 80) }, record.revision)
  const [reviewing, setReviewing] = useState(false)
  const [error, setError] = useState("")
  const { mutate, pending } = useConkerStore()
  const navigate = useNavigate()
  const changed = (Object.keys(value) as (keyof AgentInput)[]).filter(key => JSON.stringify(value[key]) !== JSON.stringify(published.definition.agent[key]))
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose() }}><TaskDialogContent size="wide" title={reviewing ? "Review new agent" : "Use template"} description={`${record.draft.name} · immutable version ${version}. Creating an agent grants no execution authority.`} showCloseButton={!pending} onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (pending) event.preventDefault() }}>
    <form className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={async event => {
      event.preventDefault()
      if (!reviewing) { setReviewing(true); return }
      let agentId = ""
      const saved = await mutate(async () => {
        const { name, ...configuration } = value
        const overrides = Object.fromEntries(Object.entries(configuration).filter(([key, field]) => JSON.stringify(field) !== JSON.stringify(published.definition.agent[key as keyof AgentInput])))
        const prepared = await conkerClient.collaboration.instantiateTemplate(record.id, version, { name, overrides }, revision!)
        agentId = (await conkerClient.createAgent(prepared.configuration)).id
      }, "Agent created from the reviewed template version. No run started.")
      if (saved) { clear(); onClose(); navigate(`/agents/${agentId}/edit`) } else setError(takeMutationError())
    }}><OverlayBody><fieldset disabled={pending} className="space-y-5">{reviewing ? <><ReferenceSection title={value.name}><p>{value.role}</p><p className="whitespace-pre-wrap text-sm">{value.instructions}</p><p className="text-sm">{value.toolIds.length} selected tools · {value.memory.scope} memory · {value.modelId ?? "Settings default model"}</p></ReferenceSection><ReferenceSection title="Overrides"><p className="text-sm">{changed.length ? changed.join(", ") : "No changes to the published defaults."}</p><p className="text-xs text-muted-foreground">Tool and memory selections replace the template’s selections. They are never combined into broader access.</p></ReferenceSection></> : <ConfigurationFields value={value} onChange={setValue} />}{stale && <p role="alert" className="text-sm text-destructive">The template changed. Discard this draft and reopen the published version for review.</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</fieldset></OverlayBody><FormActions inset description="Preview agent configuration · resets on reload"><Button type="button" variant="ghost" disabled={pending} onClick={() => { clear(); onClose() }}>Discard draft</Button><Button type="button" variant="outline" disabled={pending} onClick={() => reviewing ? setReviewing(false) : onClose()}>{reviewing ? "Back to edit" : "Close"}</Button><Button type="submit" disabled={pending || stale}>{pending ? "Creating…" : reviewing ? "Create agent" : "Review configuration"}</Button></FormActions></form>
  </TaskDialogContent></Dialog>
}

export function TemplatesPanel() {
  const records = useConker(data => data.collaboration.templates)
  const [params, setParams] = useSearchParams()
  const selected = records.find(record => record.id === params.get("template"))
  const [editing, setEditing] = useState<AgentTemplateRecord | "new" | null>(null)
  const [using, setUsing] = useState<{ record: AgentTemplateRecord; version: number } | null>(null)
  const [version, setVersion] = useState("")
  const [filter, setFilter] = useState("active")
  const [error, setError] = useState("")
  const { mutate, pending } = useConkerStore()
  const open = (record: AgentTemplateRecord) => { const next = new URLSearchParams(params); next.set("template", record.id); setParams(next); setVersion(String(record.versions.at(-1)?.version ?? "")); setError("") }
  const close = () => { const next = new URLSearchParams(params); next.delete("template"); setParams(next, { replace: true }); setError("") }
  const currentVersion = selected?.versions.find(item => String(item.version) === version)?.version ?? selected?.versions.at(-1)?.version
  const columns: ColumnDef<AgentTemplateRecord>[] = [
    { id: "name", accessorFn: record => `${record.draft.name} ${record.draft.description}`, header: "Template", cell: ({ row }) => <button type="button" onClick={() => open(row.original)} className="rounded-sm text-left font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring">{row.original.draft.name}</button> },
    { id: "versions", accessorFn: record => record.versions.length, header: "Published versions" },
    { id: "state", accessorFn: record => record.archivedAt ? "Archived" : "Draft available", header: "State" },
  ]
  if (editing) return <TemplateEditor key={editing === "new" ? "new" : editing.id} record={editing === "new" ? undefined : records.find(record => record.id === editing.id)} onClose={() => setEditing(null)} />
  return <div className="space-y-4"><p className="text-xs text-muted-foreground">Owner-authored templates. Publication keeps an immutable preview version; it does not publish a service.</p>{records.length ? <DataTable columns={columns} data={records.filter(record => filter === "all" || (filter === "archived" ? !!record.archivedAt : !record.archivedAt))} searchColumn="name" searchPlaceholder="Search templates…" itemLabel="templates" toolbarAction={<><Select value={filter} onValueChange={setFilter}><SelectTrigger size="sm" aria-label="Filter templates"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active templates</SelectItem><SelectItem value="archived">Archived templates</SelectItem><SelectItem value="all">All templates</SelectItem></SelectContent></Select><Button onClick={() => setEditing("new")}><Plus />New template</Button></>} renderItem={record => <RecordItem title={record.draft.name} description={record.draft.description} onOpen={() => open(record)} meta={<><Badge variant="outline">{record.archivedAt ? "Archived" : "Preview"}</Badge><span>{record.versions.length} published versions</span></>} />} /> : <CollectionEmpty title="Reuse your own agent configuration" description="Copy a configured specialist or write defaults, publish a version, then review the changes before creating another agent." action={<Button onClick={() => setEditing("new")}><Plus />New template</Button>} />}
    <DetailPanel open={!!selected && !using} onOpenChange={value => { if (!value) close() }} title={selected?.draft.name ?? "Template"} description="Draft and immutable published versions · preview" busy={pending}>{selected && <><OverlayBody><ReferenceSection title="Purpose"><p>{selected.draft.description}</p><p className="text-xs text-muted-foreground">Draft revision {selected.revision} · {selected.archivedAt ? "Archived" : "Available"}</p></ReferenceSection><ReferenceSection title="Draft defaults"><p>{selected.draft.agent.role}</p><p className="whitespace-pre-wrap text-sm">{selected.draft.agent.instructions}</p><p className="text-xs text-muted-foreground">{selected.draft.agent.toolIds.length} tools · {selected.draft.agent.memory.scope} memory</p></ReferenceSection><ReferenceSection title="Published versions">{selected.versions.length ? <><SearchableSelect id="template-version" label="Versions" value={String(currentVersion)} onChange={setVersion} disabled={pending} options={selected.versions.map(item => ({ value: String(item.version), label: `Version ${item.version} · ${new Date(item.publishedAt).toLocaleString()}` }))} /><p className="text-sm whitespace-pre-wrap">{selected.versions.find(item => item.version === currentVersion)?.definition.agent.instructions}</p></> : <p className="text-sm text-muted-foreground">Save and publish a version before instantiating this template.</p>}</ReferenceSection>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</OverlayBody><FormActions inset><Button variant="outline" disabled={pending} onClick={async () => { const saved = await mutate(() => conkerClient.collaboration.archiveTemplate(selected.id, !selected.archivedAt, selected.revision), "Template archive state saved in preview."); setError(saved ? "" : takeMutationError()) }}>{selected.archivedAt ? "Restore" : "Archive"}</Button>{!selected.archivedAt && <><Button variant="outline" disabled={pending} onClick={() => setEditing(selected)}>Edit draft</Button><Button variant="outline" disabled={pending} onClick={async () => { const saved = await mutate(() => conkerClient.collaboration.publishTemplate(selected.id, selected.revision), "Immutable template version published in preview."); setError(saved ? "" : takeMutationError()) }}>Publish version</Button><Button disabled={pending || !currentVersion} onClick={() => setUsing({ record: structuredClone(selected), version: currentVersion! })}>Use version</Button></>}</FormActions></>}</DetailPanel>
    {using && <InstantiateTemplate record={using.record} version={using.version} onClose={() => setUsing(null)} />}
  </div>
}
