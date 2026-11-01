const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..'), cache = new Map()
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports
  const module = { exports: {} }; cache.set(relative, module)
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(request => {
    if (request === 'zustand/vanilla') return require(request)
    const base = request.startsWith('@/') ? `src/${request.slice(2)}` : path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))
    assert.ok(request.startsWith('.') || request.startsWith('@/'), request)
    return load(`${base}.ts`)
  }, module, module.exports)
  return module.exports
}
const { parseMemoryDelivery, parseMemoryDeliveryRead, createMemoryDeliveryClient } = load('src/lib/gateway/memory-delivery.ts')
const { createGatewayRuntimeClient } = load('src/lib/gateway/runtime.ts')
const { createGatewayTransport, GatewayError } = load('src/lib/gateway/transport.ts')
const { watchMemoryDelivery, memoryCheckDelays } = load('src/components/gateway/memory-delivery-watch.ts')
const { gatewayChatContract } = load('src/lib/chat/gateway-adapter.ts')
const { memoryFeedback } = load('src/lib/chat/memory-feedback.ts')
const { createMemoryUndo } = load('src/lib/chat/memory-undo.ts')
const { maskForgottenConversation } = load('src/components/gateway/source-privacy.ts')
const wire = (state = 'saved', patch = {}) => ({ state, reason_code: state === 'pending' ? 'queued' : null, admission_method: state === 'saved' ? 'owner_requested' : state === 'filtered' ? 'filtered' : null, memory_id: state === 'saved' ? 'memory_one' : null, ...patch })
const envelope = (rows = [{ message_id: 'message_one', ...wire() }], patch = {}) => ({ schemaVersion: 1, session_id: 'session_one', content_status: 'available', results: rows, truncated: false, ...patch })
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve() }
function scheduler() {
  let id = 0
  const jobs = new Map(), delays = []
  return {
    schedule: (run, delay) => { delays.push(delay); jobs.set(++id, run); return id }, unschedule: id => jobs.delete(id), delays, jobs,
    next: async () => { const entry = jobs.entries().next().value; if (!entry) return false; jobs.delete(entry[0]); entry[1](); await flush(); return true },
  }
}

