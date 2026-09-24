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
const { createGatewayTransport, GatewayError } = load('transport.ts')
const { createGatewayAuthClient } = load('auth.ts')
const { createGatewayAuthStore } = load('auth-store.ts')
const { createGatewayVerificationStore, describeGatewayOperation } = load('verification.ts')
const { gatewaySessionUnlocked } = load('session-policy.ts')
const { bindGatewayWorkspaceReset } = load(path.resolve(__dirname, '../src/components/gateway/auth-workspace-reset.ts'))
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const tick = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const password = 'Owner password with spaces 🔐'
// A write that still requires a password; conversation writes are session-only (ADR-0010).
const route = '/api/pi/tasks/task_one/update'
function fixture(handler) {
  let now = 10000
  const wire = () => ({ authenticated: true, setup_required: false, session_id: 'a'.repeat(24), csrf_token: 'c'.repeat(43), expires_at: 90000, unlock_expires_at: 11800 })
  const calls = [], verification = createGatewayVerificationStore()
  const transport = createGatewayTransport({ origin: 'https://conker.example', fetch: async (url, options) => {
    const call = { path: new URL(url).pathname, options, body: options.body ? JSON.parse(options.body) : undefined }; calls.push(call)
    if (handler) { const value = await handler(call); if (value !== undefined) return value }
    if (call.path === '/auth/session') return json(wire())
    if (call.path === '/auth/logout') return json({ authenticated: false })
    if (call.path === '/auth/verify') return json({ verification_token: 'v'.repeat(43), verification_expires_at: now + 120, unlock_expires_at: now + 1800 })
    return json({ accepted: true })
  } })
  const client = createGatewayAuthClient({ transport, verification, now: () => now }), store = createGatewayAuthStore({ client })
  return { calls, verification, transport, client, store, advance: seconds => { now += seconds }, targets: () => calls.filter(call => call.path.startsWith('/api/')) }
}
const outcome = promise => promise.then(value => ({ value }), error => ({ error }))
async function prompt(f, body = { text: 'Private draft never shown in the verification metadata', request_id: 'request_123' }, signal) {
  const result = outcome(f.client.request(route, { method: 'POST', body, signal }))
  await tick(); assert.ok(f.verification.getState().challenge)
  return { result }
}
async function main() {
  const short = fixture(); await short.client.bootstrap()
  const shortRequest = await prompt(short)
  assert.equal(await short.verification.getState().submit('1234'), true)
  assert.ok((await shortRequest.result).value)
  assert.equal(short.calls.find(call => call.path === '/auth/verify').body.password, '1234')
  console.log('PASS existing short credentials reach server verification unchanged')
  for (const conversation of ['/api/pi/sessions', '/api/pi/sessions/session_one/turns', '/api/pi/sessions/session_one/fork', '/api/pi/turn-submissions/request_identity_0001/cancel']) {
    const c = fixture(); await c.client.bootstrap()
    assert.ok((await c.client.request(conversation, { method: 'POST', body: { text: 'hi' } })).accepted)
    assert.equal(c.verification.getState().challenge, null)
    assert.equal(c.calls.filter(call => call.path === '/auth/verify').length, 0)
    const sent = c.targets()[0]
    assert.equal(sent.path, conversation); assert.equal(sent.options.headers['X-Conker-Verification'], undefined)
    assert.ok(sent.options.headers['X-CSRF-Token'])
  }
  console.log('PASS conversation writes (create, send, fork, stop) send with the session and CSRF, without a password prompt')
  let f = fixture(); await f.store.getState().bootstrap()
  let resets = 0
  bindGatewayWorkspaceReset(f.store, [{ getState: () => ({ reset: () => { resets++ } }) }])
  const initialResets = resets
  const body = { text: 'Original private text', nested: { values: [1, 2] }, request_id: 'request_123' }
  const { result } = await prompt(f, body)
  body.text = 'Changed later'; body.nested.values.push(3)
  assert.equal(f.targets().length, 0)
  assert.doesNotMatch(JSON.stringify(f.verification.getState()), /Original private|Changed later|csrf|verification_token/)
  f.advance(100)
  assert.equal(await f.verification.getState().submit(password), true)
  assert.ok((await result).value)
  const verify = f.calls.find(call => call.path === '/auth/verify'), target = f.targets()[0]
  assert.deepEqual(verify.body.operation, { method: 'POST', path: route, body: { text: 'Original private text', nested: { values: [1, 2] }, request_id: 'request_123' } })
  assert.deepEqual(target.body, verify.body.operation.body)
  assert.equal(verify.body.password, password)
  assert.equal(verify.options.headers['X-Conker-Verification'], undefined)
  assert.equal(target.options.headers['X-Conker-Verification'], 'v'.repeat(43))
  assert.equal(f.store.getState().phase, 'authenticated')
  assert.equal(f.store.getState().session.unlockExpiresAt, 11900)
  assert.equal(resets, initialResets, 'same-session password verification must preserve retained workspace drafts')
  assert.equal(f.verification.getState().challenge, null)
  assert.doesNotMatch(JSON.stringify(f.store.getState()), /csrf|verification_token|Owner password/)
  console.log('PASS explicit password gate, exact immutable payload, private proof, same-session unlock extension')

  f = fixture(); await f.client.bootstrap()
  const first = await prompt(f), secondController = new AbortController(), second = await prompt(f, { text: 'second' }, secondController.signal)
  secondController.abort(); assert.equal((await second.result).error.kind, 'verification-cancelled')
  f.verification.getState().cancel(); assert.equal((await first.result).error.kind, 'verification-cancelled')
  assert.equal(f.calls.filter(call => call.path === '/auth/verify').length, 0); assert.equal(f.targets().length, 0)
  const delayed = deferred()
  f = fixture(call => call.path === '/auth/verify' ? delayed.promise : undefined); await f.client.bootstrap()
  const pending = await prompt(f), submitting = f.verification.getState().submit(password)
  await tick(); f.verification.getState().cancel()
  delayed.resolve(json({ verification_token: 'v'.repeat(43), verification_expires_at: 10120, unlock_expires_at: 11800 }))
  assert.equal(await submitting, false); assert.equal((await pending.result).error.kind, 'verification-cancelled'); assert.equal(f.targets().length, 0)
  console.log('PASS cancellation before dispatch, queued cancellation and late verification result suppression')

  let attempts = 0
  f = fixture(call => call.path === '/auth/verify' && ++attempts === 1 ? json({ detail: 'raw-secret-error' }, 401) : undefined)
  await f.store.getState().bootstrap(); const phases = []; f.store.subscribe(state => phases.push(state.phase))
  const wrong = await prompt(f); assert.equal(await f.verification.getState().submit(password), false)
  assert.equal(f.verification.getState().error.kind, 'verification-password')
  assert.equal(f.store.getState().phase, 'authenticated'); assert.equal(phases.includes('checking'), false); assert.equal(phases.includes('error'), false)
  assert.equal(f.targets().length, 0); assert.ok(f.verification.getState().challenge)
  await f.verification.getState().submit(password); assert.ok((await wrong.result).value)
  assert.equal(f.targets().length, 1)
  console.log('PASS wrong password preserves same-owner workspace and requires an explicit new password submission')

  for (const failure of [() => json({}, 428), () => { throw new TypeError('private network detail') }]) {
    f = fixture(call => call.path === route ? failure() : undefined); await f.client.bootstrap()
    const request = await prompt(f); await f.verification.getState().submit(password)
    const error = (await request.result).error
    assert.ok(['verification-required', 'network'].includes(error.kind)); assert.equal(f.targets().length, 1)
    assert.equal(f.calls.filter(call => call.path === '/auth/verify').length, 1); assert.equal(f.verification.getState().challenge, null)
  }
  console.log('PASS unadmitted 428 and uncertain dispatched failure never replay or reuse proof')

  const logoutVerify = deferred()
  f = fixture(call => call.path === '/auth/verify' ? logoutVerify.promise : undefined); await f.store.getState().bootstrap()
  const cancelled = await prompt(f), inFlight = f.verification.getState().submit(password); await tick()
  await f.store.getState().logout()
  logoutVerify.resolve(json({ verification_token: 'v'.repeat(43), verification_expires_at: 10120, unlock_expires_at: 11800 }))
  await inFlight; assert.equal((await cancelled.result).error.kind, 'verification-cancelled'); assert.equal(f.targets().length, 0)
  assert.equal(f.store.getState().phase, 'anonymous')
  const read = deferred(); let reads = 0
  f = fixture(call => call.path === '/auth/session' && ++reads === 2 ? read.promise : undefined); await f.store.getState().bootstrap()
  const recheck = f.store.getState().revalidate(); await tick(); f.store.getState().lock()
  read.resolve(json({ authenticated: true, setup_required: false, session_id: 'a'.repeat(24), csrf_token: 'c'.repeat(43), expires_at: 90000, unlock_expires_at: 11800 }))
  await recheck; assert.equal(f.store.getState().phase, 'anonymous'); assert.equal(f.client.getSession(), null)
  assert.equal(gatewaySessionUnlocked({ authenticated: true, setupRequired: false, expiresAt: 90000, unlockExpiresAt: 9999 }, 10000), false)
  const lateLogin = deferred()
  f = fixture(call => call.path === '/auth/session' ? json({ authenticated: false, setup_required: false, session_id: 'a'.repeat(24), csrf_token: 'c'.repeat(43), expires_at: 10600, unlock_expires_at: null }) : call.path === '/auth/login' ? lateLogin.promise : undefined)
  await f.store.getState().bootstrap(); const login = f.store.getState().login(password); await tick(); f.store.getState().lock()
  lateLogin.resolve(json({ authenticated: true, session_id: 'b'.repeat(24), csrf_token: 'd'.repeat(43), expires_at: 90000, unlock_expires_at: 11800 }))
  await login; assert.equal(f.store.getState().phase, 'anonymous'); assert.equal(f.client.getSession(), null)
  console.log('PASS logout cancels outstanding proof; local deadline lock cannot be undone by a late auth read')

  for (const patch of [{ verification_token: 'bad' }, { verification_expires_at: 20000 }, { unlock_expires_at: 9999 }, { unlock_expires_at: 999999 }, { unlock_expires_at: 10050 }]) {
    f = fixture(call => call.path === '/auth/verify' ? json({ verification_token: 'v'.repeat(43), verification_expires_at: 10120, unlock_expires_at: 11800, ...patch }) : undefined)
    await f.client.bootstrap(); const request = await prompt(f); await f.verification.getState().submit(password)
    assert.equal(f.verification.getState().error.kind, 'invalid-response'); assert.equal(f.targets().length, 0)
    f.verification.getState().cancel(); await request.result
  }
  f = fixture(); await f.client.bootstrap()
  const noPrompt = createGatewayAuthClient({ transport: f.transport, now: () => 10000 }); await noPrompt.bootstrap()
  await assert.rejects(noPrompt.request(route, { method: 'POST', body: { text: 'x' } }), error => error.kind === 'verification-required')
  for (const [path, options] of [['/health', {}], ['/auth/verify', { method: 'POST', csrfToken: 'c'.repeat(43), body: {} }]]) await assert.rejects(f.transport.request(path, { ...options, verificationToken: 'v'.repeat(43) }), error => error instanceof GatewayError && error.kind === 'validation')
  const review = describeGatewayOperation({ method: 'POST', path: '/api/pi/tasks/task_1/update', body: { outcome: 'secret outcome', criteria: ['secret criterion'], expected_revision: 4, run_ids: ['turn_1'] } })
  assert.equal(review.target, 'Task task_1'); assert.match(review.details.join(' '), /revision 4/); assert.doesNotMatch(JSON.stringify(review), /secret/)
  console.log('PASS malformed proof fails closed, missing prompt cannot dispatch, safe operation metadata and proof header boundary')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
