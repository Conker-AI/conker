const assert = require('node:assert/strict')
const { build } = require('esbuild')

async function main() {
  const bundle = await build({ entryPoints: ['src/lib/gateway/memory-graph.ts'], bundle: true, write: false, format: 'cjs', platform: 'node' })
  const module = { exports: {} }
  new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(module, module.exports, require)
  const { readMemoryGraph, projectMemoryGraph, layoutMemoryAtlas } = module.exports
  const record = (id, type = 'memory') => ({ id, type, title: id, preview: 'Preview', available_fields: ['text'] })
  const records = [record('a'), record('b'), record('source', 'evidence')]
  const link = { id: 'ab', source_type: 'memory', source_id: 'a', target_type: 'memory', target_id: 'b', relationship: 'supports', confidence: .8 }
  let active = 0, peak = 0, calls = 0
  const client = { connections: async () => {
    active++; peak = Math.max(peak, active); calls++
    await new Promise(resolve => setTimeout(resolve, 1)); active--
    return { nodes: [], links: [link], next_after: null }
  } }
  const result = await readMemoryGraph(client, records, new AbortController().signal)
  assert.equal(result.links.length, 1, 'duplicate server link IDs are collapsed')
  assert.equal(result.nodes.length, 3)
  assert.equal(result.partial, false)
  assert.equal(calls, 3)
  const graph = projectMemoryGraph(result.nodes, result.links, false)
  assert.equal(graph.nodes.filter(node => node.kind !== 'folder').length, 3)
  assert.equal(graph.edges.filter(edge => edge.kind !== 'parent').length, 1)
  assert.equal(graph.edges.find(edge => edge.relationship)?.relationship, 'supports')
  assert.equal(graph.nodes.find(node => node.id === 'evidence:source').kind, 'source')
  const original = JSON.stringify(graph)
  const layout = layoutMemoryAtlas(graph.nodes, graph.edges, false)
  assert.deepEqual(layout, layoutMemoryAtlas([...graph.nodes].reverse(), [...graph.edges].reverse(), false), 'layout independent of request completion order')
  assert.equal(JSON.stringify(graph), original, 'D3 cannot mutate application records')
  assert.equal(layout.size, graph.nodes.length)
  assert.ok([...layout.values()].every(point => Number.isFinite(point.x) && Number.isFinite(point.y)))
  const tree = projectMemoryGraph(records, [link], true)
  const treePositions = layoutMemoryAtlas(tree.nodes, tree.edges, true)
  tree.nodes.filter(node => node.parentId).forEach(node => assert.ok(treePositions.get(node.id).x > treePositions.get(node.parentId).x))
  assert.equal(projectMemoryGraph(records, [{ ...link, target_id: 'absent' }], true).edges.filter(edge => edge.kind !== 'parent').length, 0)
  const failed = await readMemoryGraph({ connections: async () => { throw new Error('offline') } }, records, new AbortController().signal)
  assert.equal(failed.failures, 3); assert.equal(failed.partial, true)
  const paged = await readMemoryGraph({ connections: async () => ({ nodes: [], links: [], next_after: 'next' }) }, records, new AbortController().signal)
  assert.equal(paged.partial, true)
  const many = Array.from({ length: 150 }, (_, index) => record(String(index)))
  calls = 0
  const limited = await readMemoryGraph(client, many, new AbortController().signal)
  assert.equal(calls, 100); assert.ok(peak <= 4); assert.equal(limited.partial, true)
  const controller = new AbortController(); controller.abort()
  await assert.rejects(readMemoryGraph(client, records, controller.signal), error => error.name === 'AbortError')
  const dense = projectMemoryGraph(many, [], false)
  assert.equal(layoutMemoryAtlas(dense.nodes, dense.edges, false).size, 151)
  assert.equal(layoutMemoryAtlas([], [], true).size, 0)
  console.log('Gateway memory graph passed: bounded metadata, cancellation, honest links/grouping, stable force/tree layouts and 150-record scale.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
