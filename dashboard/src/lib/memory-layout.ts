import type { Memory } from "./api/models"
import { memoryGraph, type MemoryNode } from "./memory-explorer"

export type WorkspaceNode = Omit<MemoryNode, "kind"> & {
  kind: MemoryNode["kind"] | "folder"
  colorIndex: number
  displayKind?: string
  parentId?: string
}
export type WorkspaceEdge = { id: string; source: string; target: string; kind: "topic" | "source" | "parent" }
type Position = { x: number; y: number }
const rootId = "folder:root"
const folderId = (category: string) => `folder:${encodeURIComponent(category)}`
const stableSort = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0

/** Folders are explicit category organization. They do not claim inferred semantic relationships. */
export function workspaceGraph(memories: Memory[], hierarchy: boolean): { nodes: WorkspaceNode[]; edges: WorkspaceEdge[] } {
  if (!memories.length) return { nodes: [], edges: [] }
  const categories = [...new Set(memories.map(memory => memory.category))].sort(stableSort)
  const memoryById = new Map(memories.map(memory => [memory.id, memory]))
  const projection = memoryGraph(memories)
  const nodes: WorkspaceNode[] = projection.nodes.map(node => {
    const memory = memoryById.get(node.memoryIds[0])
    const category = memory?.category ?? categories[0]
    return { ...node, colorIndex: categories.indexOf(category) % 5, ...(node.kind === "memory" ? { parentId: folderId(category) } : {}) }
  })
  const edges: WorkspaceEdge[] = [...projection.edges]
  nodes.push({ id: rootId, kind: "folder", label: "Memory library", memoryIds: memories.map(memory => memory.id), colorIndex: 0 })
  categories.forEach((category, index) => {
    const id = folderId(category), records = memories.filter(memory => memory.category === category)
    nodes.push({ id, kind: "folder", label: category, memoryIds: records.map(memory => memory.id), colorIndex: index % 5, parentId: rootId })
    edges.push({ id: `${rootId}->${id}`, source: rootId, target: id, kind: "parent" })
    records.forEach(memory => edges.push({ id: `${id}->memory:${memory.id}`, source: id, target: `memory:${memory.id}`, kind: "parent" }))
  })
  // The hierarchy carries the same factual connections; the view chooses how prominently to show them.
  return { nodes: hierarchy ? nodes.sort((a, b) => Number(b.kind === "folder") - Number(a.kind === "folder") || stableSort(a.id, b.id)) : nodes, edges }
}

function seed(id: string) {
  let result = 2166136261
  for (const char of id) result = Math.imul(result ^ char.charCodeAt(0), 16777619)
  return (result >>> 0) / 4294967296
}

/** Deterministic starting positions. User dragging belongs to the view, never to stored memory data. */
export function layoutMemoryGraph(nodes: WorkspaceNode[], edges: WorkspaceEdge[], hierarchy: boolean): Map<string, Position> {
  const positions = new Map<string, Position>()
  if (!nodes.length) return positions
  const categories = nodes.filter(node => node.kind === "folder" && node.id !== rootId).sort((a, b) => stableSort(a.id, b.id))
  const records = nodes.filter(node => node.kind === "memory")
  positions.set(rootId, { x: 0, y: 0 })

  if (hierarchy) {
    let lowestRecord = 230
    const columnWidth = 230
    categories.forEach((category, categoryIndex) => {
      const children = records.filter(node => node.parentId === category.id).sort((a, b) => stableSort(a.id, b.id))
      const x = (categoryIndex - (categories.length - 1) / 2) * columnWidth
      positions.set(category.id, { x, y: 130 })
      children.forEach((node, index) => {
        const y = 230 + index * 50
        positions.set(node.id, { x: x + (index % 2 === 0 ? -24 : 24), y })
        lowestRecord = Math.max(lowestRecord, y)
      })
    })
    const auxiliary = nodes.filter(node => node.kind === "topic" || node.kind === "source").map(node => {
      const connected = node.memoryIds.map(id => positions.get(`memory:${id}`)).filter((point): point is Position => !!point)
      const meanX = connected.length ? connected.reduce((sum, point) => sum + point.x, 0) / connected.length : 0
      return { node, meanX }
    }).sort((a, b) => a.meanX - b.meanX || stableSort(a.node.id, b.node.id))
    const columns = Math.max(5, Math.ceil(categories.length * 1.8))
    const rows = Math.max(1, Math.ceil(auxiliary.length / columns))
    const span = Math.max(680, (categories.length - 1) * columnWidth + 100)
    auxiliary.forEach(({ node }, index) => {
      const column = Math.floor(index / rows), row = index % rows
      // Order by linked-record barycenter, then reserve fixed slots to avoid collisions.
      const x = (column / Math.max(1, columns - 1) - 0.5) * span
      positions.set(node.id, { x, y: lowestRecord + 100 + row * 65 })
    })
    return positions
  }

  const clusterRadius = categories.length <= 1 ? 0 : Math.max(230, categories.length * 65)
  categories.forEach((category, categoryIndex) => {
    const angle = -Math.PI / 2 + categoryIndex * Math.PI * 2 / categories.length
    const center = { x: Math.cos(angle) * clusterRadius, y: Math.sin(angle) * clusterRadius * 0.82 }
    positions.set(category.id, center)
    const children = records.filter(node => node.parentId === category.id).sort((a, b) => stableSort(a.id, b.id))
    children.forEach((node, index) => {
      const phase = index * 2.399963229728653 + seed(category.id) * Math.PI * 2
      const radius = 65 + Math.sqrt(index + 1) * 39
      positions.set(node.id, { x: center.x + Math.cos(phase) * radius, y: center.y + Math.sin(phase) * radius * 0.84 })
    })
  })
  const adjacent = new Map<string, string[]>()
  edges.forEach(edge => {
    adjacent.set(edge.source, [...(adjacent.get(edge.source) ?? []), edge.target])
    adjacent.set(edge.target, [...(adjacent.get(edge.target) ?? []), edge.source])
  })
  nodes.filter(node => !positions.has(node.id)).sort((a, b) => stableSort(a.id, b.id)).forEach(node => {
    const neighbors = (adjacent.get(node.id) ?? []).map(id => positions.get(id)).filter((point): point is Position => !!point)
    const angle = seed(node.id) * Math.PI * 2
    const mean = neighbors.length ? { x: neighbors.reduce((total, point) => total + point.x, 0) / neighbors.length, y: neighbors.reduce((total, point) => total + point.y, 0) / neighbors.length } : { x: 0, y: 0 }
    positions.set(node.id, { x: mean.x + Math.cos(angle) * 65, y: mean.y + Math.sin(angle) * 65 })
  })

  // Relax close points without flattening the category clusters into a rigid grid.
  const ordered = [...nodes].sort((a, b) => stableSort(a.id, b.id))
  for (let iteration = 0; iteration < 32; iteration++) {
    for (let i = 0; i < ordered.length; i++) for (let j = i + 1; j < ordered.length; j++) {
      const a = positions.get(ordered[i].id)!, b = positions.get(ordered[j].id)!
      const dx = b.x - a.x || 0.1, dy = b.y - a.y || 0.1
      const distance = Math.hypot(dx, dy), minimum = !categories.length ? 165 : ordered[i].kind === "folder" || ordered[j].kind === "folder" ? 80 : 62
      if (distance >= minimum) continue
      const move = (minimum - distance) * 0.28
      a.x -= dx / distance * move; a.y -= dy / distance * move
      b.x += dx / distance * move; b.y += dy / distance * move
    }
  }
  return positions
}
