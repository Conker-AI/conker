const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const cache = new Map()
function load(file) {
  file = path.resolve(__dirname, '../src/lib/gateway', file)
  if (cache.has(file)) return cache.get(file).exports
  const mod = { exports: {} }; cache.set(file, mod)
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(name => name.startsWith('.') ? load(path.resolve(path.dirname(file), `${name}.ts`)) : require(name), mod, mod.exports)
  return mod.exports
}
const { createProviderControlClient } = load('provider-control.ts')
const { snapshotGatewayOperation, isConversationWrite } = load('transport.ts')
const { describeGatewayOperation } = load('verification.ts')
const { createBrowserSessionsClient } = load('browser-sessions.ts')
const route = '/api/host/providers'
const revision = 'credential_' + 'a'.repeat(32)
function status() {
  return { schemaVersion: 1, available: true, secretsIncluded: false, paidAllowed: false, policyRecoveryRequired: false, providers: ['openrouter', 'openai', 'anthropic'].map(id => ({
    id, configured: false, activeRevision: null, activeAt: null, stagedRevision: null, stagedAt: null,
    verificationStatus: null, verificationBasis: null, verifiedAt: null, verificationStale: false,
    activationPending: false, revokedRevisions: [], secretIncluded: false,
  })) }
}
async function main() {
  const calls = []; let result = status()
  const client = createProviderControlClient({ request: async (...args) => { calls.push(args); return result } })
  assert.equal((await client.status()).available, true)
  assert.equal(calls[0][0], route)
  const body = { operation: 'stage', provider: 'openai', secret: 'SYNTHETIC_PRIVATE_KEY', activeRevision: null, stagedRevision: null }
  const snapshot = snapshotGatewayOperation(route, body)
  assert.equal(isConversationWrite(route), false, 'credentials always require exact password verification')
  const review = describeGatewayOperation(snapshot)
  assert.equal(review.title, 'Save provider key')
  assert.equal(JSON.stringify(review).includes(body.secret), false, 'review never reveals key')
  await client.apply(body)
  assert.deepEqual(calls.at(-1)[1].body, body)
  assert.equal(calls.at(-1)[1].method, 'POST')
  for (const invalid of [{ ...body, url: 'https://evil.test' }, { ...body, secret: 'key\nwith\nlines' }, { operation: 'activate', provider: 'openai', revision: '--help' }, { operation: 'record-revoked', provider: 'openai', revision, issuerConfirmed: false }]) {
    const count = calls.length
    await assert.rejects(client.apply(invalid), error => error.kind === 'validation')
    assert.equal(calls.length, count)
  }
  for (const malformed of [{ ...status(), secret: 'PRIVATE' }, { ...status(), providers: [] }, { ...status(), providers: [status().providers[0], status().providers[0], status().providers[0]] }]) {
    result = malformed
    await assert.rejects(client.status(), error => error.kind === 'invalid-response')
  }
  result = { schemaVersion: 1, available: false, secretsIncluded: false, paidAllowed: null, policyRecoveryRequired: false, providers: [] }
  assert.equal((await client.status()).available, false)
  const paid = describeGatewayOperation(snapshotGatewayOperation(route, { operation: 'paid-policy', enabled: true, expectedAllowed: false }))
  assert.equal(paid.title, 'Allow paid model requests')
  assert.ok(paid.details.some(text => text.includes('not a budget')))
  const adminCalls = []; let locked = false
  const id = 'browser_session_' + 'a'.repeat(20)
  const sessions = createBrowserSessionsClient({ request: async (...args) => { adminCalls.push(args); return args[1]?.method === 'POST' ? { revoked: true } : { results: [{ id, created: 10, touched: 12, expires: 100 }] } }, getSession: () => ({ sessionId: id }), lock: () => { locked = true } })
  assert.equal((await sessions.list())[0].current, true)
  assert.equal(describeGatewayOperation(snapshotGatewayOperation('/auth/revoke-all', {})).title, 'Sign out all browser sessions')
  await assert.rejects(sessions.revoke('bad/id'), error => error.kind === 'validation')
  await sessions.revoke(id)
  assert.equal(locked, true)
  assert.deepEqual(adminCalls.at(-1), [`/auth/sessions/${id}/revoke`, { method: 'POST', body: {}, signal: undefined }])
  console.log('Provider control passed: one typed API, exact verification, secret-free review, no arbitrary endpoint, honest unavailable state.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
