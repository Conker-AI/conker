import { describe, expect, it } from 'vitest'
import type { Memory } from '../api/models'
import { filterMemories, memoryGraph, memoryNeighborhood, memoryTitle, normalizeMemoryInput } from '../memory-explorer'
import { toolValueSources } from '../tool-value-sources'
import type { ToolDefinition, ToolRun } from '../tool-workspace'

const memory = (over: Partial<Memory> & { id: string }): Memory => ({ text: 'Likes tea', category: 'preference', confidence: 'high', age: '1d', provenance: 'said so', source: '/chat/abc#12', ...over })
const input = { title: ' Tea ', text: ' Likes tea ', category: ' food ', tags: [' Drinks ', 'drinks', '', 'Warm'] }

describe('memory input', () => {
  it('trims fields and drops blank and case-duplicate topics, keeping the first spelling', () => {
    expect(normalizeMemoryInput(input)).toEqual({ title: 'Tea', text: 'Likes tea', category: 'food', tags: ['drinks', 'Warm'] })
  })
  it('refuses a missing or over-long title, text and category', () => {
    expect(() => normalizeMemoryInput({ ...input, title: ' ' })).toThrow('Give the memory a title of 1–100 characters.')
    expect(() => normalizeMemoryInput({ ...input, title: 't'.repeat(101) })).toThrow('Give the memory a title of 1–100 characters.')
    expect(() => normalizeMemoryInput({ ...input, text: '' })).toThrow('Memory text must contain 1–16,000 characters.')
    expect(() => normalizeMemoryInput({ ...input, text: 'x'.repeat(16001) })).toThrow('Memory text must contain 1–16,000 characters.')
    expect(() => normalizeMemoryInput({ ...input, category: '' })).toThrow('Choose a category of 1–50 characters.')
    expect(() => normalizeMemoryInput({ ...input, category: 'c'.repeat(51) })).toThrow('Choose a category of 1–50 characters.')
  })
  it('refuses more than 8 topics or a topic over 40 characters, and accepts the limits', () => {
    const topics = Array.from({ length: 9 }, (_, i) => `t${i}`)
    expect(() => normalizeMemoryInput({ ...input, tags: topics })).toThrow('Use up to 8 topics, each no longer than 40 characters.')
    expect(() => normalizeMemoryInput({ ...input, tags: ['x'.repeat(41)] })).toThrow('Use up to 8 topics, each no longer than 40 characters.')
    expect(normalizeMemoryInput({ ...input, title: 't'.repeat(100), tags: [...topics.slice(0, 7), 'x'.repeat(40)] }).tags).toHaveLength(8)
  })
})

describe('memory title', () => {
  it('uses the title, falling back to the text', () => {
    expect(memoryTitle(memory({ id: '1', title: 'Tea' }))).toBe('Tea')
    expect(memoryTitle(memory({ id: '1' }))).toBe('Likes tea')
  })
})

describe('memory graph', () => {
  const memories = [
    memory({ id: '1', title: 'Tea', tags: ['Drinks', 'drinks'] }),
    memory({ id: '2', title: 'Coffee', tags: ['DRINKS'], source: '/chat/xyz#3' }),
    memory({ id: '3', title: 'Typed by hand', origin: 'manual', source: 'manual' }),
    memory({ id: '4', title: 'From the journal', source: 'journal/2026-01-01', tags: undefined }),
  ]
  it('links memories to shared topics (case-insensitive, once per memory) and to their sources', () => {
    const { nodes, edges } = memoryGraph(memories)
    const topic = nodes.find(node => node.id === 'topic:drinks')
    expect(topic).toMatchObject({ kind: 'topic', label: 'Drinks', memoryIds: ['1', '2'] })
    expect(edges.filter(edge => edge.target === 'topic:drinks').map(edge => edge.source)).toEqual(['memory:1', 'memory:2'])
    expect(nodes.find(node => node.id === 'source:/chat/abc#12')).toMatchObject({ kind: 'source', label: 'Chat · abc', memoryIds: ['1'], source: '/chat/abc#12' })
    expect(nodes.find(node => node.id === 'source:journal/2026-01-01')?.label).toBe('Journal evidence')
    expect(nodes.some(node => node.id === 'source:manual')).toBe(false)
    expect(edges.find(edge => edge.kind === 'source')).toEqual({ id: 'source:/chat/abc#12->memory:1', source: 'source:/chat/abc#12', target: 'memory:1', kind: 'source' })
  })
  it('shares one source node between memories from the same place', () => {
    const { nodes } = memoryGraph([memory({ id: '1' }), memory({ id: '2' })])
    expect(nodes.filter(node => node.kind === 'source')).toEqual([expect.objectContaining({ memoryIds: ['1', '2'] })])
  })
  it('leaves sources out when asked', () => {
    const { nodes, edges } = memoryGraph(memories, false)
    expect(nodes.some(node => node.kind === 'source')).toBe(false)
    expect(edges.every(edge => edge.kind === 'topic')).toBe(true)
  })
})

describe('memory filter', () => {
  const memories = [memory({ id: 'm1', title: 'Tea', tags: ['Drinks'], category: 'food' }), memory({ id: 'm2', title: 'Run', text: 'Runs on Sundays', category: 'habit', provenance: 'watch' })]
  it('matches every term across id, text, provenance, source, category and topics', () => {
    expect(filterMemories(memories, 'drinks', 'all').map(m => m.id)).toEqual(['m1'])
    expect(filterMemories(memories, '  SUNDAYS  watch', 'all').map(m => m.id)).toEqual(['m2'])
    expect(filterMemories(memories, 'tea sundays', 'all')).toEqual([])
    expect(filterMemories(memories, 'm2', 'all').map(m => m.id)).toEqual(['m2'])
  })
  it('keeps everything for a blank query and narrows by category', () => {
    expect(filterMemories(memories, '', 'all')).toHaveLength(2)
    expect(filterMemories(memories, '', 'habit').map(m => m.id)).toEqual(['m2'])
  })
})

