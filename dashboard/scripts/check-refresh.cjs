// "Refresh everything" and the check on entering the app: the store's rules (single flight, throttles,
// what never runs while work is open, the update check's polling and its failures), plus source
// assertions that the routed screens are keyed by the refresh and the chat panel is not.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..'), cache = new Map()
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports
  const module = { exports: {} }; cache.set(relative, module)
  const source = read(relative).replaceAll('import.meta.env.PROD', 'false').replaceAll('import.meta.env.BASE_URL', '"/"')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(request => request.startsWith('.') ? load(`${path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))}.ts`) : require(request), module, module.exports)
  return module.exports
}
const { createRefresh, RETURN_AFTER_MS, AUTO_GAP_MS, UPDATE_CHECK_GAP_MS, POLL_GIVE_UP_MS, MANUAL_MIN_MS } = load('src/lib/refresh-store.ts')
const { GatewayError } = load('src/lib/gateway/transport.ts')

const wait = () => new Promise(resolve => setImmediate(resolve))
const fresh = { state: 'fresh', checkedAt: '2026-11-21T09:00:00Z', ok: true, reason: null, nextCheckAfter: null }
const started = { state: 'started', checkedAt: null, ok: null, reason: null, nextCheckAfter: null }
const running = { ...started, state: 'running' }

/** A world with a manual clock: sleeping moves time instead of waiting. */
function world(overrides = {}) {
  const time = { now: 1_000_000 }, calls = { reload: 0, worker: 0, check: 0, list: 0, found: [], build: 0 }
  const flags = { unsaved: false, dialog: false, busy: false, served: null, running: null, prod: false }
  const env = {
    now: () => time.now,
    sleep: async (ms, signal) => { if (signal.aborted) throw new Error('aborted'); time.now += ms },
    unsaved: () => flags.unsaved, dialogOpen: () => flags.dialog,
    fetchEntry: async () => { if (flags.served instanceof Error) throw flags.served; return flags.served },
    runningEntry: () => flags.running, get prod() { return flags.prod },
    reload: () => { calls.reload++; calls.statusAtReload = refresh.store.getState().status }, updateWorker: () => { calls.worker++ },
  }
  const script = { answers: [started, fresh], offers: [null, '0.2.0'], ...overrides }
  const deps = {
    checkUpdate: async () => { const answer = script.answers[Math.min(calls.check, script.answers.length - 1)]; calls.check++; if (answer instanceof Error) throw answer; return answer },
    listUpdates: async () => { const version = script.offers[Math.min(calls.list, script.offers.length - 1)]; calls.list++; return { offer: version ? { version } : null, results: [] } },
    probe: async () => { if (script.probeFails) throw new GatewayError('network') },
    busy: () => flags.busy, onUpdateFound: version => calls.found.push(version), onNewBuild: () => { calls.build++ },
  }
  const refresh = createRefresh(env)
  const unbind = refresh.bind(deps)
  return { refresh, time, calls, flags, unbind, state: () => refresh.store.getState() }
}

