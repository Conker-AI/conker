import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { Copy, Download, ExternalLink, Network, Pencil, Plus, Trash2, Maximize2, Minimize2, FolderTree, SlidersHorizontal } from "lucide-react"
import { toast } from "sonner"
import { useConker, useConkerStore } from "@/lib/api/store"
import { conkerClient } from "@/lib/api"
import type { Memory } from "@/lib/api/models"
import { BaseLayout } from "@/components/layouts/base-layout"
import { DataTable } from "@/components/data-table"
import { CollectionSearch, CollectionEmpty, WorkspaceInspector, OverlayBody, FormActions, RecordItem, ConfirmationDialog } from "@/components/design-system"
import { ReferenceSection } from "@/components/reference-section"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { workspaceGraph, type WorkspaceNode } from "@/lib/memory-layout"
import { memoryDemo } from "@/lib/memory-demo"
import { MemoryFinder } from "./memory-finder"
import { downloadAnswerFile } from "@/lib/rich-answer"
import { filterMemories, memoryTitle } from "@/lib/memory-explorer"
import { memoryColumns } from "./columns"
import { MemoryGraph } from "./memory-graph"
import { MemoryTree } from "./memory-tree"
import { MemoryEditor } from "./memory-editor"

export default function MemoryPage() {
  const storedMemories = useConker(data => data.memories)
  const location = useLocation(), navigate = useNavigate()
  const params = new URLSearchParams(location.search)
  const query = params.get("q") || "", category = params.get("category") || "all"
  const requestedView = params.get("view") || params.get("tab")
  const section = requestedView === "database" ? "database" : requestedView === "sources" || requestedView === "hierarchy" ? "hierarchy" : "graph"
  const demo = params.get("data") !== "sample" && !location.hash
  const memories = demo ? memoryDemo : storedMemories
  const [expanded, setExpanded] = useState(false)
  const [treeOpen, setTreeOpen] = useState(section === "hierarchy")
  const [focusRequest, setFocusRequest] = useState("")
  const workspaceRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!expanded) return
    const shell = workspaceRef.current?.closest('[data-slot="sidebar-wrapper"]')
    const hidden = Array.from(shell?.querySelectorAll<HTMLElement>('[data-slot="appbar"], [data-slot="sidebar"]') || [])
    hidden.forEach(element => { element.inert = true })
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !document.querySelector('[role="dialog"], [data-slot="popover-content"]')) setExpanded(false) }
    document.addEventListener("keydown", escape)
    return () => { document.removeEventListener("keydown", escape); hidden.forEach(element => { element.inert = false }) }
  }, [expanded])
  const [includeSources, setIncludeSources] = useState(true)
  const [selection, setSelection] = useState<WorkspaceNode | null>(location.hash ? { id: `memory:${location.hash.slice(1)}`, kind: "memory", colorIndex: 0, label: "Memory", memoryIds: [location.hash.slice(1)] } : null)
  const [editor, setEditor] = useState<Memory | "new" | null>(null)
  const [deleting, setDeleting] = useState<Memory | null>(null)
  const [deleteError, setDeleteError] = useState("")
  const pending = useConkerStore(state => state.pending)
  const notice = useConkerStore(state => state.notice)
  const mutate = useConkerStore(state => state.mutate)
  const visible = useMemo(() => filterMemories(memories, query, category), [memories, query, category])
  const graph = useMemo(() => workspaceGraph(memories, section === "hierarchy"), [memories, section])
  const filteredGraph = useMemo(() => {
    const projected = workspaceGraph(visible, section === "hierarchy")
    const colors = new Map(graph.nodes.map(node => [node.id, node.colorIndex]))
    const nodes = projected.nodes.filter(node => includeSources || node.kind !== "source").map(node => ({ ...node, colorIndex: colors.get(node.id) ?? node.colorIndex }))
    const ids = new Set(nodes.map(node => node.id))
    return { nodes, edges: projected.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)) }
  }, [visible, includeSources, section, graph])
  const choosePoint = (node: WorkspaceNode) => { setSelection(node); setFocusRequest(`${node.id}|${Date.now()}`) }
  const closeInspector = () => { setSelection(null); setFocusRequest(""); if (location.hash) { const next = new URLSearchParams(location.search); next.set("data", "sample"); navigate({ pathname: location.pathname, search: next.toString() }, { replace: true }) } }
  const selectedMemories = memories.filter(memory => selection?.memoryIds.includes(memory.id))
  const selected = selection?.kind === "memory" ? selectedMemories[0] : undefined
  const inspectMemory = (memory: Memory) => setSelection({ id: `memory:${memory.id}`, kind: "memory", colorIndex: 0, label: memoryTitle(memory), memoryIds: [memory.id] })
  const columns = useMemo(() => memoryColumns(memory => setSelection({ id: `memory:${memory.id}`, kind: "memory", colorIndex: 0, label: memoryTitle(memory), memoryIds: [memory.id] })), [])
  const setFilter = (name: string, value: string) => {
    setFocusRequest("")
    const next = new URLSearchParams(location.search)
    if (!value || value === "all") next.delete(name); else next.set(name, value)
    navigate({ pathname: "/memory", search: next.toString() }, { replace: true })
  }
  const clear = () => { const next = new URLSearchParams(location.search); next.delete("q"); next.delete("category"); navigate({ pathname: "/memory", search: next.toString() }, { replace: true }) }
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value); toast.success("Record copied") } catch { toast.error("Could not copy. Select the record text to copy it manually.") } }
  return <BaseLayout variant="canvas">
    <div ref={workspaceRef} className={`memory-workspace${expanded ? " memory-workspace-expanded" : ""}`}>
      <div className="memory-workspace-toolbar">
        <Select value={section} onValueChange={value => { setFilter("view", value); if (value === "hierarchy") setTreeOpen(true) }}><SelectTrigger aria-label="Memory view" className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="graph">Network</SelectItem><SelectItem value="hierarchy">Hierarchy</SelectItem><SelectItem value="database">Database</SelectItem></SelectContent></Select>
        <MemoryFinder nodes={filteredGraph.nodes} onSelect={choosePoint} />
        <div className="memory-toolbar-spacer" />
        <Select value={demo ? "demo" : "sample"} onValueChange={value => { setSelection(null); const next = new URLSearchParams(location.search); next.set("data", value); next.delete("q"); next.delete("category"); navigate({ pathname: "/memory", search: next.toString() }, { replace: true }) }}><SelectTrigger aria-label="Memory dataset" className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="demo">Illustrative demo</SelectItem><SelectItem value="sample">Sample records</SelectItem></SelectContent></Select>
        <Popover><PopoverTrigger asChild><Button variant="outline" size="icon" aria-label="Filter memories"><SlidersHorizontal /></Button></PopoverTrigger><PopoverContent align="end" className="space-y-4"><CollectionSearch label="Search memories" value={query} onChange={event => setFilter("q", event.target.value)} placeholder="Filter memory text…" /><Select value={category} onValueChange={value => setFilter("category", value)}><SelectTrigger aria-label="Filter memory category"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{[...new Set(memories.map(memory => memory.category))].sort().map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select><div className="flex items-center gap-2"><Switch id="graph-sources" checked={includeSources} onCheckedChange={setIncludeSources} /><Label htmlFor="graph-sources">Source points</Label></div><Button variant="ghost" size="sm" onClick={clear}>Clear filters</Button><Button variant="outline" size="sm" disabled={!visible.length} onClick={() => downloadAnswerFile(JSON.stringify({ mode: demo ? "illustrative-demo" : "preview", records: visible }, null, 2), "conker-memory-preview.json", "application/json")}><Download />Export JSON</Button></PopoverContent></Popover>
        {section !== "database" && <Button size="icon" variant={treeOpen ? "secondary" : "outline"} aria-label="Toggle folder browser" aria-pressed={treeOpen} onClick={() => setTreeOpen(!treeOpen)}><FolderTree /></Button>}
        {!demo && <Button size="icon" aria-label="New memory" onClick={() => setEditor("new")}><Plus /></Button>}
        <Button size="icon" variant="outline" aria-label={expanded ? "Restore workspace" : "Maximize workspace"} onClick={() => setExpanded(!expanded)}>{expanded ? <Minimize2 /> : <Maximize2 />}</Button>
      </div>
      <div className="memory-workspace-body">
        {treeOpen && section !== "database" && <MemoryTree memories={visible} selectedId={selection?.memoryIds[0]} onOpen={memory => choosePoint(graph.nodes.find(node => node.id === `memory:${memory.id}`)!)} />}
        <div className={`memory-stage${section === "database" ? " memory-stage-table" : ""}`}>
          {!visible.length ? <CollectionEmpty title="No matching memories" description="Clear filters to return to the full workspace." onClear={clear} clearLabel="Clear filters" />
          : section === "database" ? <DataTable columns={columns} data={visible} itemLabel="records" renderItem={memory => <RecordItem title={memoryTitle(memory)} description={memory.text} onOpen={() => inspectMemory(memory)} meta={<><Badge variant="outline">{memory.category}</Badge><span>{memory.confidence} confidence</span></>} />} />
          : <MemoryGraph key={`${section}:${demo}:${visible.map(memory => `${memory.id}:${memory.updatedAt || ""}`).join("|")}:${includeSources}`} graph={filteredGraph} hierarchy={section === "hierarchy"} selectedId={selection?.id || ""} focusRequest={focusRequest} onSelect={setSelection} />}
        </div>
        {selection && <WorkspaceInspector onClose={closeInspector} title={selected ? memoryTitle(selected) : selection.label} description={selection.kind === "folder" ? "Parent–child organization" : selection.kind === "topic" ? "Shared topic connections" : demo ? "Illustrative record · not your personal data" : "Record and source evidence"}>
      <OverlayBody>{selected ? <>
        <ReferenceSection title="Memory"><p lang={selected.language}>{selected.text}</p><div className="flex flex-wrap gap-2"><Badge variant="outline">{selected.category}</Badge><Badge variant="secondary">{selected.confidence} confidence</Badge></div><p className="text-xs text-muted-foreground">{selected.age} · {selected.updatedAt ? new Date(selected.updatedAt).toLocaleString() : "sample dated 12 September 2026"}</p></ReferenceSection>
        <ReferenceSection title="Connections">{selected.tags?.length ? <div className="flex flex-wrap gap-2">{selected.tags.map(tag => <Button key={tag} variant="outline" size="sm" onClick={() => setSelection(graph.nodes.find(node => node.id === `topic:${tag.toLocaleLowerCase()}`) || null)}><Network />{tag}</Button>)}</div> : <p className="text-sm text-muted-foreground">No topics yet. Edit this memory to connect it to a topic.</p>}<p className="text-xs text-muted-foreground">A shared topic is an organizational link, not proof that two claims agree.</p></ReferenceSection>
        <ReferenceSection title="Evidence"><p>{selected.provenance}</p>{selected.originalText && <div className="space-y-2"><Badge variant="outline">Edited in preview</Badge><p className="text-xs text-muted-foreground">Original record retained for comparison:</p><blockquote className="border-l pl-3 text-sm" lang={selected.language}>{selected.originalText}</blockquote></div>}<p className="text-xs text-muted-foreground">Confidence is stored metadata, not a guarantee of correctness.</p>{selected.origin !== "manual" && <Button variant="outline" size="sm" asChild><Link to={selected.source}><ExternalLink />Open original source</Link></Button>}</ReferenceSection>
        <ReferenceSection title="Database record"><p className="break-all font-mono text-xs">{selected.id}</p><details><summary className="cursor-pointer text-sm text-muted-foreground">View JSON payload</summary><pre className="mt-3 max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap break-all">{JSON.stringify(selected, null, 2)}</pre></details><Button size="sm" variant="outline" onClick={() => void copy(JSON.stringify(selected, null, 2))}><Copy />Copy record</Button></ReferenceSection>
      </> : selectedMemories.length ? <ReferenceSection title={`${selectedMemories.length} linked records`}><div className="divide-y">{selectedMemories.map(memory => <button key={memory.id} type="button" onClick={() => inspectMemory(memory)} className="block w-full rounded-md py-3 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"><span className="text-sm font-medium">{memoryTitle(memory)}</span><span className="mt-1 block text-xs text-muted-foreground">{memory.text}</span></button>)}</div>{selection?.source && <Button variant="outline" asChild><Link to={selection.source}><ExternalLink />Open source</Link></Button>}</ReferenceSection> : <p className="text-sm text-muted-foreground">This memory is no longer available.</p>}</OverlayBody>
      {selected && !demo && <FormActions inset><Button variant="outline" onClick={() => { setDeleteError(""); setDeleting(selected); setSelection(null) }}><Trash2 />Delete</Button><Button onClick={() => { setEditor(selected); setSelection(null) }}><Pencil />Edit memory</Button></FormActions>}
    </WorkspaceInspector>}
      </div>
      <div className="memory-workspace-status"><span role="status">{visible.length} records · {demo ? "Illustrative demo · read-only" : "Preview · edits reset on reload"}</span><span className="hidden md:inline">Solid: parent / source · dotted: shared topic</span>{(query || category !== "all") && <Button size="sm" variant="ghost" onClick={clear}>Clear filters</Button>}{notice && !demo && <span role="status">{notice}</span>}</div>
    </div>
    {editor && <MemoryEditor key={editor === "new" ? "new" : editor.id} memory={editor === "new" ? undefined : editor} onClose={() => { if (editor !== "new") inspectMemory(editor); setEditor(null) }} onSaved={id => { setEditor(null); clear(); const memory = useConkerStore.getState().data?.memories.find(item => item.id === id); if (memory) inspectMemory(memory) }} />}
    <ConfirmationDialog open={!!deleting} onOpenChange={open => { if (!open) { if (deleting) inspectMemory(deleting); setDeleting(null) } }} title="Delete this preview memory?" description={`“${deleting ? memoryTitle(deleting) : ""}” will disappear from all three views. Its original source remains unchanged. Reload restores sample data.`} actionLabel="Delete preview memory" pending={pending} error={deleteError} onConfirm={async () => { if (!deleting) return; const success = await mutate(() => conkerClient.deleteMemory(deleting.id), "Memory removed from the preview. Source unchanged."); if (success) { setDeleting(null); setSelection(null) } else setDeleteError(useConkerStore.getState().error) }} />
  </BaseLayout>
}

