import { useEffect, useMemo, useRef, useState } from "react"
import { Background, Handle, MarkerType, Position, ReactFlow, type Node, type NodeProps, type ReactFlowInstance } from "@xyflow/react"
import { Button } from "@/components/ui/button"
import { ReferenceSection } from "@/components/reference-section"
import type { ArtifactContent } from "@/lib/api/artifact-types"
import { cn } from "@/lib/utils"
import "@xyflow/react/dist/style.css"

type Diagram = Extract<ArtifactContent, { kind: "diagram" }>
type DiagramNode = Node<{ label: string }, "artifactNode">
function DiagramPoint({ data, selected }: NodeProps<DiagramNode>) {
  return <div className={cn("w-48 rounded-lg border bg-card p-3 text-sm text-card-foreground shadow-sm", selected && "border-ring ring-2 ring-ring")}>
    <Handle type="target" position={Position.Top} isConnectable={false} className="invisible" />
    <span className="block whitespace-pre-wrap break-words">{data.label}</span>
    <Handle type="source" position={Position.Bottom} isConnectable={false} className="invisible" />
  </div>
}
const nodeTypes = { artifactNode: DiagramPoint }
const ariaLabelConfig = { "node.a11yDescription.default": "Press Enter or Space to select this node. Press Escape to clear selection. Nodes cannot be moved or deleted here. Use the zoom controls or the diagram list to explore." }

/** Graph interaction changes only the view; source remains the sole saved definition. */
export function ArtifactDiagramPreview({ content }: { content: Diagram }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [instance, setInstance] = useState<ReactFlowInstance<DiagramNode> | null>(null)
  const canvas = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = canvas.current
    if (!element || !instance) return
    let width = element.clientWidth, height = element.clientHeight, frame = 0
    const observer = new ResizeObserver(() => {
      const nextWidth = element.clientWidth, nextHeight = element.clientHeight
      if (!nextWidth || !nextHeight || (nextWidth === width && nextHeight === height)) return
      width = nextWidth; height = nextHeight
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => { void instance.fitView({ padding: .2, maxZoom: 1 }) })
    })
    observer.observe(element)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [instance])
  const selected = content.nodes.find(node => node.id === selectedId)
  const nodes = useMemo(() => content.nodes.map(node => ({ id: node.id, type: "artifactNode" as const, position: { x: node.x, y: node.y }, data: { label: node.label }, selected: node.id === selectedId, ariaLabel: `${node.label}. Select to inspect.`, deletable: false })), [content.nodes, selectedId])
  const edges = useMemo(() => content.edges.map(edge => ({ ...edge, type: "smoothstep", selectable: false, focusable: false, markerEnd: { type: MarkerType.ArrowClosed, color: "var(--muted-foreground)" }, style: { stroke: "var(--muted-foreground)" }, labelStyle: { fill: "var(--foreground)", fontSize: 12 }, labelBgStyle: { fill: "var(--background)" } })), [content.edges])
  const label = (id: string) => content.nodes.find(node => node.id === id)?.label ?? id
  if (!content.nodes.length) return <p className="text-sm text-muted-foreground">This diagram is empty. Add nodes and connections in Source. Nothing runs when you interact with a diagram.</p>
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2"><Button size="sm" variant="outline" disabled={!instance} onClick={() => void instance?.zoomIn()}>Zoom in</Button><Button size="sm" variant="outline" disabled={!instance} onClick={() => void instance?.zoomOut()}>Zoom out</Button><Button size="sm" variant="outline" disabled={!instance} onClick={() => void instance?.fitView({ padding: .2, maxZoom: 1 })}>Fit diagram</Button><p className="text-xs text-muted-foreground">Drag the background to pan. Select a node to inspect it.</p></div>
    <div ref={canvas} className="h-80 overflow-hidden rounded-lg border bg-background" role="region" aria-label="Artifact diagram">
      <ReactFlow<DiagramNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} ariaLabelConfig={ariaLabelConfig} onInit={setInstance} onNodeClick={(_, node) => setSelectedId(node.id)} onNodesChange={changes => { const selection = changes.find(change => change.type === "select" && change.selected); if (selection?.type === "select") setSelectedId(selection.id); else if (changes.some(change => change.type === "select" && change.id === selectedId && !change.selected)) setSelectedId(null) }} onPaneClick={() => setSelectedId(null)} nodesDraggable={false} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null} fitView fitViewOptions={{ padding: .2, maxZoom: 1 }} minZoom={.02} maxZoom={2} aria-label="Diagram nodes and directed connections"><Background color="var(--border)" /></ReactFlow>
    </div>
    {selected && <ReferenceSection title={selected.label}><p className="text-xs text-muted-foreground">Node {selected.id}</p>{selected.description && <p className="whitespace-pre-wrap break-words text-sm">{selected.description}</p>}<p className="text-sm">{content.edges.filter(edge => edge.source === selected.id || edge.target === selected.id).length} connected edges</p><Button size="sm" variant="outline" onClick={() => setSelectedId(null)}>Clear selection</Button></ReferenceSection>}
    <details><summary className="cursor-pointer rounded-sm text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">View diagram as a list · {content.nodes.length} nodes, {content.edges.length} connections</summary><div className="mt-4 space-y-5"><ReferenceSection title="Nodes"><ul className="space-y-3">{content.nodes.map(node => <li key={node.id} className="space-y-1"><Button variant="link" className="h-auto max-w-full whitespace-normal break-words p-0 text-left" aria-pressed={selectedId === node.id} onClick={() => { setSelectedId(node.id); void instance?.fitView({ nodes: [{ id: node.id }], maxZoom: 1, padding: .5 }) }}>{node.label}</Button><p className="text-xs text-muted-foreground">ID: {node.id}</p>{node.description && <p className="whitespace-pre-wrap break-words text-sm">{node.description}</p>}</li>)}</ul></ReferenceSection><ReferenceSection title="Directed connections">{content.edges.length ? <ul className="space-y-2">{content.edges.map(edge => <li key={edge.id} className="break-words text-sm">{label(edge.source)} → {label(edge.target)}{edge.label ? ` · ${edge.label}` : ""}</li>)}</ul> : <p className="text-sm text-muted-foreground">No connections.</p>}</ReferenceSection></div></details>
    <p className="text-xs text-muted-foreground">Native diagram only. Nodes and connections describe information; they do not execute tools or workflows. Edit saved positions in Source.</p>
  </div>
}
