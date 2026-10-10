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
const { createGatewayTransport } = load('transport.ts')
const { createGatewayAuthClient } = load('auth.ts')
const { createGatewayVerificationStore } = load('verification.ts')
const { createChatGPTClient } = load('chatgpt.ts')
const { createNativeClaudeClient } = load('native-claude.ts')
const { createProviderControlClient } = load('provider-control.ts')
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const tick = () => new Promise(resolve => setImmediate(resolve))
const outcome = promise => promise.then(value => ({ value }), error => ({ error }))
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const route = '/api/host/chatgpt'
const proof = { verification_token: 'v'.repeat(43), verification_expires_at: 10120, unlock_expires_at: 11800 }
const statuses = {
  chatgpt: { available: true, connected: false, connectionId: null, plan: null, loginId: 'synthetic-login', loginState: 'pending', problem: null, models: [], catalogueComplete: false, credentialsIncluded: false, deviceCode: { verificationUrl: 'https://auth.openai.com/codex/device', userCode: 'TEST-1234' } },
  claude: { available: true, connected: false, loginState: 'pending', loginId: 'login_' + 'a'.repeat(32), authorizationUrl: 'https://claude.ai/oauth/authorize?code=synthetic', credentialsIncluded: false, runtime: 'Claude Code', models: [] },
  providers: { schemaVersion: 1, available: true, secretsIncluded: false, paidAllowed: false, policyRecoveryRequired: false, providers: ['openrouter', 'openai', 'anthropic'].map(id => ({
    id, configured: false, activeRevision: null, activeAt: null, stagedRevision: null, stagedAt: null, verificationStatus: null, verificationBasis: null, verifiedAt: null, verificationStale: false, activationPending: false, revokedRevisions: [], secretIncluded: false,
  })) },
}
function fixture(handler) {
  const wire = [], dispatches = [], order = [], verification = createGatewayVerificationStore()
  const transport = createGatewayTransport({ origin: 'https://conker.example', fetch: async (url, options) => {
    assert.equal(Object.hasOwn(options, 'onDispatch'), false)
    const call = { path: new URL(url).pathname, options, body: options.body === undefined ? undefined : JSON.parse(options.body) }
    wire.push(call)
    const overridden = handler && await handler(call)
    if (overridden !== undefined) return overridden
    if (call.path === '/auth/session') return json({ authenticated: true, setup_required: false, session_id: 'a'.repeat(24), csrf_token: 'c'.repeat(43), expires_at: 90000, unlock_expires_at: 11800 })
    if (call.path === '/auth/verify') return json(proof)
    return json(call.path.endsWith('/providers') ? statuses.providers : call.path.endsWith('/claude') ? statuses.claude : statuses.chatgpt)
  } })
  const observed = { ...transport, request(path, options = {}) {
    assert.equal(Object.hasOwn(options, 'onDispatch'), false, 'Auth metadata must not cross the transport boundary')
    if (path.startsWith('/api/')) { dispatches.push({ path, options }); order.push('transport') }
    return transport.request(path, options)
  } }
  const auth = createGatewayAuthClient({ transport: observed, verification, now: () => 10000 })
  return { auth, verification, wire, dispatches, order }
}
async function ready(handler) { const f = fixture(handler); await f.auth.bootstrap(); return f }
async function main() {
  // Deliberately retain a promise without awaiting its final mutation result.
  const verificationResponse = deferred(), f = await ready(call => call.path === '/auth/verify' ? verificationResponse.promise : undefined)
  let callbacks = 0, replacements = 0
  const options = { method: 'POST', body: { operation: 'login' }, onDispatch() {
    callbacks++; f.order.push('callback')
    assert.equal(f.wire.filter(call => call.path === '/auth/verify').length, 1)
    assert.equal(f.dispatches.length, 0)
  } }
  const pending = outcome(f.auth.request(route, options))
  await tick()
  assert.ok(f.verification.getState().challenge)
  assert.equal(callbacks, 0); assert.equal(f.dispatches.length, 0)
  options.method = 'GET'; options.body.operation = 'models'; options.onDispatch = () => replacements++
  const verifying = f.verification.getState().submit('synthetic-owner-password')
  await tick(); assert.equal(callbacks, 0); assert.equal(f.dispatches.length, 0)
  verificationResponse.resolve(json(proof))
  assert.equal(await verifying, true); assert.ok((await pending).value)
  assert.equal(callbacks, 1); assert.equal(replacements, 0)
  assert.deepEqual(f.order, ['callback', 'transport'])
  const verified = f.wire.find(call => call.path === '/auth/verify'), sent = f.wire.find(call => call.path === route)
  assert.deepEqual(verified.body.operation, { method: 'POST', path: route, body: { operation: 'login' } })
  assert.deepEqual(sent.body, verified.body.operation.body)
  assert.equal(sent.options.headers['X-Conker-Verification'], proof.verification_token)
  assert.equal(verified.options.headers['X-Conker-Verification'], undefined)
  console.log('PASS callback waits through password and verification, then precedes exact frozen dispatch once without crossing transport')

  for (const [name, factory, body] of [['chatgpt', createChatGPTClient, { operation: 'login' }], ['claude', createNativeClaudeClient, { operation: 'login', billing: 'subscription' }], ['providers', createProviderControlClient, { operation: 'stage', provider: 'openai', secret: 'SYNTHETIC_PRIVATE_KEY', activeRevision: null, stagedRevision: null }]]) {
    const f = await ready(), client = factory(f.auth), abort = new AbortController()
    let called = 0
    const result = outcome(client.apply(body, abort.signal, () => called++))
    await tick(); assert.equal(called, 0); assert.equal(f.dispatches.length, 0)
    await f.verification.getState().submit('synthetic-owner-password')
    assert.deepEqual((await result).value, statuses[name]); assert.equal(called, 1)
    assert.deepEqual(f.dispatches[0].options.body, body)
    assert.equal(f.dispatches[0].options.signal, abort.signal)
    assert.equal(f.dispatches[0].path, '/api/host/' + name)
    console.log(`PASS ${name} apply forwards third callback only through authenticated exact-operation dispatch`)
  }

  const revision = 'credential_' + 'a'.repeat(32)
  for (const body of [
    { operation: 'stage', provider: 'openai', secret: 'SYNTHETIC_PRIVATE_KEY', activeRevision: revision, stagedRevision: null },
    ...['verify', 'activate', 'recover', 'discard'].map(operation => ({ operation, provider: 'openai', revision })),
    { operation: 'record-revoked', provider: 'openai', revision, issuerConfirmed: true },
    { operation: 'paid-policy', enabled: true, expectedAllowed: false },
    { operation: 'recover-paid-policy' },
  ]) {
    const f = await ready(), client = createProviderControlClient(f.auth), before = structuredClone(body)
    let called = 0
    const result = outcome(client.apply(body, undefined, () => called++))
    await tick()
    assert.equal(called, 0); assert.equal(f.dispatches.length, 0)
    assert.doesNotMatch(JSON.stringify(f.verification.getState().challenge), /SYNTHETIC_PRIVATE_KEY|onDispatch/)
    // The owner authorizes the original exact operation even if caller data later changes.
    Object.assign(body, { revision: 'credential_' + 'b'.repeat(32), secret: 'CHANGED_SYNTHETIC_KEY', enabled: false })
    await f.verification.getState().submit('synthetic-owner-password')
    assert.deepEqual((await result).value, statuses.providers)
    assert.equal(called, 1); assert.equal(f.dispatches.length, 1)
    const verify = f.wire.find(call => call.path === '/auth/verify'), sent = f.wire.find(call => call.path === '/api/host/providers')
    assert.deepEqual(verify.body.operation, { method: 'POST', path: '/api/host/providers', body: before })
    assert.deepEqual(sent.body, before)
    assert.equal(sent.options.headers['X-Conker-Verification'], proof.verification_token)
  }
  console.log('PASS credential revisions, secret and paid-policy expectations stay exact across verified dispatch for all eight operations')

  const credentials = await ready(), credentialClient = createProviderControlClient(credentials.auth), readController = new AbortController()
  assert.deepEqual(await credentialClient.status(readController.signal), statuses.providers)
  assert.equal(credentials.dispatches.length, 1)
  assert.equal(credentials.dispatches[0].options.method, undefined)
  assert.equal(credentials.dispatches[0].options.body, undefined)
  assert.equal(credentials.dispatches[0].options.signal, readController.signal)
  assert.equal(credentials.wire.filter(call => call.path === '/auth/verify').length, 0)
  assert.equal(credentials.verification.getState().challenge, null)
  const read = credentials.wire.find(call => call.path === '/api/host/providers')
  assert.equal(read.options.method, 'GET')
  assert.equal(read.options.headers['X-Conker-Verification'], undefined)
  console.log('PASS credential status is a read with no callback metadata, verification or mutation')

  const failedCredentials = await ready(call => call.path === '/api/host/providers' ? json({}, 503) : undefined)
  let credentialCalls = 0
  const failedOperation = outcome(createProviderControlClient(failedCredentials.auth).apply({ operation: 'paid-policy', enabled: true, expectedAllowed: false }, undefined, () => credentialCalls++))
  await tick(); await failedCredentials.verification.getState().submit('synthetic-owner-password')
  assert.equal((await failedOperation).error.kind, 'dependency')
  await tick()
  assert.equal(credentialCalls, 1); assert.equal(failedCredentials.dispatches.length, 1)
  assert.equal(failedCredentials.wire.filter(call => call.path === '/auth/verify').length, 1)
  console.log('PASS unconfirmed credential mutation reports failure without callback or POST replay')

  for (const kind of ['already-aborted', 'waiting-abort', 'dismissed', 'owner-lock']) {
    const f = await ready(), abort = new AbortController(); let called = 0
    if (kind === 'already-aborted') abort.abort()
    const result = outcome(f.auth.request(route, { method: 'POST', body: { operation: 'login' }, signal: abort.signal, onDispatch: () => called++ }))
    await tick()
    if (kind === 'waiting-abort') abort.abort()
    if (kind === 'dismissed') f.verification.getState().cancel()
    if (kind === 'owner-lock') f.auth.lock()
    assert.equal((await result).error.kind, 'verification-cancelled')
    assert.equal(called, 0); assert.equal(f.dispatches.length, 0)
  }
  console.log('PASS pre-dispatch abort, dismissed verification and owner change never start the operation clock or transport')

  for (const kind of ['abort', 'lock', 'throw']) {
    const f = await ready(), abort = new AbortController(), original = new Error('local-observer-failed'); let called = 0
    const result = outcome(f.auth.request(route, { method: 'POST', body: { operation: 'login' }, signal: abort.signal, onDispatch() {
      called++
      if (kind === 'abort') abort.abort()
      if (kind === 'lock') f.auth.lock()
      if (kind === 'throw') throw original
    } }))
    await tick(); await f.verification.getState().submit('synthetic-owner-password')
    const failure = (await result).error
    if (kind === 'throw') assert.equal(failure, original)
    else assert.equal(failure.kind, 'verification-cancelled')
    assert.equal(called, 1); assert.equal(f.dispatches.length, 0)
  }
  console.log('PASS callback-triggered cancellation, lock or failure cannot dispatch')

  let attempts = 0
  const retryPassword = await ready(call => call.path === '/auth/verify' && ++attempts === 1 ? json({}, 401) : undefined)
  let called = 0
  const retryResult = outcome(retryPassword.auth.request(route, { method: 'POST', body: { operation: 'login' }, onDispatch: () => called++ }))
  await tick(); assert.equal(await retryPassword.verification.getState().submit('incorrect-synthetic-password'), false)
  assert.equal(called, 0); assert.equal(retryPassword.dispatches.length, 0)
  assert.equal(await retryPassword.verification.getState().submit('correct-synthetic-password'), true)
  assert.ok((await retryResult).value); assert.equal(called, 1); assert.equal(retryPassword.dispatches.length, 1)
  console.log('PASS password refusal does not start dispatch; explicit successful verification starts it once')

  for (const kind of ['network', 'verification-required', 'denied', 'aborted', 'invalid-response']) {
    const abort = new AbortController()
    const f = await ready(call => {
      if (call.path !== route) return undefined
      if (kind === 'network') throw new TypeError('synthetic-network-failure')
      if (kind === 'aborted') { abort.abort(); throw new DOMException('synthetic-abort', 'AbortError') }
      if (kind === 'invalid-response') return new Response('invalid synthetic JSON', { headers: { 'Content-Type': 'application/json' } })
      return json({}, kind === 'denied' ? 403 : 428)
    })
    let called = 0
    const result = outcome(f.auth.request(route, { method: 'POST', body: { operation: 'login' }, signal: abort.signal, onDispatch: () => called++ }))
    await tick(); await f.verification.getState().submit('synthetic-owner-password')
    assert.ok((await result).error)
    await tick()
    assert.equal(called, 1); assert.equal(f.dispatches.length, 1)
    assert.equal(f.wire.filter(call => call.path === '/auth/verify').length, 1)
    assert.equal(f.verification.getState().challenge, null)
  }
  console.log('PASS failed, denied and interrupted dispatched operations never replay POST or callback')

  const reads = await ready(); let observed = 0
  await reads.auth.request('/api/host/claude', { onDispatch: () => observed++ })
  assert.equal(observed, 0)
  await reads.auth.request('/api/pi/sessions', { method: 'POST', body: {}, onDispatch: () => observed++ })
  assert.equal(observed, 1)
  assert.equal(reads.wire.filter(call => call.path === '/auth/verify').length, 0)
  console.log('PASS GET ignores local dispatch metadata; session-authorized conversation POST calls it once')

  for (const factory of [createChatGPTClient, createNativeClaudeClient, createProviderControlClient]) {
    const f = await ready(); let observed = 0
    await assert.rejects(factory(f.auth).apply({ operation: 'invalid' }, undefined, () => observed++), error => error.kind === 'validation')
    assert.equal(observed, 0); assert.equal(f.dispatches.length, 0); assert.equal(f.verification.getState().challenge, null)
  }
  for (const body of [
    { operation: 'stage', provider: 'openai', secret: 'invalid\nkey', activeRevision: null, stagedRevision: null },
    { operation: 'activate', provider: 'openai', revision: '--invalid' },
    { operation: 'paid-policy', enabled: true, expectedAllowed: 'false' },
    { operation: 'recover-paid-policy', onDispatch: () => {} },
  ]) {
    const f = await ready(); let observed = 0
    await assert.rejects(createProviderControlClient(f.auth).apply(body, undefined, () => observed++), error => error.kind === 'validation')
    assert.equal(observed, 0); assert.equal(f.dispatches.length, 0); assert.equal(f.verification.getState().challenge, null)
  }
  console.log('PASS invalid client operations fail before verification or dispatch observation')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
