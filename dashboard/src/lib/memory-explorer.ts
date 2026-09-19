import type { Memory, MemoryInput } from "./api/models"

export type MemoryNode = { id: string; kind: "memory" | "topic" | "source"; label: string; memoryIds: string[]; source?: string }
export type MemoryEdge = { id: string; source: string; target: string; kind: "topic" | "source" }
export function memoryTitle(memory: Memory) { return memory.title || memory.text }

export function normalizeMemoryInput(input: MemoryInput): MemoryInput {
  const title = input.title.trim(), text = input.text.trim(), category = input.category.trim()
  const tags = [...new Map(input.tags.map(tag => tag.trim()).filter(Boolean).map(tag => [tag.toLocaleLowerCase(), tag])).values()]
  if (!title || title.length > 100) throw new Error("Give the memory a title of 1–100 characters.")
  if (!text || text.length > 16000) throw new Error("Memory text must contain 1–16,000 characters.")
  if (!category || category.length > 50) throw new Error("Choose a category of 1–50 characters.")
  if (tags.length > 8 || tags.some(tag => tag.length > 40)) throw new Error("Use up to 8 topics, each no longer than 40 characters.")
  return { title, text, category, tags }
}

/** A metadata projection, not semantic similarity or an inferred knowledge graph. */
export function memoryGraph(memories: Memory[], includeSources = true) {
  const nodes = new Map<string, MemoryNode>(), edges: MemoryEdge[] = []
  for (const memory of memories) {
    const id = `memory:${memory.id}`
    nodes.set(id, { id, kind: "memory", label: memoryTitle(memory), memoryIds: [memory.id] })
    const seenTopics = new Set<string>()
    for (const tag of memory.tags || []) {
      const topicId = `topic:${tag.toLocaleLowerCase()}`
      if (seenTopics.has(topicId)) continue
      seenTopics.add(topicId)
      const topic = nodes.get(topicId) || { id: topicId, kind: "topic" as const, label: tag, memoryIds: [] }
      if (!topic.memoryIds.includes(memory.id)) topic.memoryIds.push(memory.id)
      nodes.set(topicId, topic)
      edges.push({ id: `${id}->${topicId}`, source: id, target: topicId, kind: "topic" })
    }
    if (includeSources && memory.origin !== "manual") {
      const sourceId = `source:${memory.source}`
      const source = nodes.get(sourceId) || { id: sourceId, kind: "source" as const, label: memory.source.startsWith("/chat/") ? `Chat · ${memory.source.split("/")[2].split("#")[0]}` : "Journal evidence", memoryIds: [], source: memory.source }
      if (!source.memoryIds.includes(memory.id)) source.memoryIds.push(memory.id)
      nodes.set(sourceId, source)
      edges.push({ id: `${sourceId}->${id}`, source: sourceId, target: id, kind: "source" })
    }
  }
  return { nodes: [...nodes.values()], edges }
}

export function filterMemories(memories: Memory[], query: string, category: string) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  return memories.filter(memory => (category === "all" || memory.category === category) && terms.every(term => [memory.id, memory.title, memory.text, memory.provenance, memory.source, memory.category, ...(memory.tags || [])].join(" ").toLocaleLowerCase().includes(term)))
}

export function memoryNeighborhood(id: string, edges: MemoryEdge[], depth: number) {
  const ids = new Set([id])
  for (let i = 0; i < depth; i++) {
    const current = new Set(ids)
    for (const edge of edges) if (current.has(edge.source) || current.has(edge.target)) { ids.add(edge.source); ids.add(edge.target) }
  }
  return ids
}
