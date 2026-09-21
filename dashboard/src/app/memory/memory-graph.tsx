import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { ReactFlow, Background, Handle, Position, applyNodeChanges, BaseEdge, type EdgeProps, type Node, type NodeProps, type ReactFlowInstance } from "@xyflow/react"
import { FileText, Folder, Maximize, Minus, Plus, RotateCcw, ScanSearch } from "lucide-react"
import { Button } from "@/components/ui/button"
import { memoryNeighborhood } from "@/lib/memory-explorer"
import { layoutMemoryGraph, type WorkspaceNode, type WorkspaceEdge } from "@/lib/memory-layout"
import { cn } from "@/lib/utils"
import "@xyflow/react/dist/style.css"
import "./memory-graph.css"

type Point = Node<{ record: WorkspaceNode; emphasized: boolean; dimmed: boolean; detailed: boolean }, "memoryPoint">
function MemoryPoint({ data }: NodeProps<Point>) {
  const { record, emphasized, dimmed, detailed } = data
  return <div style={{ "--point-color": `var(--memory-category-${record.colorIndex % 5 + 1})` } as CSSProperties} className={cn("memory-point", `memory-point-${record.kind}`, emphasized && "is-emphasized", dimmed && "is-dimmed", detailed && "is-detailed")}>
    <Handle type="target" position={Position.Top} isConnectable={false} />
    <div className="memory-point-symbol">{record.kind === "folder" ? <Folder size={18} /> : record.kind === "source" ? <FileText size={12} /> : <span />}</div>
    <span className="memory-point-label">{record.label}</span>
    <Handle type="source" position={Position.Bottom} isConnectable={false} />
  </div>
}
function MemoryLink({ sourceX, sourceY, targetX, targetY, style, markerEnd }: EdgeProps) {
  const bend = Math.min(100, Math.abs(targetX - sourceX) * .2 + 24)
  return <BaseEdge path={`M ${sourceX},${sourceY} C ${sourceX + bend},${sourceY} ${targetX - bend},${targetY} ${targetX},${targetY}`} style={style} markerEnd={markerEnd} />
}
const nodeTypes = { memoryPoint: MemoryPoint }
const edgeTypes = { memoryLink: MemoryLink }
export function MemoryGraph({ graph, hierarchy, selectedId, focusRequest, onSelect }: { graph: { nodes: WorkspaceNode[]; edges: WorkspaceEdge[] }; hierarchy: boolean; selectedId: string; focusRequest: string; onSelect: (node: WorkspaceNode | null) => void }) {
  const initial = useMemo(() => {
    const positions = layoutMemoryGraph(graph.nodes, graph.edges, hierarchy)
    return graph.nodes.map(record => ({ id: record.id, type: "memoryPoint" as const, position: positions.get(record.id) || { x: 0, y: 0 }, data: { record, emphasized: false, dimmed: false, detailed: false }, ariaLabel: `${record.displayKind ?? record.kind}: ${record.label}. Select to inspect.`, style: { width: 120, height: 36 }, deletable: false }))
  }, [graph, hierarchy])
  const [nodes, setNodes] = useState<Point[]>(initial)
  const [previousInitial, setPreviousInitial] = useState(initial)
  if (previousInitial !== initial) {
    const positions = new Map(nodes.map(node => [node.id, node.position]))
    setPreviousInitial(initial)
    setNodes(initial.map(node => ({ ...node, position: positions.get(node.id) ?? node.position })))
  }
  const [instance, setInstance] = useState<ReactFlowInstance<Point> | null>(null)
  const [hoverId, setHoverId] = useState("")
  const [focus, setFocus] = useState(false)
  const [depth, setDepth] = useState(1)
  const [zoom, setZoom] = useState(.5)
  const canvas = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!instance || !selectedId || !canvas.current) return
    let frame = 0
    const reveal = (force = false) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const node = instance.getNode(selectedId), rect = canvas.current?.getBoundingClientRect()
        if (!node || !rect) return
        const viewport = instance.getViewport(), nextZoom = force ? 1.1 : viewport.zoom
        const x = node.position.x + 60, y = node.position.y + 18
        const screenX = x * viewport.zoom + viewport.x, screenY = y * viewport.zoom + viewport.y
        if (force || screenX < 70 || screenX > rect.width - 70 || screenY < 60 || screenY > rect.height - 90)
          void instance.setViewport({ x: rect.width / 2 - x * nextZoom, y: rect.height / 2 - y * nextZoom, zoom: nextZoom })
      })
    }
    reveal(!!focusRequest)
    const resize = new ResizeObserver(() => reveal(!!focusRequest))
    resize.observe(canvas.current)
    return () => { cancelAnimationFrame(frame); resize.disconnect() }
  }, [instance, focusRequest, selectedId])
  const active = graph.nodes.find(node => node.id === selectedId)
  const highlighted = memoryNeighborhood(hoverId || selectedId, graph.edges, 1)
  const neighborhood = active && focus ? memoryNeighborhood(active.id, graph.edges, depth) : null
  const visibleNodes = nodes.filter(node => !neighborhood || neighborhood.has(node.id)).map(node => ({ ...node, selected: selectedId === node.id, data: { ...node.data, emphasized: highlighted.has(node.id), dimmed: !!(hoverId || selectedId) && !highlighted.has(node.id), detailed: (zoom > .85 && !(hoverId || selectedId)) || highlighted.has(node.id) || node.data.record.kind === "folder" } }))
  const edges = graph.edges.filter(edge => !neighborhood || (neighborhood.has(edge.source) && neighborhood.has(edge.target))).map(edge => {
    const emphasized = edge.source === (hoverId || selectedId) || edge.target === (hoverId || selectedId)
    const color = graph.nodes.find(node => node.id === edge.target)?.colorIndex || 0
    return { ...edge, type: "memoryLink", focusable: false, selectable: false, style: { stroke: `var(--memory-category-${color % 5 + 1})`, strokeWidth: emphasized ? 2 : edge.kind === "parent" ? 1.3 : .85, strokeOpacity: emphasized ? .95 : (hoverId || selectedId) ? .12 : edge.kind === "parent" ? .5 : .28, strokeDasharray: edge.kind === "topic" ? "3 5" : undefined } }
  })
  return <div ref={canvas} className="memory-graph-shell" role="region" aria-label={hierarchy ? "Memory hierarchy canvas" : "Memory network canvas"}>
    <ReactFlow<Point> nodes={visibleNodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onInit={setInstance}
      onNodesChange={changes => { setNodes(current => applyNodeChanges(changes, current)); const selection = changes.find(change => change.type === "select" && change.selected); if (selection?.type === "select") onSelect(graph.nodes.find(node => node.id === selection.id) || null) }}
      onNodeClick={(_, node) => onSelect(node.data.record)} onNodeMouseEnter={(_, node) => setHoverId(node.id)} onNodeMouseLeave={() => setHoverId("")}
      onMove={(_, viewport) => setZoom(viewport.zoom)} onPaneClick={() => { if (!focus) onSelect(null) }}
      nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null} fitView fitViewOptions={{ padding: .16, maxZoom: .9 }} minZoom={.08} maxZoom={2.5} aria-label="Memory connections">
      <Background gap={32} size={.7} color="var(--border)" />
    </ReactFlow>
    <div className="memory-canvas-caption pointer-events-none"><span className="font-medium text-foreground">{hierarchy ? "Hierarchy + connections" : "Memory constellation"}</span><span>{visibleNodes.length} points · {edges.length} connections</span></div>
    <div className="memory-canvas-controls"><div className="flex gap-1 rounded-lg border bg-background p-1">
      <Button size="icon" variant="ghost" aria-label="Zoom in" title="Zoom in" onClick={() => void instance?.zoomIn()}><Plus /></Button>
      <Button size="icon" variant="ghost" aria-label="Zoom out" title="Zoom out" onClick={() => void instance?.zoomOut()}><Minus /></Button>
      <Button size="icon" variant="ghost" aria-label="Fit all points" title="Fit all points" onClick={() => void instance?.fitView({ padding: .16, maxZoom: 1 })}><Maximize /></Button>
      <Button size="icon" variant="ghost" aria-label="Reset positions" title="Reset positions" onClick={() => { setNodes(initial); setFocus(false); requestAnimationFrame(() => void instance?.fitView({ padding: .16, maxZoom: .9 })) }}><RotateCcw /></Button>
    </div>{active && <div className="flex gap-1 rounded-lg border bg-background p-1"><Button size="sm" variant={focus ? "secondary" : "ghost"} onClick={() => { setFocus(!focus); setDepth(1) }}><ScanSearch />{focus ? "Show all" : "Neighbors"}</Button>{focus && <Button size="sm" variant="ghost" onClick={() => setDepth(depth === 1 ? 2 : 1)}>{depth === 1 ? "2 hops" : "1 hop"}</Button>}</div>}</div>
    <span className="memory-zoom pointer-events-none">{Math.round(zoom * 100)}% · drag to explore</span>
  </div>
}
