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

const { createGatewayFilesystemClient } = load('src/lib/gateway/filesystem.ts')
const { createGatewayTransport } = load('src/lib/gateway/transport.ts')
const id = 'browser_1234567890abcdef1234567890abcdef'
const catalogue = {
  schemaVersion: 1, mode: 'configured', code: null, roots: [{ id: 'project', path: '/workspace/conker' }],
  capabilities: { list: true, read: false, write: false }, authority: 'none', execution: 'directory-listing-only', contentIncluded: false,
}
const directory = {
  schemaVersion: 1, requestId: id, state: 'complete', limit: 200, rootId: 'project', path: 'docs', approvalRequired: false, errorCode: null,
  listing: { mode: 'observed', rootId: 'project', path: 'docs', truncated: false, sampledAt: '2026-09-27T10:00:00Z', entries: [{ name: 'README.md', path: 'docs/README.md', kind: 'file' }] },
  receiptStatus: null, currentAgeSeconds: 1, createdAt: 1, updatedAt: 2, source: 'toolgate/system.files-list', refreshRequiresNewRequest: true,
  authority: 'none', contentIncluded: false, execution: 'directory-listing-only',
}

async function main() {
  const calls = [], client = createGatewayFilesystemClient({ request: async (...args) => { calls.push(args); return args[0].endsWith('/roots') ? structuredClone(catalogue) : structuredClone(directory) } })
  assert.equal((await client.roots()).capabilities.write, false)
  assert.equal(calls.pop()[0], '/api/control/pi/system/files/roots')
  assert.equal((await client.request(id, 'project', 'docs')).listing.entries[0].kind, 'file')
  assert.deepEqual(calls.pop(), ['/api/control/pi/system/files/listings', { method: 'POST', body: { request_id: id, root_id: 'project', path: 'docs', limit: 200 }, signal: undefined }])
  assert.equal((await client.inspect(id)).requestId, id)
  assert.equal(calls.pop()[0], `/api/control/pi/system/files/listings/${id}`)
  await client.resume(id); assert.equal(calls.pop()[0], `/api/control/pi/system/files/listings/${id}/resume`)
  const unicode = { ...directory, path: '🌲', listing: { ...directory.listing, path: '🌲', entries: [{ name: '📄.md', path: '🌲/📄.md', kind: 'file' }] } }
  assert.equal((await createGatewayFilesystemClient({ request: async () => unicode }).inspect(id)).listing.entries[0].name, '📄.md')
  await assert.rejects(createGatewayFilesystemClient({ request: async () => ({ ...directory, contentIncluded: true }) }).inspect(id), error => error.kind === 'invalid-response')
  await assert.rejects(createGatewayFilesystemClient({ request: async () => ({ ...directory, listing: { ...directory.listing, entries: [{ name: 'README.md', path: '../README.md', kind: 'file' }] } }) }).inspect(id), error => error.kind === 'invalid-response')
  await assert.rejects(createGatewayFilesystemClient({ request: async () => ({ ...directory, listing: { ...directory.listing, entries: [{ name: 'nested/file', path: 'docs/nested/file', kind: 'file' }] } }) }).inspect(id), error => error.kind === 'invalid-response')
  await assert.rejects(client.request(id, 'project', '../private'), error => error.kind === 'validation')

  let requests = 0
  const transport = createGatewayTransport({ origin: 'https://localhost:8050', fetch: async (_url, options) => { requests++; return new Response(JSON.stringify(options.method === 'GET' && String(_url).endsWith('/roots') ? catalogue : directory), { headers: { 'content-type': 'application/json' } }) } })
  await transport.request('/api/control/pi/system/files/roots')
  await transport.request(`/api/control/pi/system/files/listings/${id}`)
  await transport.request('/api/control/pi/system/files/listings', { method: 'POST', csrfToken: 'x'.repeat(43), body: { request_id: id, root_id: 'project', path: 'docs', limit: 200 } })
  await transport.request(`/api/control/pi/system/files/listings/${id}/resume`, { method: 'POST', csrfToken: 'x'.repeat(43), body: {} })
  await assert.rejects(transport.request('/api/control/pi/system/files/content'), error => error.kind === 'validation')
  await assert.rejects(transport.request(`/api/control/pi/system/files/listings/${id}/refresh`, { method: 'POST', csrfToken: 'x'.repeat(43), body: {} }), error => error.kind === 'validation')
  await assert.rejects(transport.request('/api/control/pi/system/files/listings/short'), error => error.kind === 'validation')
  assert.equal(requests, 4)

  const ui = fs.readFileSync(path.join(root, 'src/components/gateway/filesystem-workspace.tsx'), 'utf8')
  assert.match(ui, /Directory listing only/)
  assert.match(ui, /No file contents, editing, uploads, deletes, or shell access/)
  assert.match(ui, /without dispatching it again/)
  assert.doesNotMatch(ui, /Edit file|Upload|Delete file|Open terminal|Run command/)
  console.log('Gateway filesystem passed: strict metadata-only DTOs, exact durable routes, bounded navigation, and no content or mutation surface.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