async function main() {
  // Manual: remounts (epoch), nudges (reads), polls the check, then reads Pi's offer again and announces a release found now.
  let w = world()
  await w.refresh.refreshAll('manual')
  assert.equal(w.state().epoch, 1); assert.equal(w.state().reads, 1)
  assert.equal(w.state().status, 'done'); assert.equal(w.state().note, 'none')
  assert.equal(w.calls.check, 2, 'started, then one poll that answers fresh')
  assert.equal(w.state().updateFound, '0.2.0'); assert.deepEqual(w.calls.found, ['0.2.0'], 'A release the check found is announced once')
  assert.equal(w.calls.worker, 1, 'A manual refresh updates the offline shell')
  assert.ok(w.state().lastDoneAt !== null)
  await w.refresh.refreshAll('manual'); assert.deepEqual(w.calls.found, ['0.2.0'], 'The same release is not announced twice')

  // A release Pi already offered before the check is not announced again.
  w = world({ offers: ['0.2.0'] }); await w.refresh.refreshAll('manual'); assert.deepEqual(w.calls.found, [])

  // Single flight: a second call joins the first.
  w = world(); const one = w.refresh.refreshAll('manual'), two = w.refresh.refreshAll('manual')
  assert.equal(one, two, 'One run at a time'); await one; assert.equal(w.state().epoch, 1)

  // A click while the quiet entry check is still polling stops it and runs for real (it must show work and ask first).
  w = world({ answers: [running] }); const quiet = w.refresh.enter(); w.flags.unsaved = true
  assert.equal(w.refresh.manual(), 'unsaved', 'The ask comes even while an entry check is running')
  w.flags.unsaved = false; assert.equal(w.refresh.manual(), null); await quiet; await wait()
  assert.equal(w.state().epoch, 1, 'The click ran, not the quiet check')

  // Manual always runs; the throttles apply only to entry and return.
  w = world(); await w.refresh.enter()
  assert.equal(w.state().epoch, 0, 'Entry never remounts'); assert.equal(w.state().reads, 0, 'Entry skips the nudge: the screens are mounting')
  assert.equal(w.state().status, 'idle', 'Entry never shows the button as busy')
  const checks = w.calls.check
  assert.ok(checks > 0, 'Entry asks the server to look for a release')
  await w.refresh.enter(); assert.equal(w.calls.check, checks, 'A second entry within a minute (React double mount) does nothing')
  w.time.now += AUTO_GAP_MS; await w.refresh.refreshAll('return'); assert.equal(w.calls.check, checks, 'Auto checks for a release at most every 30 minutes')
  assert.equal(w.state().reads, 1, 'Return nudges the shell readers')
  w.time.now += UPDATE_CHECK_GAP_MS; await w.refresh.refreshAll('return'); assert.ok(w.calls.check > checks, 'After 30 minutes it checks again')
  w.time.now += 1; await w.refresh.refreshAll('manual'); assert.equal(w.state().epoch, 1, 'Manual ignores the throttles')

  // Auto never remounts, and does not reload while work is open; a changed build is only announced.
  w = world(); w.flags.prod = true; w.flags.running = '/assets/index-old.js'; w.flags.served = '/assets/index-new.js'; w.flags.busy = true
  await w.refresh.refreshAll('return'); assert.equal(w.calls.reload, 0); assert.equal(w.state().newBuild, true); assert.equal(w.calls.build, 1)
  w.time.now += AUTO_GAP_MS; await w.refresh.refreshAll('return'); assert.equal(w.calls.build, 1, 'The new-version prompt shows once')
  w = world(); w.flags.prod = true; w.flags.running = '/assets/index-old.js'; w.flags.served = '/assets/index-new.js'
  await w.refresh.refreshAll('return'); assert.equal(w.calls.reload, 0, 'Auto never reloads, even when idle: it offers a button')
  await w.refresh.refreshAll('manual'); assert.equal(w.calls.reload, 1, 'Manual reloads a changed build when nothing is being sent')
  w.flags.busy = true; w.time.now += 1; await w.refresh.refreshAll('manual'); assert.equal(w.calls.reload, 1, 'Never while a send is in progress')
  // A reload the browser cancels (Stay on the leave-page prompt) must not leave the button spinning.
  w = world(); w.flags.prod = true; w.flags.running = '/assets/index-old.js'; w.flags.served = '/assets/index-new.js'
  await w.refresh.refreshAll('manual'); assert.equal(w.calls.reload, 1)
  assert.equal(w.calls.statusAtReload, 'done', 'Status is left before reload, so a cancelled reload is not stuck')
  assert.notEqual(w.state().status, 'refreshing')
  // The same build, a failed fetch and the dev server never reload.
  for (const set of [flags => { flags.served = '/assets/index-old.js' }, flags => { flags.served = new Error('offline') }, flags => { flags.prod = false }]) {
    w = world(); w.flags.prod = true; w.flags.running = '/assets/index-old.js'; w.flags.served = '/assets/index-new.js'; set(w.flags)
    await w.refresh.refreshAll('manual'); assert.equal(w.calls.reload, 0); assert.equal(w.state().newBuild, false)
  }

  // Manual asks first only when something is unsaved or a window is open; confirming goes on.
  w = world(); w.flags.unsaved = true
  assert.equal(w.refresh.manual(), 'unsaved'); assert.equal(w.state().epoch, 0, 'Asking changes nothing')
  await w.refresh.refreshAll('manual'); assert.equal(w.state().epoch, 0, 'A manual run is refused while unconfirmed')
  assert.equal(w.refresh.manual(true), null); await wait(); await wait(); assert.equal(w.state().epoch, 1)
  w = world(); w.flags.dialog = true; assert.equal(w.refresh.manual(), 'dialog')
  w = world(); assert.equal(w.refresh.manual(), null, 'Nothing open: it just runs')

  // The update check's failures never make the refresh look failed, and never look fresh.
  w = world({ answers: [new GatewayError('network')] }); await w.refresh.refreshAll('manual')
  assert.equal(w.state().status, 'done'); assert.equal(w.state().note, 'update-unchecked'); assert.equal(w.state().updateFound, null)
  w = world({ answers: [{ ...fresh, ok: false, reason: 'github_unreachable' }] }); await w.refresh.refreshAll('manual')
  assert.equal(w.state().note, 'update-unchecked', 'A failed check is not "up to date"')
  w = world({ answers: [{ ...started, state: 'skipped', reason: 'update_running' }] }); await w.refresh.refreshAll('manual')
  assert.equal(w.state().note, 'update-unchecked')
  w = world({ answers: [running] }); await w.refresh.refreshAll('manual')
  assert.equal(w.state().note, 'update-slow', 'Polling gives up after a minute with a soft note'); assert.ok(w.calls.check <= POLL_GIVE_UP_MS / 2000 + 2)
  // An older server: remembered for the session, no error, no second call.
  w = world({ answers: [new GatewayError('http', 422, undefined, 'invalid_host_operation', 'This server read is not allowed.')] })
  await w.refresh.refreshAll('manual'); assert.equal(w.state().status, 'done'); assert.equal(w.state().note, 'none'); assert.equal(w.calls.check, 1)
  await w.refresh.refreshAll('manual'); assert.equal(w.calls.check, 1, 'Not asked again this session')
  w = world({ answers: [{ ...started, state: 'unsupported' }] }); await w.refresh.refreshAll('manual'); assert.equal(w.state().note, 'none')

  // An unreachable server is an error and does not move lastDoneAt.
  w = world({ probeFails: true }); await w.refresh.refreshAll('manual')
  assert.equal(w.state().status, 'error'); assert.equal(w.state().lastDoneAt, null)
  w.refresh.acknowledge(); assert.equal(w.state().status, 'idle')

  // A manual refresh takes at least a moment, so the click is seen.
  w = world(); const before = w.time.now; await w.refresh.refreshAll('manual'); assert.ok(w.time.now - before >= MANUAL_MIN_MS)

  // Unbinding (sign-out, lock) ends the run, and nothing runs without a workspace.
  w = world(); w.unbind()
  await w.refresh.refreshAll('manual'); assert.equal(w.state().epoch, 0, 'Without a bound workspace nothing runs')

  // Coming back: only after five minutes away, from hidden or offline.
  w = world(); const listeners = {}
  const events = type => ({ addEventListener: (name, fn) => { (listeners[`${type}:${name}`] ??= new Set()).add(fn) }, removeEventListener: (name, fn) => listeners[`${type}:${name}`]?.delete(fn) })
  const view = { ...events('window'), document: { ...events('document'), visibilityState: 'visible' } }
  const stopWatching = w.refresh.watchReturn(view)
  const fire = (type, name) => listeners[`${type}:${name}`]?.forEach(fn => fn())
  const hide = () => { view.document.visibilityState = 'hidden'; fire('document', 'visibilitychange') }, show = () => { view.document.visibilityState = 'visible'; fire('document', 'visibilitychange') }
  hide(); w.time.now += RETURN_AFTER_MS - 1000; show(); await wait(); assert.equal(w.state().reads, 0, 'A short absence does nothing')
  hide(); w.time.now += RETURN_AFTER_MS; show(); await wait(); await wait(); assert.equal(w.state().reads, 1, 'After five minutes away it re-reads')
  w.time.now += AUTO_GAP_MS; fire('window', 'offline'); w.time.now += RETURN_AFTER_MS; fire('window', 'online'); await wait(); await wait(); assert.equal(w.state().reads, 2, 'Back online after five minutes also counts')
  stopWatching(); assert.equal([...Object.values(listeners)].reduce((sum, set) => sum + set.size, 0), 0, 'Nothing stays listening')

  // The unsaved probe: a synthetic beforeunload that screens already answer with preventDefault.
  assert.match(read('src/lib/refresh-store.ts'), /new Event\('beforeunload', \{ cancelable: true \}\)[\s\S]*defaultPrevented/, 'The unsaved probe is the synthetic beforeunload')
  for (const file of ['src/components/gateway/runtime-workspace.tsx', 'src/components/gateway/owner-workspace.tsx', 'src/components/gateway/activity-workspace.tsx', 'src/app/tools/tool-editor.tsx'])
    assert.match(read(file), /beforeunload/, `${file} still tells the browser about unsaved work`)

  // Source: the routed screens are keyed by the refresh, the chat panel is not, the button is in the sidebar header.
  const workspace = read('src/components/gateway/workspace.tsx')
  assert.doesNotMatch(read('src/components/gateway/workspace.tsx') + read('src/components/gateway/inbox-attention.tsx') + read('src/components/gateway/session-discovery-provider.tsx') + read('src/settings/appearance.ts'), /from '@\/lib\/refresh-store'/, 'The first download carries only the small state; the logic loads after it')
  assert.match(workspace, /<Suspense fallback=\{workspaceFallback\}><Fragment key=\{refreshEpoch\}>/, 'The routed screens are keyed by the refresh epoch')
  const chat = workspace.slice(workspace.indexOf('<GatewayRuntimeWorkspace'), workspace.indexOf('{activityActive'))
  assert.doesNotMatch(chat, /refreshEpoch/, 'The chat panel is never keyed: it keeps streams and unsent text')
  assert.doesNotMatch(workspace, /\.reset\(\)/, 'Refresh never resets the conversation state')
  assert.match(read('src/components/gateway/gateway-sidebar.tsx'), /<RefreshButton \/><\/Suspense>\s*<ModeToggle/, 'The button sits beside Ask Conker and the theme switch')
  const runtime = read('src/components/gateway/runtime-workspace.tsx')
  assert.match(runtime, /useRefreshChat\(/, 'The chat panel re-reads through its own hook')
  assert.ok(runtime.split('\n').length <= 600, 'runtime-workspace.tsx stays under 600 lines')
  const button = read('src/components/gateway/refresh-button.tsx')
  assert.match(button, /motion-reduce:animate-none/); assert.match(button, /role="status"/); assert.match(button, /aria-label=\{LABEL\}/)
  assert.doesNotMatch(button, /\bpoll|epoch|\bbuild\b|service worker/i, 'Plain words only')
  console.log('Refresh: single flight, throttles, guards, update polling, failures, return rules and wiring passed.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
