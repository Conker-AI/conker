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
const { createGatewayTeamsClient, GatewayTeamMutationError } = load('src/lib/gateway/teams.ts')
const { createGatewayTransport, GatewayError } = load('src/lib/gateway/transport.ts')
const id = `team_${'a'.repeat(32)}`, agent = `agent_${'b'.repeat(32)}`
const definition = { name: 'Review team', objective: 'Draft and review one bounded result.', roles: [{ id: 'draft', name: 'Draft', agentId: agent, instructions: 'Draft the result.', toolIds: [], memory: { scope: 'none', memoryIds: [] }, context: { mode: 'task_only', sourceIds: [] }, budget: { maxTurns: 1, maxTokens: 1000, maxCostCents: 0 } }], handoffs: [], budget: { maxTurns: 2, maxTokens: 2000, maxCostCents: 0, maxHandoffs: 0 } }
const summary = { schemaVersion: 1, id, revision: 1, name: definition.name, archived_at: null, created_at: 1, updated_at: 1, authority: 'none', execution: 'configuration-only', contentIncluded: false, reference_validation: 'external-references-unverified' }
const team = { ...summary, contentIncluded: true, definition, agentReferences: [{ roleId: 'draft', agentId: agent, revision: 1 }], agentReferenceState: 'available' }

async function main() {
  const calls = []; let result = { schemaVersion: 1, results: [summary], nextCursor: null }
  const client = createGatewayTeamsClient({ request: async (...args) => { calls.push(args); return structuredClone(result) } })
  assert.deepEqual((await client.list()).results, [summary]); assert.equal(calls.pop()[0], '/api/control/pi/collaboration/teams')
  result = team; assert.equal((await client.get(id)).id, id)
  await client.create(definition); assert.equal(calls.pop()[0], '/api/control/pi/collaboration/teams')
  await client.update(id, definition, 1); assert.equal(calls.pop()[0], `/api/control/pi/collaboration/teams/${id}/update`)
  await client.setArchived(id, true, 1); assert.deepEqual(calls.pop()[1].body, { expected_revision: 1, archived: true })
  await client.setArchived(id, false, 1); assert.deepEqual(calls.pop()[1].body, { expected_revision: 1 })
  result = { schemaVersion: 1, results: [summary], nextRevision: null }; assert.equal((await client.history(id)).results.length, 1)
  result = { ...summary, contentIncluded: true, definition, historical: true }; assert.equal((await client.revision(id, 1)).historical, true)
  result = { ...team, execution: 'prepared' }; await assert.rejects(client.get(id), error => error.kind === 'invalid-response')
  const conflict = createGatewayTeamsClient({ request: async () => { throw new GatewayError('http', 409) } })
  await assert.rejects(conflict.update(id, definition, 1), error => error instanceof GatewayTeamMutationError && error.outcome === 'conflict')

  let requests = 0
  const transport = createGatewayTransport({ origin: 'https://localhost:8050', fetch: async () => { requests++; return new Response(JSON.stringify(team), { headers: { 'content-type': 'application/json' } }) } })
  await transport.request('/api/control/pi/collaboration/teams')
  await transport.request(`/api/control/pi/collaboration/teams/${id}`)
  await transport.request(`/api/control/pi/collaboration/teams/${id}/versions`)
  await transport.request(`/api/control/pi/collaboration/teams/${id}/versions/1`)
  await transport.request(`/api/control/pi/collaboration/teams/${id}/update`, { method: 'POST', csrfToken: 'x'.repeat(43), body: { expected_revision: 1, definition } })
  await assert.rejects(transport.request(`/api/control/pi/collaboration/teams/${id}/prepare`, { method: 'POST', csrfToken: 'x'.repeat(43), body: { expected_revision: 1 } }), error => error.kind === 'validation')
  await assert.rejects(transport.request('/api/control/pi/team-runs'), error => error.kind === 'validation')
  assert.equal(requests, 5)

  const ui = fs.readFileSync(path.join(root, 'src/components/gateway/teams-workspace.tsx'), 'utf8')
  assert.match(ui, /Definitions grant no authority and start no work/)
  assert.match(ui, /No preparation or execution endpoint is exposed here/)
  assert.match(ui, /Credentials, memory scope, and authority never transfer/)
  assert.doesNotMatch(ui, /Prepare snapshot|Run team|Start team/)
  console.log('Gateway teams passed: canonical strict DTOs, optimistic configuration, immutable history, exact routes, and no preparation or execution surface.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
