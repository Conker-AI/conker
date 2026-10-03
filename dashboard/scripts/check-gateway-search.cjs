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
const { createGatewaySearchClient } = load('src/lib/gateway/search.ts')
const { isConversationWrite, snapshotGatewayOperation } = load('src/lib/gateway/transport.ts')
async function main() {
  const calls = [], controller = new AbortController()
  let response = { revision: 0, configuration: { sources: ['conversations'], exactText: true, semantic: false, reranking: false }, credential: 'never project' }
  const client = createGatewaySearchClient({ request: async (...args) => { calls.push(args); return structuredClone(response) } })
  assert.equal((await client.settings(controller.signal)).credential, undefined)
  assert.deepEqual(calls.pop(), ['/api/control/pi/search/settings', { signal: controller.signal }])
  const configuration = response.configuration
  response = { revision: 1, configuration }
  await client.save(configuration, 0)
  assert.deepEqual(calls.pop(), ['/api/control/pi/search/settings', { method: 'POST', body: { configuration, expected_revision: 0 } }])
  assert.equal(isConversationWrite('/api/control/pi/search/settings'), false)
  assert.equal(snapshotGatewayOperation('/api/control/pi/search/settings', { configuration, expected_revision: 0 }).path, '/api/control/pi/search/settings')
  response.revision = 8
  await assert.rejects(client.save(configuration, 0), error => error.kind === 'invalid-response')
  response = { stage: 'text', results: [{ id: 'conversations:msg_one:text', source: 'conversations', recordId: 'msg_one', title: 'Planning', excerpt: 'שלום needle', href: '/chat?session=ses_one&message=msg_one', matchType: 'text', role: 'assistant' }], nextCursor: 'digest:30', coverage: [{ source: 'conversations', status: 'searched' }, { source: 'memory', status: 'unavailable' }], ranking: { status: 'fallback' }, protected: 'hidden' }
  const result = await client.query(' שלום ', 'text', controller.signal)
  assert.equal(result.results[0].role, 'assistant')
  assert.equal(result.protected, undefined)
  assert.deepEqual(calls.pop(), ['/api/control/pi/search', { query: { q: 'שלום', stage: 'text' }, signal: controller.signal }])
  await client.query('needle', 'text', controller.signal, 'digest:30')
  assert.equal(calls.pop()[1].query.cursor, 'digest:30')
  for (const href of ['https://external.example', '//external.example', '/unknown', '/chat\\evil', '/chat\n']) {
    response.results[0].href = href
    await assert.rejects(client.query('needle', 'text'), error => error.kind === 'invalid-response')
  }
  response.results[0].href = '/chat?message=msg_one'
  response.stage = 'semantic'
  await assert.rejects(client.query('needle', 'text'), error => error.kind === 'invalid-response')
  const count = calls.length
  for (const query of ['', '   ', 'x'.repeat(201)]) await assert.rejects(client.query(query, 'text'))
  assert.equal(calls.length, count, 'invalid requests must not reach transport')
  const ui = fs.readFileSync(path.join(root, 'src/components/gateway/universal-search.tsx'), 'utf8')
  assert.match(ui, /controller\.abort\(\)/)
  assert.match(ui, /controller\.signal\.aborted/)
  assert.match(ui, /shouldFilter=\{false\}/, 'cmdk must not hide backend semantic matches')
  assert.match(ui, /!configuration\.semantic/)
  assert.match(ui, /!configuration\.exactText/)
  assert.match(ui, /select\(item\.href\)/)
  console.log('Gateway search passed: strict DTOs, exact message links, privacy-safe projections, verification, cancellation boundaries and explicit stage gating.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
