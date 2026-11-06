const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const root = path.resolve(__dirname, '..'), cache = new Map()
function load(file) {
  if (cache.has(file)) return cache.get(file).exports
  const module = { exports: {} }; cache.set(file, module)
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(name => name.startsWith('.') || name.startsWith('@/') ? load((name.startsWith('@/') ? 'src/' + name.slice(2) : path.posix.normalize(path.posix.join(path.posix.dirname(file), name))) + '.ts') : require(name), module, module.exports)
  return module.exports
}
const { createChatDirectory } = load('src/components/gateway/chat-directory.ts')
const { parseHistoryPage, createGatewayHistoryClient } = load('src/lib/gateway/session-history.ts')
const { createGatewayTransport } = load('src/lib/gateway/transport.ts')
const { createChatNamesClient } = load('src/lib/gateway/chat-names.ts')
const { createGatewayRuntimeWorkspaceState } = load('src/components/gateway/runtime-state.ts')
const { createGatewaySourcePrivacyState } = load('src/components/gateway/source-privacy.ts')
const { createStore } = require('zustand/vanilla')
const cursor = id => 'h1.' + 'a'.repeat(64) + '.' + id
const wire = (id = 'chat_a') => ({ id, parent_id: null, title: 'Saved chat', status: 'open', created_at: 100, closed_at: null, summary_preview: 'Preview only', content_status: 'available', title_truncated: false, summary_truncated: false })
const envelope = (results = [wire()], next_cursor = null) => ({ schemaVersion: 1, results, next_cursor })
const row = id => parseHistoryPage(envelope([wire(id)])).rows[0]
const page = (ids, nextCursor = null) => ({ rows: ids.map(row), nextCursor })
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
async function flush() { for (let n = 0; n < 24; n++) await Promise.resolve() }
function clock() {
  let now = 0, id = 0; const jobs = new Map()
  return { jobs, schedule: (run, delay) => { jobs.set(++id, { run, at: now + delay }); return id }, unschedule: id => jobs.delete(id),
    async advance(amount) { const end = now + amount; for (let n = 0; n < 100; n++) { const next = [...jobs].sort((a, b) => a[1].at - b[1].at)[0]; if (!next || next[1].at > end) { now = end; await flush(); return }; now = next[1].at; jobs.delete(next[0]); next[1].run(); await flush() }; assert.fail('Timer loop') } }
}
function harness() {
  const timers = clock(), calls = [], auth = createStore(() => ({ phase: 'authenticated', session: { sessionId: 'owner', authenticated: true }, pending: false, logoutUnconfirmed: false }))
  const workspace = createGatewayRuntimeWorkspaceState(), privacy = createGatewaySourcePrivacyState(); let eligible = true
  const directory = createChatDirectory({ ...timers, auth, workspace, privacy, available: () => eligible, read: (q, cursor, signal, view) => { const result = deferred(); calls.push({ q, cursor, signal, view, ...result }); return result.promise } })
  directory.start(); return { ...directory, timers, calls, auth, workspace, privacy, eligible: value => { eligible = value } }
}
async function clientCases() {
  assert.equal(parseHistoryPage(envelope([{ ...wire(), title: '😀'.repeat(300), summary_preview: '😀'.repeat(400), title_truncated: true, summary_truncated: true }])).rows[0].title.length, 600)
  for (const patch of [{ status: ['open'] }, { content_status: ['available'] }, { title: '😀'.repeat(301) }, { summary_preview: 'a'.repeat(401) }, { title_truncated: 1 }, { status: 'forgotten' }, { created_at: Infinity }]) assert.throws(() => parseHistoryPage(envelope([{ ...wire(), ...patch }])), error => error.kind === 'invalid-response')
  assert.throws(() => parseHistoryPage(envelope([wire(), wire()])), error => error.kind === 'invalid-response')
  for (const next of ['', 'arbitrary', cursor('a') + ' ', 'h2.' + 'a'.repeat(64) + '.a']) assert.throws(() => parseHistoryPage(envelope([wire()], next)), error => error.kind === 'invalid-response')
  const gone = { ...wire(), status: 'forgotten', content_status: 'forgotten', title: '', summary_preview: null }
  assert.equal(parseHistoryPage(envelope([gone], cursor('a'))).rows[0].forgotten, true)
  const requests = [], transport = createGatewayTransport({ origin: 'https://conker.test', fetch: async (url, options) => { requests.push({ url, options }); return new Response(JSON.stringify(envelope()), { headers: { 'Content-Type': 'application/json' } }) } })
  const client = createGatewayHistoryClient({ request: (url, options) => transport.request(url, options) })
  await client.list({ q: '  Straße  ', cursor: cursor('anchor') }); assert.match(requests[0].url, /q=Stra%C3%9Fe/); assert.match(requests[0].url, /cursor=h1/); assert.equal(requests[0].options.method, 'GET')
  await client.list({ q: '😀'.repeat(200) })
  for (const query of [{ q: 'a'.repeat(201) }, { q: '\u0000' }, { q: '\ud800' }, { cursor: '' }, { cursor: 'arbitrary' }, { limit: 0 }, { limit: 51 }]) await assert.rejects(client.list(query), error => error.kind === 'validation')
  for (const query of [{ extra: 'x' }, { q: '\ud800' }, { cursor: '' }, { cursor: 'a' }, { limit: '50' }]) await assert.rejects(transport.request('/api/pi/sessions/history', { query }), error => error.kind === 'validation')
  await assert.rejects(transport.request('/api/pi/sessions/history', { method: 'POST', body: {} }), error => error.kind === 'validation')
  assert.equal(requests.length, 2)
  assert.doesNotMatch(requests[0].url, /archived=|sort=/, 'Defaults stay off the wire')
  await client.list({ archived: 'only', sort: 'name' }); assert.match(requests[2].url, /archived=only/); assert.match(requests[2].url, /sort=name/)
  for (const query of [{ archived: 'yes' }, { sort: 'random' }]) await assert.rejects(client.list(query), error => error.kind === 'validation')
  for (const query of [{ archived: 'exclude' }, { sort: 'newest' }, { archived: 'all' }]) await assert.rejects(transport.request('/api/pi/sessions/history', { query }), error => error.kind === 'validation')
  assert.equal(requests.length, 3)
  assert.equal(parseHistoryPage(envelope([wire()])).rows[0].archivedAt, null)
  assert.equal(parseHistoryPage(envelope([{ ...wire(), archived_at: 200 }])).rows[0].archivedAt, parseHistoryPage(envelope([{ ...wire(), created_at: 200 }])).rows[0].createdAt)
  assert.throws(() => parseHistoryPage(envelope([{ ...wire(), archived_at: 'soon' }])), error => error.kind === 'invalid-response')
  const posts = [], names = createChatNamesClient({ request: async (url, options) => { posts.push({ url, options }); return { sessions: options.body.sessions, archived: options.body.archived } } })
  const ids = ['ses_' + '0'.repeat(16), 'ses_' + '1'.repeat(16)]
  assert.deepEqual(await names.archive([...ids, ids[0]], true), { sessions: ids, archived: true }, 'Duplicates are sent once')
  assert.equal(posts[0].url, '/api/control/pi/sessions/archive'); assert.equal(posts[0].options.method, 'POST')
  for (const bad of [[], ['chat_a'], Array.from({ length: 101 }, (_, n) => 'ses_' + n.toString(16).padStart(16, '0'))]) await assert.rejects(names.archive(bad, true), error => error.kind === 'validation')
  await assert.rejects(names.archive(ids, 'yes'), error => error.kind === 'validation'); assert.equal(posts.length, 1)
  const oversized = createGatewayTransport({ origin: 'https://conker.test', fetch: async () => new Response(JSON.stringify({ ...envelope(), padding: 'a'.repeat(256 * 1024) }), { headers: { 'Content-Type': 'application/json' } }) })
  await assert.rejects(oversized.request('/api/pi/sessions/history'), error => error.kind === 'response-too-large')
  for (const code of ['invalid_history_cursor', 'invalid_history_request', 'raw_private_error']) {
    const errors = createGatewayTransport({ origin: 'https://conker.test', fetch: async () => new Response(JSON.stringify({ detail: { code, message: 'Private data must not escape' } }), { status: 422, headers: { 'Content-Type': 'application/json' } }) })
    await assert.rejects(errors.request('/api/pi/sessions/history'), error => error.code === (code === 'raw_private_error' ? undefined : code) && !error.message.includes('Private'))
  }
}
async function controllerCases() {
  let h = harness(); h.noteRecent(['a']); await h.timers.advance(0); h.calls[0].resolve(page(['a'], cursor('a'))); await flush()
  assert.equal(h.store.getState().changed, null)
  const more = h.older(), duplicate = h.older(); assert.equal(await duplicate, false); assert.equal(h.calls.length, 2)
  assert.equal(h.calls[1].cursor, cursor('a')); h.calls[1].resolve(page(['a', 'b'], cursor('b'))); assert.equal(await more, true)
  assert.deepEqual(h.store.getState().rows.map(row => row.id), ['a', 'b'])
  h.noteRecent(['new', 'a']); assert.equal(h.store.getState().changed, 'new'); assert.equal(h.store.getState().rows.length, 2, 'Recent discovery cannot erase older directory pages')
  const refresh = h.refresh(); assert.equal(h.store.getState().rows.length, 2); h.noteRecent(['newer', 'new', 'a'])
  h.calls[2].resolve(page(['new', 'a'], cursor('a'))); assert.equal(await refresh, true); assert.equal(h.store.getState().changed, 'new', 'Changes during snapshot read stay actionable')
  assert.equal(h.store.getState().rows.some(row => row.id === 'b'), false, 'Explicit refresh resets the old page chain')
  const errorMore = h.older(); h.calls[3].reject(new Error('503')); assert.equal(await errorMore, false); assert.equal(h.store.getState().rows.length, 2); assert.equal(h.store.getState().nextCursor, cursor('a'))
  const invalid = h.older(); h.calls[4].reject({ code: 'invalid_history_cursor' }); await invalid; assert.equal(h.store.getState().error, 'cursor'); assert.equal(h.store.getState().nextCursor, null)
  assert.equal(h.store.getState().rows.length, 2); assert.equal(await h.older(), false); h.stop()

  h = harness(); await h.timers.advance(0); h.noteRecent(['created_during_read']); h.calls[0].resolve(page(['old'])); await flush()
  assert.equal(h.store.getState().changed, 'unverified', 'A post-read recent snapshot is never silently acknowledged as pre-read evidence')
  const acknowledge = h.refresh(); h.calls[1].resolve(page(['created_during_read', 'old'])); await acknowledge; assert.equal(h.store.getState().changed, null); h.stop()

  h = harness(); await h.timers.advance(0); assert.deepEqual(h.calls[0].view, { archived: 'exclude', sort: 'newest' })
  h.calls[0].resolve(page(['active'])); await flush(); h.query('kept'); h.view({ archived: 'only' }); assert.equal(h.store.getState().query, 'kept')
  await h.timers.advance(0); assert.equal(h.calls.length, 2, 'A new view cancels the pending search debounce and reads once')
  assert.deepEqual([h.calls[1].q, h.calls[1].view], ['kept', { archived: 'only', sort: 'newest' }]); assert.equal(h.store.getState().rows.length, 0)
  h.view({ sort: 'name' }); assert.equal(h.calls[1].signal.aborted, true); await h.timers.advance(0)
  h.calls[1].resolve(page(['stale_view'])); await flush(); assert.equal(h.store.getState().rows.length, 0, 'A stale view never lands')
  assert.deepEqual(h.calls[2].view, { archived: 'only', sort: 'name' }); h.calls[2].resolve(page(['archived_one'])); await flush()
  assert.equal(h.store.getState().rows[0].id, 'archived_one'); h.view({ archived: 'only' }); await h.timers.advance(0); assert.equal(h.calls.length, 3, 'An unchanged view reads nothing')
  h.noteRecent(['brand_new']); assert.equal(h.store.getState().changed, null, 'The Archived view never offers new chats')
  h.stop(); assert.deepEqual([h.store.getState().archived, h.store.getState().sort], ['exclude', 'newest'])

  h = harness(); await h.timers.advance(0); h.query('A'); assert.equal(h.calls[0].signal.aborted, true)
  await h.timers.advance(250); h.query('B'); await h.timers.advance(250); h.query('A'); await h.timers.advance(250)
  assert.deepEqual(h.calls.map(call => call.q), ['', 'A', 'B', 'A'])
  h.calls[1].resolve(page(['stale_a'], cursor('stale_a'))); h.calls[2].resolve(page(['stale_b'])); await flush(); assert.equal(h.store.getState().rows.length, 0)
  h.calls[3].resolve(page(['new_a'], cursor('new_a'))); await flush(); assert.equal(h.store.getState().rows[0].id, 'new_a')
  const paging = h.older(); h.query('new search'); assert.equal(await paging, false); assert.equal(h.store.getState().rows.length, 0); assert.equal(h.store.getState().nextCursor, null)
  h.calls[4].resolve(page(['wrong_page'])); await flush(); assert.equal(h.store.getState().rows.length, 0)
  h.query('a'.repeat(201)); await h.timers.advance(250); assert.equal(h.store.getState().error, 'query'); const count = h.calls.length
  h.privacy.getState().markForgotten(['unrelated']); await h.timers.advance(1000); assert.equal(h.calls.length, count); assert.equal(h.store.getState().error, 'query'); h.stop()

  for (const stage of ['read', 'debounce']) {
    h = harness(); if (stage === 'read') await h.timers.advance(0); else h.query('pending')
    h.privacy.getState().markForgotten(['unrelated']); await h.timers.advance(0)
    const live = h.calls.at(-1); live.resolve(page(['safe'])); await flush(); assert.equal(h.store.getState().loaded, true, stage + ' recovers after an unrelated forget')
    if (stage === 'read') { h.calls[0].resolve(page(['stale'])); await flush(); assert.equal(h.store.getState().rows[0].id, 'safe') }
    h.stop()
  }
  h = harness(); await h.timers.advance(0)
  h.calls[0].resolve({ rows: [{ ...row('gone'), forgotten: true, status: 'forgotten', title: '', summaryPreview: null }], nextCursor: cursor('gone') }); await flush()
  assert.ok(h.privacy.getState().sessionIds.includes('gone')); assert.equal(h.store.getState().nextCursor, cursor('gone')); assert.equal(h.store.getState().loaded, true)
  const continuePastTombstones = h.older(); h.calls[1].resolve(page(['older'])); assert.equal(await continuePastTombstones, true); h.stop()

  for (const boundary of ['hidden', 'offline', 'identity', 'epoch', 'logout', 'stop']) {
    h = harness(); await h.timers.advance(0); h.calls[0].resolve(page(['private'], cursor('private'))); await flush(); const held = h.older()
    if (boundary === 'hidden' || boundary === 'offline') { h.eligible(false); h.recheck() }
    if (boundary === 'identity') h.auth.setState({ session: { sessionId: 'other', authenticated: true } })
    if (boundary === 'epoch') h.workspace.getState().reset()
    if (boundary === 'logout') h.auth.setState({ logoutUnconfirmed: true })
    if (boundary === 'stop') h.stop()
    assert.equal(await held, false); assert.equal(h.calls[1].signal.aborted, true)
    h.calls[1].resolve(page(['late_private'])); await flush(); assert.equal(h.store.getState().rows.some(row => row.id === 'late_private'), false)
    if (boundary !== 'hidden' && boundary !== 'offline') assert.equal(h.store.getState().rows.length, 0)
    h.stop(); assert.equal(h.timers.jobs.size, 0)
  }
  h = harness(); await h.timers.advance(0); await h.timers.advance(15000); assert.equal(h.store.getState().error, 'read'); assert.equal(h.store.getState().pending, null)
  const retry = h.refresh(); h.calls[1].resolve(page(['after_timeout'])); assert.equal(await retry, true); h.calls[0].resolve(page(['late'])); await flush(); assert.equal(h.store.getState().rows[0].id, 'after_timeout'); h.stop()
  h = harness(); h.eligible(false); h.query('offline search'); await h.timers.advance(1000)
  assert.equal(h.store.getState().error, 'offline'); assert.equal(h.calls.length, 0); assert.equal(h.store.getState().pending, null)
  h.eligible(true); h.recheck(); await h.timers.advance(0); assert.equal(h.calls[0].q, 'offline search'); h.calls[0].resolve(page(['online'])); await flush(); h.stop()
  for (const priorError of [null, 'older']) {
    h = harness(); await h.timers.advance(0); h.calls[0].resolve(page(['retained'], cursor('retained'))); await flush()
    if (priorError) { const older = h.older(); h.calls[1].reject(new Error('503')); await older }
    const reads = h.calls.length
    h.eligible(false); h.recheck(); assert.equal(h.store.getState().error, priorError, 'Hiding an idle loaded snapshot does not invent a paused read')
    h.eligible(true); h.recheck(); await h.timers.advance(1000)
    assert.equal(h.calls.length, reads); assert.equal(h.store.getState().error, priorError); assert.equal(h.store.getState().rows[0].id, 'retained')
    h.eligible(false); assert.equal(await h.refresh(), false); assert.equal(h.store.getState().error, 'offline', 'An explicit unavailable refresh still explains why no read ran')
    h.stop()
  }
}
function componentCases() {
  const source = fs.readFileSync(path.join(root, 'src/components/gateway/chats-workspace.tsx'), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  let state = { query: 'kept search', rows: [], pending: 'initial', error: null, loaded: false, nextCursor: null, changed: null, archived: 'exclude', sort: 'newest', setQuery: () => {}, setView: () => {}, refresh: () => {}, older: () => {} }, tree, chosen = []
  const selection = { active: false, count: 0, total: 0, all: false, some: false, has: id => chosen.includes(id), toggle: () => {}, setAll: () => {}, start: () => {}, stop: () => {} }
  const jsx = (type, props) => ({ type, props }), module = { exports: {} }
  new Function('require', 'module', 'exports', code)(name => name === 'react/jsx-runtime' ? { jsx, jsxs: jsx } : name === 'zustand' ? { useStore: (_, select) => select({ sessionIds: [] }) } : name === './use-chat-directory' ? { useChatDirectory: () => state } : name === 'react' ? { useState: value => [value, () => {}] } : name.endsWith('/list-selection') ? { useListSelection: () => selection } : new Proxy({}, { get: (_, property) => property }), module, module.exports)
  const find = type => { const matches = []; function visit(node) { if (!node || typeof node !== 'object') return; if (node.type === type) matches.push(node); [node.props?.children].flat(Infinity).forEach(visit) }; visit(tree); return matches }
  const render = () => { tree = module.exports.GatewayChatsWorkspace({ conversationState: {}, sourcePrivacy: {} }) }
  for (const patch of [{}, { pending: null, error: 'read' }, { loaded: true, error: null, rows: [row('a')], nextCursor: cursor('a') }, { pending: 'refresh' }, { pending: null, error: 'refresh' }]) {
    state = { ...state, ...patch }; render(); assert.equal(find('ListCard').length, 1)
  }
  state = { ...state, query: '', rows: [{ ...row('gone'), forgotten: true }], nextCursor: cursor('gone'), error: null }; render()
  assert.equal(find('ListCard')[0].props.count, 0); assert.equal(find('ListCard')[0].props.emptyTitle, 'No visible chats on this page')
  const footer = find('ListCard')[0].props.footer, footerButtons = []
  ;(function visit(node) { if (!node || typeof node !== 'object') return; if (node.type === 'Button') footerButtons.push(node); [node.props?.children].flat(Infinity).forEach(visit) })(footer)
  assert.ok(footerButtons.some(button => button.props.children === 'Load older' && !button.props['aria-disabled']))
  const card = () => find('ListCard')[0].props, mount = chatNames => { tree = module.exports.GatewayChatsWorkspace({ conversationState: {}, sourcePrivacy: {}, chatNames }) }
  const bulk = () => { const found = []; (function visit(node) { if (!node || typeof node !== 'object') return; if (node.type === 'Button') found.push(node); [node.props?.children].flat(Infinity).forEach(visit) })(card().bulkActions); return found }
  state = { ...state, rows: [row('a')], nextCursor: null }; mount(undefined)
  assert.equal(card().selection, undefined, 'Without the chat writes client the list cannot select'); assert.ok(!find('ListLine')[0].props.actions)
  mount({}); assert.equal(card().selection, selection); assert.equal(card().label, 'Search chats'); assert.deepEqual(card().sort.options.map(option => option.value), ['newest', 'oldest', 'name'])
  assert.deepEqual([card().filters].flat().map(chip => [chip.props.children, chip.props.active]), [['Active', true], ['Archived', false], ['All', false]])
  assert.equal(find('ListLine')[0].props.actions.type, 'ListLineMenu'); assert.equal(find('ListLine')[0].props.badge, undefined)
  assert.equal(bulk().length, 1); assert.equal(bulk()[0].props.disabled, true, 'Nothing picked, nothing to archive')
  chosen = ['a']; mount({}); assert.equal(bulk()[0].props.disabled, false)
  state = { ...state, archived: 'include', rows: [{ ...row('a'), archivedAt: row('a').createdAt }, row('b')] }; mount({})
  assert.deepEqual(bulk().map(button => button.props.disabled), [true, false], 'In All, Archive acts on active picks and Restore on archived ones')
  assert.equal(find('ListLine')[0].props.badge, 'Archived'); assert.equal(find('ListLine')[1].props.badge, undefined)
  state = { ...state, archived: 'only', rows: [], query: '' }; mount({})
  assert.equal(card().emptyTitle, 'No archived chats'); assert.equal(card().emptyAction, undefined)
}
async function main() { await clientCases(); await controllerCases(); componentCases(); console.log('Paged chat directory parser/transport, query/cursor generations, page retention, evidence ordering, privacy/lifetime/deadline and mounted collection, archive, sort and selection tests passed.') }
main().catch(error => { console.error(error); process.exitCode = 1 })
