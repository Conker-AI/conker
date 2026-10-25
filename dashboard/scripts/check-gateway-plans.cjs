const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..'), cache = new Map()
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports
  const module = { exports: {} }; cache.set(relative, module)
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('require', 'module', 'exports', code)(request => request === 'zod' ? require('zod') :
    load(`${path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))}.ts`), module, module.exports)
  return module.exports
}

const { createGatewayPlansClient } = load('src/lib/gateway/plans.ts')
const { createGatewayTransport } = load('src/lib/gateway/transport.ts')
const reading = { provider: 'claude', window: 'five_hour', label: '5-hour', usedPercent: 42, resetsAt: '2026-10-25T15:00:00Z', checkedAt: 1_761_390_000 }

async function main() {
  let result = { windows: [reading], alerts: [{ id: 'plan_x' }] }, seen = null
  const client = createGatewayPlansClient({ request: async (route, options) => { seen = { route, options }; return result } })
  assert.deepEqual(await client.usage(), { windows: [reading] }, 'Home keeps the windows; alerts stay with the Inbox')
  assert.equal(seen.route, '/api/control/pi/plans/usage')
  assert.equal(seen.options.method, undefined, 'Reading plan usage is a GET')
  for (const bad of [{ ...reading, usedPercent: 101 }, { ...reading, usedPercent: 4.5 }, { ...reading, provider: 'openai' }, { ...reading, label: '<script>' }, { ...reading, checkedAt: -1 }]) {
    result = { windows: [bad] }
    await assert.rejects(client.usage(), error => error.kind === 'invalid-response', JSON.stringify(bad))
  }
  result = { windows: Array.from({ length: 41 }, () => reading) }
  await assert.rejects(client.usage(), error => error.kind === 'invalid-response', 'The window list is bounded')

  let requests = 0
  const transport = createGatewayTransport({ origin: 'https://localhost:8050', fetch: async () => { requests++; return new Response(JSON.stringify({ windows: [] }), { headers: { 'content-type': 'application/json' } }) } })
  await transport.request('/api/control/pi/plans/usage')
  await assert.rejects(transport.request('/api/control/pi/plans/alerts/plan_0123456789abcdef0123456789abcdef/dismiss', { method: 'POST', csrfToken: 'x'.repeat(43), body: {} }), error => error.kind === 'validation', 'Dismissing an alert is not a browser route')
  await assert.rejects(transport.request('/api/control/pi/plans/usage', { method: 'POST', csrfToken: 'x'.repeat(43), body: {} }), error => error.kind === 'validation')
  assert.equal(requests, 1)

  const ui = fs.readFileSync(path.join(root, 'src/components/gateway/today-workspace.tsx'), 'utf8')
  assert.match(ui, /role="meter"/, 'Each window is a labelled meter')
  assert.match(ui, /may be out of date/, 'An old reading says so')
  assert.match(ui, /status === 'unsupported'/, 'An older server shows its own state, not an error')
  console.log('Gateway plans passed: strict bounded readings, one read-only route, no browser dismiss, and honest Home states.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
