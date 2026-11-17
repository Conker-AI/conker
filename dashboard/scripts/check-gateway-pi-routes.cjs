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
  // Prompt templates: the list, one template by either kind of id, a save and a delete; nothing else under /prompts.
  const posts = []
  const writer = createGatewayTransport({ origin, fetch: async (url, init) => { posts.push([init?.method, url]); return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }) } })
  const csrfToken = 'c'.repeat(43)
  const mine = 'tpl_' + '0123456789abcdef'.repeat(2)
  for (const id of ['starter-research', 'starter-bug-report', mine]) await writer.request(`/api/control/pi/prompts/templates/${id}`)
  await writer.request('/api/control/pi/prompts/templates')
  await writer.request('/api/control/pi/prompts/templates', { method: 'POST', csrfToken, body: { name: 'A', description: '', fields: [] } })
  await writer.request(`/api/control/pi/prompts/templates/${mine}`, { method: 'POST', csrfToken, body: { expected_revision: 1 } })
  await writer.request(`/api/control/pi/prompts/templates/${mine}/delete`, { method: 'POST', csrfToken, body: { expected_revision: 1 } })
  assert.equal(posts.length, 7)
  for (const bad of ['/api/control/pi/prompts/templates/other', '/api/control/pi/prompts/templates/tpl_short', '/api/control/pi/prompts/templates/starter-x/extra', '/api/control/pi/prompts/templates/starter-x/delete/more']) await assert.rejects(writer.request(bad), error => error.kind === 'validation', bad)
  await assert.rejects(writer.request(`/api/control/pi/prompts/templates/${mine}/delete`), error => error.kind === 'validation', 'delete is a POST only')
  await assert.rejects(writer.request('/api/control/pi/prompts/enhance'), error => error.kind === 'validation', 'enhance is a POST only')
  assert.ok(urls[2].includes('origin=stated'))
  // Team runs: one run by its id, its steps, check and finish. Pi's browser contract also allows starting a run; the browser never does.
  const run = '/api/control/pi/team-runs/teamrun_' + 'a'.repeat(32)
  await transport.request(run)
  for (const action of ['steps', 'reconcile', 'finish']) await transport.request(`${run}/${action}`, { method: 'POST', csrfToken, body: {} })
  assert.equal(urls.length, 10); urls.length = 6
  await assert.rejects(transport.request('/api/control/pi/team-runs'), error => error.kind === 'validation')
  await assert.rejects(transport.request(`${run}/steps`), error => error.kind === 'validation')
  assert.equal(snapshotGatewayOperation(`${run}/finish`, { expected_revision: 3, state: 'cancelled' }).path, `${run}/finish`)
  assert.equal(snapshotGatewayOperation('/api/control/pi/prompts/enhance', { text: 'plan my week' }).path, '/api/control/pi/prompts/enhance')
  await assert.rejects(transport.request('/api/control/pi/open-loops/loop_0/state'), error => error.kind === 'validation')
  await assert.rejects(transport.request('/api/control/pi/memory/mem_judo/uses/extra'), error => error.kind === 'validation')
  await assert.rejects(transport.request('/api/control/pi/memory/unknown'), error => error.kind === 'validation')
  assert.throws(() => snapshotGatewayOperation('/api/control/pi/prompts/other', {}), error => error.kind === 'validation')
  console.log('Pi routes: memory care, beliefs, recall notices, team runs, prompt enhance and prompt templates pass the transport; unknown routes are refused')
}
main().catch(error => { console.error(error); process.exit(1) })
