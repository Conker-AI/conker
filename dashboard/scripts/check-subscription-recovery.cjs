const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const { createStore } = require('zustand/vanilla')
const root = path.resolve(__dirname, '..')
function loader(mocks = {}) {
  const cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }; cache.set(file, module)
    const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
    new Function('require', 'module', 'exports', code)(name => {
      if (mocks[name]) return mocks[name]
      if (!name.startsWith('.') && !name.startsWith('@/')) return require(name)
      const next = name.startsWith('@/') ? 'src/' + name.slice(2) : path.posix.normalize(path.posix.join(path.posix.dirname(file), name))
      return load(next + (fs.existsSync(path.join(root, next + '.ts')) ? '.ts' : '.tsx'))
    }, module, module.exports)
    return module.exports
  }
  return load
}
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const flush = async () => { for (let index = 0; index < 20; index++) await Promise.resolve() }
const owner = id => ({ phase: 'authenticated', session: { authenticated: true, sessionId: id }, pending: false, logoutUnconfirmed: false })
const row = (model = 'previous-model', status = 'ok', id = 'ollama') => ({ id, model, status, capabilities: ['text'] })
const idle = { available: true, connected: false, connectionId: null, plan: null, loginId: null, loginState: 'idle', problem: null, models: [], catalogueComplete: false, credentialsIncluded: false, deviceCode: null }
const pending = { ...idle, loginId: 'login_A', loginState: 'pending' }
const code = { verificationUrl: 'https://auth.openai.com/codex/device', userCode: 'TEST-1234' }
const connected = { ...idle, connected: true, connectionId: 'connection_' + 'a'.repeat(32), plan: 'plus', models: [{ id: 'test', name: 'Test' }] }
const mocks = { react: {}, 'lucide-react': { ExternalLink: 'svg', LogIn: 'svg', RefreshCw: 'svg' }, 'react-router-dom': { Link: 'a' }, '@/components/ui/button': { Button: 'button' }, '@/components/design-system': { WorkspaceSection: 'section' }, './use-subscription-connection': {} }
const { chatGPTConnectionRules } = loader(mocks)('src/components/gateway/subscription-rules.ts')
const { nativeClaudeConnectionRules } = loader(mocks)('src/components/gateway/subscription-rules.ts')
const { createSubscriptionConnection } = loader()('src/components/gateway/subscription-connection.ts')
function controllerHarness(rules = chatGPTConnectionRules) {
  const authStore = createStore(() => owner('A')), reads = [], writes = [], timers = new Map(); let next = 0, visible = true, environment
  const controller = createSubscriptionConnection({ authStore, ...rules,
    read(signal) { const call = { signal, ...deferred() }; reads.push(call); return call.promise },
    apply(operation, signal, onDispatch) { const call = { operation, signal, onDispatch, ...deferred() }; writes.push(call); return call.promise },
    eligible: () => visible, subscribeEnvironment(listener) { environment = listener; return () => { environment = null } },
    schedule(run, delay) { const id = ++next; timers.set(id, { run, delay }); return id }, unschedule(id) { timers.delete(id) },
  })
  const stop = controller.start()
  return { controller, reads, writes, timers, authStore, stop,
    fire(delay) { const match = [...timers].find(([, timer]) => timer.delay === delay); assert.ok(match, `Expected timer ${delay}`); timers.delete(match[0]); match[1].run() },
    visibility(value) { visible = value; environment?.() },
  }
}
async function controllerCases() {
  const h = controllerHarness()
  h.reads[0].resolve(idle); await flush()
  const signIn = h.controller.apply({ operation: 'login' }); await h.controller.apply({ operation: 'login' })
  assert.equal(h.writes.length, 1); assert.equal(h.controller.store.getState().phase, 'awaiting-verification')
  assert.equal(h.timers.size, 0, 'Owner verification has no provider-operation deadline')
  h.writes[0].onDispatch(); h.writes[0].onDispatch()
  assert.equal(h.controller.store.getState().phase, 'working'); assert.equal(h.timers.size, 1)
  h.fire(75000); await signIn
  assert.equal(h.writes[0].signal.aborted, true); assert.equal(h.controller.store.getState().phase, 'uncertain')
  await h.controller.apply({ operation: 'login' }); assert.equal(h.writes.length, 1, 'Unknown POST cannot be retried before read-only recovery')
  const read = h.controller.read(); h.reads[1].resolve(idle); await read
  assert.equal(h.controller.store.getState().phase, 'current'); assert.equal(h.controller.store.getState().uncertain, true, 'GET idle does not claim an old POST was canceled')
  h.writes[0].resolve({ ...pending, deviceCode: code }); await flush()
  assert.equal(h.controller.store.getState().value.loginId, null, 'Late POST cannot replace read recovery')
  const next = h.controller.apply({ operation: 'login' }); h.writes[1].onDispatch(); h.writes[1].resolve({ ...pending, deviceCode: code }); await next
  assert.equal(h.controller.store.getState().value.deviceCode.userCode, code.userCode)
  assert.equal(h.controller.store.getState().uncertain, false)
  h.fire(3000); assert.equal(h.reads.length, 3); assert.deepEqual([...h.timers.values()].map(timer => timer.delay), [15000], 'Slow polling has one GET and one deadline, not recurring aborts')
  await h.controller.read(); assert.equal(h.reads.length, 3)
  h.reads[2].resolve(pending); await flush()
  assert.equal(h.controller.store.getState().value.deviceCode.userCode, code.userCode, 'Same exact login retains its one-time code')
  const replacement = h.controller.read(); h.reads[3].resolve({ ...pending, loginId: 'login_B' }); await replacement
  assert.equal(h.controller.store.getState().value.deviceCode, null, 'Different login never inherits an earlier code')
  await h.controller.apply({ operation: 'cancel', loginId: pending.loginId }); assert.equal(h.writes.length, 2, 'Captured cancellation cannot target a newer login')
  const failed = h.controller.read(); h.reads[4].reject(new Error('private provider exception')); await failed
  assert.equal(h.controller.store.getState().phase, 'unavailable'); assert.equal(h.controller.store.getState().value, null); assert.equal(h.timers.size, 0)
  const recovery = h.controller.read(); h.reads[5].resolve(connected); await recovery
  const dismissed = h.controller.apply({ operation: 'logout', connectionId: connected.connectionId }); h.writes[2].reject({ kind: 'verification-cancelled' }); await dismissed
  assert.equal(h.controller.store.getState().phase, 'current'); assert.equal(h.controller.store.getState().uncertain, false); assert.equal(h.timers.size, 0)
  const lost = h.controller.apply({ operation: 'logout', connectionId: connected.connectionId }); h.writes[3].onDispatch(); h.writes[3].reject(new Error('lost response')); await lost
  assert.equal(h.controller.store.getState().phase, 'uncertain')
  const pendingRecovery = h.controller.read(); h.reads[6].resolve(pending); await pendingRecovery
  assert.equal(h.controller.store.getState().value.deviceCode, null); assert.equal(h.controller.store.getState().uncertain, true)
  h.stop(); assert.equal(h.timers.size, 0)
}
async function lifecycleCases() {
  const h = controllerHarness()
  h.fire(15000); await flush(); assert.equal(h.controller.store.getState().phase, 'unavailable')
  h.reads[0].resolve(connected); await flush(); assert.equal(h.controller.store.getState().value, null)
  const read = h.controller.read(); h.reads[1].resolve(idle); await read
  const login = h.controller.apply({ operation: 'login' }); h.writes[0].onDispatch()
  h.authStore.setState(owner('B')); h.authStore.setState(owner('A'))
  assert.equal(h.writes[0].signal.aborted, true)
  h.writes[0].resolve({ ...pending, deviceCode: code }); h.reads[2].resolve(connected); await login; await flush()
  assert.equal(h.controller.store.getState().value, null, 'Owner A to B to A fences prior writes and reads')
  h.reads[3].resolve(idle); await flush()
  const oldValue = h.controller.store.getState().value
  const newer = h.controller.read(); h.reads[4].resolve(connected); await newer
  await h.controller.apply({ operation: 'login' }, oldValue); assert.equal(h.writes.length, 1, 'Retired rendered commands cannot apply to a later status snapshot')
  const teardown = h.controller.apply({ operation: 'logout', connectionId: connected.connectionId }); h.writes[1].onDispatch(); h.stop()
  await teardown; h.writes[1].resolve(idle); await flush()
  assert.equal(h.controller.store.getState().phase, 'inactive'); assert.equal(h.timers.size, 0)
  for (const phase of ['awaiting-verification', 'working']) {
    const test = controllerHarness(); test.reads[0].resolve(idle); await flush()
    const unsubscribe = test.controller.store.subscribe(state => { if (state.phase === phase) test.authStore.setState(owner('B')) })
    const operation = test.controller.apply({ operation: 'login' })
    if (phase === 'working') assert.throws(() => test.writes[0].onDispatch())
    await operation
    assert.equal(test.writes.length, phase === 'working' ? 1 : 0, 'Synchronous owner invalidation never leaves a detached pending operation')
    assert.deepEqual([...test.timers.values()].map(timer => timer.delay), [15000], 'Only new owner status read remains; no leaked mutation deadline')
    unsubscribe(); test.stop()
  }
}
async function pollingCases() {
  const h = controllerHarness(); h.reads[0].resolve(pending); await flush()
  h.visibility(false); assert.equal(h.timers.size, 0)
  h.visibility(true); assert.equal(h.reads.length, 2)
  h.visibility(false); assert.equal(h.reads[1].signal.aborted, true)
  h.reads[1].resolve(connected); await flush(); assert.equal(h.controller.store.getState().value.loginId, pending.loginId, 'Hidden pending read preserves the same login for revalidation')
  h.visibility(true); h.reads[2].resolve(pending); await flush()
  for (let index = 0; index < 20; index++) { h.fire(3000); h.reads.at(-1).resolve(pending); await flush() }
  assert.equal(h.controller.store.getState().pollingPaused, true); assert.equal(h.timers.size, 0)
  h.visibility(false); h.visibility(true); assert.equal(h.timers.size, 0, 'Visibility does not reset bounded polling budget')
  const count = h.reads.length, explicit = h.controller.read(); h.reads.at(-1).resolve(pending); await explicit
  assert.equal(h.reads.length, count + 1); assert.equal(h.controller.store.getState().pollingPaused, false)
  h.stop()
}
const walk = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(walk) : [node, ...walk(node.props?.children), ...walk(node.props?.action)]
const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : ''
function componentHarness(provider) {
  const slots = [], effects = [], subscriptions = new Map(); let cursor = 0, dirty = false, tree
  const hooks = {
    useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; dirty = true }] },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial } },
    useMemo(factory, deps) { const i = cursor++; if (!slots[i] || deps.some((value, index) => value !== slots[i].deps[index])) slots[i] = { value: factory(), deps }; return slots[i].value },
    useEffect(effect, deps) { const i = cursor++, old = slots[i]; if (!old || !deps || deps.some((value, index) => value !== old.deps[index])) { slots[i] = { deps, effect }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = effect() }) } },
  }
  hooks.useLayoutEffect = hooks.useEffect
  const load = loader({ ...mocks, react: hooks, './use-subscription-connection': undefined, zustand: { useStore(store) { if (!subscriptions.has(store)) subscriptions.set(store, store.subscribe(() => { dirty = true })); return store.getState() } } })
  const Component = provider === 'chatgpt' ? load('src/components/gateway/chatgpt-connection.tsx').ChatGPTConnection : load('src/components/gateway/native-claude-connection.tsx').NativeClaudeConnection
  const authStore = createStore(() => owner('A')), reads = [], writes = [], catalogues = []
  const service = { status(signal) { const call = { signal, ...deferred() }; reads.push(call); return call.promise }, apply(operation, signal, onDispatch) { const call = { operation, signal, onDispatch, ...deferred() }; writes.push(call); return call.promise } }
  let client = { [provider]: service }; const original = client
  const onModels = value => catalogues.push(value)
  function expand(node) {
    if (!node || typeof node !== 'object') return node
    if (Array.isArray(node)) return node.map(expand)
    if (typeof node.type === 'function') return expand(node.type(node.props))
    return { ...node, props: { ...node.props, children: expand(node.props.children), action: expand(node.props.action) } }
  }
  function render() { cursor = 0; dirty = false; tree = expand(Component({ client, authStore, onModels })); effects.splice(0).forEach(run => run()) }
  return { render, reads, writes, catalogues, authStore,
    async settle() { await flush(); for (let index = 0; dirty; index++) { assert.ok(index < 12); render(); await flush() } },
    text: () => text(tree), button: label => walk(tree).find(node => node.type === 'button' && text(node) === label), code: () => walk(tree).find(node => node.props?.['aria-label'] === 'OpenAI device code'),
    replace() { client = { [provider]: { ...service } }; render() }, restore() { client = original; render() },
    stop() { slots.forEach(slot => slot?.cleanup?.()); subscriptions.forEach(stop => stop()) },
  }
}
async function componentCases() {
  const previous = { document: global.document, window: global.window, navigator: global.navigator, setTimeout: global.setTimeout, clearTimeout: global.clearTimeout }
  const timers = new Map(); let next = 0
  global.document = { visibilityState: 'visible', body: {}, activeElement: null, querySelector() { return null }, addEventListener() {}, removeEventListener() {} }
  global.window = { addEventListener() {}, removeEventListener() {} }
  Object.defineProperty(global, 'navigator', { configurable: true, value: { onLine: true } })
  global.setTimeout = (run, delay) => { const id = ++next; timers.set(id, { run, delay }); return id }; global.clearTimeout = id => timers.delete(id)
  try {
    for (const provider of ['chatgpt', 'claude']) {
      const h = componentHarness(provider), nativeIdle = { available: true, connected: false, loginState: 'idle', loginId: null, authorizationUrl: null, models: [], runtime: 'Claude Code', credentialsIncluded: false }
      const base = provider === 'chatgpt' ? idle : nativeIdle, linked = provider === 'chatgpt' ? connected : { ...nativeIdle, connected: true }
      h.render(); h.reads[0].resolve(linked); await h.settle(); assert.match(h.text(), /Connected/)
      h.button('Refresh').props.onClick(); await h.settle()
      assert.doesNotMatch(h.text(), /Connected/); assert.match(h.text(), /Checking current connection/)
      h.reads[1].reject(new Error('private error')); await h.settle()
      assert.doesNotMatch(h.text(), /Connected|Checking current|private error/); assert.match(h.text(), /status is unavailable/)
      if (provider === 'chatgpt') assert.deepEqual(h.catalogues.at(-1), [], 'Failed connection status clears discovered model suggestions')
      assert.ok(h.button('Check status'))
      h.button('Check status').props.onClick(); await h.settle(); h.reads[2].resolve(base); await h.settle()
      const signIn = h.button(provider === 'chatgpt' ? 'Sign in with ChatGPT' : 'Sign in with Claude subscription')
      signIn.props.onClick({ currentTarget: {} }); signIn.props.onClick({ currentTarget: {} }); await h.settle()
      assert.equal(h.writes.length, 1); assert.match(h.text(), /Waiting for owner verification/); assert.equal(timers.size, 0)
      h.writes[0].onDispatch(); await h.settle(); assert.match(h.text(), /Waiting for the provider operation/)
      const [id, deadline] = [...timers].find(([, item]) => item.delay === 75000); timers.delete(id); deadline.run(); await h.settle()
      assert.match(h.text(), /outcome was not confirmed/); assert.ok(h.button('Check status'))
      h.button('Check status').props.onClick(); await h.settle(); h.reads[3].resolve(base); await h.settle()
      assert.match(h.text(), /earlier operation/); assert.equal(h.writes.length, 1, 'Read-only recovery never repeats POST')
      h.writes[0].resolve({ ...base, loginId: 'login_late', loginState: 'pending', deviceCode: code }); await h.settle(); assert.equal(h.code(), undefined)
      h.button(provider === 'chatgpt' ? 'Sign in with ChatGPT' : 'Sign in with Claude subscription').props.onClick({ currentTarget: {} }); await h.settle(); h.writes[1].onDispatch()
      h.replace(); h.restore(); await h.settle(); assert.equal(h.writes[1].signal.aborted, true)
      h.writes[1].resolve({ ...base, loginId: 'login_old', loginState: 'pending', deviceCode: code }); h.reads[4].resolve(linked); await h.settle()
      assert.equal(h.code(), undefined); assert.doesNotMatch(h.text(), /Connected/)
      h.reads[5].resolve(base); await h.settle(); assert.match(h.text(), /Not connected/)
      if (provider === 'claude') {
        const first = { ...base, loginId: 'login_A', loginState: 'pending' }, replacement = { ...first, loginId: 'login_B' }
        h.button('Refresh').props.onClick(); await h.settle(); h.reads[6].resolve(first); await h.settle()
        const captured = h.button('Cancel sign-in').props.onClick
        h.button('Refresh').props.onClick(); await h.settle(); h.reads[7].resolve(replacement); await h.settle()
        captured({ currentTarget: {} }); await h.settle()
        assert.equal(h.writes.length, 2, 'Actual retired Cancel A button cannot submit after the current login becomes B')
        h.button('Cancel sign-in').props.onClick({ currentTarget: {} }); await h.settle()
        assert.deepEqual(h.writes[2].operation, { operation: 'cancel', loginId: 'login_B' })
        h.writes[2].onDispatch(); h.writes[2].resolve(base); await h.settle()
      }
      h.stop(); assert.equal(timers.size, 0)
    }
  } finally {
    global.document = previous.document; global.window = previous.window; Object.defineProperty(global, 'navigator', { configurable: true, value: previous.navigator }); global.setTimeout = previous.setTimeout; global.clearTimeout = previous.clearTimeout
  }
}
async function hiddenCodeAndFocusCases() {
  const h = controllerHarness(); h.reads[0].resolve(idle); await flush()
  const login = h.controller.apply({ operation: 'login' }); h.writes[0].onDispatch(); h.writes[0].resolve({ ...pending, deviceCode: code }); await login
  h.visibility(false); await h.controller.read()
  assert.equal(h.controller.store.getState().value.deviceCode.userCode, code.userCode, 'Explicit offline read preserves code when no request was attempted')
  h.visibility(true); h.reads[1].resolve(pending); await flush()
  h.fire(3000); h.visibility(false)
  assert.equal(h.controller.store.getState().notice, 'paused')
  assert.equal(h.controller.store.getState().value.deviceCode.userCode, code.userCode, 'Opening provider authorization during a poll retains the same ephemeral code')
  h.reads[2].resolve(connected); await flush()
  assert.equal(h.controller.store.getState().value.loginId, pending.loginId, 'Aborted hidden read cannot change the visible source')
  h.visibility(true); h.reads[3].resolve(pending); await flush()
  assert.equal(h.controller.store.getState().value.deviceCode.userCode, code.userCode)
  const read = h.controller.read(); h.reads[4].reject(new Error()); await read
  assert.equal(h.controller.store.getState().value, null, 'A genuine failed read clears private code')
  h.stop()
  const { restoreSubscriptionFocus } = loader(mocks)('src/components/gateway/subscription-focus.ts')
  const previous = global.document, body = {}, input = {}, source = {}, authStore = createStore(() => owner('A'))
  let focused = 0, dialog = false
  global.document = { body, activeElement: body, querySelector: () => dialog ? {} : null }
  const target = { isConnected: true, focus: () => focused++ }, action = { node: { isConnected: false }, source, owner: 'A' }
  try {
    assert.equal(restoreSubscriptionFocus(action, source, authStore, target, 'uncertain'), true); assert.equal(focused, 1)
    global.document.activeElement = input; restoreSubscriptionFocus(action, source, authStore, target, 'uncertain'); assert.equal(focused, 1)
    global.document.activeElement = body; dialog = true
    assert.equal(restoreSubscriptionFocus(action, source, authStore, target, 'working'), false); assert.equal(focused, 1)
    dialog = false; restoreSubscriptionFocus(action, {}, authStore, target, 'current'); assert.equal(focused, 1)
    authStore.setState(owner('B')); restoreSubscriptionFocus(action, source, authStore, target, 'current'); assert.equal(focused, 1)
  } finally { global.document = previous }
}
async function main() {
  await controllerCases(); await lifecycleCases(); await pollingCases(); await componentCases(); await hiddenCodeAndFocusCases()
  const claude = { available: true, connected: false, loginId: 'login_A', loginState: 'pending', authorizationUrl: 'https://claude.ai/login' }
  assert.equal(nativeClaudeConnectionRules.allowed(claude, { operation: 'cancel', loginId: 'login_B' }), false)
  assert.equal(nativeClaudeConnectionRules.accept(null, { ...claude, loginId: null, loginState: 'idle' }).authorizationUrl, null)
  console.log('Subscription recovery passed: real cards/controller, verification/dispatch deadlines, exact-login secrets, uncertain GET recovery, serialized bounded polling, auth/client ABA and synchronous teardown fences.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
