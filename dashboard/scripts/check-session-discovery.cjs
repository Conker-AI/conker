const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..'), cache = new Map()
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports
  const module = { exports: {} }; cache.set(relative, module)
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(name => name.startsWith('.') ? load(path.posix.normalize(path.posix.join(path.posix.dirname(relative), name)) + '.ts') : require(name), module, module.exports)
  return module.exports
}
const { createSessionDiscovery } = load('src/components/gateway/session-discovery.ts')
const { createGatewayRuntimeWorkspaceState } = load('src/components/gateway/runtime-state.ts')
const { createGatewaySourcePrivacyState } = load('src/components/gateway/source-privacy.ts')
const { workspaceTab } = load('src/components/gateway/workspace-tabs.ts')
const { createStore } = require('zustand/vanilla')
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
async function flush() { for (let n = 0; n < 24; n++) await Promise.resolve() }
function clock() {
  let now = 0, id = 0
  const jobs = new Map()
  return { jobs, schedule: (run, delay) => { jobs.set(++id, { run, at: now + delay }); return id }, unschedule: id => jobs.delete(id),
    delay: () => Math.min(...[...jobs.values()].map(job => job.at - now)),
    async advance(amount) {
      const end = now + amount
      for (let n = 0; n < 100; n++) {
        const next = [...jobs].sort((a, b) => a[1].at - b[1].at)[0]
        if (!next || next[1].at > end) { now = end; await flush(); return }
        now = next[1].at; jobs.delete(next[0]); next[1].run(); await flush()
      }
      assert.fail('Timer loop did not settle')
    } }
}
const row = (id = 'chat_a', title = 'First chat', status = 'open') => ({ id, title, summary: 'Private summary', status, createdAt: '2026-10-10T12:00:00Z' })
function harness() {
  const timers = clock(), calls = [], auth = createStore(() => ({ phase: 'authenticated', session: { sessionId: 'owner_a', authenticated: true }, pending: false, logoutUnconfirmed: false }))
  const workspace = createGatewayRuntimeWorkspaceState(), privacy = createGatewaySourcePrivacyState()
  let eligible = true
  const discovery = createSessionDiscovery({ ...timers, auth, workspace, privacy, available: () => eligible,
    read: signal => { const result = deferred(); calls.push({ signal, ...result }); return result.promise } })
  return { ...discovery, timers, calls, auth, workspace, privacy, eligible: value => { eligible = value } }
}
async function controllerCases() {
  let h = harness(), snapshots = []
  const subscribers = Array.from({ length: 4 }, () => h.store.subscribe(state => snapshots.push(state)))
  h.start(); h.start(); await h.timers.advance(0); assert.equal(h.calls.length, 1, 'Four subscribers and repeated start share one list GET')
  h.calls[0].resolve([row()]); await flush(); assert.equal(h.store.getState().loaded, true); assert.equal(h.timers.delay(), 15000)
  await h.timers.advance(15000); assert.equal(h.calls.length, 2)
  const fresh = [h.refresh(), h.refresh(), h.refresh()]
  let completed = 0; fresh.forEach(promise => promise.then(() => completed++))
  h.calls[1].resolve([row()]); await flush(); assert.equal(completed, 0, 'A read that predates refresh demand does not settle it')
  await h.timers.advance(0); assert.equal(h.calls.length, 3)
  h.calls[2].resolve([row('cli_chat', 'Created externally'), row()]); await flush()
  assert.deepEqual(await Promise.all(fresh), [true, true, true]); assert.equal(h.store.getState().rows[0].id, 'cli_chat')
  assert.equal(h.calls.length, 3, 'Concurrent demand is exactly one successor')
  const before = h.store.getState().rows
  const refreshing = h.refresh(); await h.timers.advance(0); assert.equal(h.store.getState().rows, before)
  h.calls[3].reject(new Error('503')); assert.equal(await refreshing, false); assert.equal(h.store.getState().rows, before)
  assert.equal(h.store.getState().loaded, true); assert.equal(h.store.getState().error, true); assert.equal(h.timers.delay(), 2000)
  for (const wait of [2000, 4000, 8000, 16000, 32000, 60000, 60000]) {
    assert.equal(h.timers.delay(), wait); await h.timers.advance(wait); h.calls.at(-1).reject(new Error('offline')); await flush()
  }
  h.wake(); h.wake(); await h.timers.advance(0); const recovered = h.calls.at(-1)
  recovered.resolve([row('renamed', 'Updated title')]); await flush()
  assert.equal(h.store.getState().error, false); assert.equal(h.timers.delay(), 15000)
  assert.equal(h.store.getState().rows[0].title, 'Updated title')
  const absent = h.refresh(); await h.timers.advance(0); h.calls.at(-1).resolve([]); assert.equal(await absent, true)
  assert.deepEqual(h.privacy.getState().sessionIds, [], 'Absence from the bounded list never declares forgetting')
  subscribers.forEach(stop => stop()); h.stop(); assert.equal(h.timers.jobs.size, 0)

  // An explicit post-send list refresh works before the operation lock is released.
  h = harness(); h.workspace.setState({ operation: 'send', selected: 'chat_a', drafts: { chat_a: 'Unsent newer text' } })
  h.start(); await h.timers.advance(0)
  const duringSend = h.refresh(); h.workspace.setState({ operation: null })
  h.calls[0].resolve([row()]); await flush(); await h.timers.advance(0); assert.equal(h.calls.length, 2)
  h.calls[1].resolve([row('new_chat')]); assert.equal(await duringSend, true)
  assert.equal(h.calls.length, 2); assert.equal(h.workspace.getState().selected, 'chat_a'); assert.equal(h.workspace.getState().drafts.chat_a, 'Unsent newer text')
  h.stop()

  // Both active and queued callers are released by each cancellation boundary.
  for (const boundary of ['hidden', 'offline', 'identity', 'auth-pending', 'logout-unconfirmed', 'epoch', 'stop']) {
    h = harness(); h.start(); const active = h.refresh(); await h.timers.advance(0); const queued = h.refresh()
    if (boundary === 'hidden' || boundary === 'offline') { h.eligible(false); h.recheck() }
    if (boundary === 'identity') h.auth.setState({ session: { sessionId: 'owner_b', authenticated: true } })
    if (boundary === 'auth-pending') h.auth.setState({ pending: true })
    if (boundary === 'logout-unconfirmed') h.auth.setState({ logoutUnconfirmed: true })
    if (boundary === 'epoch') h.workspace.getState().reset()
    if (boundary === 'stop') h.stop()
    assert.equal(h.calls[0].signal.aborted, true, boundary)
    assert.deepEqual(await Promise.all([active, queued]), [false, false], boundary)
    h.calls[0].resolve([row('late_private')]); await flush(); assert.deepEqual(h.store.getState().rows, [], boundary)
    h.stop(); assert.equal(h.timers.jobs.size, 0)
  }
  h = harness(); h.start(); await h.timers.advance(0); h.calls[0].resolve([row()]); await flush()
  h.auth.setState({ session: { sessionId: 'owner_b', authenticated: true } }); assert.deepEqual(h.store.getState().rows, [])
  h.auth.setState({ session: { sessionId: 'owner_a', authenticated: true } }); await h.timers.advance(0)
  h.calls.at(-1).resolve([row('new_identity_read')]); await flush(); assert.equal(h.store.getState().rows[0].id, 'new_identity_read')
  h.stop(); h.start(); await h.timers.advance(0); assert.equal(h.store.getState().rows.length, 0, 'StrictMode restart does not retain the prior lifetime')
  h.calls.at(-1).resolve([]); await flush(); h.stop()

  h = harness(); h.start(); const hung = h.refresh(); await h.timers.advance(0); await h.timers.advance(15000)
  assert.equal(await hung, false); assert.equal(h.calls[0].signal.aborted, true); assert.equal(h.store.getState().refreshing, false)
  await h.timers.advance(2000); h.calls[1].resolve([row('after_timeout')]); await flush()
  h.calls[0].resolve([row('late_private')]); await flush(); assert.equal(h.store.getState().rows[0].id, 'after_timeout')
  h.stop()

  // A forgotten receipt crosses the shared privacy boundary BEFORE any subscriber sees it.
  h = harness(); h.start(); await h.timers.advance(0)
  h.store.subscribe(state => { if (state.rows.some(item => item.id === 'chat_a')) assert.ok(h.privacy.getState().sessionIds.includes('chat_a')) })
  h.calls[0].resolve([row('chat_a', 'Must disappear', 'forgotten')]); await flush()
  assert.equal(h.store.getState().rows[0].title, ''); assert.equal(h.store.getState().rows[0].summary, null)
  assert.equal(h.calls[0].signal.aborted, false, 'Publishing privacy does not abort its own verified read')
  assert.equal(h.timers.delay(), 15000)
  const stale = h.refresh(); await h.timers.advance(0); const queued = h.refresh()
  h.privacy.getState().markForgotten(['other_chat']); assert.deepEqual(await Promise.all([stale, queued]), [false, false])
  h.calls[1].resolve([row('other_chat', 'Stale content')]); await flush(); await h.timers.advance(0)
  h.calls[2].resolve([row('chat_a', 'Older server read'), row('other_chat', 'Older server read')]); await flush()
  assert.ok(h.store.getState().rows.every(item => item.status === 'forgotten' && item.title === ''))
  h.stop()
}

