import { describe, expect, it } from 'vitest'
import type { Memory } from '../api/models'
import { filterMemories, memoryGraph, memoryNeighborhood, memoryTitle, normalizeMemoryInput } from '../memory-explorer'
import { layoutMemoryGraph, workspaceGraph } from '../memory-layout'

const memory = (id: string, partial: Partial<Memory> = {}): Memory => ({ id, text: `text of ${id}`, category: 'People', provenance: 'told', source: '/chat/abc#m1', origin: 'chat', tags: [], ...partial }) as unknown as Memory

describe('memory explorer: input', () => {
  const valid = { title: ' Dentist ', text: ' Tuesday at 9 ', category: ' Health ', tags: [' a ', 'A', '', 'b'] }

  it('trims and keeps each topic once, ignoring case', () => {
    expect(normalizeMemoryInput(valid)).toEqual({ title: 'Dentist', text: 'Tuesday at 9', category: 'Health', tags: ['A', 'b'] })
  })

  it('names what to fix', () => {
    expect(() => normalizeMemoryInput({ ...valid, title: ' ' })).toThrow('title of 1–100')
    expect(() => normalizeMemoryInput({ ...valid, title: 'x'.repeat(101) })).toThrow('title of 1–100')
    expect(() => normalizeMemoryInput({ ...valid, text: '' })).toThrow('1–16,000')
    expect(() => normalizeMemoryInput({ ...valid, text: 'x'.repeat(16001) })).toThrow('1–16,000')
    expect(() => normalizeMemoryInput({ ...valid, category: '' })).toThrow('category of 1–50')
    expect(() => normalizeMemoryInput({ ...valid, category: 'x'.repeat(51) })).toThrow('category of 1–50')
    expect(() => normalizeMemoryInput({ ...valid, tags: Array.from({ length: 9 }, (_, index) => `t${index}`) })).toThrow('up to 8 topics')
    expect(() => normalizeMemoryInput({ ...valid, tags: ['x'.repeat(41)] })).toThrow('up to 8 topics')
    expect(normalizeMemoryInput({ ...valid, title: 'x'.repeat(100), tags: Array.from({ length: 8 }, (_, index) => `t${index}`) }).tags).toHaveLength(8)
  })

  it('titles a memory by its title, else its text', () => {
    expect(memoryTitle(memory('a', { title: 'Named' }))).toBe('Named')
    expect(memoryTitle(memory('a'))).toBe('text of a')
  })
})

describe('memory explorer: graph', () => {
  it('links memories to shared topics and to their source', () => {
    const graph = memoryGraph([
      memory('1', { tags: ['Work', 'work', 'Home'], source: '/chat/abc#m1' }),
      memory('2', { tags: ['WORK'], source: '/chat/abc#m2' }),
      memory('3', { origin: 'manual' }),
      memory('4', { source: '/journal/2026-01-01' }),
    ])
    const byId = Object.fromEntries(graph.nodes.map(node => [node.id, node]))
    expect(byId['topic:work']).toMatchObject({ kind: 'topic', label: 'Work', memoryIds: ['1', '2'] })
    expect(byId['source:/chat/abc#m1'].label).toBe('Chat · abc')
    expect(byId['source:/journal/2026-01-01'].label).toBe('Journal evidence')
    expect(byId['source:/journal/2026-01-01'].source).toBe('/journal/2026-01-01')
    expect(graph.nodes.some(node => node.id.startsWith('source:') && node.memoryIds.includes('3'))).toBe(false)
    expect(graph.edges.filter(edge => edge.source === 'memory:1' && edge.kind === 'topic')).toHaveLength(2)
    expect(graph.edges.find(edge => edge.kind === 'source' && edge.target === 'memory:4')?.source).toBe('source:/journal/2026-01-01')
  })

  it('merges memories that share one source and can leave sources out', () => {
    const shared = [memory('1', { source: '/chat/abc#m1' }), memory('2', { source: '/chat/abc#m1' })]
    const source = memoryGraph(shared).nodes.find(node => node.kind === 'source')
    expect(source?.memoryIds).toEqual(['1', '2'])
    expect(memoryGraph(shared, false).nodes.some(node => node.kind === 'source')).toBe(false)
    expect(memoryGraph([])).toEqual({ nodes: [], edges: [] })
  })
})

describe('memory explorer: search and neighbourhood', () => {
  const memories = [memory('a', { title: 'Dentist', category: 'Health', tags: ['teeth'] }), memory('b', { title: 'Piano', category: 'Hobbies', text: 'Lesson on Friday', tags: ['music'] })]

  it('matches every word anywhere in the record, ignoring case', () => {
    expect(filterMemories(memories, 'lesson friday', 'all').map(item => item.id)).toEqual(['b'])
    expect(filterMemories(memories, 'TEETH', 'all').map(item => item.id)).toEqual(['a'])
    expect(filterMemories(memories, 'teeth piano', 'all')).toEqual([])
    expect(filterMemories(memories, '  ', 'all')).toHaveLength(2)
  })

  it('narrows by category', () => {
    expect(filterMemories(memories, '', 'Health').map(item => item.id)).toEqual(['a'])
    expect(filterMemories(memories, 'piano', 'Health')).toEqual([])
  })

  it('walks the graph a step at a time', () => {
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
      { source: 'c', target: 'd' },
    ]
    expect([...memoryNeighborhood('a', edges, 0)]).toEqual(['a'])
    expect([...memoryNeighborhood('a', edges, 1)].sort()).toEqual(['a', 'b'])
    expect([...memoryNeighborhood('a', edges, 2)].sort()).toEqual(['a', 'b', 'c'])
    expect([...memoryNeighborhood('d', edges, 1)].sort()).toEqual(['c', 'd'])
  })
})

