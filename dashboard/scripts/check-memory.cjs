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
  const { createFixtureClient } = load('src/lib/api/fixture-adapter.ts')
  const client = createFixtureClient()
  const initial = await client.load()
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

  const input = { title: '  Training note  ', text: '  Я люблю дзюдо.  ', category: '  Training  ', tags: [' Judo ', '', 'Judo', 'Practice'] }
  const invalidInputs = [
    { title: ' ' }, { title: 'x'.repeat(101) }, { text: '' }, { text: 'x'.repeat(16001) },
    { category: ' ' }, { category: 'x'.repeat(51) }, { tags: ['x'.repeat(41)] },
    { tags: Array.from({ length: 9 }, (_, index) => `Topic ${index}`) },
  ]
  for (const invalid of invalidInputs) {
    await assert.rejects(client.createMemory({ ...input, ...invalid }))
    await assert.rejects(client.saveMemory('judo', { ...input, ...invalid }))
  }
  await assert.rejects(client.saveMemory('missing', input), /Memory not found/)
  await assert.rejects(client.deleteMemory('missing'), /Memory not found/)
  assert.deepEqual(await client.load(), initial, 'Rejected writes leave the snapshot unchanged')

  const created = await client.createMemory(input)
  assert.equal(created.title, 'Training note')
  assert.equal(created.text, 'Я люблю дзюдо.')
  assert.equal(created.category, 'Training')
  assert.deepEqual(created.tags, ['Judo', 'Practice'])
  assert.equal(created.origin, 'manual')
  assert.equal(created.confidence, 'Unreviewed')
  assert.equal(created.source, `/memory#${created.id}`)
  const manualGraph = memoryGraph([created])
  assert.ok(manualGraph.nodes.every(node => node.kind !== 'source'), 'Manual notes do not pretend to have external sources')
  assert.ok(manualGraph.edges.every(edge => edge.kind !== 'source'))
  input.tags.push('Outside input mutation')
  created.text = 'Outside result mutation'
  created.tags.push('Outside result mutation')
  const snapshot = await client.load()
  const stored = snapshot.memories.find(memory => memory.id === created.id)
  assert.equal(stored.text, 'Я люблю дзюдо.')
  assert.deepEqual(stored.tags, ['Judo', 'Practice'], 'Input and result arrays are isolated')
  stored.tags.push('Outside snapshot mutation')
  snapshot.memories.length = 0
  assert.equal((await client.load()).memories.length, initial.memories.length + 1, 'Loading returns an isolated snapshot')

  const sourceMemory = initial.memories.find(memory => memory.id === 'judo')
  const editInput = { title: 'Changed schedule', text: 'Judo starts at 19:00.', category: 'Training', tags: ['Judo'] }
  const edited = await client.saveMemory('judo', editInput)
  assert.equal(edited.originalText, sourceMemory.text)
  assert.equal(edited.source, sourceMemory.source)
  assert.equal(edited.provenance, sourceMemory.provenance)
  editInput.tags.push('Outside edit input')
  edited.tags.push('Outside edit result')
  assert.deepEqual((await client.load()).memories.find(memory => memory.id === 'judo').tags, ['Judo'])
  const editedAgain = await client.saveMemory('judo', { ...editInput, text: 'Judo starts at 19:30.', tags: ['Judo'] })
  assert.equal(editedAgain.originalText, sourceMemory.text, 'Repeated edits retain the original source text')
  assert.equal(editedAgain.source, sourceMemory.source)
  assert.equal(editedAgain.provenance, sourceMemory.provenance)
  await client.deleteMemory(created.id)
  await assert.rejects(client.deleteMemory(created.id), /Memory not found/)
  const after = await client.load()
  assert.ok(!after.memories.some(memory => memory.id === created.id))
  assert.deepEqual({ ...after, memories: initial.memories }, initial, 'Memory actions leave other screens unchanged')
  assert.deepEqual((await createFixtureClient().load()).memories, initial.memories, 'A new adapter resets preview edits')
  console.log('Memory checks passed: metadata graphs, shared sources, neighborhoods, multilingual AND search, validation, CRUD isolation, provenance preservation, and preview reset.')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
