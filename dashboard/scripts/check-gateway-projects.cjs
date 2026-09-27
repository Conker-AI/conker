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

const { createGatewayProjectsClient, GatewayProjectMutationError, projectReferenceKey } = load('src/lib/gateway/projects.ts')
const { createGatewayTransport, GatewayError } = load('src/lib/gateway/transport.ts')
const projectId = `project_${'a'.repeat(32)}`, sessionId = `ses_${'b'.repeat(16)}`
const fields = { name: 'Launch', description: 'Release work', instructions: 'Prefer verified evidence.' }
const reference = { kind: 'conversation', sessionId }
const project = {
  schemaVersion: 1, id: projectId, revision: 3, ...fields, createdAt: 1, updatedAt: 2, archivedAt: null,
  links: [{ reference, mode: 'live-reference', snapshot: { originSessionId: sessionId, linkedAt: 1.5 }, availability: 'available', label: 'Release chat', labelSource: 'live-source', privacy: { memoryDisabled: false, harnessDisabled: true, incognito: false } }],
  authority: 'none', contentIncluded: false, grantsInherited: false,
}

async function main() {
  const calls = []
  let result = { schemaVersion: 1, results: [project], nextCursor: null }
  const client = createGatewayProjectsClient({ request: async (...args) => { calls.push(args); return structuredClone(result) } })
  assert.deepEqual((await client.list()).results, [project])
  assert.deepEqual(calls.pop(), ['/api/control/pi/projects', { query: { limit: 100 }, signal: undefined }])
  result = project
  assert.equal((await client.get(projectId)).id, projectId)
  assert.equal(calls.pop()[0], `/api/control/pi/projects/${projectId}`)
  await client.update(projectId, fields, 3)
  assert.deepEqual(calls.pop(), [`/api/control/pi/projects/${projectId}/update`, { method: 'POST', body: { expected_revision: 3, fields } }])
  await client.archive(projectId, true, 3)
  assert.equal(calls.pop()[1].body.archived, true)
  await client.link(projectId, reference, 3)
  assert.deepEqual(calls.pop()[1].body.reference, reference)
  await client.unlink(projectId, reference, 3)
  assert.deepEqual(calls.pop()[1].body.reference, reference)
  assert.equal(projectReferenceKey(reference), `conversation:${sessionId}`)
  await assert.rejects(client.get('project_wrong'), error => error.kind === 'validation')
  assert.throws(() => client.link(projectId, { kind: 'conversation', sessionId: 'ses_short' }, 3), error => error.kind === 'validation')
  result = { ...project, authority: 'execute' }
  await assert.rejects(client.get(projectId), error => error.kind === 'invalid-response')
  result = { ...project, secret: 'never project' }
  await assert.rejects(client.get(projectId), error => error.kind === 'invalid-response')

  const conflict = createGatewayProjectsClient({ request: async () => { throw new GatewayError('http', 409) } })
  await assert.rejects(conflict.update(projectId, fields, 3), error => error instanceof GatewayProjectMutationError && error.outcome === 'conflict')
  const uncertain = createGatewayProjectsClient({ request: async () => { throw new GatewayError('network') } })
  await assert.rejects(uncertain.archive(projectId, true, 3), error => error instanceof GatewayProjectMutationError && error.outcome === 'unknown')

  let requests = 0
  const transport = createGatewayTransport({ origin: 'https://localhost:8050', fetch: async () => { requests++; return new Response(JSON.stringify(project), { headers: { 'content-type': 'application/json' } }) } })
  await transport.request('/api/control/pi/projects')
  await transport.request(`/api/control/pi/projects/${projectId}`)
  await transport.request(`/api/control/pi/projects/${projectId}/link`, { method: 'POST', csrfToken: 'x'.repeat(43), body: { expected_revision: 3, reference } })
  await assert.rejects(transport.request(`/api/control/pi/projects/${projectId}/remove`, { method: 'POST', csrfToken: 'x'.repeat(43), body: { expected_revision: 3 } }), error => error.kind === 'validation')
  await assert.rejects(transport.request(`/api/control/pi/projects/${projectId}/search`), error => error.kind === 'validation')
  await assert.rejects(transport.request('/api/control/pi/projects/project_not_hex'), error => error.kind === 'validation')
  assert.equal(requests, 3)

  const ui = fs.readFileSync(path.join(root, 'src/components/gateway/projects-workspace.tsx'), 'utf8')
  assert.match(ui, /Authority: none\. Content included: no\. Grants inherited: no\./)
  assert.match(ui, /never accepts filesystem paths or uploads/)
  assert.match(ui, /Pi will recheck every source/)
  console.log('Gateway Projects passed: strict DTOs, optimistic writes, exact routes, no destructive browser removal, and honest context boundaries.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
