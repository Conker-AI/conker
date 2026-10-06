const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const cache = new Map()
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports
  const source = fs.readFileSync(path.join(root, relative), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const module = { exports: {} }
  cache.set(relative, module)
  new Function('require', 'module', 'exports', compiled.outputText)(request => {
    if (request === 'd3-hierarchy') return require(request)
    assert.ok(request.startsWith('.'), `Unexpected runtime dependency: ${request}`)
    return load(`${path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))}.ts`)
  }, module, module.exports)
  return module.exports
}
const { memoryDemo } = load('src/lib/memory-demo.ts')
const { workspaceGraph, layoutMemoryGraph, layoutCompactMemoryGraph } = load('src/lib/memory-layout.ts')
assert.equal(memoryDemo.length, 50)
assert.equal(new Set(memoryDemo.map(memory => memory.category)).size, 5)
assert.equal(new Set(memoryDemo.map(memory => memory.id)).size, memoryDemo.length)
assert.ok(memoryDemo.every(memory => memory.id.startsWith('demo-') && memory.origin === 'manual' && memory.provenance.includes('fictional')))
const original = JSON.stringify(memoryDemo)
for (const hierarchy of [false, true]) {
  const graph = workspaceGraph(memoryDemo, hierarchy)
  const ids = new Set(graph.nodes.map(node => node.id))
  assert.equal(ids.size, graph.nodes.length)
  assert.equal(new Set(graph.edges.map(edge => edge.id)).size, graph.edges.length)
  assert.equal(graph.nodes.filter(node => node.kind === 'memory').length, 50)
  assert.equal(graph.nodes.filter(node => node.kind === 'folder').length, 6)
  assert.equal(graph.nodes.filter(node => node.kind === 'source').length, 0, 'Demo does not fabricate source documents')
  assert.equal(graph.edges.filter(edge => edge.kind === 'parent').length, 55)
  assert.ok(graph.nodes.filter(node => node.kind === 'topic').some(node => new Set(node.memoryIds.map(id => memoryDemo.find(memory => memory.id === id).category)).size >= 3), 'Demo has shared topics that bridge categories')
  assert.ok(graph.nodes.every(node => Number.isInteger(node.colorIndex) && node.colorIndex >= 0 && node.colorIndex < 5))
  for (const edge of graph.edges) assert.ok(ids.has(edge.source) && ids.has(edge.target), 'No dangling links')
  const positions = layoutMemoryGraph(graph.nodes, graph.edges, hierarchy)
  const compact = layoutCompactMemoryGraph(graph.nodes, hierarchy)
  assert.equal(compact.size, graph.nodes.length, 'Portrait view retains all real nodes')
  assert.deepEqual(compact, layoutCompactMemoryGraph([...graph.nodes].reverse(), hierarchy), 'Portrait positions are order independent')
  assert.ok([...compact.values()].every(point => Number.isFinite(point.x) && Number.isFinite(point.y)))
  assert.ok(Math.max(...[...compact.values()].map(point => point.x)) <= 176, 'Portrait layout preserves readable label space')
  if (hierarchy) graph.nodes.filter(node => node.parentId).forEach(node => assert.ok(compact.get(node.id).y > compact.get(node.parentId).y))
  assert.equal(positions.size, graph.nodes.length)
  assert.deepEqual(positions, layoutMemoryGraph(graph.nodes, graph.edges, hierarchy), 'Layout must be repeatable')
  assert.ok([...positions.values()].every(point => Number.isFinite(point.x) && Number.isFinite(point.y)))
  for (const node of graph.nodes.filter(node => node.kind === 'memory')) {
    const parent = graph.nodes.find(candidate => candidate.id === node.parentId)
    assert.ok(parent && parent.kind === 'folder' && parent.memoryIds.includes(node.memoryIds[0]))
    if (hierarchy) assert.ok(positions.get(node.id).y > positions.get(parent.id).y, 'Hierarchy reads from parent down to child')
  }
  if (hierarchy) {
    const points = [...positions.values()]
    assert.ok(Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x)) < 1500, 'Demo hierarchy fits a compact workspace width')
    assert.ok(Math.max(...points.map(point => point.y)) - Math.min(...points.map(point => point.y)) < 1100, 'Demo hierarchy fits a compact workspace height')
  }
}
assert.equal(JSON.stringify(memoryDemo), original, 'Projection and layout do not mutate memories')
assert.deepEqual(workspaceGraph([], false), { nodes: [], edges: [] })
assert.equal(layoutMemoryGraph([], [], true).size, 0)
assert.equal(layoutCompactMemoryGraph([], true).size, 0)
const tiny = workspaceGraph(memoryDemo.slice(0, 1), false)
assert.equal(layoutMemoryGraph(tiny.nodes, tiny.edges, false).size, tiny.nodes.length)
console.log('Memory demo and layouts passed: isolated fictional data, valid links, stable positions and parent-child structure.')
