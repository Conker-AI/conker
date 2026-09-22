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
const { createGatewayControlClient } = load('src/lib/gateway/control.ts')
const { snapshotGatewayOperation, createGatewayTransport } = load('src/lib/gateway/transport.ts')
const card = { type: 'memory', id: 'm_one', title: 'Project', preview: 'Short record', preview_truncated: false, status: 'active', confidence: .8, available_fields: ['text'] }
async function main() {
  const calls = []
  let result = { scope: 'all', objects: [{ ...card, connections: { derived_from: 2 } }], total: 2, next_after: 'memory:m_one', search_mode: 'text', private: 'not projected' }
  const client = createGatewayControlClient({ request: async (...args) => { calls.push(args); return structuredClone(result) } })
  const libraryResult = result
  result = { service: 'pi', version: 'test', status: 'degraded', checked_at: '2026-09-22T00:00:00Z', age_seconds: 2,
    checks: Object.fromEntries(['store', 'memory', 'local_provider', 'hosted_provider', 'action_boundary'].map(key => [key, { status: 'ok', secret: 'never project' }])) }
  const health = await client.health()
  assert.equal(health.checks.store.secret, undefined)
  assert.equal(calls.pop()[0], '/api/pi/health')
  result.service = 'wrong-service'
  await assert.rejects(client.health(), error => error.kind === 'invalid-response')
  calls.pop()
  result = { status: 'ok', results: [{ id: 'conker.echo', name: 'Echo', description: 'Local tool', inputs: [{ name: 'value', type: 'string', default: 'do not expose', secret: 'do not expose' }] }] }
  const inventory = await client.tools()
  assert.equal(calls.pop()[0], '/api/pi/tools')
  assert.deepEqual(inventory.results[0].inputs[0], { name: 'value', type: 'string' })
  result = { status: 'unavailable', results: [], reason: 'private backend exception' }
  assert.deepEqual(await client.tools(), { status: 'unavailable', results: [] })
  calls.pop()
  result = libraryResult
  const page = await client.library({ search: 'project', limit: 1 })
  assert.equal(page.next_after, 'memory:m_one')
  assert.equal(page.objects[0].connections.derived_from, 2)
  assert.equal(page.private, undefined)
  result.objects[0].confidence = 'high'
  assert.equal((await client.library()).objects[0].confidence, 'high', 'MemoryGate memories use named confidence levels; other objects use numeric values')
  assert.deepEqual(calls[0], ['/api/control/pi/memory/objects', { query: { search: 'project', limit: 1 }, signal: undefined }])
  result.scope = 'selected'
  await assert.rejects(client.library(), error => error.kind === 'invalid-response')
  await assert.rejects(client.library({ limit: 100 }), error => error.kind === 'validation')
  result = { scope: 'all', object: card, connections: {}, links: [], nodes: [], next_after: null }
  await assert.rejects(client.connections('memory', 'm_other'), error => error.kind === 'invalid-response')
  await assert.rejects(client.connections('memory', '../secret'), error => error.kind === 'validation')
  result = { revision: 0, configuration: null }
  assert.deepEqual(await client.models(), result)
  const disabled = { enabled: false, eligibleModelIds: [], modelId: null, timeoutMs: 2000, failure: 'stop', fallbackModelId: null }
  const configuration = { providers: [{ id: 'decisions', name: 'Local decisions', enabled: true, apiKeyDraft: 'NEVER SEND', endpoint: 'http://private' }], models: [], defaultModelId: null,
    roleSettings: { answerMode: 'manual', roles: { answer: disabled, routing: disabled, 'context-selection': disabled, summarization: disabled } } }
  await client.saveModels(configuration, 0)
  const saved = calls.at(-1)
  assert.equal(saved[1].method, 'POST')
  assert.ok(!JSON.stringify(saved).includes('NEVER SEND'))
  assert.ok(!JSON.stringify(saved).includes('http://private'))
  assert.equal(snapshotGatewayOperation(saved[0], saved[1].body).path, saved[0])
  result = { revision: 1, settings: { agentId: 'companion', privacy: { memoryDisabled: true, harnessDisabled: false }, projectId: 'project_1', projectSources: [{ kind: 'conversation', sessionId: 'ses_source' }] } }
  const settings = await client.sessionSettings('ses_one')
  await client.saveSessionSettings('ses_one', settings)
  assert.deepEqual(calls.at(-1)[1].body.settings.projectSources, settings.settings.projectSources)
  assert.equal(snapshotGatewayOperation(calls.at(-1)[0], calls.at(-1)[1].body).path, '/api/control/pi/sessions/ses_one/settings')
  await assert.rejects(client.sessionSettings('../secret'), error => error.kind === 'validation')
  let requests = 0
  const transport = createGatewayTransport({ origin: 'https://localhost:8050', fetch: async () => { requests++; return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } }) } })
  await transport.request('/api/control/pi/models/configuration')
  await transport.request('/api/control/pi/memory/objects', { query: { search: 'hello' } })
  await assert.rejects(transport.request('/api/control/pi/vault'), error => error.kind === 'validation')
  await transport.request('/api/control/pi/sessions/ses_one/settings')
  await assert.rejects(transport.request('/api/control/pi/sessions/ses_one/turns'), error => error.kind === 'validation')
  assert.equal(requests, 3)
  const definition = load('src/lib/tool-workspace.ts').createToolDefinition('draft-one', 'Draft one')
  result = { id: definition.id, revision: 1, updated_at: '2026-09-22T00:00:00Z', document: definition }
  const draft = await client.editorDrafts.get(definition.id)
  assert.equal(calls.pop()[0], '/api/owner/editor-drafts/draft-one')
  assert.deepEqual(draft.document, definition)
  await client.editorDrafts.save(definition, 0)
  assert.equal(calls.pop()[1].body.expected_revision, 0)
  result.id = 'different'
  await assert.rejects(client.editorDrafts.get(definition.id), error => error.kind === 'invalid-response')
  await assert.rejects(client.editorDrafts.get('../vault'), error => error.kind === 'validation')
  await transport.request('/api/owner/editor-drafts')
  await transport.request('/api/owner/editor-drafts/draft-one', { method: 'POST', csrfToken: 'x'.repeat(43), body: { expected_revision: 0, document: definition } })
  await assert.rejects(transport.request('/api/owner/editor-drafts/draft-one/publish', { method: 'POST', body: {} }), error => error.kind === 'validation')
  console.log('Gateway owner control: bounded memory reads, identity/scope checks, catalogue credential exclusion and route isolation passed.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