function collectionCases() {
  const tab = workspaceTab('/chat', '?session=chat_a')
  assert.equal(tab.title, 'Chat'); assert.equal(tab.sessionId, 'chat_a')
  const shell = fs.readFileSync(path.join(root, 'src/components/gateway/workspace-shell.tsx'), 'utf8')
  assert.match(shell, /tabs\.filter\(tab => !tab\.sessionId \|\| !forgotten\.includes\(tab\.sessionId\)\)/)
  assert.doesNotMatch(shell, /setTabs\([^\n]+sessions|title: session\.title|title:.*session\?\.title/, 'Open tabs retain navigation, never a private title cache beyond the discovery window')
  for (const name of ['chat-sidebar', 'workspace-shell', 'runtime-workspace']) {
    const content = fs.readFileSync(path.join(root, `src/components/gateway/${name}.tsx`), 'utf8')
    assert.match(content, /useSessionDiscovery\(\)/); assert.doesNotMatch(content, /\.listSessions\(/, `${name} must not create a duplicate discovery request`)
  }
}
async function main() { await controllerCases(); collectionCases(); console.log('Shared session discovery serialization, fresh-demand coalescing, polling/backoff/deadline, auth/epoch/privacy boundaries and shared consumer tests passed.') }
main().catch(error => { console.error(error); process.exitCode = 1 })
