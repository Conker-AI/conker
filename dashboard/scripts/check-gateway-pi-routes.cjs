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
  assert.equal(urls.length, 3)
  assert.ok(urls[2].includes('origin=stated'))
  assert.equal(snapshotGatewayOperation('/api/control/pi/prompts/enhance', { text: 'plan my week' }).path, '/api/control/pi/prompts/enhance')
  await assert.rejects(transport.request('/api/control/pi/memory/unknown'), error => error.kind === 'validation')
  assert.throws(() => snapshotGatewayOperation('/api/control/pi/prompts/other', {}), error => error.kind === 'validation')
  console.log('Pi routes: memory care, beliefs and prompt enhance pass the transport; unknown routes are refused')
}
main().catch(error => { console.error(error); process.exit(1) })
