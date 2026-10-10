const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const root = path.resolve(__dirname, '..'), cache = new Map()
function load(file) {
  if (cache.has(file)) return cache.get(file).exports
  const module = { exports: {} }; cache.set(file, module)
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(name => name.startsWith('.') || name.startsWith('@/') ? load((name.startsWith('@/') ? 'src/' + name.slice(2) : path.posix.normalize(path.posix.join(path.posix.dirname(file), name))) + '.ts') : require(name), module, module.exports)
  return module.exports
}
const { createUniversalSearch, searchResultIsForgotten } = load('src/components/gateway/universal-search-state.ts')
const { createGatewayRuntimeWorkspaceState } = load('src/components/gateway/runtime-state.ts')
const { createGatewaySourcePrivacyState } = load('src/components/gateway/source-privacy.ts')
const { createStore } = require('zustand/vanilla')
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
async function flush() { for (let index = 0; index < 20; index++) await Promise.resolve() }
function clock() {
  let now = 0, id = 0; const jobs = new Map()
  return { jobs, schedule: (run, delay) => { jobs.set(++id, { run, at: now + delay }); return id }, unschedule: id => jobs.delete(id),
    async advance(amount) { const end = now + amount; for (let n = 0; n < 100; n++) { const next = [...jobs].sort((a, b) => a[1].at - b[1].at)[0]; if (!next || next[1].at > end) { now = end; await flush(); return }; now = next[1].at; jobs.delete(next[0]); next[1].run(); await flush() }; assert.fail('Timer loop') } }
}
const settings = (exactText = false, semantic = false) => ({ revision: 1, configuration: { sources: ['conversations'], exactText, semantic, reranking: false } })
const result = (id, source = 'conversations', href = `/chat?session=${id}`) => ({ id, source, recordId: id, title: `Title ${id}`, excerpt: `Excerpt ${id}`, href, matchType: 'metadata', role: null })
const page = (ids, nextCursor = null, stage = 'metadata') => ({ stage, results: ids.map(id => typeof id === 'string' ? result(id) : id), nextCursor, coverage: [{ source: 'conversations', status: 'searched' }], ranking: { status: 'disabled' } })
function harness() {
  const timers = clock(), calls = [], auth = createStore(() => ({ phase: 'authenticated', session: { sessionId: 'owner', authenticated: true }, pending: false, logoutUnconfirmed: false }))
  const workspace = createGatewayRuntimeWorkspaceState(), privacy = createGatewaySourcePrivacyState()
  const client = { settings: signal => { const read = deferred(); calls.push({ method: 'settings', signal, ...read }); return read.promise }, query: (q, stage, signal, cursor) => { const read = deferred(); calls.push({ method: 'query', q, stage, signal, cursor, ...read }); return read.promise } }
  const search = createUniversalSearch({ ...timers, client, auth, workspace, privacy }); search.start()
  return { ...search, calls, timers, auth, workspace, privacy, client }
}
async function first(h, rows = ['safe'], cursor = null) {
  h.query('needle'); h.setOpen(true); await h.timers.advance(250)
  h.calls.at(-1).resolve(settings()); await flush(); h.calls.at(-1).resolve(page(rows, cursor)); await flush()
}
function finish(h) { h.stop(); assert.equal(h.timers.jobs.size, 0, 'Stop clears debounce and read deadlines') }
async function privacyCases() {
  const h = harness(), linked = result('message', 'conversations', '/chat?session=gone&message=message'), opaque = result('artifact', 'artifacts', '/artifacts/artifact')
  await first(h, [result('gone'), linked, result('event', 'activity', '/activity?sessionId=gone'), opaque, result('safe')], 'cursor-one')
  assert.equal(h.resultHref('gone'), '/chat?session=gone')
  h.privacy.getState().markForgotten(['gone'])
  assert.deepEqual(h.store.getState().results, {}, 'Already displayed titles, excerpts, cursors and opaque derived records clear synchronously')
  assert.equal(h.resultHref('gone'), null); assert.equal(h.resultHref('artifact'), null)
  assert.equal(h.store.getState().query, 'needle'); assert.equal(h.store.getState().open, true)
  h.privacy.getState().markForgotten(['another']); await h.timers.advance(250)
  assert.equal(h.calls.length, 3, 'Privacy notifications coalesce into one fresh settings read')
  h.calls[2].resolve(settings()); await flush()
  h.calls[3].resolve(page([result('gone', 'conversations', '/chat'), linked, result('event', 'activity', '/activity?sessionId=gone'), opaque, result('safe')]))
  await flush(); assert.deepEqual(h.store.getState().results.metadata.results.map(row => row.id), ['artifact', 'safe'], 'Known identity masks also apply to a newly returned stale snapshot; opaque eligibility belongs to the fresh source read')
  finish(h)
  for (const phase of ['settings', 'first', 'more']) {
    const h = harness()
    if (phase === 'more') { await first(h, ['safe'], 'cursor-one'); h.more('metadata') }
    else { h.query('needle'); h.setOpen(true); await h.timers.advance(250); if (phase === 'first') { h.calls[0].resolve(settings()); await flush() } }
    const held = h.calls.at(-1); h.privacy.getState().markForgotten(['gone'])
    assert.equal(held.signal.aborted, true); assert.deepEqual(h.store.getState().results, {})
    held.resolve(phase === 'settings' ? settings() : page(['gone'])); await flush()
    assert.deepEqual(h.store.getState().results, {}, 'Abort-ignoring ' + phase + ' reply cannot publish')
    await h.timers.advance(250); h.calls.at(-1).resolve(settings()); await flush(); h.calls.at(-1).resolve(page(['fresh'])); await flush()
    assert.deepEqual(h.store.getState().results.metadata.results.map(row => row.id), ['fresh']); finish(h)
  }
  assert.equal(searchResultIsForgotten(result('msg', 'conversations', '/chat?session=safe&session=gone'), ['gone']), true)
  assert.equal(searchResultIsForgotten(result('gone', 'memory', '/memory?record=gone'), ['gone']), false, 'Unrelated record IDs cannot be guessed as conversation identity')
}
async function queryCases() {
  let h = harness(); h.query('needle'); h.setOpen(true); h.query(' needle '); await h.timers.advance(250)
  assert.equal(h.calls.length, 1); h.calls[0].resolve(settings()); await flush(); h.query('needle  ')
  assert.equal(h.calls[1].signal.aborted, false); h.calls[1].resolve(page(['safe'])); await flush()
  h.query('  needle  '); assert.equal(h.store.getState().pending, false); assert.equal(h.store.getState().results.metadata.results.length, 1); assert.equal(h.calls.length, 2)
  h.query('   '); assert.deepEqual(h.store.getState().results, {}); assert.equal(h.store.getState().pending, false); finish(h)
  h = harness(); h.setOpen(true)
  for (const query of ['A', 'B', 'A']) { h.query(query); await h.timers.advance(250); h.calls.at(-1).resolve(settings()); await flush() }
  const queries = h.calls.filter(call => call.method === 'query'); assert.deepEqual(queries.map(call => call.q), ['A', 'B', 'A'])
  queries[2].resolve(page(['new_a'])); await flush(); queries[0].resolve(page(['old_a'])); queries[1].resolve(page(['old_b'])); await flush()
  assert.equal(h.store.getState().results.metadata.results[0].id, 'new_a'); finish(h)
  h = harness(); await first(h, ['a'], 'cursor-one'); h.more('metadata'); h.more('metadata')
  assert.equal(h.calls.length, 3, 'Repeated activation before rendering dispatches only one page read')
  h.calls[2].resolve(page(['a', 'b'], 'cursor-two')); await flush()
  assert.deepEqual(h.store.getState().results.metadata.results.map(row => row.id), ['a', 'b'])
  h.more('metadata'); h.calls[3].reject(new Error('Private raw error')); await flush()
  assert.equal(h.store.getState().error, 'more'); assert.equal(h.store.getState().results.metadata.nextCursor, 'cursor-two'); assert.equal(h.store.getState().results.metadata.results.length, 2)
  h.more('metadata'); h.query('different'); h.calls[4].resolve(page(['wrong_query'])); await flush(); assert.deepEqual(h.store.getState().results, {}); finish(h)
}
async function lifetimeCases() {
  for (const boundary of ['identity', 'epoch', 'pending', 'logout', 'lock', 'close', 'stop']) {
    const h = harness(); await first(h, ['private'], 'cursor'); h.more('metadata'); const held = h.calls.at(-1)
    if (boundary === 'identity') h.auth.setState({ session: { sessionId: 'new-owner', authenticated: true } })
    if (boundary === 'epoch') h.workspace.getState().reset()
    if (boundary === 'pending') h.auth.setState({ pending: true })
    if (boundary === 'logout') h.auth.setState({ logoutUnconfirmed: true })
    if (boundary === 'lock') h.auth.setState({ phase: 'anonymous' })
    if (boundary === 'close') h.setOpen(false)
    if (boundary === 'stop') h.stop()
    assert.equal(held.signal.aborted, true); assert.equal(h.store.getState().open, false); assert.deepEqual(h.store.getState().results, {})
    assert.equal(h.store.getState().query, boundary === 'close' ? 'needle' : '')
    held.resolve(page(['private_late'])); await flush(); assert.deepEqual(h.store.getState().results, {}); assert.equal(h.resultHref('private'), null); finish(h)
  }
  const h = harness(); h.stop(); h.start(); await first(h); assert.equal(h.store.getState().results.metadata.results[0].id, 'safe', 'StrictMode restart remains functional'); finish(h)
}
async function deadlineAndStageCases() {
  for (const phase of ['settings', 'first', 'more']) {
    const h = harness()
    if (phase === 'more') { await first(h, ['kept'], 'cursor'); h.more('metadata') }
    else { h.query('needle'); h.setOpen(true); await h.timers.advance(250); if (phase === 'first') { h.calls[0].resolve(settings()); await flush() } }
    const held = h.calls.at(-1); await h.timers.advance(15000)
    assert.equal(held.signal.aborted, true); assert.equal(h.store.getState().pending, false)
    assert.equal(h.store.getState().error, phase === 'settings' ? 'settings' : phase === 'first' ? 'sources' : 'more')
    if (phase === 'more') assert.equal(h.store.getState().results.metadata.results[0].id, 'kept')
    const count = h.calls.length; await h.timers.advance(60000); assert.equal(h.calls.length, count, 'Timeout does not create an automatic model-enabled search loop')
    h.retry(); await h.timers.advance(250); h.calls.at(-1).resolve(settings()); await flush(); h.calls.at(-1).resolve(page(['recovered'])); await flush()
    held.resolve(phase === 'settings' ? settings() : page(['late'])); await flush(); assert.equal(h.store.getState().results.metadata.results[0].id, 'recovered'); finish(h)
  }
  const h = harness(); h.query('needle'); h.setOpen(true); await h.timers.advance(250); h.calls[0].resolve(settings(true, true)); await flush()
  const metadata = page(['literal'], 'next-metadata'); metadata.coverage[0].status = 'partial'; h.calls[1].resolve(metadata); await flush()
  h.calls[2].reject(new Error('Search source failed')); await flush(); assert.equal(h.calls[3].stage, 'semantic')
  h.calls[3].resolve(page(['semantic'], null, 'semantic')); await flush()
  assert.equal(h.store.getState().error, 'sources'); assert.equal(h.store.getState().results.metadata.coverage[0].status, 'partial'); assert.equal(h.store.getState().results.semantic.results.length, 1)
  h.more('metadata'); h.calls[4].resolve(page(['later'])); await flush(); assert.equal(h.store.getState().error, 'sources', 'Successful pagination cannot erase a failed search stage'); finish(h)
}
async function componentCases() {
  const h = harness(); await first(h, ['private'])
  const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/components/gateway/universal-search.tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const jsx = (type, props) => ({ type, props }), module = { exports: {} }, navigations = []
  new Function('require', 'module', 'exports', code)(name => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (name === 'react') return { useRef: () => ({ current: null }), useEffect: () => {} }
    if (name === 'react-router-dom') return { useNavigate: () => href => navigations.push(href) }
    if (name === './use-universal-search') return { useUniversalSearch: () => ({ ...h.store.getState(), search: h }) }
    if (name === './universal-search-state') return { searchStages: ['metadata', 'text', 'semantic'] }
    if (name === './navigation') return { gatewayCommandDestinations: [{ title: 'Needle page', path: '/settings' }] }
    if (name === '@/lib/workspace-chrome') return { UniversalSearchContext: { Provider: 'Provider' } }
    return new Proxy({}, { get: (_, key) => key })
  }, module, module.exports)
  let tree
  const render = () => { tree = module.exports.UniversalSearchProvider({}) }
  function find(type) { const found = []; const visit = node => { if (!node || typeof node !== 'object') return; if (node.type === type) found.push(node); [node.props?.children].flat(Infinity).forEach(visit) }; visit(tree); return found }
  render(); const record = find('CommandItem').find(item => item.props.value === 'private')
  h.privacy.getState().markForgotten(['private']); record.props.onSelect(); assert.deepEqual(navigations, [], 'A stale activation closure must recheck the current result identity')
  render(); assert.equal(find('CommandInput')[0].props.value, 'needle'); assert.equal(find('CommandDialog')[0].props.open, true)
  assert.equal(find('CommandItem').some(item => item.props.value === 'private'), false)
  h.store.setState({ pending: false, error: 'settings' }); render()
  const footer = find('div').find(node => node.props.onKeyDown), events = []
  footer.props.onKeyDown({ key: 'Enter', stopPropagation: () => events.push('stopped'), preventDefault: () => events.push('prevented') })
  footer.props.onKeyDown({ key: 'Escape', stopPropagation: () => events.push('escape-stopped') })
  assert.deepEqual(events, ['stopped'], 'Footer Enter stays with its native button; native activation and Escape are not prevented')
  let focused = 0; find('CommandInput')[0].props.ref.current = { focus: () => focused++ }
  find('Button').find(button => button.props.children === 'Try again').props.onClick()
  assert.equal(focused, 1); assert.equal(h.store.getState().open, true); assert.deepEqual(navigations, [])
  await h.timers.advance(250); h.calls.at(-1).resolve(settings()); await flush(); h.calls.at(-1).resolve(page(['recovered'])); await flush()
  render(); assert.equal(h.store.getState().results.metadata.results[0].id, 'recovered')
  find('Button').find(button => Array.isArray(button.props.children) && button.props.children.includes('Search settings')).props.onClick()
  assert.deepEqual(navigations, ['/settings?tab=search'], 'Search settings has its exact route, independently of the selected page command')
  navigations.length = 0; h.setOpen(true); render()
  find('CommandItem').find(item => item.props.value === 'page:/settings').props.onSelect(); assert.deepEqual(navigations, ['/settings'], 'Page commands remain usable without record results')
  finish(h)
}
async function main() { await privacyCases(); await queryCases(); await lifetimeCases(); await deadlineAndStageCases(); await componentCases(); console.log('Global search lifecycle passed: synchronous privacy clearing, known-source masking, stale activation/read fences, auth/epoch/deadline recovery, pagination, stage policy and whitespace continuity.') }
main().catch(error => { console.error(error); process.exitCode = 1 })
