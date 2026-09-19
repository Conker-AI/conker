import { useMemo, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { Copy, Download, ExternalLink, Network, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { useConker, useConkerStore } from "@/lib/api/store"
import { conkerClient } from "@/lib/api"
import type { Memory } from "@/lib/api/models"
import { BaseLayout } from "@/components/layouts/base-layout"
import { DataTable } from "@/components/data-table"
import { CollectionSearch, CollectionEmpty, DetailPanel, OverlayBody, FormActions, RecordItem, ConfirmationDialog } from "@/components/design-system"
import { ReferenceSection } from "@/components/reference-section"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { usePageSection } from "@/hooks/use-page-navigation"
import { downloadAnswerFile } from "@/lib/rich-answer"
import { filterMemories, memoryGraph, memoryTitle, type MemoryNode } from "@/lib/memory-explorer"
import { memoryColumns } from "./columns"
import { MemoryGraph } from "./memory-graph"
import { MemoryTree } from "./memory-tree"
import { MemoryEditor } from "./memory-editor"

export default function MemoryPage() {
  const memories = useConker(data => data.memories)
  const memorySearch = useConker(data => data.memorySearch)
  const location = useLocation(), navigate = useNavigate()
  const section = usePageSection()
  const params = new URLSearchParams(location.search)
  const query = params.get("q") || "", category = params.get("category") || "all"
  const [includeSources, setIncludeSources] = useState(true)
  const [selection, setSelection] = useState<MemoryNode | null>(location.hash ? { id: `memory:${location.hash.slice(1)}`, kind: "memory", label: "Memory", memoryIds: [location.hash.slice(1)] } : null)
  const [editor, setEditor] = useState<Memory | "new" | null>(null)
  const [deleting, setDeleting] = useState<Memory | null>(null)
  const [deleteError, setDeleteError] = useState("")
  const pending = useConkerStore(state => state.pending)
  const notice = useConkerStore(state => state.notice)
  const mutate = useConkerStore(state => state.mutate)
  const visible = useMemo(() => filterMemories(memories, query, category), [memories, query, category])
  const graph = useMemo(() => memoryGraph(memories), [memories])
  const selectedMemories = memories.filter(memory => selection?.memoryIds.includes(memory.id))
  const selected = selection?.kind === "memory" ? selectedMemories[0] : undefined
  const inspectMemory = (memory: Memory) => setSelection({ id: `memory:${memory.id}`, kind: "memory", label: memoryTitle(memory), memoryIds: [memory.id] })
  const columns = useMemo(() => memoryColumns(memory => setSelection({ id: `memory:${memory.id}`, kind: "memory", label: memoryTitle(memory), memoryIds: [memory.id] })), [])
  const setFilter = (name: string, value: string) => {
    const next = new URLSearchParams(location.search)
    if (!value || value === "all") next.delete(name); else next.set(name, value)
    navigate({ pathname: "/memory", search: next.toString() }, { replace: true })
  }
  const clear = () => { const next = new URLSearchParams(location.search); next.delete("q"); next.delete("category"); navigate({ pathname: "/memory", search: next.toString() }, { replace: true }) }
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value); toast.success("Record copied") } catch { toast.error("Could not copy. Select the record text to copy it manually.") } }
  return <BaseLayout variant="collection" title="Memory" description="Explore what Conker knows, where it came from, and how it connects." status={<Badge variant="secondary">Preview data</Badge>}
    actions={<><Button variant="outline" disabled={!visible.length} onClick={() => downloadAnswerFile(JSON.stringify({ mode: "preview", records: visible }, null, 2), "conker-memory-preview.json", "application/json")}><Download />Export view</Button><Button onClick={() => setEditor("new")}><Plus />New memory</Button></>}>
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row"><CollectionSearch label="Search memories" value={query} onChange={event => setFilter("q", event.target.value)} placeholder="Find a memory, topic, source, or ID…" />
        <Select value={category} onValueChange={value => setFilter("category", value)}><SelectTrigger className="sm:w-48" aria-label="Filter memory category"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{[...new Set([...memories.map(memory => memory.category), ...(category !== "all" ? [category] : [])])].sort().map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"><div className="flex flex-wrap items-center gap-3"><span role="status">{visible.length} of {memories.length} records</span><span>Text search{memorySearch.degraded ? " · vector search unavailable in preview" : " · no semantic ranking"}</span>{(query || category !== "all") && <Button variant="ghost" size="sm" onClick={clear}>Clear filters</Button>}</div>
        {section === "graph" && <div className="flex items-center gap-2"><Switch id="graph-sources" checked={includeSources} onCheckedChange={setIncludeSources} /><Label htmlFor="graph-sources" className="text-xs">Source nodes</Label></div>}
      </div>
      {notice && <p role="status" className="text-xs text-muted-foreground">{notice}</p>}
      {!visible.length ? <CollectionEmpty title={memories.length ? "No matching memories" : "No memories yet"} description={memories.length ? "Try another phrase or clear the category filter." : "Add a preview note to start exploring connections."} onClear={query || category !== "all" ? clear : undefined} clearLabel="Clear filters" />
        : section === "database" ? <DataTable columns={columns} data={visible} itemLabel="records" renderItem={memory => <RecordItem title={memoryTitle(memory)} description={memory.text} onOpen={() => inspectMemory(memory)} meta={<><Badge variant="outline">{memory.category}</Badge><span>{memory.confidence} confidence</span><span>{memory.age}</span></>} />} />
        : section === "sources" ? <MemoryTree memories={visible} onOpen={inspectMemory} />
        : <MemoryGraph key={`${visible.map(memory => `${memory.id}:${memory.updatedAt || ""}`).join("|")}:${includeSources}`} memories={visible} includeSources={includeSources} onInspect={setSelection} />}
      <p className="text-xs leading-5 text-muted-foreground">{section === "graph" ? "Connections show saved topics and source references; distance is a layout choice, not a similarity score. " : ""}Sample records · 12 September 2026. Edits reset on reload. Audio, video, and file ingestion are not connected.</p>
    </div>
    <DetailPanel open={!!selection} onOpenChange={open => { if (!open) { setSelection(null); if (location.hash) navigate({ pathname: location.pathname, search: location.search }, { replace: true }) } }} title={selected ? memoryTitle(selected) : selection?.label || "Memory details"} description={selection?.kind === "topic" ? "Records grouped by this saved topic" : selection?.kind === "source" ? "Records linked to this source" : "Stored record, provenance, and connections"}>
      <OverlayBody>{selected ? <>
        <ReferenceSection title="Memory"><p lang={selected.language}>{selected.text}</p><div className="flex flex-wrap gap-2"><Badge variant="outline">{selected.category}</Badge><Badge variant="secondary">{selected.confidence} confidence</Badge></div><p className="text-xs text-muted-foreground">{selected.age} · {selected.updatedAt ? new Date(selected.updatedAt).toLocaleString() : "sample dated 12 September 2026"}</p></ReferenceSection>
        <ReferenceSection title="Connections">{selected.tags?.length ? <div className="flex flex-wrap gap-2">{selected.tags.map(tag => <Button key={tag} variant="outline" size="sm" onClick={() => setSelection(graph.nodes.find(node => node.id === `topic:${tag.toLocaleLowerCase()}`) || null)}><Network />{tag}</Button>)}</div> : <p className="text-sm text-muted-foreground">No topics yet. Edit this memory to connect it to a topic.</p>}<p className="text-xs text-muted-foreground">A shared topic is an organizational link, not proof that two claims agree.</p></ReferenceSection>
        <ReferenceSection title="Evidence"><p>{selected.provenance}</p>{selected.originalText && <div className="space-y-2"><Badge variant="outline">Edited in preview</Badge><p className="text-xs text-muted-foreground">Original record retained for comparison:</p><blockquote className="border-l pl-3 text-sm" lang={selected.language}>{selected.originalText}</blockquote></div>}<p className="text-xs text-muted-foreground">Confidence is stored metadata, not a guarantee of correctness.</p>{selected.origin !== "manual" && <Button variant="outline" size="sm" asChild><Link to={selected.source}><ExternalLink />Open original source</Link></Button>}</ReferenceSection>
        <ReferenceSection title="Database record"><p className="break-all font-mono text-xs">{selected.id}</p><details><summary className="cursor-pointer text-sm text-muted-foreground">View JSON payload</summary><pre className="mt-3 max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap break-all">{JSON.stringify(selected, null, 2)}</pre></details><Button size="sm" variant="outline" onClick={() => void copy(JSON.stringify(selected, null, 2))}><Copy />Copy record</Button></ReferenceSection>
      </> : selectedMemories.length ? <ReferenceSection title={`${selectedMemories.length} linked records`}><div className="divide-y">{selectedMemories.map(memory => <button key={memory.id} type="button" onClick={() => inspectMemory(memory)} className="block w-full rounded-md py-3 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"><span className="text-sm font-medium">{memoryTitle(memory)}</span><span className="mt-1 block text-xs text-muted-foreground">{memory.text}</span></button>)}</div>{selection?.source && <Button variant="outline" asChild><Link to={selection.source}><ExternalLink />Open source</Link></Button>}</ReferenceSection> : <p className="text-sm text-muted-foreground">This memory is no longer available.</p>}</OverlayBody>
      {selected && <FormActions inset><Button variant="outline" onClick={() => { setDeleteError(""); setDeleting(selected); setSelection(null) }}><Trash2 />Delete</Button><Button onClick={() => { setEditor(selected); setSelection(null) }}><Pencil />Edit memory</Button></FormActions>}
    </DetailPanel>
    {editor && <MemoryEditor key={editor === "new" ? "new" : editor.id} memory={editor === "new" ? undefined : editor} onClose={() => { if (editor !== "new") inspectMemory(editor); setEditor(null) }} onSaved={id => { setEditor(null); clear(); const memory = useConkerStore.getState().data?.memories.find(item => item.id === id); if (memory) inspectMemory(memory) }} />}
    <ConfirmationDialog open={!!deleting} onOpenChange={open => { if (!open) { if (deleting) inspectMemory(deleting); setDeleting(null) } }} title="Delete this preview memory?" description={`“${deleting ? memoryTitle(deleting) : ""}” will disappear from all three views. Its original source remains unchanged. Reload restores sample data.`} actionLabel="Delete preview memory" pending={pending} error={deleteError} onConfirm={async () => { if (!deleting) return; const success = await mutate(() => conkerClient.deleteMemory(deleting.id), "Memory removed from the preview. Source unchanged."); if (success) { setDeleting(null); setSelection(null) } else setDeleteError(useConkerStore.getState().error) }} />
  </BaseLayout>
}

