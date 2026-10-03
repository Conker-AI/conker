import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from 'd3-force'
import { hierarchy, tree } from 'd3-hierarchy'
import type { WorkspaceEdge, WorkspaceNode } from '../memory-layout'
import type { GatewayControlClient, MemoryConnections, MemoryObjectCard, MemoryObjectKind } from './control'

export const memoryRecordKey = (record: MemoryObjectCard) => `${record.type}:${record.id}`
const recordLimit = 100
export const memoryGraphNodeLimit = 250
const kinds: MemoryObjectKind[] = ['memory', 'entity', 'evidence', 'analysis', 'episode', 'observation', 'pattern', 'transcript']
const groups: Record<MemoryObjectKind, string> = { memory: 'Memories', entity: 'People & things', evidence: 'Sources', analysis: 'Notes', episode: 'Episodes', observation: 'Observations', pattern: 'Patterns', transcript: 'Transcripts' }
export type MemoryGraphRead = { nodes: MemoryObjectCard[]; links: MemoryConnections['links']; partial: boolean; failures: number }

/** Bounded metadata reads only. No content expansion, inference or memory writes. */
export async function readMemoryGraph(client: Pick<GatewayControlClient, 'connections'>, records: MemoryObjectCard[], signal: AbortSignal): Promise<MemoryGraphRead> {
  const nodes = new Map(records.slice(0, recordLimit).map(record => [memoryRecordKey(record), record]))
  const links = new Map<string, MemoryConnections['links'][number]>()
  let partial = records.length > recordLimit, failures = 0
  const queue = records.slice(0, recordLimit)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (cursor < queue.length) {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
      const record = queue[cursor++]
      try {
        const detail = await client.connections(record.type, record.id, { signal })
        if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
        partial ||= detail.next_after !== null
        detail.nodes.forEach(node => {
          if (nodes.has(memoryRecordKey(node)) || nodes.size < memoryGraphNodeLimit) nodes.set(memoryRecordKey(node), node)
          else partial = true
        })
        detail.links.forEach(link => links.set(link.id, link))
      } catch (error) {
        if (signal.aborted) throw error
        failures++; partial = true
      }
    }
  }))
  const visibleLinks = [...links.values()].filter(link => nodes.has(`${link.source_type}:${link.source_id}`) && nodes.has(`${link.target_type}:${link.target_id}`))
  partial ||= visibleLinks.length !== links.size
  return { nodes: [...nodes.values()], links: visibleLinks, partial, failures }
}

/** Type branches are organization, never inferred factual relationships. */
export function projectMemoryGraph(records: MemoryObjectCard[], links: MemoryConnections['links'], hierarchical: boolean) {
  const unique = [...new Map(records.map(record => [memoryRecordKey(record), record])).values()]
  const nodes: WorkspaceNode[] = unique.map(record => ({
    id: memoryRecordKey(record), kind: record.type === 'evidence' || record.type === 'transcript' ? 'source' : 'memory',
    label: record.title === record.type ? record.preview.slice(0, 80) || record.title : record.title,
    memoryIds: [record.id], displayKind: record.type, colorIndex: kinds.indexOf(record.type) % 5, parentId: `folder:type:${record.type}`,
  }))
  const ids = new Set(nodes.map(node => node.id))
  const edges: WorkspaceEdge[] = [...new Map(links.map(link => [link.id, link])).values()]
    .filter(link => ids.has(`${link.source_type}:${link.source_id}`) && ids.has(`${link.target_type}:${link.target_id}`))
    .map(link => ({ id: `relationship:${link.id}`, source: `${link.source_type}:${link.source_id}`, target: `${link.target_type}:${link.target_id}`, kind: 'source', relationship: link.relationship }))
  kinds.forEach((kind, index) => {
    const children = nodes.filter(node => node.displayKind === kind)
    if (!children.length) return
    const id = `folder:type:${kind}`
    nodes.push({ id, kind: 'folder', label: groups[kind], colorIndex: index % 5, memoryIds: children.flatMap(node => node.memoryIds), ...(hierarchical ? { parentId: 'folder:gateway-root' } : {}) })
    children.forEach(node => edges.push({ id: `organization:${id}:${node.id}`, source: id, target: node.id, kind: 'parent' }))
    if (hierarchical) edges.push({ id: `organization:root:${id}`, source: 'folder:gateway-root', target: id, kind: 'parent' })
  })
  if (hierarchical && unique.length) nodes.push({ id: 'folder:gateway-root', kind: 'folder', label: 'Memory', memoryIds: unique.map(memoryRecordKey), colorIndex: 0 })
  return { nodes, edges }
}

type Point = SimulationNodeDatum & { id: string; targetX: number; targetY: number; radius: number }
type Branch = { record: WorkspaceNode; children: Branch[] }
export function layoutMemoryAtlas(nodes: WorkspaceNode[], edges: WorkspaceEdge[], hierarchical: boolean) {
  const positions = new Map<string, { x: number; y: number }>()
  if (!nodes.length) return positions
  const ordered = [...nodes].sort((a, b) => a.id.localeCompare(b.id))
  if (hierarchical) {
    const root = nodes.find(node => !node.parentId && node.kind === 'folder')
    if (!root) return positions
    const branch = (record: WorkspaceNode): Branch => ({ record, children: ordered.filter(node => node.parentId === record.id).map(branch) })
    const result = tree<Branch>().nodeSize([64, 285]).separation((a, b) => a.parent === b.parent ? 1 : 1.5)(hierarchy(branch(root)))
    result.each(node => positions.set(node.data.record.id, { x: node.y, y: node.x }))
    return positions
  }
  const categories = ordered.filter(node => node.kind === 'folder')
  const targets = new Map(categories.map((node, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / categories.length
    const radius = categories.length > 1 ? Math.max(190, categories.length * 55) : 0
    return [node.id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }]
  }))
  const points: Point[] = ordered.map((node, index) => {
    const target = targets.get(node.kind === 'folder' ? node.id : node.parentId ?? '') ?? { x: 0, y: 0 }
    const phase = index * 2.3999632297
    return { id: node.id, x: target.x + Math.cos(phase) * 100, y: target.y + Math.sin(phase) * 100, targetX: target.x, targetY: target.y, radius: 95 }
  })
  const simulation = forceSimulation(points).stop()
    .force('links', forceLink<Point, { source: string; target: string }>([...edges].sort((a, b) => a.id.localeCompare(b.id)).map(edge => ({ source: edge.source, target: edge.target }))).id(point => point.id).distance(180).strength(.15))
    .force('charge', forceManyBody().strength(-400))
    .force('collision', forceCollide<Point>().radius(point => point.radius).iterations(2))
    .force('x', forceX<Point>(point => point.targetX).strength(.045))
    .force('y', forceY<Point>(point => point.targetY).strength(.045))
  simulation.tick(180)
  points.forEach(point => positions.set(point.id, { x: point.x ?? 0, y: point.y ?? 0 }))
  return positions
}
