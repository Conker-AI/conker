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
  new Function('require', 'module', 'exports', code)(request => {
    if (request === 'zod') return require('zod')
    if (request.startsWith('@/')) return load(`src/${request.slice(2)}.ts`)
    return load(`${path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))}.ts`)
  }, module, module.exports)
  return module.exports
}

const { createGatewayCharactersClient, GatewayCharacterMutationError } = load('src/lib/gateway/characters.ts')
const { createGatewayTransport, snapshotGatewayOperation, GatewayError } = load('src/lib/gateway/transport.ts')
const { createCharacterStudio } = load('src/lib/api/character-defaults.ts')
const profile = {
  name: 'Conker', mood: '', personality: 'Steady and curious.', speakingStyle: 'Clear and concise.', speakingPreset: 'custom',
  portrait: '/conker.png', renderer: 'static', face: 'sprout', tone: 'green',
  emotions: { neutral: 'default', happy: 'portrait', thinking: 'portrait', concerned: 'default', celebrating: 'portrait' },
  studio: createCharacterStudio(),
}

async function main() {
  const calls = []
  let result = { agentId: 'companion', revision: 1, profile }
  const client = createGatewayCharactersClient({ request: async (...args) => { calls.push(args); return structuredClone(result) } })
  assert.equal((await client.get()).revision, 1)
  assert.deepEqual(calls.pop(), ['/api/control/pi/characters/companion', { query: undefined, signal: undefined }])
  result = { results: [{ revision: 1, created_at: 1, restored_from: null }] }
  assert.equal((await client.history())[0].revision, 1)
  result = { agentId: 'companion', revision: 2, profile }
  assert.equal((await client.save(profile, 1)).revision, 2)
  assert.equal(calls.pop()[0], '/api/control/pi/characters/companion/save')
  result = { profile, note: 'Imported into a draft.' }
  assert.equal((await client.importDraft(JSON.stringify({ format: 'conker-character', version: 1, character: profile }))).profile.name, 'Conker')
  result = { format: 'conker-character', version: 1, character: profile }
  assert.equal((await client.export()).format, 'conker-character')
  const conflict = createGatewayCharactersClient({ request: async () => { throw new GatewayError('http', 409) } })
  await assert.rejects(conflict.save(profile, 1), error => error instanceof GatewayCharacterMutationError && error.outcome === 'conflict')
  result = { agentId: 'companion', revision: 1, profile: { ...profile, surprise: true } }
  await assert.rejects(client.get(), error => error.kind === 'invalid-response')

  const large = { text: 'x'.repeat(70_000) }
  assert.equal(snapshotGatewayOperation('/api/control/pi/characters/companion/import', large).body.text.length, 70_000)
  assert.throws(() => snapshotGatewayOperation('/api/control/pi/models/configuration', large), error => error.kind === 'too-large')
  assert.throws(() => snapshotGatewayOperation(`/api/control/pi/characters/agent_${'a'.repeat(32)}/import`, large), error => error.kind === 'validation')

  let requests = 0
  const transport = createGatewayTransport({ origin: 'https://localhost:8050', fetch: async request => {
    requests++
    return new Response(JSON.stringify({ ok: true, path: String(request) }), { headers: { 'content-type': 'application/json' } })
  } })
  await transport.request('/api/control/pi/characters/companion/import', { method: 'POST', csrfToken: 'x'.repeat(43), body: large })
  await transport.request('/api/control/pi/characters/companion/history')
  await assert.rejects(transport.request('/api/control/pi/characters/companion/import'), error => error.kind === 'validation')
  await assert.rejects(transport.request(`/api/control/pi/characters/agent_${'a'.repeat(32)}`), error => error.kind === 'validation')
  assert.equal(requests, 2)

  const ui = fs.readFileSync(path.join(root, 'src/components/gateway/character-workspace.tsx'), 'utf8')
  assert.match(ui, /Saved immutable revision/)
  assert.match(ui, /Saving still uses the current revision check/)
  assert.match(ui, /Every save and restore creates a new immutable revision/)
  console.log('Gateway Character Studio passed: strict packages, Companion-only routes, large bounded media envelopes, CAS saves, import, export and immutable restore history.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
