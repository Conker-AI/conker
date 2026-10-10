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
const { createChatGPTClient } = load('chatgpt.ts')
const { createNativeClaudeClient } = load('native-claude.ts')
const route = '/api/host/providers'
const revision = 'credential_' + 'a'.repeat(32)
function status() {
  return { schemaVersion: 1, available: true, secretsIncluded: false, paidAllowed: false, policyRecoveryRequired: false, providers: ['openrouter', 'openai', 'anthropic'].map(id => ({
    id, configured: false, activeRevision: null, activeAt: null, stagedRevision: null, stagedAt: null,
    verificationStatus: null, verificationBasis: null, verifiedAt: null, verificationStale: false,
    activationPending: false, revokedRevisions: [], secretIncluded: false,
  })) }
}

async function connectionRecoveryChecks(subscription) {
  const slots = [], effects = []; let cursor = 0, dirty = false
  const hooks = {
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; dirty = true }]
    },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index] },
    useEffect(effect, deps) {
      const index = cursor++, previous = slots[index]
      if (!previous || deps.some((value, position) => !Object.is(value, previous.deps[position]))) {
        slots[index] = { deps, cleanup: null }
        effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = effect() })
      }
    },
  }
  const file = path.resolve(__dirname, '../src/components/gateway/providers-settings.tsx')
  const component = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'module', 'exports', code)(name => {
    if (name === 'react') return hooks
    if (name === 'react/jsx-runtime') return require(name)
    if (name === 'lucide-react') return { ExternalLink: 'svg', LogIn: 'svg', RefreshCw: 'svg' }
    const parts = {
      '@/components/ui/button': { Button: 'button' }, '@/components/design-system': { WorkspaceSection: 'section' },
      '@/app/settings/models-providers': { ModelsProviders: 'div' }, './page-frame': { GatewayPageFrame: 'main' }, './provider-credentials': { ProviderCredentials: 'div' },
      './native-claude-connection': { NativeClaudeConnection: 'section' },
      './use-provider-readiness': { useProviderReadiness: () => { throw new Error('Connection test must not invoke runtime readiness') } },
      './runtime-read-deadline': { readRuntimeWithDeadline: () => { throw new Error('Connection test must not invoke catalogue reads') } },
    }
    assert.ok(parts[name], `Unexpected Providers dependency ${name}`)
    return parts[name]
  }, component, component.exports)
  const reads = [], writes = [], catalogues = [], connections = []
  const defer = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
  const client = { chatgpt: {
    status(signal) { const request = { ...defer(), signal }; reads.push(request); return request.promise },
    apply(operation, signal) { const request = { ...defer(), operation, signal }; writes.push(request); return request.promise },
  } }
  const props = { client, onModels: models => catalogues.push(models), onConnection: connection => connections.push(connection) }
  let tree
  const render = () => { cursor = 0; dirty = false; tree = component.exports.ChatGPTConnection(props); while (effects.length) effects.shift()(); return tree }
  const settle = async () => { await new Promise(resolve => setImmediate(resolve)); if (dirty) render() }
  const walk = value => !value || typeof value !== 'object' ? [] : Array.isArray(value) ? value.flatMap(walk) : [value, ...walk(value.props?.children), ...walk(value.props?.action)]
  const text = value => typeof value === 'string' ? value : Array.isArray(value) ? value.map(text).join('') : value?.props ? text(value.props.children) : ''
  const button = label => walk(tree).find(node => node.type === 'button' && text(node) === label)
  const pending = { ...subscription, loginId: 'test-login', loginState: 'pending' }
  const previousWindow = global.window
  let timer = 0
  global.window = { setInterval: () => ++timer, clearInterval: () => {} }
  try {
    render(); reads[0].resolve(subscription); await settle()
    assert.ok(button('Sign in with ChatGPT'))
    button('Refresh').props.onClick(); render()
    const staleIdle = reads.at(-1)
    const signIn = button('Sign in with ChatGPT')
    signIn.props.onClick(); signIn.props.onClick(); render()
    assert.equal(writes.length, 1, 'A synchronous lock prevents double sign-in before React rerenders')
    assert.equal(staleIdle.signal.aborted, true, 'Starting auth cancels the previous read')
    writes[0].resolve({ ...pending, deviceCode: { verificationUrl: 'https://auth.openai.com/codex/device', userCode: 'TEST-1234' } }); await settle()
    const freshPending = reads.at(-1)
    staleIdle.resolve(subscription); await settle()
    assert.ok(button('Cancel sign-in'), 'A late pre-login read cannot hide the pending grant')
    freshPending.resolve(pending); await settle()
    assert.ok(walk(tree).some(node => node.props?.['aria-label'] === 'OpenAI device code'), 'A current pending read preserves the once-issued code')
    button('Refresh').props.onClick(); render()
    const stalePending = reads.at(-1)
    button('Cancel sign-in').props.onClick(); render()
    writes[1].resolve({ ...subscription, loginState: 'canceled' }); await settle()
    stalePending.resolve(pending); await settle()
    assert.ok(button('Sign in with ChatGPT'), 'A late pre-cancel read cannot resurrect the pending grant')
    assert.ok(!walk(tree).some(node => node.props?.['aria-label'] === 'OpenAI device code'))
    const connected = { ...subscription, connected: true, connectionId: 'connection_' + 'b'.repeat(32), plan: 'plus', models: [{ id: 'test-model', name: 'Test' }] }
    reads.at(-1).resolve(connected); await settle()
    assert.ok(button('Disconnect'))
    assert.equal(connections.at(-1), 'connected')
    button('Refresh').props.onClick(); render(); reads.at(-1).reject(new Error('Connection unavailable')); await settle()
    assert.ok(!button('Disconnect') && !button('Sign in with ChatGPT'), 'A failed read hides stale auth commands until recovery')
    assert.deepEqual(catalogues.at(-1), [], 'Stale model discovery cannot survive a failed connection read')
    assert.equal(connections.at(-1), 'unavailable', 'Runtime readiness follows the same failed read, not old provider health')
    button('Refresh').props.onClick(); render(); reads.at(-1).resolve({ ...subscription, available: false, problem: 'provider_operation_failed' }); await settle()
    assert.ok(text(tree).includes('existing authorization has not been removed'))
    assert.ok(!button('Sign in with ChatGPT'))
    button('Refresh').props.onClick(); render(); reads.at(-1).resolve(connected); await settle()
    assert.ok(button('Disconnect'), 'Explicit read recovery restores the authoritative connection')
    assert.equal(connections.at(-1), 'connected')
    button('Read available models').props.onClick(); render()
    for (const slot of slots) slot?.cleanup?.()
    writes.at(-1).resolve(connected); await settle()
    assert.equal(writes.at(-1).signal.aborted, true, 'Leaving Providers cancels its pending UI operation')
  } finally { for (const slot of slots) slot?.cleanup?.(); global.window = previousWindow }
}