describe('memory layout', () => {
  const memories = [
    memory('1', { category: 'People', tags: ['family'] }),
    memory('2', { category: 'Health', tags: ['family'] }),
    memory('3', { category: 'Health', origin: 'manual' }),
    memory('4', { category: 'Work', source: '/journal/x' }),
  ]

  it('has nothing to draw without memories', () => {
    expect(workspaceGraph([], true)).toEqual({ nodes: [], edges: [] })
    expect(layoutMemoryGraph([], [], true).size).toBe(0)
  })

  it('adds a library, a folder per category and parent links', () => {
    const { nodes, edges } = workspaceGraph(memories, false)
    const folders = nodes.filter(node => node.kind === 'folder')
    expect(folders.map(node => node.label).sort()).toEqual(['Health', 'Memory library', 'People', 'Work'])
    expect(nodes.find(node => node.id === 'folder:root')?.memoryIds).toEqual(['1', '2', '3', '4'])
    expect(nodes.find(node => node.id === 'memory:3')?.parentId).toBe('folder:Health')
    expect(edges.filter(edge => edge.kind === 'parent')).toHaveLength(3 + 4)
    expect(nodes.find(node => node.id === 'folder:Health')).toMatchObject({ parentId: 'folder:root', memoryIds: ['2', '3'] })
  })

  it('gives each category a colour in order, and a hierarchy puts folders first', () => {
    const { nodes } = workspaceGraph(memories, true)
    expect(nodes.slice(0, 4).every(node => node.kind === 'folder')).toBe(true)
    expect(nodes.find(node => node.id === 'folder:Health')?.colorIndex).toBe(0)
    expect(nodes.find(node => node.id === 'folder:People')?.colorIndex).toBe(1)
    expect(nodes.find(node => node.id === 'memory:1')?.colorIndex).toBe(1)
  })

  it('encodes odd category names in folder ids', () => {
    const { nodes } = workspaceGraph([memory('1', { category: 'A/B c' })], false)
    expect(nodes.some(node => node.id === 'folder:A%2FB%20c')).toBe(true)
  })

  for (const hierarchy of [true, false]) {
    it(`places every node exactly the same way each time (${hierarchy ? 'tree' : 'clusters'})`, () => {
      const first = workspaceGraph(memories, hierarchy)
      const second = workspaceGraph(memories, hierarchy)
      const a = layoutMemoryGraph(first.nodes, first.edges, hierarchy)
      const b = layoutMemoryGraph(second.nodes, second.edges, hierarchy)
      expect(a.size).toBe(first.nodes.length)
      expect([...a.entries()]).toEqual([...b.entries()])
      for (const point of a.values()) {
        expect(Number.isFinite(point.x)).toBe(true)
        expect(Number.isFinite(point.y)).toBe(true)
      }
      expect(a.get('folder:root')).toEqual(hierarchy ? { x: 0, y: 0 } : expect.anything())
    })
  }

  it('lays a tree out in rows: root, folders, records, then topics and sources', () => {
    const { nodes, edges } = workspaceGraph(memories, true)
    const at = layoutMemoryGraph(nodes, edges, true)
    expect(at.get('folder:root')).toEqual({ x: 0, y: 0 })
    expect(at.get('folder:Health')?.y).toBe(130)
    expect(at.get('memory:2')?.y).toBe(230)
    expect(at.get('memory:3')?.y).toBe(280)
    expect(at.get('topic:family')?.y).toBeGreaterThan(280)
    // Categories sit in sorted order, left to right.
    expect(at.get('folder:Health')!.x).toBeLessThan(at.get('folder:People')!.x)
  })

  it('keeps clustered nodes from landing on top of each other', () => {
    const many = Array.from({ length: 12 }, (_, index) => memory(`m${index}`, { category: index % 2 ? 'A' : 'B' }))
    const { nodes, edges } = workspaceGraph(many, false)
    const at = layoutMemoryGraph(nodes, edges, false)
    const points = [...at.values()]
    let closest = Infinity
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) closest = Math.min(closest, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y))
    expect(closest).toBeGreaterThan(40)
  })

  it('keeps a single category beside the library', () => {
    const { nodes, edges } = workspaceGraph([memory('1', { category: 'Only' })], false)
    const at = layoutMemoryGraph(nodes, edges, false)
    const folder = at.get('folder:Only')!,
      root = at.get('folder:root')!
    // No ring to spread over: the folder stays beside the library (kept apart by relaxation only).
    const gap = Math.hypot(folder.x - root.x, folder.y - root.y)
    expect(gap).toBeGreaterThan(30)
    expect(gap).toBeLessThan(150)
  })
})