describe('memory neighbourhood', () => {
  const edges = [
    { source: 'a', target: 'b' },
    { source: 'b', target: 'c' },
    { source: 'c', target: 'd' },
  ]
  it('grows one hop per step of depth', () => {
    expect([...memoryNeighborhood('a', edges, 0)]).toEqual(['a'])
    expect([...memoryNeighborhood('a', edges, 1)].sort()).toEqual(['a', 'b'])
    expect([...memoryNeighborhood('b', edges, 1)].sort()).toEqual(['a', 'b', 'c'])
    expect([...memoryNeighborhood('a', edges, 3)].sort()).toEqual(['a', 'b', 'c', 'd'])
  })
})

const node = (id: string, type: ToolDefinition['nodes'][number]['type'] = 'set', label = id): ToolDefinition['nodes'][number] => ({ id, type, label, position: { x: 0, y: 0 }, config: {} })
const edge = (source: string, target: string) => ({ id: `${source}-${target}`, source, target })
const definition = (over: Partial<ToolDefinition> = {}): ToolDefinition => ({
  id: 'tool',
  name: 'Tool',
  description: '',
  kind: 'workflow',
  effect: 'read',
  agentVisible: false,
  credentialRefs: [],
  outputs: [],
  budgets: { maxSteps: 10, maxLoopItems: 5, timeoutMs: 1000 },
  inputs: [
    { name: 'city', type: 'string', required: true },
    { name: 'days', type: 'number', required: false },
    { name: '__proto__', type: 'string', required: true },
    { name: 'bad key', type: 'string', required: true },
  ],
  nodes: [node('in', 'input', 'Input'), node('weather', 'tool_call', 'Weather'), node('pick', 'set', 'Pick'), node('out', 'return', 'Return')],
  edges: [edge('in', 'weather'), edge('weather', 'pick'), edge('pick', 'out')],
  ...over,
})
const run = (output: ToolRun['steps'][number]['output'], status: ToolRun['steps'][number]['status'] = 'completed'): ToolRun => ({
  id: 'run',
  toolId: 'tool',
  version: 'draft',
  startedAt: '',
  finishedAt: '',
  status: 'completed',
  input: {},
  mode: 'preview',
  steps: [{ nodeId: 'weather', label: 'Weather', type: 'tool_call', status, output }],
})

describe('tool value sources', () => {
  it('offers nothing without an input step, and nothing for the input step itself', () => {
    expect(toolValueSources(definition({ nodes: [node('a'), node('b')] }), 'b')).toEqual([])
    expect(toolValueSources(definition(), 'in')).toEqual([])
  })
  it('offers caller inputs with safe names only, marking optional ones', () => {
    const paths = toolValueSources(definition(), 'weather').filter(source => source.path.startsWith('$input.'))
    expect(paths).toEqual([
      { path: '$input.city', label: 'city', detail: 'Caller input · string' },
      { path: '$input.days', label: 'days', detail: 'Caller input · number · optional' },
    ])
  })
  it('offers only caller inputs for a step the input never reaches', () => {
    const sources = toolValueSources(definition({ nodes: [...definition().nodes, node('island')] }), 'island')
    expect(sources.map(source => source.path)).toEqual(['$input.city', '$input.days'])
  })
  it('offers the previous result and steps that run before, not steps after or itself', () => {
    const paths = toolValueSources(definition(), 'pick').map(source => source.path)
    expect(paths).toEqual(['$input.city', '$input.days', '$last', '$steps.weather'])
  })
  it('does not offer a step on a branch that may be skipped', () => {
    const branching = definition({
      nodes: [node('in', 'input'), node('check', 'condition'), node('yes'), node('no'), node('join')],
      edges: [edge('in', 'check'), edge('check', 'yes'), edge('check', 'no'), edge('yes', 'join'), edge('no', 'join')],
    })
    const paths = toolValueSources(branching, 'join').map(source => source.path)
    expect(paths).toContain('$steps.check')
    expect(paths).not.toContain('$steps.yes')
    expect(paths).not.toContain('$steps.no')
  })
  it('offers fields seen in the last test, two levels deep, skipping unsafe keys', () => {
    const output = { temp: 4, nested: { deep: { deeper: 1 } }, list: [1], constructor: 'x', 'bad key': 1 }
    const paths = toolValueSources(definition(), 'pick', run(output)).map(source => source.path)
    expect(paths).toContain('$steps.weather.temp')
    expect(paths).toContain('$steps.weather.nested')
    expect(paths).toContain('$steps.weather.nested.deep')
    expect(paths).not.toContain('$steps.weather.nested.deep.deeper')
    expect(paths).toContain('$steps.weather.list')
    expect(paths).not.toContain('$steps.weather.list.0')
    expect(paths).not.toContain('$steps.weather.constructor')
    expect(paths).not.toContain('$steps.weather.bad key')
  })
  it('ignores fields from steps that did not complete or have no object output', () => {
    expect(toolValueSources(definition(), 'pick', run({ temp: 4 }, 'failed')).map(source => source.path)).not.toContain('$steps.weather.temp')
    expect(toolValueSources(definition(), 'pick', run('text')).map(source => source.path)).toEqual(['$input.city', '$input.days', '$last', '$steps.weather'])
  })
})
