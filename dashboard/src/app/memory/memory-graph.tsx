import { useMemo, useState } from "react"
import { ReactFlow, Background, Handle, Position, applyNodeChanges, type Node, type NodeProps, type ReactFlowInstance } from "@xyflow/react"
import { FileText, Hash, Maximize, Minus, Plus, RotateCcw, ScanSearch, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { memoryGraph, memoryNeighborhood, type MemoryNode } from "@/lib/memory-explorer"
import type { Memory } from "@/lib/api/models"
import { cn } from "@/lib/utils"
import "@xyflow/react/dist/style.css"
import "./memory-graph.css"

type Point = Node<{ record: MemoryNode; emphasized: boolean; dimmed: boolean }, "memoryPoint">
function MemoryPoint({ data }: NodeProps<Point>) {
  const { record, emphasized, dimmed } = data
  return <div className={cn("memory-point", `memory-point-${record.kind}`, emphasized && "is-emphasized", dimmed && "is-dimmed")}>
    <Handle type="target" position={Position.Top} isConnectable={false} />
    <div className="memory-point-symbol">{record.kind === "source" ? <FileText size={16} /> : record.kind === "topic" ? <Hash size={14} /> : <span className="memory-point-core" />}</div>
    <span className="memory-point-label">{record.label}</span>
    <Handle type="source" position={Position.Bottom} isConnectable={false} />
  </div>
}
const nodeTypes = { memoryPoint: MemoryPoint }
function positionNodes(records: MemoryNode[]): Point[] {
  const groups = ["topic", "memory", "source"] as const
  return groups.flatMap((kind, row) => {
    const items = records.filter(node => node.kind === kind)
    return items.map((record, index) => ({ id: record.id, type: "memoryPoint" as const, position: { x: (index - (items.length - 1) / 2) * 210 + 500, y: row * 165 + (index % 2) * 20 }, data: { record, emphasized: false, dimmed: false }, ariaLabel: `${record.kind}: ${record.label}. Select to inspect connections.`, style: { width: 180 }, deletable: false }))
  })
}

/** Canvas positions are local UI state. No edge represents computed vector similarity. */
export function MemoryGraph({ memories, includeSources, onInspect }: { memories: Memory[]; includeSources: boolean; onInspect: (node: MemoryNode) => void }) {
  const graph = useMemo(() => memoryGraph(memories, includeSources), [memories, includeSources])
  const initial = useMemo(() => positionNodes(graph.nodes), [graph.nodes])
  const [nodes, setNodes] = useState(initial)
  const [instance, setInstance] = useState<ReactFlowInstance<Point> | null>(null)
  const [activeId, setActiveId] = useState("")
  const [hoverId, setHoverId] = useState("")
  const [focus, setFocus] = useState(false)
  const [depth, setDepth] = useState(1)
  const active = graph.nodes.find(node => node.id === activeId)
  const highlighted = memoryNeighborhood(hoverId || activeId, graph.edges, 1)
  const neighborhood = active && focus ? memoryNeighborhood(active.id, graph.edges, depth) : null
  const visibleNodes = nodes.filter(node => !neighborhood || neighborhood.has(node.id)).map(node => ({ ...node, selected: activeId === node.id, data: { ...node.data, emphasized: highlighted.has(node.id), dimmed: !!(hoverId || activeId) && !highlighted.has(node.id) } }))
  const edges = graph.edges.filter(edge => !neighborhood || (neighborhood.has(edge.source) && neighborhood.has(edge.target))).map(edge => {
    const emphasized = edge.source === (hoverId || activeId) || edge.target === (hoverId || activeId)
    return { ...edge, type: "straight", focusable: false, selectable: false, style: { stroke: emphasized ? "var(--primary)" : "var(--muted-foreground)", strokeWidth: emphasized ? 2 : 1, strokeOpacity: emphasized ? 1 : .6, strokeDasharray: edge.kind === "topic" ? "4 5" : undefined } }
  })
  return <div className="memory-graph-shell overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted px-4 py-3">
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-2"><span className="size-2 rounded-full bg-primary" />Memory</span><span className="flex items-center gap-2"><Hash className="size-3.5" />Topic · dotted link</span><span className="flex items-center gap-2"><FileText className="size-3.5" />Source · solid link</span></div>
      <span className="text-xs tabular-nums text-muted-foreground">{visibleNodes.length} nodes · {edges.length} links</span>
    </div>
    <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
      <Select value={activeId} onValueChange={id => { setActiveId(id); setFocus(false); void instance?.fitView({ nodes: [{ id }], maxZoom: 1.1, padding: .5 }) }}><SelectTrigger size="sm" className="w-full sm:w-64" aria-label="Select graph point"><SelectValue placeholder="Jump to a point…" /></SelectTrigger><SelectContent>{graph.nodes.map(node => <SelectItem value={node.id} key={node.id}>{node.label} · {node.kind}</SelectItem>)}</SelectContent></Select>
      <span className="text-xs text-muted-foreground">Drag to arrange · scroll or pinch to zoom</span>
    </div>
    <div className="memory-graph-canvas" role="region" aria-label="Interactive memory graph">
      <ReactFlow<Point> nodes={visibleNodes} edges={edges} nodeTypes={nodeTypes} onInit={setInstance}
        onNodesChange={changes => { setNodes(current => applyNodeChanges(changes, current)); const selection = changes.find(change => change.type === "select" && change.selected); if (selection?.type === "select") setActiveId(selection.id) }}
        onNodeClick={(_, node) => setActiveId(node.id)} onNodeMouseEnter={(_, node) => setHoverId(node.id)} onNodeMouseLeave={() => setHoverId("")}
        onPaneClick={() => { if (!focus) setActiveId("") }}
        nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null} fitView fitViewOptions={{ padding: .15, minZoom: .65, maxZoom: 1 }} minZoom={.25} maxZoom={2.5}
        onNodeDoubleClick={(_, node) => onInspect(node.data.record)} aria-label="Memory connections">
        <Background gap={24} size={1} color="var(--border)" />
      </ReactFlow>
      <div className="absolute bottom-4 left-4 flex gap-1 rounded-lg border bg-background p-1 shadow-sm" aria-label="Graph controls">
        <Button size="sm" variant="ghost" aria-label="Zoom in" title="Zoom in" onClick={() => void instance?.zoomIn()}><Plus /></Button>
        <Button size="sm" variant="ghost" aria-label="Zoom out" title="Zoom out" onClick={() => void instance?.zoomOut()}><Minus /></Button>
        <Button size="sm" variant="ghost" aria-label="Fit graph" title="Fit graph" onClick={() => void instance?.fitView({ padding: .15, maxZoom: 1 })}><Maximize /></Button>
        <Button size="sm" variant="ghost" aria-label="Reset graph layout" title="Reset graph layout" onClick={() => { setNodes(initial); setFocus(false); setActiveId(""); requestAnimationFrame(() => void instance?.fitView({ padding: .15, minZoom: .65, maxZoom: 1 })) }}><RotateCcw /></Button>
      </div>
    </div>
    <div className="flex min-h-20 flex-wrap items-center justify-between gap-3 border-t px-4 py-3" aria-live="polite">
      {active ? <><div className="min-w-0"><div className="flex items-center gap-2"><Badge variant="outline">{active.kind}</Badge><p className="max-w-md truncate text-sm font-medium">{active.label}</p></div><p className="mt-1 text-xs text-muted-foreground">{graph.edges.filter(edge => edge.source === active.id || edge.target === active.id).length} direct connections · {active.memoryIds.length} linked {active.memoryIds.length === 1 ? "record" : "records"}</p></div>
        <div className="flex flex-wrap gap-2">{focus && <Button size="sm" variant="outline" onClick={() => setDepth(depth === 1 ? 2 : 1)}>{depth === 1 ? "Expand to 2 hops" : "Show 1 hop"}</Button>}
          <Button size="sm" variant="outline" onClick={() => { setFocus(!focus); setDepth(1) }}>{focus ? <X /> : <ScanSearch />}{focus ? "Show all" : "Focus connections"}</Button>
          <Button size="sm" onClick={() => onInspect(active)}><Search />Inspect</Button></div></>
        : <div><p className="text-sm font-medium">Follow a connection.</p><p className="mt-1 text-xs text-muted-foreground">Select a point to highlight its neighbors. Drag points to arrange; drag the canvas to pan. Double-click to inspect.</p></div>}
    </div>
  </div>
}
