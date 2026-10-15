const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const cache = new Map()
function load(file) {
  file = path.resolve(__dirname, '../src/lib/gateway', file)
  if (cache.has(file)) return cache.get(file).exports
  const mod = { exports: {} }; cache.set(file, mod)
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(name => name.startsWith('.') ? load(path.resolve(path.dirname(file), `${name}.ts`)) : require(name), mod, mod.exports)
  return mod.exports
}
const { createGatewayMcpClient } = load('mcp.ts')
const { createGatewayTransport, snapshotGatewayOperation } = load('transport.ts')
const { describeGatewayOperation } = load('verification.ts')
const hash = 'a'.repeat(64), url = 'https://mcp.example.com/mcp'
const remote = { name: 'search', description: 'Find a document', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }, schemaHash: hash }
const tool = { id: 'mcp.search', name: 'search', description: remote.description, status: 'active', authorization: 'owner_confirmation', url, tool_name: 'search', schema_hash: hash, secret_ref: null, version: 1, digest: hash }
const discovery = { schemaVersion: 1, server: { url, name: 'Search', version: '1' }, tools: [remote] }
const access = { schemaVersion: 1, toolId: tool.id, actorId: 'agent-1', actorName: 'Conker', enabled: false, requiredScope: 'tool:mcp.search', digest: hash }
async function main() {
  const calls = []; let result = discovery
  const client = createGatewayMcpClient({ request: async (path, options) => { calls.push({ path, options }); return structuredClone(result) } })
  const found = await client.discover(url, null)
  assert.deepEqual(found, discovery)
  result = { ...discovery, unsupportedTools: [{ name: 'complex_tool', reason: 'Schema references are not supported.' }] }
  assert.equal((await client.discover(url, null)).unsupportedTools.length, 1, 'Unsupported entries must not hide usable tools')
  result = { schemaVersion: 1, tool }
  await client.import(found, 'search', 'mcp.search', null)
  assert.deepEqual(calls.at(-1).options.body.input_schema, remote.inputSchema)
  assert.equal(calls.at(-1).options.body.schema_hash, hash)
  assert.equal(calls.at(-1).options.body.url, url)
  assert.equal(calls.filter(call => call.path.endsWith('/access')).length, 0, 'Import must never grant access')
  result = access
  assert.equal((await client.access(tool)).enabled, false)
  result = { ...access, enabled: true }
  await client.setAccess(tool, true)
  assert.deepEqual(calls.at(-1).options.body, { enabled: true, expected_digest: hash })
  result = { ...access, toolId: 'mcp.other' }
  await assert.rejects(client.access(tool), { kind: 'invalid-response' })
  result = { schemaVersion: 1, tool: { ...tool, id: 'mcp.other' } }
  await assert.rejects(client.import(found, 'search', 'mcp.search', null), { kind: 'invalid-response' })
  const count = calls.length
  for (const bad of ['http://example.com/mcp', 'https://user:pass@example.com/mcp', 'https://example.com:8443/mcp', 'https://example.com/mcp?token=secret']) await assert.rejects(client.discover(bad, null), { kind: 'validation' })
  await assert.rejects(client.import(found, 'missing', tool.id, null), { kind: 'validation' })
  assert.equal(calls.length, count)
  const onWire = []
  const transport = createGatewayTransport({ origin: 'https://conker.example', fetch: async (target, options) => { onWire.push({ target, options }); return new Response(JSON.stringify(access), { headers: { 'Content-Type': 'application/json' } }) } })
  await transport.request('/api/owner/mcp/tools/mcp.search/access')
  const operation = snapshotGatewayOperation('/api/owner/mcp/tools/mcp.search/access', { enabled: true, expected_digest: hash })
  assert.equal(describeGatewayOperation(operation).title, 'Make MCP tool available in chats')
  await transport.request(operation.path, { method: 'POST', body: operation.body, csrfToken: 'x'.repeat(43), verificationToken: 'v'.repeat(43) })
  for (const route of ['/api/owner/mcp/tools/mcp.search/run', '/api/owner/mcp/tools/../access', '/api/owner/mcp/tools/mcp.search/access?key=x']) await assert.rejects(transport.request(route), { kind: 'validation' })
  assert.equal(onWire.length, 2)
  assert.equal(onWire[1].options.headers['X-Conker-Verification'], 'v'.repeat(43))
  console.log('MCP client: reviewed schema, separate scoped grant, digest binding, response identity and browser boundary passed.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
