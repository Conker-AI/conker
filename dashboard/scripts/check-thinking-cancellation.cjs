const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { createStore } = require('zustand/vanilla')
const cache = new Map(), root = path.resolve(__dirname, '..')
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports
  const module = { exports: {} }; cache.set(relative, module)
  const source = fs.readFileSync(path.join(root, relative), 'utf8') + (relative.endsWith('/thinking-status.tsx') ? '\nexport { restoreThinkingActionFocus };' : '')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'module', 'exports', code)(name => {
    if (name === 'react' && relative.endsWith('/thinking-status.tsx')) return { useRef: value => ({ current: value }), useLayoutEffect: () => {} }
    if (name === '@/components/ui/button') return { Button: 'button' }
    if (!name.startsWith('.') && !name.startsWith('@/')) return require(name)
    const file = name.startsWith('@/') ? `src/${name.slice(2)}` : path.posix.normalize(path.posix.join(path.posix.dirname(relative), name))
    return load(file + (fs.existsSync(path.join(root, file + '.ts')) ? '.ts' : '.tsx'))
  }, module, module.exports)
  return module.exports
}
const { createThinkingCancellation, applyThinkingCancellationRead } = load('src/components/gateway/thinking-cancellation.ts')
const { ThinkingStatus, restoreThinkingActionFocus } = load('src/components/gateway/thinking-status.tsx')
const { createGatewayRuntimeClient } = load('src/lib/gateway/runtime.ts')
const { createFakeGateway } = load('src/dev/fake-gateway.ts')
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const flush = async () => { for (let index = 0; index < 24; index++) await Promise.resolve() }
const row = (turnId = 'think_A', status = 'running') => ({ turnId, status, model: 'thinking-model', provider: 'local', result: null })
const receipt = (turnId = 'think_A', status = 'canceled') => ({ forgotten: false, results: [row(turnId, status)] })
function harness() {
  const calls = [], applied = [], timers = new Map(); let nextTimer = 0
  const authStore = createStore(() => ({ phase: 'authenticated', session: { authenticated: true, sessionId: 'owner_A' }, pending: false, logoutUnconfirmed: false }))
  const workspace = createStore(() => ({ selected: 'session_A', epoch: 1, operation: null, drafts: { session_A: 'Unsent talking draft' } }))
  const privacy = createStore(set => ({ sessionIds: [], markForgotten: sessionIds => set({ sessionIds }) }))
  let context = { sessionId: 'session_A', turnId: 'think_A', working: true, active: true, identity: 'owner_A', epoch: 1 }
  const request = (kind, sessionId, turnId, signal) => { const value = { kind, sessionId, turnId, signal, ...deferred() }; calls.push(value); return value.promise }
  const controller = createThinkingCancellation({ authStore, workspace, privacy, context: () => context,
    client: { cancelThinking: (id, turnId, options) => request('POST', id, turnId, options.signal), getThinking: (id, options) => request('GET', id, null, options.signal) },
    apply: (id, turnId, value) => applied.push({ id, turnId, value }),
    schedule: (run, delay) => { const id = ++nextTimer; timers.set(id, { run, delay }); return id }, unschedule: id => timers.delete(id) })
  let stop = controller.start()
  return { controller, calls, applied, timers, authStore, workspace, privacy,
    context: patch => { context = { ...context, ...patch }; controller.sync() },
    timeout: () => { const [id, timer] = timers.entries().next().value; timers.delete(id); assert.equal(timer.delay, 15000); timer.run() },
    stop: () => stop(), restart: () => { stop(); stop = controller.start() } }
}
async function lifetimes() {
  let h = harness()
  const cancelA = h.controller.cancel('think_A'); await h.controller.cancel('think_A')
  assert.equal(h.calls.length, 1, 'Duplicate cancellation is blocked synchronously before rendering')
  h.context({ turnId: 'think_B' })
  assert.equal(h.calls[0].signal.aborted, true)
  assert.equal(h.controller.store.getState().pending, null, 'B does not inherit A pending state')
  const cancelB = h.controller.cancel('think_B')
  h.calls[0].reject(new Error('Old failure')); await cancelA
  assert.equal(h.controller.store.getState().turnId, 'think_B')
  assert.equal(h.controller.store.getState().error, null)
  assert.equal(h.controller.store.getState().pending, 'cancel', 'A finalizer cannot unlock B')
  h.calls[1].resolve({}); await flush()
  assert.equal(h.calls[2].kind, 'GET'); h.calls[2].resolve(receipt('think_B')); await cancelB
  assert.equal(h.applied.length, 1); assert.equal(h.applied[0].turnId, 'think_B')
  assert.equal(h.timers.size, 0)
  assert.deepEqual(h.workspace.getState().drafts, { session_A: 'Unsent talking draft' })
  assert.equal(h.workspace.getState().operation, null, 'Cancel never takes the talking operation lock')
  h.stop()

  for (const invalidate of [
    h => { h.authStore.setState({ session: { authenticated: true, sessionId: 'owner_B' } }); h.authStore.setState({ session: { authenticated: true, sessionId: 'owner_A' } }) },
    h => h.authStore.setState({ pending: true }),
    h => h.authStore.setState({ logoutUnconfirmed: true }),
    h => { h.workspace.setState({ selected: 'session_B' }); h.workspace.setState({ selected: 'session_A' }) },
    h => h.workspace.setState({ epoch: 2 }),
    h => h.privacy.getState().markForgotten(['session_A']),
    h => h.context({ working: false }),
    h => h.stop(),
  ]) {
    h = harness(); const pending = h.controller.cancel('think_A'); invalidate(h)
    assert.equal(h.calls[0].signal.aborted, true, 'Lifetime invalidation aborts without waiting for React')
    h.calls[0].resolve({}); await pending
    assert.equal(h.calls.length, 1, 'Late cancellation cannot start a follow-up read')
    assert.equal(h.applied.length, 0); assert.equal(h.timers.size, 0); h.stop()
  }
  h = harness(); h.restart()
  const pending = h.controller.cancel('think_A'); h.calls[0].resolve({}); await flush()
  h.workspace.setState({ operation: 'send' })
  assert.equal(h.calls[1].signal.aborted, false, 'Independent talking does not interrupt cancellation recovery')
  h.calls[1].resolve(receipt()); await pending; assert.equal(h.applied.length, 1); h.stop()
}
async function uncertainty() {
  const h = harness()
  const pending = h.controller.cancel('think_A'); h.timeout(); await pending
  assert.equal(h.controller.store.getState().pending, null)
  assert.equal(h.controller.store.getState().error, 'uncertain')
  assert.equal(h.calls[0].signal.aborted, true)
  h.calls[0].resolve({}); await flush()
  assert.equal(h.calls.length, 1, 'Late success after timeout never starts recovery or claims cancellation')
  await h.controller.cancel('think_A'); assert.equal(h.calls.length, 1, 'Unconfirmed cancellation must be checked first')
  let checking = h.controller.refresh('think_A'); await h.controller.refresh('think_A')
  assert.equal(h.calls.length, 2); assert.equal(h.calls[1].kind, 'GET')
  h.timeout(); await checking
  assert.equal(h.controller.store.getState().error, 'refresh')
  h.calls[1].resolve(receipt()); await flush(); assert.equal(h.applied.length, 0, 'Late timed-out read cannot publish')
  checking = h.controller.refresh('think_A'); h.calls[2].resolve(receipt('think_A', 'running')); await checking
  assert.equal(h.controller.store.getState().error, null, 'A verified running state permits a new explicit cancel')
  assert.equal(h.calls.filter(call => call.kind === 'POST').length, 1, 'Status checks never retry cancellation')
  const retry = h.controller.cancel('think_A'); h.calls[3].resolve({}); await flush()
  h.privacy.getState().markForgotten(['session_A']); h.calls[4].resolve(receipt()); await retry
  assert.equal(h.applied.length, 1, 'Forgetting fences an already-started confirmation read')
  h.stop()

  const forgotten = harness(), cancel = forgotten.controller.cancel('think_A')
  forgotten.calls[0].resolve({}); await flush(); forgotten.calls[1].resolve({ forgotten: true, results: [] }); await cancel
  assert.deepEqual(forgotten.privacy.getState().sessionIds, ['session_A']); assert.equal(forgotten.applied.length, 0)
  assert.equal(forgotten.controller.store.getState().pending, null); forgotten.stop()

  for (const results of [[], [row('other_turn')]]) {
    const missing = harness(), pending = missing.controller.cancel('think_A')
    missing.calls[0].resolve({}); await flush(); missing.calls[1].resolve({ forgotten: false, results }); await pending
    assert.equal(missing.applied.length, 0, 'Missing target cannot remove the status or recovery controls')
    assert.equal(missing.controller.store.getState().error, 'uncertain'); missing.stop()
  }
  const completed = { id: 'session_A', thinking: [{ ...row('think_A', 'completed'), result: 'New verified findings' }] }
  assert.equal(applyThinkingCancellationRead(completed, 'session_A', 'think_A', receipt('think_A', 'running')), completed, 'Late React updater preserves terminal same-turn findings')
  assert.equal(applyThinkingCancellationRead(completed, 'session_A', 'think_A', receipt('think_A', 'canceled')), completed)
  const current = { id: 'session_A', thinking: [row('think_B')] }
  assert.equal(applyThinkingCancellationRead(current, 'session_A', 'think_A', receipt()), current, 'Queued A updater cannot replace B')
  const running = { id: 'session_A', thinking: [row()] }
  assert.equal(applyThinkingCancellationRead(running, 'session_A', 'think_A', receipt()).thinking[0].status, 'canceled')
}
const walk = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(walk) : [node, ...walk(node.props?.children)]
const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : ''
async function renderedControls() {
  const originalDocument = global.document
  const body = {}, input = {}, status = { isConnected: true, focus: () => { global.document.activeElement = status } }
  global.document = { activeElement: body, body, querySelector: () => null }
  const event = { currentTarget: {} }
  try {
  const canceled = [], checked = []
  const props = { rows: [row('think_B')], disabled: false, onCancel: async id => canceled.push(id), onRefresh: async id => checked.push(id), onDiscuss: () => {} }
  let tree = ThinkingStatus({ ...props, cancellation: { turnId: 'think_A', pending: 'cancel', error: 'uncertain' } })
  let button = walk(tree).find(node => node.type === 'button')
  assert.equal(text(button), 'Cancel thinking'); assert.equal(button.props.disabled, false)
  button.props.onClick(event); assert.deepEqual(canceled, ['think_B'])
  tree = ThinkingStatus({ ...props, cancellation: { turnId: 'think_B', pending: null, error: 'uncertain' } })
  assert.match(text(tree), /Work may still be running/); assert.match(text(tree), /Checking only reads/)
  button = walk(tree).find(node => node.type === 'button'); assert.equal(text(button), 'Check thinking status')
  button.props.onClick(event); assert.deepEqual(checked, ['think_B']); assert.equal(canceled.length, 1)
  tree = ThinkingStatus({ ...props, cancellation: { turnId: 'think_B', pending: 'refresh', error: 'uncertain' } })
  assert.equal(walk(tree).find(node => node.type === 'button').props.disabled, true)
  const action = { turnId: 'think_A', node: { isConnected: false } }
  assert.equal(restoreThinkingActionFocus(action, 'think_A', false, status), true)
  assert.equal(global.document.activeElement, status, 'Removed keyboard action restores focus to persistent status')
  global.document.activeElement = input
  restoreThinkingActionFocus(action, 'think_A', false, status)
  assert.equal(global.document.activeElement, input, 'Completion never steals composer focus')
  for (const [turnId, disabled] of [['think_B', false], ['think_A', true]]) {
    global.document.activeElement = body; restoreThinkingActionFocus(action, turnId, disabled, status)
    assert.equal(global.document.activeElement, body, 'Other turns and auth teardown do not move focus')
  }
  global.document.querySelector = () => ({})
  restoreThinkingActionFocus(action, 'think_A', false, status)
  assert.equal(global.document.activeElement, body, 'An open dialog retains focus ownership')
  } finally { global.document = originalDocument }
}
async function clientAndFixture() {
  const calls = [], abort = new AbortController()
  const client = createGatewayRuntimeClient({ request: async (...args) => { calls.push(args); return {} } })
  await client.cancelThinking('session_A', 'think_A', { signal: abort.signal })
  assert.equal(calls[0][0], '/api/pi/sessions/session_A/thinking/think_A/cancel')
  assert.equal(calls[0][1].method, 'POST'); assert.equal(calls[0][1].signal, abort.signal); assert.deepEqual(calls[0][1].body, {})
  const original = global.sessionStorage
  global.sessionStorage = { getItem: key => key === 'conker-fake-fail' ? 'thinking-cancel-timeout' : null }
  try {
    const fake = createFakeGateway(), fixture = createGatewayRuntimeClient({ request: fake.request })
    const detail = await fixture.getSession('ses_1111111111111111')
    assert.equal(detail.thinking[0].status, 'running')
    const result = await fixture.getThinking(detail.id)
    assert.equal(result.results[0].status, 'canceled')
  } finally { global.sessionStorage = original }
}
async function main() { await lifetimes(); await uncertainty(); await renderedControls(); await clientAndFixture(); console.log('Thinking cancellation: turn/auth/selection/epoch/forget fences, duplicate guard, bounded uncertainty, read-only recovery, responsive talking and actual control/client fixtures passed.') }
main().catch(error => { console.error(error); process.exitCode = 1 })
