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

const { createGatewayHostInventoryClient } = load('src/lib/gateway/host-inventory.ts')
const { createGatewayTransport } = load('src/lib/gateway/transport.ts')
const id = 'browser_1234567890abcdef1234567890abcdef'
const empty = { status: 'ok', truncated: false, errors: [], results: [] }
const inventory = {
  schemaVersion: 1, requestId: id, state: 'complete', limit: 100, approvalRequired: false, errorCode: null,
  observation: { mode: 'observed', status: 'ok', sampledAt: '2026-09-27T10:00:00Z', ageSeconds: 1, collectionSeconds: 0.1,
    sourceScopes: { process: 'configured-procfs', network: 'collector-namespace', containers: 'configured-docker-daemon' },
    processes: empty, containers: empty, ports: empty, unavailableFieldCount: 0,
    capabilities: { inspection: true, processActions: false, containerActions: false, portMutation: false, terminal: false, files: false } },
  receiptStatus: null, currentAgeSeconds: 1, createdAt: 1, updatedAt: 2, source: 'toolgate/system.inventory', refreshRequiresNewRequest: true,
  authority: 'none', contentIncluded: true, execution: 'read-only-observation',
}

async function main() {
  const calls = [], client = createGatewayHostInventoryClient({ request: async (...args) => { calls.push(args); return structuredClone(inventory) } })
  assert.equal((await client.request(id)).requestId, id)
  assert.deepEqual(calls.pop(), ['/api/control/pi/system/inventory', { method: 'POST', body: { request_id: id, limit: 100 }, signal: undefined }])
  assert.equal((await client.inspect(id)).state, 'complete')
  assert.equal(calls.pop()[0], `/api/control/pi/system/inventory/${id}`)
  await client.resume(id); assert.equal(calls.pop()[0], `/api/control/pi/system/inventory/${id}/resume`)
  const configured = { schemaVersion: 1, kind: 'containers', status: 'configured', results: [], requiresApproval: true, observed: false, authority: 'none', contentIncluded: false, execution: 'not-triggered' }
  const configuredClient = createGatewayHostInventoryClient({ request: async () => configured })
  assert.equal((await configuredClient.configured('containers')).observed, false)
  await assert.rejects(createGatewayHostInventoryClient({ request: async () => ({ ...inventory, authority: 'read' }) }).inspect(id), error => error.kind === 'invalid-response')
  await assert.rejects(createGatewayHostInventoryClient({ request: async () => ({ ...inventory, observation: { ...inventory.observation, processes: { ...empty, results: [{ pid: 1 }] } } }) }).inspect(id), error => error.kind === 'invalid-response')

  let requests = 0
  const transport = createGatewayTransport({ origin: 'https://localhost:8050', fetch: async (_url, options) => { requests++; return new Response(JSON.stringify(inventory), { headers: { 'content-type': 'application/json' } }) } })
  await transport.request(`/api/control/pi/system/inventory/${id}`)
  await transport.request('/api/control/pi/system/inventory/configured/services')
  await transport.request('/api/control/pi/system/inventory', { method: 'POST', csrfToken: 'x'.repeat(43), body: { request_id: id, limit: 100 } })
  await transport.request(`/api/control/pi/system/inventory/${id}/resume`, { method: 'POST', csrfToken: 'x'.repeat(43), body: {} })
  await assert.rejects(transport.request('/api/control/pi/system/inventory/short'), error => error.kind === 'validation')
  await assert.rejects(transport.request(`/api/control/pi/system/inventory/${id}/refresh`, { method: 'POST', csrfToken: 'x'.repeat(43), body: {} }), error => error.kind === 'validation')
  await assert.rejects(transport.request('/api/control/pi/system/terminal'), error => error.kind === 'validation')
  assert.equal(requests, 4)

  const ui = fs.readFileSync(path.join(root, 'src/components/gateway/host-inventory-workspace.tsx'), 'utf8')
  assert.match(ui, /New sample/)
  assert.match(ui, /No command lines, users, raw IDs, images, addresses, terminal, or files/)
  assert.match(ui, /without dispatching another sample/)
  assert.doesNotMatch(ui, /Start process|Stop process|Restart container|Open terminal/)
  console.log('Gateway host inventory passed: strict redacted DTOs, exact durable routes, explicit sampling, and no host mutation surface.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
