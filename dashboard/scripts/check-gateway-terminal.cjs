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

const { createGatewayTerminalClient } = load('src/lib/gateway/terminal.ts')
const { createGatewayTransport, isConversationWrite } = load('src/lib/gateway/transport.ts')
const id = 'browser_1234567890abcdef1234567890abcdef'

async function main() {
  const calls = []
  const responses = {
    '/api/terminal/current': { lease: id, workspace: 'Owner workspace', maximumLifetimeSeconds: 600, commandsPersisted: false, outputPersisted: false },
    '/api/terminal': { id, closed: false, replayed: false },
    [`/api/terminal/${id}`]: { data: btoa('hello'), encoding: 'base64', cursor: 5, droppedBytes: 0, exitCode: null },
    [`/api/terminal/${id}/input`]: { acceptedBytes: 2, automaticReplay: false },
    [`/api/terminal/${id}/resize`]: { resized: true },
    [`/api/terminal/${id}/close`]: { closed: true },
  }
  const client = createGatewayTerminalClient({ request: async (route, options = {}) => { calls.push([route, options]); return structuredClone(responses[route]) } })
  assert.equal((await client.current()).commandsPersisted, false)
  assert.equal((await client.create(id)).id, id)
  assert.equal((await client.read(id, 0)).cursor, 5)
  assert.equal((await client.input(id, new TextEncoder().encode('ls'))).automaticReplay, false)
  await client.resize(id, 24, 80); await client.close(id)
  assert.equal(calls.length, 6)
  assert.equal(isConversationWrite('/api/terminal'), false)
  assert.equal(isConversationWrite(`/api/terminal/${id}/input`), true)

  let requests = 0
  const transport = createGatewayTransport({ origin: 'https://localhost:8050', fetch: async url => {
    requests++
    const pathname = new URL(String(url)).pathname
    return new Response(JSON.stringify(responses[pathname]), { headers: { 'content-type': 'application/json' } })
  } })
  await transport.request('/api/terminal/current')
  await transport.request(`/api/terminal/${id}`, { query: { cursor: 0 } })
  await transport.request('/api/terminal', { method: 'POST', csrfToken: 'x'.repeat(43), body: { requestId: id } })
  await transport.request(`/api/terminal/${id}/input`, { method: 'POST', csrfToken: 'x'.repeat(43), body: { data: btoa('ls') } })
  await assert.rejects(transport.request('/api/terminal/not-safe/input', { method: 'POST', csrfToken: 'x'.repeat(43), body: { data: 'bHM=' } }), error => error.kind === 'validation')
  assert.equal(requests, 4)

  await assert.rejects(createGatewayTerminalClient({ request: async () => ({ ...responses['/api/terminal/current'], commandsPersisted: true }) }).current(), error => error.kind === 'invalid-response')
  await assert.rejects(client.resize(id, 1, 80), error => error.kind === 'validation')
  const ui = fs.readFileSync(path.join(root, 'src/components/gateway/terminal-workspace.tsx'), 'utf8')
  assert.match(ui, /Input may or may not have arrived/)
  assert.match(ui, /nothing was retried/)
  assert.match(ui, /Not saved to history or backups/)
  assert.match(ui, /Resume input without replay/)
  console.log('Gateway terminal passed: exact lease routes, strict ephemeral DTOs, bounded input, and explicit uncertain-delivery recovery.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