async function nativeCancellationChecks(idle) {
  const slots = [], effects = []; let cursor = 0, dirty = false
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; dirty = true }] },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index] },
    useEffect(effect, deps) {
      const index = cursor++, previous = slots[index]
      if (!previous || deps.some((value, position) => !Object.is(value, previous.deps[position]))) {
        slots[index] = { deps, cleanup: null }
        effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = effect() })
      }
    },
  }
  const file = path.resolve(__dirname, '../src/components/gateway/native-claude-connection.tsx')
  const component = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'module', 'exports', code)(name => {
    if (name === 'react') return hooks
    if (name === 'react/jsx-runtime') return require(name)
    const parts = { 'react-router-dom': { Link: 'a' }, '@/components/ui/button': { Button: 'button' }, '@/components/design-system': { WorkspaceSection: 'section' } }
    assert.ok(parts[name], `Unexpected native connection dependency ${name}`)
    return parts[name]
  }, component, component.exports)
  const defer = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
  const reads = [], writes = []
  const client = { claude: {
    status(signal) { const request = { ...defer(), signal }; reads.push(request); return request.promise },
    apply(operation, signal) { const request = { ...defer(), operation, signal }; writes.push(request); return request.promise },
  } }
  let tree
  const render = () => { cursor = 0; dirty = false; tree = component.exports.NativeClaudeConnection({ client }); while (effects.length) effects.shift()() }
  const settle = async () => { await new Promise(resolve => setImmediate(resolve)); if (dirty) render() }
  const walk = value => !value || typeof value !== 'object' ? [] : Array.isArray(value) ? value.flatMap(walk) : [value, ...walk(value.props?.children), ...walk(value.props?.action)]
  const text = value => typeof value === 'string' ? value : Array.isArray(value) ? value.map(text).join('') : value?.props ? text(value.props.children) : ''
  const button = label => walk(tree).find(node => node.type === 'button' && text(node) === label)
  const first = { ...idle, loginState: 'pending', loginId: 'login_' + 'a'.repeat(32) }
  const replacement = { ...first, loginId: 'login_' + 'b'.repeat(32) }
  const originalInterval = global.setInterval, originalClear = global.clearInterval
  global.setInterval = () => 1; global.clearInterval = () => {}
  try {
    render(); reads[0].resolve(first); await settle()
    const capturedCancel = button('Cancel sign-in').props.onClick
    button('Refresh').props.onClick(); render(); reads.at(-1).resolve(replacement); await settle()
    // The owner action captured A before a different tab replaced it with B.
    capturedCancel(); capturedCancel(); render()
    assert.equal(writes.length, 1)
    assert.deepEqual(writes[0].operation, { operation: 'cancel', loginId: first.loginId })
    writes[0].reject(new Error('Operation was not confirmed. Refresh status.')); await settle()
    reads.at(-1).resolve(replacement); await settle()
    assert.equal(writes.length, 1, 'Recovering current status must never cancel a replacement automatically')
    button('Cancel sign-in').props.onClick(); render()
    assert.deepEqual(writes[1].operation, { operation: 'cancel', loginId: replacement.loginId })
    writes[1].resolve({ ...idle, loginState: 'canceled' }); await settle()
    assert.ok(button('Sign in with Claude subscription'))
  } finally {
    for (const slot of slots) slot?.cleanup?.()
    global.setInterval = originalInterval; global.clearInterval = originalClear
  }
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
  const sessions = createBrowserSessionsClient({ request: async (...args) => { adminCalls.push(args); return args[1]?.method === 'POST' ? { revoked: true } : { results: [{ id, created: 10, touched: 12, expires: 100 }] } }, getSession: () => ({ sessionId: id }) }, () => { locked = true })
  assert.equal((await sessions.list())[0].current, true)
  assert.equal(describeGatewayOperation(snapshotGatewayOperation('/auth/revoke-all', {})).title, 'Sign out all browser sessions')
  await assert.rejects(sessions.revoke('bad/id'), error => error.kind === 'validation')
  await sessions.revoke(id)
  assert.equal(locked, true)
  assert.deepEqual(adminCalls.at(-1), [`/auth/sessions/${id}/revoke`, { method: 'POST', body: {}, signal: undefined }])
  const subscription = { available: true, connected: false, connectionId: null, plan: null, loginId: null, loginState: 'idle', problem: null, models: [], catalogueComplete: false, credentialsIncluded: false, deviceCode: null }
  let chatgptResponse = subscription
  const chatgptCalls = []
  const chatgpt = createChatGPTClient({ request: async (...args) => { chatgptCalls.push(args); return chatgptResponse } })
  assert.equal((await chatgpt.status()).connected, false)
  const authPath = '/api/host/chatgpt'
  assert.equal(chatgptCalls[0][0], authPath)
  assert.equal(isConversationWrite(authPath), false)
  assert.equal(describeGatewayOperation(snapshotGatewayOperation(authPath, { operation: 'login' })).title, 'Sign in with ChatGPT')
  chatgptResponse = { ...subscription, loginId: 'test-login', loginState: 'pending', deviceCode: { verificationUrl: 'https://auth.openai.com/codex/device', userCode: 'TEST-1234' } }
  assert.equal((await chatgpt.apply({ operation: 'login' })).deviceCode.userCode, 'TEST-1234')
  await assert.rejects(chatgpt.status(), error => error.kind === 'invalid-response')
  for (const invalid of [{ operation: 'login', apiKey: 'PRIVATE' }, { operation: 'logout', connectionId: 'stale' }, { operation: 'command/exec' }]) await assert.rejects(chatgpt.apply(invalid), error => error.kind === 'validation')
  chatgptResponse = { ...subscription, accessToken: 'PRIVATE' }
  await assert.rejects(chatgpt.status(), error => error.kind === 'invalid-response')
  const nativeIdle = { available: true, connected: false, loginId: null, loginState: 'idle', authorizationUrl: null, credentialsIncluded: false, runtime: 'Claude Code', models: [] }
  let nativeResponse = nativeIdle
  const nativeCalls = [], nativePath = '/api/host/claude', loginId = 'login_' + 'a'.repeat(32)
  const native = createNativeClaudeClient({ request: async (...args) => { nativeCalls.push(args); return nativeResponse } })
  assert.equal((await native.status()).loginId, null)
  assert.equal(nativeCalls[0][0], nativePath)
  assert.equal(isConversationWrite(nativePath), false, 'Native cancellation remains an exact owner-verified action')
  nativeResponse = { ...nativeIdle, loginState: 'pending', loginId }
  assert.equal((await native.apply({ operation: 'login', billing: 'subscription' })).loginId, loginId)
  const cancellation = { operation: 'cancel', loginId }
  await native.apply(cancellation)
  assert.deepEqual(nativeCalls.at(-1)[1].body, cancellation)
  assert.deepEqual(snapshotGatewayOperation(nativePath, cancellation).body, cancellation)
  for (const invalid of [{ operation: 'cancel' }, { operation: 'cancel', loginId: null }, { operation: 'cancel', loginId: 'invalid' }, { ...cancellation, billing: 'api' }, { operation: 'login', loginId }, { operation: 'logout', loginId }]) {
    const before = nativeCalls.length
    await assert.rejects(native.apply(invalid), error => error.kind === 'validation')
    assert.equal(nativeCalls.length, before)
  }
  for (const malformed of [{ ...nativeResponse, loginId: null }, { ...nativeResponse, loginId: 'invalid' }, { ...nativeIdle, loginId }, { ...nativeIdle, privateToken: 'PRIVATE' }]) {
    nativeResponse = malformed
    await assert.rejects(native.status(), error => error.kind === 'invalid-response')
  }
  const general = fs.readFileSync(path.resolve(__dirname, '../src/components/gateway/models-settings.tsx'), 'utf8')
  assert.ok(!general.includes('<ProviderCredentials') && !general.includes('<ModelsProviders'), 'provider management is not General')
  const header = fs.readFileSync(path.resolve(__dirname, '../src/components/gateway/header.tsx'), 'utf8')
  assert.ok(header.includes('gatewayPageNavigation'))
  const { gatewayPageNavigation } = load(path.resolve(__dirname, '../src/components/gateway/navigation.ts'))
  const providerNavigation = gatewayPageNavigation('/settings', '?tab=providers')
  assert.equal(providerNavigation.activeSection, 'providers')
  assert.deepEqual(providerNavigation.sections.find(section => section.value === 'providers'), { value: 'providers', label: 'Providers', to: '/settings?tab=providers', badge: undefined })
  await connectionRecoveryChecks(subscription)
  await nativeCancellationChecks(nativeIdle)
  console.log('Provider control passed: separate subscription and API-key flows, exact verification, strict secret-free projections, dedicated Providers settings and late-read recovery.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
