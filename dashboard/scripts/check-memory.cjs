const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { webcrypto } = require('node:crypto')
const root = path.resolve(__dirname, '..')
const ts = require(path.join(root, 'node_modules/typescript'))
const cache = new Map()
globalThis.crypto ??= webcrypto

function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports
  const source = fs.readFileSync(path.join(root, relative), 'utf8').replaceAll('import.meta.env', '({})')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const module = { exports: {} }
  cache.set(relative, module)
  const resolve = request => {
    if (request === 'zod') return require(path.join(root, 'node_modules/zod'))
    assert.ok(request.startsWith('.'), `Unexpected dependency: ${request}`)
    return load(`${path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))}.ts`)
  }
  new Function('require', 'module', 'exports', compiled.outputText)(resolve, module, module.exports)
  return module.exports
}

async function main() {
  const { memoryGraph, memoryNeighborhood, filterMemories } = load('src/lib/memory-explorer.ts')
  // Sample memories (test data only) moved here when the legacy fixture shell was deleted.
  const initial = { memories: load('scripts/fixtures/memories.ts').memories }
  const graph = memoryGraph(initial.memories)
  assert.equal(new Set(graph.nodes.map(node => node.id)).size, graph.nodes.length, 'Graph node IDs are unique')
  assert.equal(new Set(graph.edges.map(edge => edge.id)).size, graph.edges.length, 'Graph edge IDs are unique')
  assert.equal(graph.nodes.filter(node => node.kind === 'memory').length, initial.memories.length)
  assert.ok(graph.edges.some(edge => edge.kind === 'topic'))
  assert.ok(graph.edges.some(edge => edge.kind === 'source'))
  const nodeById = new Map(graph.nodes.map(node => [node.id, node]))
  for (const edge of graph.edges) {
    assert.ok(nodeById.has(edge.source) && nodeById.has(edge.target), 'Every edge resolves to visible nodes')
    const kinds = [nodeById.get(edge.source).kind, nodeById.get(edge.target).kind].sort()
    assert.deepEqual(kinds, ['memory', edge.kind].sort(), 'Edges describe source or topic metadata, not invented semantic links')
  }
  assert.deepEqual(memoryNeighborhood('memory:judo', graph.edges, 0), new Set(['memory:judo']))
  const oneHop = memoryNeighborhood('memory:judo', graph.edges, 1)
  assert.deepEqual(oneHop, new Set(['memory:judo', 'topic:judo', 'topic:routine', 'source:/chat/week#intent']))
  const twoHops = memoryNeighborhood('memory:judo', graph.edges, 2)
  assert.deepEqual(twoHops, new Set([...oneHop, 'memory:study', 'memory:mornings']))
  assert.ok(!memoryNeighborhood('memory:judo', graph.edges, 10).has('memory:server'), 'Unrelated server stays disconnected at every depth')

  const shared = memoryGraph([
    { ...initial.memories[0], id: 'shared-a', tags: ['Routine'] },
    { ...initial.memories[0], id: 'shared-b', tags: ['routine'] },
  ])
  assert.equal(shared.nodes.filter(node => node.kind === 'source').length, 1, 'Identical source references share one source node')
  assert.equal(shared.nodes.filter(node => node.kind === 'topic').length, 1, 'Topic casing does not split shared topics')
  assert.deepEqual(shared.nodes.find(node => node.kind === 'source').memoryIds, ['shared-a', 'shared-b'])
  assert.equal(shared.edges.filter(edge => edge.kind === 'source').length, 2)
  const repeatedTopic = memoryGraph([{ ...initial.memories[0], tags: ['Judo', 'judo', 'Judo'] }])
  assert.equal(repeatedTopic.nodes.filter(node => node.kind === 'topic').length, 1)
  assert.equal(repeatedTopic.edges.filter(edge => edge.kind === 'topic').length, 1, 'Repeated topic labels must not produce duplicate edge IDs')
  const withoutSources = memoryGraph(initial.memories, false)
  assert.ok(withoutSources.nodes.every(node => node.kind !== 'source'))
  assert.ok(withoutSources.edges.every(edge => edge.kind !== 'source'))

  assert.deepEqual(filterMemories(initial.memories, '  JUDO tuesdays ', 'all').map(memory => memory.id), ['judo'])
  assert.deepEqual(filterMemories(initial.memories, 'judo nonexistent', 'all'), [], 'All lexical query terms must match')
  assert.deepEqual(filterMemories(initial.memories, 'judo', 'Training').map(memory => memory.id), ['judo'], 'Category and query combine with AND')
  const russian = filterMemories(initial.memories, 'ПРЕДПОЧИТАЮ школой', 'Preference')
  assert.deepEqual(russian.map(memory => memory.id), ['mornings'])
  assert.equal(russian[0].text, 'Я предпочитаю тренироваться перед школой.', 'Search preserves original multilingual text')
  assert.equal(russian[0].language, 'ru')
  assert.deepEqual(filterMemories(initial.memories, '   ', 'all'), initial.memories)

  console.log('Memory checks passed: metadata graphs, shared sources, neighborhoods, multilingual AND search.')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
