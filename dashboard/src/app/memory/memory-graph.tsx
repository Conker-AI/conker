import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { ReactFlow, Handle, Position, applyNodeChanges, BaseEdge, type EdgeProps, type Node, type NodeProps, type ReactFlowInstance } from "@xyflow/react"
import { FileText, Maximize, Minus, Plus, RotateCcw, ScanSearch } from "lucide-react"
import { Button } from "@/components/ui/button"
import { memoryNeighborhood } from "@/lib/memory-explorer"
import { layoutMemoryGraph, type WorkspaceNode, type WorkspaceEdge } from "@/lib/memory-layout"
import { cn } from "@/lib/utils"
import "@xyflow/react/dist/style.css"
import "./memory-graph.css"

type Point = Node<{ record: WorkspaceNode; emphasized: boolean; dimmed: boolean; detailed: boolean; hierarchy: boolean; moved: boolean }, "memoryPoint">
function MemoryPoint({ data }: NodeProps<Point>) {
  const { record, emphasized, dimmed, detailed, hierarchy } = data
  return <div title={record.label} style={{ "--point-color": `var(--memory-category-${record.colorIndex % 5 + 1})` } as CSSProperties} className={cn("memory-point", `memory-point-${record.kind}`, hierarchy && "is-tree", emphasized && "is-emphasized", dimmed && "is-dimmed", detailed && "is-detailed")}>
    <Handle type="target" position={hierarchy ? Position.Left : Position.Top} isConnectable={false} />
    <div className="memory-point-symbol">{record.kind === "folder" ? <span>{record.memoryIds.length}</span> : record.kind === "source" ? <FileText size={12} /> : <span />}</div>
    <span className="memory-point-label">{record.label}</span>
    <Handle type="source" position={hierarchy ? Position.Right : Position.Bottom} isConnectable={false} />
  </div>
}
function MemoryLink({ sourceX, sourceY, targetX, targetY, style, markerEnd, label, labelStyle, labelBgStyle, data }: EdgeProps) {
  const middle = (sourceX + targetX) / 2
  const control = middle - (data?.hierarchy ? 35 + Math.abs(targetY - sourceY) * .25 : 0)
  return <BaseEdge path={`M ${sourceX},${sourceY} C ${control},${sourceY} ${control},${targetY} ${targetX},${targetY}`} style={style} markerEnd={markerEnd} label={label} labelX={middle * .25 + control * .75} labelY={(sourceY + targetY) / 2} labelStyle={labelStyle} labelBgStyle={labelBgStyle} />
}
const nodeTypes = { memoryPoint: MemoryPoint }
const edgeTypes = { memoryLink: MemoryLink }
type GraphProps = {
  graph: { nodes: WorkspaceNode[]; edges: WorkspaceEdge[] }
  hierarchy: boolean
  selectedId: string
  focusRequest: string
  onSelect: (node: WorkspaceNode | null) => void
  positions?: Map<string, { x: number; y: number }>
  connectionStatus?: string
}
export function MemoryGraph({ graph, hierarchy, selectedId, focusRequest, onSelect, positions: suppliedPositions, connectionStatus }: GraphProps) {
  const recordsById = useMemo(() => new Map(graph.nodes.map(node => [node.id, node])), [graph.nodes])
  const initial = useMemo(() => {
    const positions = suppliedPositions ?? layoutMemoryGraph(graph.nodes, graph.edges, hierarchy)
    return graph.nodes.map(record => ({ id: record.id, type: "memoryPoint" as const, position: positions.get(record.id) || { x: 0, y: 0 }, data: { record, emphasized: false, dimmed: false, detailed: false, hierarchy, moved: false }, ariaLabel: record.kind === "folder" ? `${record.label}: ${record.memoryIds.length} records. Organization group.` : `${record.displayKind ?? record.kind}: ${record.label}. Select to inspect.`, style: { width: hierarchy ? 260 : 180, height: hierarchy ? 40 : 80 }, deletable: false }))
  }, [graph, hierarchy, suppliedPositions])
  const [nodes, setNodes] = useState<Point[]>(initial)
  const [previousInitial, setPreviousInitial] = useState(initial)
  if (previousInitial !== initial) {
    const moved = new Map(nodes.filter(node => node.data.moved && node.data.hierarchy === hierarchy).map(node => [node.id, node.position]))
    setPreviousInitial(initial)
    setNodes(initial.map(node => ({ ...node, position: moved.get(node.id) ?? node.position, data: { ...node.data, moved: moved.has(node.id) } })))
  }
  const [instance, setInstance] = useState<ReactFlowInstance<Point> | null>(null)
  const [hoverId, setHoverId] = useState("")
  const [hoverEdge, setHoverEdge] = useState("")
  const [groupId, setGroupId] = useState("")
  const [focus, setFocus] = useState(false)
  const [depth, setDepth] = useState(1)
  const [zoom, setZoom] = useState(.5)
  const canvas = useRef<HTMLDivElement>(null)
  const activeId = selectedId || groupId
  useEffect(() => {
    if (!instance || selectedId) return
    const frame = requestAnimationFrame(() => void instance.fitView({ padding: .22, maxZoom: 1 }))
    return () => cancelAnimationFrame(frame)
  }, [initial, instance, selectedId])
  useEffect(() => {
    if (!instance || !selectedId || !canvas.current) return
    let frame = 0
    const reveal = (force = false) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const node = instance.getNode(selectedId), rect = canvas.current?.querySelector('.react-flow')?.getBoundingClientRect()
        if (!node || !rect) return
        const viewport = instance.getViewport(), nextZoom = force ? 1.1 : Math.max(.85, viewport.zoom)
        const x = node.position.x + (hierarchy ? 130 : 90), y = node.position.y + (hierarchy ? 20 : 40)
        const screenX = x * viewport.zoom + viewport.x, screenY = y * viewport.zoom + viewport.y
        if (force || viewport.zoom < .65 || screenX < 90 || screenX > rect.width - 90 || screenY < 80 || screenY > rect.height - 90)
          void instance.setViewport({ x: rect.width / 2 - x * nextZoom, y: rect.height / 2 - y * nextZoom, zoom: nextZoom })
      })
    }
    reveal(!!focusRequest)
    const resize = new ResizeObserver(() => reveal(!!focusRequest))
    resize.observe(canvas.current)
    return () => { cancelAnimationFrame(frame); resize.disconnect() }
  }, [instance, focusRequest, selectedId, hierarchy])
  const active = graph.nodes.find(node => node.id === activeId)
  const highlighted = memoryNeighborhood(hoverId || activeId, graph.edges, 1)
  const neighborhood = active && focus ? memoryNeighborhood(active.id, graph.edges, depth) : null
  const visibleNodes = nodes.filter(node => !neighborhood || neighborhood.has(node.id)).map(node => ({ ...node, selected: activeId === node.id, data: { ...node.data, emphasized: highlighted.has(node.id), dimmed: !!(hoverId || activeId) && !highlighted.has(node.id), detailed: hierarchy || graph.nodes.length <= 30 || zoom > .85 || highlighted.has(node.id) || node.data.record.kind === "folder" } }))
  const edges = graph.edges.filter(edge => !neighborhood || (neighborhood.has(edge.source) && neighborhood.has(edge.target))).map(edge => {
    const emphasized = edge.id === hoverEdge || edge.source === (hoverId || activeId) || edge.target === (hoverId || activeId)
    const organization = edge.kind === "parent"
    const color = recordsById.get(edge.target)?.colorIndex || 0
    return { ...edge, type: "memoryLink", focusable: false, selectable: false,
      data: { hierarchy: hierarchy && !organization },
      label: edge.id === hoverEdge && !organization ? edge.relationship?.replaceAll('_', ' ') : undefined,
      labelStyle: { fill: 'var(--foreground)', fontSize: 11 }, labelBgStyle: { fill: 'var(--background)', fillOpacity: .95 },
      style: { stroke: emphasized ? `var(--memory-category-${color % 5 + 1})` : "var(--muted-foreground)", strokeWidth: emphasized ? 1.5 : .8, strokeOpacity: emphasized ? .85 : (hoverId || activeId) ? .16 : organization ? .35 : .55, strokeDasharray: organization ? "3 6" : undefined } }
  })
  function select(node: Point) {
    if (node.data.record.kind === 'folder') { setGroupId(node.id); onSelect(null) }
    else { setGroupId(''); onSelect(node.data.record) }
  }
  return <div ref={canvas} className="memory-graph-shell" role="region" aria-label={hierarchy ? "Memory hierarchy canvas" : "Memory network canvas"}>
    <ReactFlow<Point> nodes={visibleNodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onInit={setInstance}
      onNodesChange={changes => {
        setNodes(current => applyNodeChanges(changes, current).map(node => changes.some(change => change.type === 'position' && change.id === node.id && change.dragging) ? { ...node, data: { ...node.data, moved: true } } : node))
        const selection = changes.find(change => change.type === "select" && change.selected)
        if (selection?.type === "select") { const node = nodes.find(node => node.id === selection.id); if (node) select(node) }
      }}
      onNodeClick={(_, node) => select(node)} onNodeMouseEnter={(_, node) => setHoverId(node.id)} onNodeMouseLeave={() => setHoverId("")}
      onEdgeMouseEnter={(_, edge) => setHoverEdge(edge.id)} onEdgeMouseLeave={() => setHoverEdge('')}
      onMove={(_, viewport) => setZoom(viewport.zoom)} onPaneClick={() => { if (!focus) { setGroupId(''); onSelect(null) } }}
      nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null} fitView fitViewOptions={{ padding: .22, maxZoom: 1 }} minZoom={.08} maxZoom={2.5} aria-label="Memory connections" />
    <div className="memory-canvas-caption pointer-events-none"><span className="font-medium text-foreground">{hierarchy ? "Memory tree" : "Memory map"}</span><span>{connectionStatus ?? `${visibleNodes.filter(node => node.data.record.kind !== 'folder').length} records · ${edges.filter(edge => edge.kind !== 'parent').length} recorded relationships`}</span><div className="memory-canvas-legend"><span><i />Relationships</span><span><i className="is-organization" />Type grouping</span></div></div>
    <div className="memory-canvas-controls"><div className="flex gap-1 rounded-lg border bg-background p-1">
      <Button size="icon" variant="ghost" aria-label="Zoom in" title="Zoom in" onClick={() => void instance?.zoomIn()}><Plus /></Button>
      <Button size="icon" variant="ghost" aria-label="Zoom out" title="Zoom out" onClick={() => void instance?.zoomOut()}><Minus /></Button>
      <Button size="icon" variant="ghost" aria-label="Fit all points" title="Fit all points" onClick={() => void instance?.fitView({ padding: .22, maxZoom: 1 })}><Maximize /></Button>
      <Button size="icon" variant="ghost" aria-label="Reset positions" title="Reset positions" onClick={() => { setNodes(initial); setFocus(false); requestAnimationFrame(() => void instance?.fitView({ padding: .22, maxZoom: 1 })) }}><RotateCcw /></Button>
    </div>{active && <div className="flex gap-1 rounded-lg border bg-background p-1"><Button size="sm" variant={focus ? "secondary" : "ghost"} onClick={() => { setFocus(!focus); setDepth(1) }}><ScanSearch />{focus ? "Show all" : "Neighbors"}</Button>{focus && <Button size="sm" variant="ghost" onClick={() => setDepth(depth === 1 ? 2 : 1)}>{depth === 1 ? "2 hops" : "1 hop"}</Button>}</div>}</div>
    <span className="memory-zoom pointer-events-none">{Math.round(zoom * 100)}%</span>
  </div>
}