async function hookLifecycle() {
  const timers = scheduler(), originals = { document: global.document, window: global.window, setTimeout: global.setTimeout, clearTimeout: global.clearTimeout }
  const events = new Map()
  global.document = { visibilityState: 'visible', addEventListener: (name, run) => events.set(name, run), removeEventListener: name => events.delete(name) }
  global.window = { addEventListener: (name, run) => events.set(name, run), removeEventListener: name => events.delete(name) }
  global.setTimeout = timers.schedule; global.clearTimeout = timers.unschedule
  const hooks = [], effects = [], layouts = [], calls = []
  let cursor = 0, dirty = false, result, selected = 'session_one'
  const effect = queue => (run, dependencies) => {
    const index = cursor++, previous = hooks[index]
    if (!previous || dependencies.some((item, at) => item !== previous.dependencies[at])) {
      const next = { dependencies, cleanup: previous?.cleanup }; hooks[index] = next
      queue.push(() => { next.cleanup?.(); next.cleanup = run() })
    }
  }
  const react = {
    useState(initial) { const index = cursor++; hooks[index] ??= { value: typeof initial === 'function' ? initial() : initial }; return [hooks[index].value, next => { hooks[index].value = typeof next === 'function' ? next(hooks[index].value) : next; dirty = true }] },
    useRef(initial) { const index = cursor++; return hooks[index] ??= { current: initial } },
    useCallback(run, dependencies) { const index = cursor++, previous = hooks[index]; if (!previous || dependencies.some((item, at) => item !== previous.dependencies[at])) hooks[index] = { dependencies, value: run }; return hooks[index].value },
    useEffect: effect(effects), useLayoutEffect: effect(layouts),
  }
  const module = { exports: {} }, source = fs.readFileSync(path.join(root, 'src/components/gateway/use-memory-delivery.ts'), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(name => name === 'react' ? react : { watchMemoryDelivery }, module, module.exports)
  let auth = { phase: 'authenticated', session: { sessionId: 'browser_one', authenticated: true }, pending: false, logoutUnconfirmed: false }, forgotten = []
  let props = { client: { getMemoryDelivery: (id, options) => { const reply = deferred(); calls.push({ id, options, ...reply }); return reply.promise } }, authStore: { getState: () => auth }, privacy: { getState: () => ({ sessionIds: forgotten, markForgotten: ids => { forgotten.push(...ids) } }) }, sessionId: selected, messageKey: 'message_one', active: true, identity: 'browser_one', epoch: 1, selected: () => selected }
  function render(patch = {}) {
    props = { ...props, ...patch }
    let count = 0
    do { dirty = false; cursor = 0; result = module.exports.useMemoryDelivery(props); if (++count > 8) assert.fail('Render loop') } while (dirty)
    for (const run of layouts.splice(0)) run()
    for (const run of effects.splice(0)) run()
    return result
  }
  try {
    render(); await timers.next(); assert.equal(calls.length, 1)
    calls[0].resolve(parseMemoryDeliveryRead(envelope(), 'session_one')); await flush(); assert.equal(render().state.receipts.message_one.state, 'saved')
    render({ active: false }); assert.equal(result.state, null); assert.equal(timers.jobs.size, 0)
    render({ active: true }); assert.equal(result.state, null, 'Returning to chat cannot flash a receipt from before a possible forget')
    await timers.next(); assert.equal(calls.length, 2)
    render({ active: false }); assert.equal(calls[1].options.signal.aborted, true)
    calls[1].resolve(parseMemoryDeliveryRead(envelope(), 'session_one')); await flush(); assert.equal(render().state, null)
    render({ active: true }); await timers.next(); auth = { ...auth, session: { sessionId: 'browser_two', authenticated: true } }
    calls[2].resolve(parseMemoryDeliveryRead(envelope(), 'session_one')); await flush(); assert.equal(render().state?.phase, 'checking', 'Old identity cannot publish acknowledgement before an auth render')
    auth = { ...auth, session: { sessionId: 'browser_one', authenticated: true } }; events.get('focus')(); render(); await timers.next()
    forgotten = ['session_one']; calls[3].resolve(parseMemoryDeliveryRead(envelope(), 'session_one')); await flush(); assert.equal(render().state?.phase, 'checking')
    forgotten = []; events.get('focus')(); render(); await timers.next(); global.document.visibilityState = 'hidden'; events.get('visibilitychange')(); render()
    assert.equal(calls[4].options.signal.aborted, true); assert.equal(timers.jobs.size, 0)
    global.document.visibilityState = 'visible'; events.get('visibilitychange')(); render(); await timers.next(); selected = 'other_session'
    calls[5].resolve(parseMemoryDeliveryRead(envelope(), 'session_one')); await flush(); assert.equal(render().state?.phase, 'checking')
    for (const hook of hooks) hook?.cleanup?.()
    assert.equal(events.size, 0); assert.equal(timers.jobs.size, 0)
  } finally { Object.assign(global, originals) }
}

async function undoFlow() {
  const calls = [], published = [], refreshed = []
  const preview = { memoryId: 'memory_one', revision: 7, text: 'Alexey trains judo on Fridays.' }
  const build = control => createMemoryUndo({ control, createRequest: value => ({ requestId: `request_${calls.length}_aaaaaaaaaa`, memoryId: value.memoryId, revision: value.revision }),
    publish: (id, state) => published.push([id, state.phase, state.message]), refresh: id => refreshed.push(id) })
  // Preview first, then forget exactly the previewed memory and revision, then re-read the receipt.
  let undo = build({ forgetPreview: async id => { calls.push(['preview', id]); return preview }, forgetMemory: async request => { calls.push(['forget', request.memoryId, request.revision]); return {} } })
  await undo('message_one', 'memory_one')
  assert.deepEqual(calls, [['preview', 'memory_one'], ['forget', 'memory_one', 7]])
  assert.deepEqual(published.map(row => row.slice(0, 2)), [['message_one', 'working'], ['message_one', 'forgotten']]); assert.deepEqual(refreshed, ['message_one'])
  // A changed memory is reviewed again; an uncertain answer repeats the same reviewed request.
  calls.length = 0; published.length = 0
  const failures = [new GatewayError('network'), null]
  undo = build({ forgetPreview: async id => { calls.push(['preview', id]); return preview }, forgetMemory: async request => { calls.push(['forget', request.requestId]); const failure = failures.shift(); if (failure) throw failure; return {} } })
  await undo('message_one', 'memory_one')
  assert.equal(published.at(-1)[1], 'failed'); assert.match(published.at(-1)[2], /forget outcome is not confirmed/, 'Undo stays available with fixed copy')
  await undo('message_one', 'memory_one')
  assert.deepEqual(calls.map(row => row[0]), ['preview', 'forget', 'forget']); assert.equal(calls[1][1], calls[2][1], 'The retry repeats the same request identity')
  assert.equal(published.at(-1)[1], 'forgotten')
  // A conflict drops the reviewed request, so the next try previews the current version.
  calls.length = 0
  let conflict = true
  undo = build({ forgetPreview: async id => { calls.push(['preview', id]); return preview }, forgetMemory: async () => { calls.push(['forget']); if (conflict) { conflict = false; throw new GatewayError('http', 409, undefined, 'revision_conflict') } return {} } })
  await undo('message_one', 'memory_one'); assert.match(published.at(-1)[2], /changed since you reviewed/); await undo('message_one', 'memory_one')
  assert.deepEqual(calls.map(row => row[0]), ['preview', 'forget', 'preview', 'forget'])
  // A second press while one is running does nothing.
  const gate = deferred(); calls.length = 0
  undo = build({ forgetPreview: async id => { calls.push(['preview', id]); await gate.promise; return preview }, forgetMemory: async () => { calls.push(['forget']); return {} } })
  const first = undo('message_one', 'memory_one'); await undo('message_one', 'memory_one'); gate.resolve(); await first
  assert.deepEqual(calls.map(row => row[0]), ['preview', 'forget'])
  // An aborted workspace publishes nothing after the fact.
  const stop = new AbortController(); published.length = 0
  undo = createMemoryUndo({ control: { forgetPreview: async () => { stop.abort(); return preview }, forgetMemory: async () => { assert.fail('Forget after abort') } }, createRequest: value => value, publish: (id, state) => published.push(state.phase), refresh() {}, signal: stop.signal })
  await undo('message_one', 'memory_one'); assert.deepEqual(published, ['working'])
}

async function main() {
  if (process.argv[2]) {
    const backend = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
    assert.ok(parseMemoryDeliveryRead(backend, backend.session_id).results.length)
    console.log('Actual isolated Pi memory receipt accepted')
  }
  for (const state of ['pending', 'saved', 'filtered', 'unavailable', 'excluded', 'removed']) assert.equal(parseMemoryDelivery(wire(state)).state, state)
  for (const value of [wire('saved', { memory_id: null }), wire('saved', { reason_code: 'blocked' }), wire('saved', { admission_method: 'filtered' }), wire('pending', { memory_id: 'old_memory' }), wire('removed', { admission_method: 'signal' }), wire('filtered', { admission_method: 'owner_requested' }), wire('unavailable', { reason_code: 'raw exception text' }), { ...wire(), state: 'maybe' }]) assert.throws(() => parseMemoryDelivery(value), error => error.kind === 'invalid-response')
  for (const value of [envelope([], { session_id: 'other' }), envelope([{ message_id: '../bad', ...wire() }]), envelope([{ message_id: 'message_one', ...wire() }, { message_id: 'message_one', ...wire() }]), envelope(Array.from({ length: 101 }, (_, index) => ({ message_id: `m_${index}`, ...wire() })))]) assert.throws(() => parseMemoryDeliveryRead(value, 'session_one'), error => error.kind === 'invalid-response')
  assert.throws(() => parseMemoryDeliveryRead(envelope(), 'session_one', 'other_message'), error => error.kind === 'invalid-response')
  assert.throws(() => parseMemoryDeliveryRead(envelope([], { truncated: true }), 'session_one', 'message_one'), error => error.kind === 'invalid-response')
  assert.deepEqual(parseMemoryDeliveryRead(envelope([{ secret: 'stale receipt' }], { content_status: 'forgotten' }), 'session_one').results, [])
  const requests = [], transport = createGatewayTransport({ origin: 'https://memory.test', fetch: async (url, options) => { requests.push([url, options]); return new Response(JSON.stringify(envelope()), { headers: { 'Content-Type': 'application/json' } }) } })
  const auth = { request: (route, options) => transport.request(route, options) }
  const client = createMemoryDeliveryClient(auth), runtime = createGatewayRuntimeClient(auth)
  await client('session_one'); await runtime.getMemoryDelivery('session_one', { messageId: 'message_one' })
  assert.equal(requests.length, 2); assert.ok(requests[1][0].endsWith('/sessions/session_one/messages/message_one/memory-delivery'))
  for (const route of ['/api/pi/sessions/session_one/memory-delivery', '/api/pi/sessions/session_one/messages/message_one/memory-delivery']) {
    await assert.rejects(transport.request(route, { query: { secret: 'text' } }), error => error.kind === 'validation')
    await assert.rejects(transport.request(route, { method: 'POST', body: {}, csrfToken: 'c'.repeat(32) }), error => error.kind === 'validation')
  }
  assert.equal(requests.length, 2)
  const sessionWire = { id: 'session_one', parent_id: null, title: 'Kept chat', status: 'open', created_at: 1, closed_at: null, summary: null, turns: [], memory: { configured: true, pending_ingestion: 0, blocked_delivery: 0, pending_deletion: 0, notices: [] }, messages: [{ id: 'message_one', session_id: 'session_one', seq: 1, role: 'user', created_at: 1, content: 'Kept input', memory_delivery: wire('saved', { memory_id: null }) }] }
  const independent = createGatewayRuntimeClient({ request: async () => sessionWire })
  const readable = await independent.getSession('session_one')
  assert.equal(readable.messages[0].content.text, 'Kept input'); assert.equal(readable.messages[0].memoryDelivery.state, 'unavailable'); assert.equal(readable.messages[0].memoryDelivery.reasonCode, 'invalid_receipt', 'Malformed optional metadata cannot block a valid conversation')
  sessionWire.status = 'forgotten'; assert.equal((await independent.getSession('session_one')).messages[0].memoryDelivery, undefined)

  const savedMessage = { id: 'message_one', sessionId: 'session_one', sequence: 1, role: 'user', createdAt: '2026-10-10T00:00:00Z', agentId: null, content: { kind: 'text', text: 'Remember this request' }, memoryDelivery: parseMemoryDelivery(wire()) }
  const detail = { id: 'session_one', status: 'open', messages: [savedMessage], turns: [], pendingSubmissions: [] }
  let state = { sessionId: 'session_one', epoch: 1, active: true, current: detail, draft: '', pending: false, sendPending: false, detailPending: false, forgotten: false, reviewed: false, notice: null, error: null, rejected: null, inFlight: null, preview: null, memoryRead: { phase: 'ready', receipts: { message_one: savedMessage.memoryDelivery }, truncated: false } }
  const refreshes = [], handlers = { refreshMemory: id => refreshes.push(id) }
  const project = () => gatewayChatContract(state, () => state, () => handlers)
  const chat = project()
  assert.equal(chat.messages[0].memory.label, 'Remembered'); assert.equal(chat.messages[0].memory.memoryId, 'memory_one'); assert.equal(chat.messages[0].memory.undo.availability, 'unsupported', 'Undo needs an owner control client')
  assert.ok(!JSON.stringify(chat).replace('"memoryId":"memory_one"', '').includes('memory_one'), 'Only the saved note carries the memory identity, as memoryId')
  await chat.messages[0].memory.refresh.run(); assert.deepEqual(refreshes, ['message_one'])
  const undone = [], withoutUndo = state
  handlers.undoMemory = (messageId, memoryId) => undone.push([messageId, memoryId])
  const undoable = project().messages[0].memory; assert.equal(undoable.undo.availability, 'enabled')
  await undoable.undo.run(); assert.deepEqual(undone, [['message_one', 'memory_one']])
  state = { ...state, memoryUndo: { message_one: { phase: 'working' } } }; assert.equal(project().messages[0].memory.undo.availability, 'disabled', 'No second Undo while one runs')
  state = { ...state, memoryUndo: { message_one: { phase: 'failed', message: 'Try again.' } } }; assert.equal(project().messages[0].memory.undo.availability, 'enabled', 'A failed Undo can be retried')
  state = { ...state, memoryUndo: { message_one: { phase: 'forgotten' } } }; assert.equal(project().messages[0].memory.undo.availability, 'disabled'); assert.equal(project().messages[0].memory.label, 'Forgotten')
  state = { ...withoutUndo, memoryRead: { ...withoutUndo.memoryRead, receipts: { message_one: parseMemoryDelivery(wire('removed')) } } }
  assert.equal(project().messages[0].memory.undo.availability, 'unsupported', 'A receipt that is no longer saved offers no Undo'); assert.equal(project().messages[0].memory.memoryId, null)
  state = withoutUndo; delete handlers.undoMemory; assert.equal(project().messages[0].memory.undo.availability, 'unsupported')
  state = { ...state, forgotten: true }; await chat.messages[0].memory.refresh.run(); assert.equal(refreshes.length, 1); assert.equal(project().messages[0].memory, undefined)
  assert.ok(!JSON.stringify(maskForgottenConversation(detail)).includes('memory_one'))
  state = { ...state, forgotten: false, memoryRead: undefined }; assert.equal(project().messages[0].memory, undefined, 'Native/older adapters without receipt capability retain their shape')
  const refresh = { availability: 'enabled', run() {} }
  for (const [status, label] of [['saved', 'Remembered'], ['filtered', 'Not added to memory'], ['excluded', 'Memory excluded'], ['removed', 'Removed from memory']]) {
    assert.equal(memoryFeedback('m', { phase: 'ready', receipts: { m: parseMemoryDelivery(wire(status)) }, truncated: false }, refresh).label, label)
  }
  for (const status of ['pending', 'filtered', 'unavailable', 'excluded', 'removed']) {
    const feedback = memoryFeedback('m', { phase: 'ready', receipts: { m: parseMemoryDelivery(wire(status)) }, truncated: false }, refresh)
    assert.notEqual(feedback.label, 'Remembered', status); assert.equal(feedback.memoryId, null, `${status} offers no Undo target`)
  }
  assert.equal(memoryFeedback('m', null, refresh).memoryId, null); assert.equal(memoryFeedback('m', { phase: 'error', receipts: {}, truncated: false }, refresh).memoryId, null)
  assert.equal(memoryFeedback('m', { phase: 'ready', receipts: { m: parseMemoryDelivery(wire('saved')) }, truncated: false }, refresh, { action: refresh, state: { phase: 'forgotten' } }).label, 'Forgotten')
  assert.match(memoryFeedback('old', { phase: 'ready', receipts: {}, truncated: true }, refresh).description, /latest 100/)
  assert.equal(memoryFeedback('m', null, refresh).label, 'Checking memory status…', 'Neither saved chat text nor model prose is a memory acknowledgement')

  let timer = scheduler(), published = [], calls = 0
  let watch = watchMemoryDelivery({ ...timer, read: async () => { calls++; return parseMemoryDeliveryRead(envelope([{ message_id: 'message_one', ...wire('pending') }]), 'session_one') }, available: () => true, publish: state => published.push(state), forgotten() { assert.fail('Unexpected forget') } })
  while (await timer.next()) {}
  assert.equal(calls, 6); assert.deepEqual(timer.delays, [...memoryCheckDelays]); assert.equal(published.at(-1).phase, 'paused')
  assert.match(memoryFeedback('message_one', published.at(-1), refresh).description, /Automatic status checks have paused/)
  watch.refresh('message_one'); await timer.next(); assert.equal(calls, 7); watch.cancel(); assert.equal(timer.jobs.size, 0)
  timer = scheduler(); published = []; calls = 0
  watch = watchMemoryDelivery({ ...timer, read: async (_, messageId) => { calls++; return parseMemoryDeliveryRead(envelope([{ message_id: messageId ?? 'recent', ...wire() }], { truncated: !messageId }), 'session_one', messageId) }, available: () => true, publish: state => published.push(state), forgotten() {} })
  await timer.next(); assert.equal(timer.jobs.size, 0, 'Acknowledged terminal state stops automatic reads')
  watch.refresh('older'); await timer.next(); assert.deepEqual(Object.keys(published.at(-1).receipts), ['recent', 'older'], 'An explicit old-message read patches only its exact receipt')
  watch.cancel()
  for (const reason of ['hidden', 'auth changed', 'source forgotten', 'new selection', 'unmounted']) {
    timer = scheduler(); published = []; let available = true, signal
    const pending = deferred()
    watch = watchMemoryDelivery({ ...timer, read: current => { signal = current; return pending.promise }, available: () => available, publish: state => published.push(state), forgotten() { assert.fail(reason) } })
    await timer.next(); watch.refresh(); assert.equal(timer.jobs.size, 0, 'An in-flight read excludes duplicate checks')
    if (reason === 'unmounted') watch.cancel(); else available = false
    pending.resolve(parseMemoryDeliveryRead(envelope(), 'session_one')); await flush()
    assert.deepEqual(published.map(state => state.phase), ['checking'], `${reason} fences the late acknowledgement`)
    watch.cancel(); if (reason === 'unmounted') assert.equal(signal.aborted, true)
  }
  timer = scheduler(); published = []
  watch = watchMemoryDelivery({ ...timer, read: async () => { throw new Error('PRIVATE RAW ERROR') }, available: () => true, publish: state => published.push(state), forgotten() {} })
  await timer.next(); assert.equal(published.at(-1).phase, 'error'); assert.equal(timer.jobs.size, 0); assert.ok(!JSON.stringify(published).includes('PRIVATE')); watch.cancel()
  timer = scheduler(); let forgotten = 0
  watch = watchMemoryDelivery({ ...timer, read: async () => ({ sessionId: 'session_one', forgotten: true, results: [], truncated: false }), available: () => true, publish() {}, forgotten: () => forgotten++ })
  await timer.next(); assert.equal(forgotten, 1); assert.equal(timer.jobs.size, 0); watch.cancel()
  await hookLifecycle()
  await undoFlow()
  console.log('Memory delivery: verified receipts, exact reads, privacy masking, truthful copy, bounded polling and stale-response fences passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
