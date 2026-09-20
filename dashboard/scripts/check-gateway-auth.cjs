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
const origin = 'https://conker.example'
const now = 10_000
const password = 'A real long passphrase 🔐'
const wire = (authenticated = false, suffix = 'a') => ({ authenticated, csrf_token: suffix.repeat(43), session_id: suffix.repeat(24), expires_at: now + (authenticated ? 86400 : 600), setup_required: false })
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const tick = () => new Promise(resolve => setImmediate(resolve))
function fixture(steps) {
  const calls = []
  const transport = createGatewayTransport({ origin, fetch: async (url, options) => {
    calls.push({ url, options })
    const step = steps.shift()
    assert.notEqual(step, undefined, `Unexpected ${options.method} ${url}`)
    return typeof step === 'function' ? step(url, options) : step
  } })
  return { calls, transport, client: createGatewayAuthClient({ transport, now: () => now }) }
}
async function rejects(promise, kind, status) {
  await assert.rejects(promise, error => error instanceof GatewayError && error.kind === kind && (status === undefined || error.status === status))
}
async function main() {
  for (const invalid of ['', 'http://localhost:5173', `${origin}/`, `${origin}/api`, 'https://me:secret@conker.example', `${origin}?q=1`]) {
    assert.throws(() => createGatewayTransport({ origin: invalid }), error => error.kind === 'configuration')
  }
  let f = fixture([json({ ok: true })])
  for (const invalid of ['//evil.example/api/pi/sessions', 'https://evil.example/api/pi/sessions', '/api/pi/../sessions', '/api/pi/%2e%2e/sessions', '/api/pi/sessions?token=secret', '/api/pi/sessions#x', '/api/pi/sessions\\x', '/api/pi/sessions/a/delete', '/api/pi/tools/run', '/auth/login/', '/auth/session\n']) {
    await rejects(f.transport.request(invalid), 'validation')
  }
  await rejects(f.transport.request('/api/pi/sessions', { method: 'DELETE' }), 'validation')
  await rejects(f.transport.request('/api/pi/sessions', { method: '__proto__' }), 'validation')
  await rejects(f.transport.request('/api/pi/sessions', { method: 'POST', body: {} }), 'validation')
  await rejects(f.transport.request('/api/pi/sessions', { body: {} }), 'validation')
  await rejects(f.transport.request('/api/pi/sessions', { query: { token: Infinity } }), 'validation')
  assert.equal(f.calls.length, 0)
  await f.transport.request('/api/pi/sessions', { query: { limit: 3, cursor: 'x/y&z=4' } })
  assert.equal(f.calls[0].url, `${origin}/api/pi/sessions?limit=3&cursor=x%2Fy%26z%3D4`)
  assert.deepEqual(Object.fromEntries(['credentials', 'mode', 'cache', 'redirect'].map(key => [key, f.calls[0].options[key]])), { credentials: 'same-origin', mode: 'same-origin', cache: 'no-store', redirect: 'error' })
  assert.equal(f.calls[0].options.headers.Authorization, undefined)
  console.log('PASS same-origin HTTPS, route/method boundaries, encoded query and browser request policy')

  f = fixture([])
  for (const body of [null, [], { x: undefined }, { x: Infinity }, { x: new Date() }]) await rejects(f.transport.request('/auth/login', { method: 'POST', csrfToken: 'a'.repeat(43), body }), 'validation')
  const circular = {}; circular.x = circular
  await rejects(f.transport.request('/auth/login', { method: 'POST', csrfToken: 'a'.repeat(43), body: circular }), 'validation')
  await rejects(f.transport.request('/auth/login', { method: 'POST', csrfToken: 'a'.repeat(43), body: { text: '🦊'.repeat(18000) } }), 'too-large')
  assert.equal(f.calls.length, 0)
  const malformed = [new Response('not JSON', { headers: { 'Content-Type': 'application/json' } }), json([]), json(null), new Response('{}', { headers: { 'Content-Type': 'text/html' } }), new Response(new Uint8Array([0xff]), { headers: { 'Content-Type': 'application/json' } })]
  for (const response of malformed) await rejects(fixture([response]).transport.request('/auth/session'), 'invalid-response')
  await rejects(fixture([json({ text: '🦊'.repeat(18000) })]).transport.request('/auth/session'), 'response-too-large')
  assert.equal((await fixture([json({ text: '🦊'.repeat(18000) })]).transport.request('/api/pi/sessions/session')).text.length, 36000)
  await rejects(fixture([json({ text: '🦊'.repeat(2_100_000) })]).transport.request('/api/pi/sessions/session'), 'response-too-large')
  const redirected = json({}); Object.defineProperty(redirected, 'redirected', { value: true })
  await rejects(fixture([redirected]).transport.request('/auth/session'), 'invalid-response')
  await rejects(fixture([new Response(null, { status: 302 })]).transport.request('/auth/session'), 'invalid-response')
  const external = json({}); Object.defineProperty(external, 'url', { value: 'https://evil.example/auth/session' })
  await rejects(fixture([external]).transport.request('/auth/session'), 'invalid-response')
  console.log('PASS request/response object JSON, UTF-8 byte bounds, malformed data and redirects')

  f = fixture([json({ detail: 'SECRET password token stack' }, 429), json({ detail: { turn_id: 'turn_123', message: 'SECRET' } }, 503)])
  await assert.rejects(f.transport.request('/auth/session'), error => error.kind === 'rate-limited' && !JSON.stringify(error).includes('SECRET') && !error.message.includes('SECRET'))
  await assert.rejects(f.transport.request('/api/pi/sessions/session/turns', { method: 'POST', csrfToken: 'a'.repeat(43), body: {} }), error => error.kind === 'dependency' && error.turnId === 'turn_123' && !JSON.stringify(error).includes('SECRET'))
  console.log('PASS bounded static errors and safe turn identity recovery without raw backend detail')

  const boot = deferred()
  const loggedIn = wire(true, 'b'); delete loggedIn.setup_required
  f = fixture([() => boot.promise, json(loggedIn), json({ authenticated: false })])
  const store = createGatewayAuthStore({ client: f.client })
  const boot1 = store.getState().bootstrap(), boot2 = store.getState().bootstrap()
  assert.equal(boot1, boot2)
  const signingIn = store.getState().login(password)
  assert.equal(store.getState().phase, 'checking')
  await tick(); assert.equal(f.calls.length, 1)
  boot.resolve(json(wire()))
  assert.equal(await boot1, true); assert.equal(await signingIn, true)
  assert.equal(f.calls.length, 2)
  assert.equal(f.calls[1].options.headers['X-CSRF-Token'], 'a'.repeat(43))
  assert.equal(JSON.parse(f.calls[1].options.body).password, password)
  assert.equal(store.getState().phase, 'authenticated')
  assert.equal(store.getState().pending, false)
  assert.equal(JSON.stringify(store.getState()).includes('csrf'), false)
  assert.equal(JSON.stringify(store.getState()).includes(password), false)
  const publicCopy = f.client.getSession(); publicCopy.authenticated = false
  assert.equal(f.client.getSession().authenticated, true)
  const loggingOut = store.getState().logout()
  assert.equal(store.getState().session, null)
  assert.equal(await loggingOut, true)
  assert.equal(f.calls[2].options.headers['X-CSRF-Token'], 'b'.repeat(43))
  assert.equal(store.getState().phase, 'anonymous')
  assert.equal(store.getState().logoutUnconfirmed, false)
  store.dispose()
  console.log('PASS concurrent bootstrap/login rotation, private CSRF, snapshot isolation and confirmed logout')

  for (const invalid of [{ ...wire(), expires_at: now }, { ...wire(), expires_at: now + 999999 }, { ...wire(), authenticated: 'yes' }, { ...wire(true), setup_required: true }, { ...wire(), csrf_token: 'short' }, { ...wire(), session_id: '../bad' }]) {
    const current = fixture([json(invalid)])
    await rejects(current.client.bootstrap(), 'invalid-response')
    assert.equal(current.client.getSession(), null)
  }
  f = fixture([json(wire()), json({ ...wire(true), setup_required: undefined })])
  await f.client.bootstrap()
  await rejects(f.client.login(password), 'invalid-response')
  assert.equal(f.client.getSession(), null)
  f = fixture([json({ ...wire(), setup_required: true })])
  const setupStore = createGatewayAuthStore({ client: f.client }); await setupStore.getState().bootstrap()
  assert.equal(setupStore.getState().phase, 'setup-required')
  assert.equal(await setupStore.getState().login(password), false)
  assert.equal(f.calls.length, 1)
  setupStore.dispose()
  console.log('PASS strict expiry/session parsing, rotation required and setup-required gating')

  f = fixture([json(wire()), json({ detail: 'wrong password' }, 401), json(wire())])
  const deniedLogin = createGatewayAuthStore({ client: f.client }); await deniedLogin.getState().bootstrap()
  assert.equal(await deniedLogin.getState().login(password), false)
  assert.equal(deniedLogin.getState().phase, 'anonymous')
  assert.equal(f.calls.filter(call => call.url.endsWith('/auth/login')).length, 1)
  deniedLogin.dispose()
  console.log('PASS rejected login refreshes CSRF separately without repeating the password')

  for (const authenticated of [true, false]) {
    f = fixture([json(wire(true, 'b')), json({ detail: 'denied' }, 403), json(wire(authenticated, authenticated ? 'b' : 'c'))])
    const authStore = createGatewayAuthStore({ client: f.client }); await authStore.getState().bootstrap()
    await rejects(f.client.request('/api/pi/sessions', { method: 'POST', body: { label: 'test' } }), authenticated ? 'upstream-denied' : 'browser-expired', 403)
    assert.equal(f.calls.filter(call => call.options.method === 'POST').length, 1)
    assert.equal(authStore.getState().phase, authenticated ? 'authenticated' : 'anonymous')
    authStore.dispose()
  }
  f = fixture([json(wire(true, 'b')), json({}, 401), () => { throw new Error('private network detail') }])
  await f.client.bootstrap()
  await rejects(f.client.request('/api/pi/models'), 'verification-failed', 401)
  assert.equal(f.client.getSession(), null)
  console.log('PASS runtime denial distinguishes active browser/expired/unknown session and never retries operation')

  const longTurn = deferred()
  f = fixture([json(wire(true, 'b')), () => longTurn.promise, json({ authenticated: false })])
  const longStore = createGatewayAuthStore({ client: f.client }); await longStore.getState().bootstrap()
  const running = f.client.request('/api/pi/sessions/session/turns', { method: 'POST', body: { message: 'hello' } })
  await tick(); assert.equal(f.calls.length, 2)
  assert.equal(await longStore.getState().logout(), true)
  assert.equal(longStore.getState().phase, 'anonymous')
  longTurn.resolve(json({ secret: 'late private response' }))
  await rejects(running, 'session-changed')
  longStore.dispose()
  console.log('PASS logout proceeds during long turn and discards late authenticated response')

  f = fixture([json(wire(true, 'b')), () => { throw new Error('offline') }, json(wire(true, 'b')), json({ authenticated: false })])
  const retryLogout = createGatewayAuthStore({ client: f.client }); await retryLogout.getState().bootstrap()
  assert.equal(await retryLogout.getState().logout(), false)
  assert.equal(retryLogout.getState().phase, 'error')
  assert.equal(retryLogout.getState().session, null)
  assert.equal(retryLogout.getState().logoutUnconfirmed, true)
  assert.equal(await retryLogout.getState().logout(), true)
  assert.equal(f.calls[2].url, `${origin}/auth/session`)
  assert.equal(f.calls[3].options.headers['X-CSRF-Token'], 'b'.repeat(43))
  assert.equal(retryLogout.getState().logoutUnconfirmed, false)
  retryLogout.dispose()
  console.log('PASS failed logout remains locked and explicit retry recovers CSRF before revocation')
  f = fixture([json(wire(true, 'b')), () => { throw new Error('lost logout response') }, json(wire(false, 'c'))])
  const lostAck = createGatewayAuthStore({ client: f.client }); await lostAck.getState().bootstrap()
  assert.equal(await lostAck.getState().logout(), false)
  assert.equal(await lostAck.getState().logout(), true)
  assert.equal(lostAck.getState().phase, 'anonymous')
  assert.equal(lostAck.getState().logoutUnconfirmed, false)
  assert.equal(f.calls.filter(call => call.url.endsWith('/auth/logout')).length, 1)
  lostAck.dispose()
  console.log('PASS anonymous cookie recheck resolves lost logout acknowledgement without an unsafe retry')
  console.log('All gateway authentication checks passed.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
