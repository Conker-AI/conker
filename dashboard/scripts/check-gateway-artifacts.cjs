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

const { createGatewayArtifactsClient, GatewayArtifactMutationError, normalizeGatewayArtifactContent } = load('src/lib/gateway/artifacts.ts')
const { createGatewayTransport, GatewayError } = load('src/lib/gateway/transport.ts')
const artifactId = `artifact_${'a'.repeat(32)}`, taskId = `tsk_${'b'.repeat(32)}`
const createdAt = '2026-09-27T12:00:00+00:00'
const content = { kind: 'markdown', text: '# Release evidence' }
const version = { version: 1, title: 'Release evidence', content, createdAt, author: 'owner', note: 'Created by owner.', citations: [] }
const view = {
  schemaVersion: 1, id: artifactId, title: version.title, revision: 1, createdAt, updatedAt: createdAt, archivedAt: null,
  provenance: 'pi', origin: 'owner-authored', source: null, task: null, availability: 'available', privacy: null,
  privateOrigin: false, taskAvailability: 'none', authority: 'none', execution: 'not-wired', contentIncluded: true,
  versionCount: 1, currentVersion: 1, versions: [version],
}
const summary = { ...view, contentIncluded: false }; delete summary.versions

async function main() {
  const calls = []
  let result = { schemaVersion: 1, results: [summary], nextCursor: null }
  const client = createGatewayArtifactsClient({ request: async (...args) => { calls.push(args); return structuredClone(result) } })
  assert.deepEqual((await client.list()).results, [summary])
  assert.deepEqual(calls.pop(), ['/api/control/pi/artifacts', { query: { limit: 100 }, signal: undefined }])
  result = view
  assert.equal((await client.get(artifactId)).id, artifactId)
  await client.create({ title: version.title, content, taskId })
  assert.equal(calls.pop()[0], '/api/control/pi/artifacts')
  await client.append(artifactId, { content, title: 'Updated', note: 'Tighter copy.', preserveCitations: false }, 1)
  assert.equal(calls.pop()[0], `/api/control/pi/artifacts/${artifactId}/versions`)
  await client.restore(artifactId, 1, 1)
  assert.equal(calls.pop()[0], `/api/control/pi/artifacts/${artifactId}/restore`)
  await client.archive(artifactId, true, 1)
  assert.equal(calls.pop()[0], `/api/control/pi/artifacts/${artifactId}/archive`)
  result = { schemaVersion: 1, artifactId, version: 1, filename: 'release-evidence.md', mime: 'text/plain;charset=utf-8', text: '# Release evidence', provenance: 'pi', privateOrigin: false, authority: 'none', contentIncluded: true, execution: 'not-wired' }
  assert.equal((await client.export(artifactId, 1)).filename, 'release-evidence.md')
  assert.throws(() => normalizeGatewayArtifactContent({ kind: 'media', mediaType: 'image', url: 'http://example.com/a.png', description: '' }), error => error.kind === 'validation')
  assert.throws(() => normalizeGatewayArtifactContent({ kind: 'media', mediaType: 'image', url: 'https://user:secret@example.com/a.png', description: '' }), error => error.kind === 'validation')
  result = { ...view, authority: 'execute' }
  await assert.rejects(client.get(artifactId), error => error.kind === 'invalid-response')
  result = { ...view, unexpected: 'never accept this' }
  await assert.rejects(client.get(artifactId), error => error.kind === 'invalid-response')

  const conflict = createGatewayArtifactsClient({ request: async () => { throw new GatewayError('http', 409) } })
  await assert.rejects(conflict.append(artifactId, { content }, 1), error => error instanceof GatewayArtifactMutationError && error.outcome === 'conflict')
  const uncertain = createGatewayArtifactsClient({ request: async () => { throw new GatewayError('network') } })
  await assert.rejects(uncertain.archive(artifactId, true, 1), error => error instanceof GatewayArtifactMutationError && error.outcome === 'unknown')

  let requests = 0
  const transport = createGatewayTransport({ origin: 'https://localhost:8050', fetch: async () => { requests++; return new Response(JSON.stringify(view), { headers: { 'content-type': 'application/json' } }) } })
  await transport.request('/api/control/pi/artifacts')
  await transport.request(`/api/control/pi/artifacts/${artifactId}`)
  await transport.request(`/api/control/pi/artifacts/${artifactId}/export`)
  await transport.request(`/api/control/pi/artifacts/${artifactId}/versions`, { method: 'POST', csrfToken: 'x'.repeat(43), body: { expected_revision: 1, content } })
  await assert.rejects(transport.request(`/api/control/pi/artifacts/${artifactId}/download`), error => error.kind === 'validation')
  await assert.rejects(transport.request(`/api/control/pi/artifacts/${artifactId}/remove`, { method: 'POST', csrfToken: 'x'.repeat(43), body: { expected_revision: 1 } }), error => error.kind === 'validation')
  await assert.rejects(transport.request('/api/control/pi/artifacts/artifact_not_hex'), error => error.kind === 'validation')
  assert.equal(requests, 4)

  const ui = fs.readFileSync(path.join(root, 'src/components/gateway/artifacts-workspace.tsx'), 'utf8')
  const chat = fs.readFileSync(path.join(root, 'src/lib/chat/gateway-adapter.ts'), 'utf8')
  assert.match(ui, /Saving appends a new immutable version/)
  assert.match(ui, /Content remains inert/)
  assert.match(ui, /History bodies, preview, editing and export are blocked/)
  assert.match(chat, /handler\.saveArtifact/)
  console.log('Gateway Artifacts passed: strict DTOs, immutable revisions, inert export, exact routes, and fail-closed unavailable states.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
