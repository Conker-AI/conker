const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..'), cache = new Map()
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports
  const module = { exports: {} }; cache.set(relative, module)
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(name => {
    if (!name.startsWith('.') && !name.startsWith('@/')) return require(name)
    return load((name.startsWith('@/') ? `src/${name.slice(2)}` : path.posix.normalize(path.posix.join(path.posix.dirname(relative), name))) + '.ts')
  }, module, module.exports)
  return module.exports
}
const { watchRuntimeObservation, observationTiming } = load('src/components/gateway/runtime-observation-watch.ts')
const { createRuntimeDetailReader } = load('src/components/gateway/runtime-detail-read.ts')
const { createGatewayRuntimeClient } = load('src/lib/gateway/runtime.ts')
const { createGatewayTransport } = load('src/lib/gateway/transport.ts')
const { canSubmitRuntime } = load('src/components/gateway/runtime-state.ts')
const { createStore } = require('zustand/vanilla')
const flush = async () => { for (let i = 0; i < 32; i++) await Promise.resolve() }
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
function scheduler() {
  let now = 0, id = 0
  const jobs = new Map()
  return { jobs, schedule: (run, delay) => { jobs.set(++id, { run, at: now + delay }); return id }, unschedule: id => jobs.delete(id),
    delay: () => Math.min(...[...jobs.values()].map(job => job.at - now)),
    async advance(amount) {
      const end = now + amount
      for (let n = 0; n < 500; n++) {
        const entry = [...jobs].sort((a, b) => a[1].at - b[1].at)[0]
        if (!entry || entry[1].at > end) { now = end; await flush(); return }
        now = entry[1].at; jobs.delete(entry[0]); entry[1].run(); await flush()
      }
      assert.fail('Unbounded timer loop')
    },
  }
}
const observation = (revision = 1, active = false) => ({ sessionId: 'session_a', revision, active, forgotten: false })
const history = (status = 'complete') => ({ id: 'session_a', status: 'open', messages: status === 'complete' ? [{ id: 'answer_one', content: { kind: 'text', text: 'Saved answer' } }] : [], turns: [{ id: 'turn_one', status, endedAt: status === 'running' ? null : '2026-10-10', acted: false }], pendingSubmissions: [] })
function harness() {
  const timers = scheduler(), calls = [], applied = [], failures = []
  let enabled = true, version = 0, token = observation(), detail = history(), readObservation, readDetail, forgotten = 0
  const watcher = watchRuntimeObservation({ ...timers, available: () => enabled, version: () => version,
    observe: signal => { calls.push({ kind: 'observation', signal }); return readObservation ? readObservation(signal) : Promise.resolve(token) },
    detail: signal => { calls.push({ kind: 'detail', signal }); return readDetail ? readDetail(signal) : Promise.resolve(detail) },
    apply: value => applied.push(value), failure: value => failures.push(value), forgotten: () => { forgotten++; enabled = false },
  })
  return { timers, calls, applied, failures, watcher, token: value => { token = value }, detail: value => { detail = value },
    observeWith: value => { readObservation = value }, detailWith: value => { readDetail = value }, eligible: value => { enabled = value }, version: () => { version++ }, forgotten: () => forgotten }
}
async function parserAndTransport() {
  const wire = { schemaVersion: 1, session_id: 'session_a', revision: 0, active: false, content_status: 'available' }, requests = []
  const transport = createGatewayTransport({ origin: 'https://conker.test', fetch: async (url, options) => { requests.push({ url, options }); return new Response(JSON.stringify(wire), { headers: { 'Content-Type': 'application/json' } }) } })
  const client = createGatewayRuntimeClient({ request: (url, options) => transport.request(url, options) })
  assert.deepEqual(await client.getObservation('session_a'), observation(0))
  assert.equal(requests[0].options.method, 'GET')
  assert.ok(requests[0].url.endsWith('/api/pi/sessions/session_a/observation'))
  for (const options of [{ query: {} }, { query: { limit: 1 } }, { method: 'POST', body: {} }]) await assert.rejects(transport.request('/api/pi/sessions/session_a/observation', options), error => error.kind === 'validation')
  assert.equal(requests.length, 1)
  for (const patch of [{ schemaVersion: 2 }, { session_id: 'other' }, { revision: -1 }, { revision: 1.5 }, { revision: Number.MAX_SAFE_INTEGER + 1 }, { active: 1 }, { content_status: 'missing' }, { content_status: 'forgotten', active: true }, { active: undefined }]) {
    await assert.rejects(createGatewayRuntimeClient({ request: async () => ({ ...wire, ...patch }) }).getObservation('session_a'), error => error.kind === 'invalid-response')
  }
  const forgotten = await createGatewayRuntimeClient({ request: async () => ({ ...wire, content_status: 'forgotten' }) }).getObservation('session_a')
  assert.equal(forgotten.forgotten, true)
}
async function controllerCases() {
  let h = harness()
  const draft = { text: 'Unsent newer draft', modelId: 'chosen', skillIds: ['review'], think: true }, before = JSON.stringify(draft)
  await h.timers.advance(0); assert.deepEqual(h.calls.map(row => row.kind), ['observation', 'detail'], 'Initial metadata must precede a real history read')
  assert.equal(h.timers.delay(), 15000)
  await h.timers.advance(15000); assert.equal(h.applied.length, 1, 'Idle unchanged metadata does not refetch transcript')
  h.token(observation(2, true)); h.detail(history('running')); await h.timers.advance(15000)
  assert.equal(canSubmitRuntime(draft.text, false, undefined, h.applied.at(-1)), false)
  assert.equal(h.timers.delay(), 2000)
  h.token(observation(3)); h.detail(history()); await h.timers.advance(2000)
  assert.equal(canSubmitRuntime(draft.text, false, undefined, h.applied.at(-1)), true)
  assert.equal(h.applied.at(-1).messages.length, 1); assert.equal(JSON.stringify(draft), before)
  h.token(observation(4)); h.detail(history('awaiting_approval')); await h.timers.advance(15000)
  assert.equal(canSubmitRuntime(draft.text, false, undefined, h.applied.at(-1)), false, 'Idle cadence does not grant send permission for a parked turn')
  h.token(observation(5, true)); h.detail({ ...history(), thinking: [{ status: 'running' }] }); await h.timers.advance(15000)
  assert.equal(canSubmitRuntime(draft.text, false, undefined, h.applied.at(-1)), true, 'A background thinker does not block talking')
  for (let i = 0; i < 100; i++) await h.timers.advance(2000)
  assert.equal(h.timers.delay(), 2000, 'Long valid turns keep being observed without a fixed read budget')
  h.watcher.cancel(); assert.equal(h.timers.jobs.size, 0)

  h = harness(); const held = deferred(); h.detailWith(() => held.promise)
  await h.timers.advance(0); h.token(observation(2)); h.detailWith(null); held.resolve(history('running')); await flush()
  await h.timers.advance(15000); assert.equal(h.applied.length, 2, 'A write during detail read is caught because only the pre-read token was acknowledged')
  h.token(observation(3)); h.detailWith(() => Promise.reject(new Error('read failed'))); await h.timers.advance(15000)
  assert.equal(h.failures.at(-1), true); h.detailWith(null); await h.timers.advance(2000)
  assert.equal(h.applied.length, 3, 'A failed history read never acknowledges its revision')
  h.watcher.cancel()

  h = harness(); h.observeWith(() => Promise.reject(new Error('offline')))
  await h.timers.advance(0)
  for (const delay of [2000, 4000, 8000, 16000, 32000, 60000, 60000]) { assert.equal(h.timers.delay(), delay); await h.timers.advance(delay) }
  h.observeWith(null); h.watcher.wake(); await h.timers.advance(0)
  assert.equal(h.failures.at(-1), false); assert.equal(h.timers.delay(), 15000)
  h.watcher.cancel()

  for (const phase of ['observation', 'detail']) {
    h = harness(); const stuck = deferred(); (phase === 'observation' ? h.observeWith : h.detailWith)(() => stuck.promise)
    await h.timers.advance(0); h.watcher.wake(); h.watcher.wake(); assert.equal(h.calls.length, phase === 'observation' ? 1 : 2, 'Focus events do not overlap a read')
    const signal = h.calls.at(-1).signal; await h.timers.advance(observationTiming.timeout)
    assert.equal(signal.aborted, true); assert.equal(h.failures.at(-1), true)
    h.observeWith(null); h.detailWith(null); await h.timers.advance(2000)
    const count = h.applied.length; stuck.resolve(phase === 'observation' ? observation(99) : history('running')); await flush()
    assert.equal(h.applied.length, count, 'Late timed-out replies never publish')
    h.watcher.cancel()
  }

  h = harness(); let blocked = deferred(); h.observeWith(() => blocked.promise); await h.timers.advance(0)
  h.eligible(false); h.watcher.recheck(); assert.equal(h.calls[0].signal.aborted, true); assert.equal(h.timers.jobs.size, 0)
  blocked.resolve(observation()); await flush(); assert.equal(h.applied.length, 0)
  h.eligible(true); h.observeWith(null); h.watcher.recheck(); await h.timers.advance(0); assert.equal(h.applied.length, 1)
  blocked = deferred(); h.token(observation(2)); h.detailWith(() => blocked.promise); await h.timers.advance(15000)
  h.version(); h.detailWith(null); blocked.resolve(history('running')); await flush(); await h.timers.advance(0)
  assert.equal(h.applied.at(-1).turns[0].status, 'complete', 'A manual-read generation invalidates older background history and observation resumes')
  h.watcher.cancel()
  h = harness(); h.token({ ...observation(9), forgotten: true }); await h.timers.advance(0)
  assert.equal(h.forgotten(), 1); assert.equal(h.calls.length, 1); assert.equal(h.timers.jobs.size, 0)
  h.watcher.cancel()
  h = harness(); h.detail({ ...history(), status: 'forgotten' }); await h.timers.advance(0)
  assert.equal(h.forgotten(), 1); assert.equal(h.applied.length, 0); assert.equal(h.timers.jobs.size, 0, 'A forget between metadata and history never publishes content')
  h.watcher.cancel()
}
async function manualReadCases() {
  let scope = 'owner:1:a', pending = false, error = null
  const timers = scheduler(), calls = [], applied = []
  const reader = createRuntimeDetailReader({ ...timers, scope: id => scope.endsWith(':' + id) ? scope : null,
    read: (id, signal) => { const result = deferred(); calls.push({ id, signal, ...result }); return result.promise },
    apply: detail => applied.push(detail), pending: value => { pending = value }, failure: value => { error = value } })
  const old = reader.refresh('a'); scope = 'owner:1:b'; reader.cancel()
  assert.equal(pending, false); assert.equal(calls[0].signal.aborted, true)
  scope = 'owner:1:a'; reader.cancel(); applied.push(history()) // New observer history has arrived on returning to A.
  calls[0].resolve(history('running')); assert.equal(await old, false); assert.equal(applied.length, 1)
  const first = reader.refresh('a'), second = reader.refresh('a')
  calls[1].reject(new Error('old error')); await first; assert.equal(pending, true); assert.equal(error, null, 'An older read cannot clear a newer pending state or publish its error')
  calls[2].resolve(history()); await second; assert.equal(pending, false)
  const auth = reader.refresh('a'); scope = 'other-owner:2:a'; reader.cancel(); calls[3].resolve(history('running'))
  assert.equal(await auth, false); assert.equal(applied.length, 2)
  const beforeSend = reader.refresh('a'); reader.cancel() // A local send starts and invalidates existing manual reads.
  assert.equal(pending, false); assert.equal(calls[4].signal.aborted, true)
  const receiptRefresh = reader.refresh('a') // The send's receipt can still refresh within that operation.
  calls[4].resolve(history('running')); assert.equal(await beforeSend, false); assert.equal(pending, true)
  calls[5].resolve(history()); assert.equal(await receiptRefresh, true); assert.equal(pending, false)
  const hung = reader.refresh('a'); await timers.advance(15000)
  assert.equal(await hung, false); assert.equal(pending, false); assert.equal(calls[6].signal.aborted, true); assert.ok(error)
  assert.equal(timers.jobs.size, 0, 'A transport that ignores abort cannot leave manual history permanently pending')
  const count = applied.length, retry = reader.refresh('a')
  calls[6].resolve(history('running')); await flush(); assert.equal(applied.length, count); assert.equal(pending, true)
  calls[7].resolve(history()); assert.equal(await retry, true); assert.equal(error, null); assert.equal(pending, false)
  assert.equal(timers.jobs.size, 0, 'Settled reads release their deadline')
  reader.cancel(false)
}
async function hookCases() {
  const timers = scheduler(), originals = { document: global.document, window: global.window, navigator: Object.getOwnPropertyDescriptor(global, 'navigator'), setTimeout: global.setTimeout, clearTimeout: global.clearTimeout }
  const events = new Map()
  global.document = { visibilityState: 'visible', addEventListener: (name, run) => events.set(name, run), removeEventListener: name => events.delete(name) }
  global.window = { addEventListener: (name, run) => events.set(name, run), removeEventListener: name => events.delete(name) }
  Object.defineProperty(global, 'navigator', { configurable: true, value: { onLine: true } })
  global.setTimeout = timers.schedule; global.clearTimeout = timers.unschedule
  const hooks = [], effects = [], layouts = [], calls = [], applied = []
  let cursor = 0, dirty = false, result
  const effect = queue => (run, deps) => { const index = cursor++, before = hooks[index]; if (!before || deps === undefined || deps.some((item, at) => item !== before.deps[at])) { const next = { deps, cleanup: before?.cleanup }; hooks[index] = next; queue.push(() => { next.cleanup?.(); next.cleanup = run() }) } }
  const react = {
    useRef(initial) { const index = cursor++; return hooks[index] ??= { current: initial } },
    useState(initial) { const index = cursor++; hooks[index] ??= { value: typeof initial === 'function' ? initial() : initial }; return [hooks[index].value, value => { hooks[index].value = typeof value === 'function' ? value(hooks[index].value) : value; dirty = true }] },
    useCallback(run, deps) { const index = cursor++; if (!hooks[index] || deps.some((item, at) => item !== hooks[index].deps[at])) hooks[index] = { value: run, deps }; return hooks[index].value },
    useEffect: effect(effects), useLayoutEffect: effect(layouts),
  }
  const module = { exports: {} }, code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/components/gateway/use-runtime-observation.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(name => name === 'react' ? react : { watchRuntimeObservation }, module, module.exports)
  const authStore = createStore(() => ({ phase: 'authenticated', session: { sessionId: 'owner', authenticated: true }, pending: false, logoutUnconfirmed: false }))
  const workspace = createStore(() => ({ selected: 'session_a', epoch: 1, operation: null }))
  const privacy = createStore(set => ({ sessionIds: [], markForgotten: ids => set({ sessionIds: ids }) }))
  let props = { client: { getObservation: (id, options) => { const reply = deferred(); calls.push({ id, ...options, ...reply }); return reply.promise }, getSession: async () => history() }, authStore, workspace, privacy, sessionId: 'session_a', active: true, identity: 'owner', epoch: 1, version: () => 1, apply: detail => applied.push(detail) }
  function render(patch = {}) { props = { ...props, ...patch }; let limit = 0; do { dirty = false; cursor = 0; result = module.exports.useRuntimeObservation(props); assert.ok(++limit < 10) } while (dirty); for (const run of layouts.splice(0)) run(); for (const run of effects.splice(0)) run(); return result }
  try {
    render(); await timers.advance(0); assert.equal(calls.length, 1)
    workspace.setState({ selected: 'session_b' }); workspace.setState({ selected: 'session_a' }); assert.equal(calls[0].signal.aborted, true)
    calls[0].resolve(observation(1)); await flush(); assert.equal(applied.length, 0)
    await timers.advance(0); calls[1].resolve(observation(2)); await flush(); assert.equal(applied.length, 1)
    events.get('focus')(); await timers.advance(0); global.document.visibilityState = 'hidden'; events.get('visibilitychange')()
    assert.equal(calls[2].signal.aborted, true); assert.equal(timers.jobs.size, 0); calls[2].resolve(observation(3)); await flush(); assert.equal(applied.length, 1)
    global.document.visibilityState = 'visible'; events.get('visibilitychange')(); await timers.advance(0)
    global.navigator.onLine = false; events.get('offline')(); assert.equal(calls[3].signal.aborted, true)
    global.navigator.onLine = true; events.get('online')(); await timers.advance(0)
    workspace.setState({ operation: 'send' }); assert.equal(calls[4].signal.aborted, true); assert.equal(timers.jobs.size, 0)
    workspace.setState({ operation: null }); await timers.advance(0); authStore.setState({ session: { sessionId: 'other-owner', authenticated: true } })
    assert.equal(calls[5].signal.aborted, true); calls[5].resolve(observation(4)); await flush(); assert.equal(applied.length, 1)
    render({ identity: 'other-owner' }); await timers.advance(0); privacy.getState().markForgotten(['session_a'])
    assert.equal(calls[6].signal.aborted, true); calls[6].resolve(observation(5)); await flush(); assert.equal(applied.length, 1)
    for (const hook of hooks) hook?.cleanup?.()
    assert.equal(timers.jobs.size, 0); assert.equal(events.size, 0)
  } finally {
    global.document = originals.document; global.window = originals.window; global.setTimeout = originals.setTimeout; global.clearTimeout = originals.clearTimeout
    if (originals.navigator) Object.defineProperty(global, 'navigator', originals.navigator); else delete global.navigator
  }
}
async function main() { await parserAndTransport(); await controllerCases(); await manualReadCases(); await hookCases(); console.log('Runtime observation parser, serialized polling/deadlines/backoff, draft/send preservation, pre-detail revisions, manual-read and hook lifetime fences passed.') }
main().catch(error => { console.error(error); process.exitCode = 1 })
