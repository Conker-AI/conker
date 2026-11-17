// The browser transport only sends routes it lists. A screen whose route is missing works in the
// preview (the fake gateway skips the transport) and is refused on a real server, so each owner route
// a screen calls is proven here against the real transport.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..'), cache = new Map()
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports
  const module = { exports: {} }; cache.set(relative, module)
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(request => request === 'zod' ? require('zod') : load(`${path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))}.ts`), module, module.exports)
  return module.exports
}
const { createGatewayTransport, snapshotGatewayOperation } = load('src/lib/gateway/transport.ts')
const origin = 'https://conker.test'
async function main() {
  const urls = []
  const transport = createGatewayTransport({ origin, fetch: async url => { urls.push(url); return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }) } })
  for (const route of ['/api/control/pi/memory/upkeep', '/api/control/pi/memory/beliefs']) await transport.request(route)
  await transport.request('/api/control/pi/memory/beliefs', { query: { origin: 'stated', state: 'all', limit: 50 } })
  await transport.request('/api/control/pi/memory/mem_judo/uses', { query: { limit: 1 } })
  await transport.request('/api/control/pi/open-loops', { query: { state: 'done', limit: 50 } })
  await transport.request('/api/control/pi/memory/recall-notices')
  assert.equal(snapshotGatewayOperation('/api/control/pi/memory/recall-notices/mrn_' + '0'.repeat(32) + '/dismiss', {}).path, '/api/control/pi/memory/recall-notices/mrn_' + '0'.repeat(32) + '/dismiss')
  assert.equal(urls.length, 6)
  assert.ok(urls[2].includes('origin=stated'))
  // Team runs: one run by its id, its steps, check and finish. Pi's browser contract also allows starting a run; the browser never does.
  const run = '/api/control/pi/team-runs/teamrun_' + 'a'.repeat(32), csrfToken = 'x'.repeat(43)
  await transport.request(run)
  for (const action of ['steps', 'reconcile', 'finish']) await transport.request(`${run}/${action}`, { method: 'POST', csrfToken, body: {} })
  assert.equal(urls.length, 9); urls.length = 5
  await assert.rejects(transport.request('/api/control/pi/team-runs'), error => error.kind === 'validation')
  await assert.rejects(transport.request(`${run}/steps`), error => error.kind === 'validation')
  assert.equal(snapshotGatewayOperation(`${run}/finish`, { expected_revision: 3, state: 'cancelled' }).path, `${run}/finish`)
  assert.equal(snapshotGatewayOperation('/api/control/pi/prompts/enhance', { text: 'plan my week' }).path, '/api/control/pi/prompts/enhance')
  assert.throws(() => snapshotGatewayOperation('/api/control/pi/memory/recall-notices/mrn_0/dismiss', {}), error => error.kind === 'validation')
  await assert.rejects(transport.request('/api/control/pi/open-loops/loop_0/state'), error => error.kind === 'validation')
  await assert.rejects(transport.request('/api/control/pi/memory/mem_judo/uses/extra'), error => error.kind === 'validation')
  await assert.rejects(transport.request('/api/control/pi/memory/unknown'), error => error.kind === 'validation')
  assert.throws(() => snapshotGatewayOperation('/api/control/pi/prompts/other', {}), error => error.kind === 'validation')
  console.log('Pi routes: memory care, beliefs, recall notices, team runs and prompt enhance pass the transport; unknown routes are refused')
}
main().catch(error => { console.error(error); process.exit(1) })
