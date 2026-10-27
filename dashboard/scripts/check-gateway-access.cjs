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
    load(request.startsWith('@/') ? `src/${request.slice(2)}.ts` : `${path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))}.ts`), module, module.exports)
  return module.exports
}

const { createAccessClient } = load('src/lib/gateway/access.ts')
const { createGatewayTransport, isConversationWrite } = load('src/lib/gateway/transport.ts')

async function main() {
  const calls = []
  let reply = { delegate: false, sensitive: ['bank.pay'], floorExecutions: ['port_control'] }
  const client = createAccessClient({ request: async (...args) => { calls.push(args); return structuredClone(reply) } })
  assert.equal((await client.state()).delegate, false)
  reply = { delegate: false, sensitive: [], floorExecutions: [], key: 'x' }
  await assert.rejects(client.state(), error => error.kind === 'invalid-response', 'The access view is exact')
  reply = { delegate: true }
  assert.equal(await client.setDelegate(true), true)
  assert.deepEqual(calls.at(-1), ['/api/owner/access/delegate', { method: 'POST', body: { enabled: true } }])
  reply = { delegate: false }
  await assert.rejects(client.setDelegate(true), error => error.kind === 'invalid-response', 'A switch that did not change is not reported as changed')
  reply = { id: 'mail.send', sensitive: true }
  assert.equal(await client.setSensitive('mail.send', true), true)
  assert.deepEqual(calls.at(-1), ['/api/owner/tools/mail.send/sensitive', { method: 'POST', body: { sensitive: true } }])
  await assert.rejects(client.setSensitive('../mail', true), error => error.kind === 'validation')
  const grant = { schemaVersion: 1, toolId: 'sandbox.run', actorId: 'k1', actorName: 'Pi', enabled: false, requiredScope: 'tool:sandbox.run', digest: 'd'.repeat(64) }
  reply = grant
  assert.equal((await client.toolAccess('sandbox.run')).enabled, false)
  assert.deepEqual(calls.at(-1)[0], '/api/owner/tools/sandbox.run/access')
  reply = { ...grant, toolId: 'other.tool' }
  await assert.rejects(client.toolAccess('sandbox.run'), error => error.kind === 'invalid-response', 'The answer is about the tool asked for')
  reply = { ...grant, enabled: true }
  assert.equal((await client.setToolAccess('sandbox.run', true, 'd'.repeat(64))).enabled, true)
  assert.deepEqual(calls.at(-1), ['/api/owner/tools/sandbox.run/access', { method: 'POST', body: { enabled: true, expected_digest: 'd'.repeat(64) } }])
  reply = grant
  await assert.rejects(client.setToolAccess('sandbox.run', true, 'd'.repeat(64)), error => error.kind === 'invalid-response', 'A grant that did not change is not reported as changed')
  await assert.rejects(client.setToolAccess('sandbox.run', true, 'stale'), error => error.kind === 'validation', 'Only an exact digest is sent')
  reply = { schemaVersion: 1, results: [{ id: `hnd_${'a'.repeat(32)}`, sessionId: null, turnId: null, toolId: 'mail.send', decidedBy: 'owner_request', reason: 'He asked.', createdAt: 1 }] }
  assert.equal((await client.handled())[0].decidedBy, 'owner_request')
  reply = { schemaVersion: 1, results: [{ id: `hnd_${'a'.repeat(32)}`, sessionId: null, turnId: null, toolId: 'mail.send', decidedBy: 'model', reason: '', createdAt: 1 }] }
  await assert.rejects(client.handled(), error => error.kind === 'invalid-response', 'Only the five deciders exist')

  let requests = 0
  const transport = createGatewayTransport({ origin: 'https://localhost:8050', fetch: async () => { requests++; return new Response('{"delegate":true}', { headers: { 'content-type': 'application/json' } }) } })
  await transport.request('/api/owner/access')
  await transport.request('/api/control/pi/access/handled')
  await assert.rejects(transport.request('/api/owner/access/keys'), error => error.kind === 'validation')
  assert.equal(requests, 2)
  assert.equal(isConversationWrite('/api/owner/access/delegate'), false, 'Letting Conker decide asks for the password')
  assert.equal(isConversationWrite('/api/owner/tools/mail.send/sensitive'), false, 'Changing the floor asks for the password')
  assert.equal(isConversationWrite('/api/owner/tools/sandbox.run/access'), false, 'Letting Conker use a tool asks for the password')
  await transport.request('/api/owner/tools/sandbox.run/access')
  assert.equal(requests, 3)

  const control = fs.readFileSync(path.join(root, 'src/lib/gateway/control.ts'), 'utf8')
  assert.match(control, /access: z\.enum\(\['default', 'ask', 'ai', 'full'\]\)\.optional\(\)/, 'Chat settings carry the access switch')
  assert.match(control, /toolAccess: z\.record\(agentReference, z\.enum\(\['allow', 'ai', 'ask'\]\)\)/, 'Agents carry per-tool access')
  const chat = fs.readFileSync(path.join(root, 'src/components/gateway/session-access-control.tsx'), 'utf8')
  assert.match(chat, /Sensitive tools always ask you/, 'The chat switch states the floor')
  console.log('Gateway access passed: exact views, password-bound switches, tool grants, five deciders, chat and agent layers.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
