const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const source = path.resolve(__dirname, '../src/components/gateway/memory-workspace.tsx')
const code = ts.transpileModule(fs.readFileSync(source, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const card = id => ({ id, type: 'memory', title: `Memory ${id}`, preview: `Private preview ${id}`, available_fields: [], connections: {}, preview_truncated: false })
const connections = object => ({ object, nodes: [], links: [], next_after: null })
function harness() {
  const hooks = [], effects = [], calls = [], writes = []
  let cursor = 0, tree, params = new URLSearchParams('view=database&record=B&kind=memory&q=keep-search')
  const react = {
    useState(initial) { const index = cursor++; hooks[index] ??= { value: typeof initial === 'function' ? initial() : initial }; return [hooks[index].value, next => { hooks[index].value = typeof next === 'function' ? next(hooks[index].value) : next }] },
    useRef(initial) { const index = cursor++; return hooks[index] ??= { current: initial } },
    useMemo(fn) { return fn() },
    useEffect(run, dependencies) {
      const index = cursor++, previous = hooks[index]
      if (!previous || dependencies.some((item, position) => item !== previous.dependencies[position])) effects.push(() => { previous?.cleanup?.(); hooks[index] = { dependencies, cleanup: run() } })
    },
  }
  const jsx = (type, props) => ({ type, props })
  const correction = { controller: { select(){}, invalidate(){} }, changed:0, ready:true, busy:null, recovery:null }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(name => {
    if (name === './use-memory-correction') return { useMemoryCorrection: () => correction }
    if (name === 'react') return react
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (name === 'react-router-dom') return { useSearchParams: () => [params, (value, options) => { params = value; writes.push([params.toString(), options]) }] }
    if (name === '@/lib/gateway/memory-graph') return { projectMemoryGraph: () => ({ nodes: [], edges: [] }), layoutMemoryAtlas: () => [], memoryGraphNodeLimit: 100 }
    return new Proxy({}, { get: (_, property) => property })
  }, module, module.exports)
  global.window = { location: { search: '?' + params } }
  const client = {
    library: async () => ({ objects: [card('B'), card('C')], total: 2, next_after: null }),
    connections: (kind, id, options) => { const result = deferred(); calls.push({ kind, id, signal: options?.signal, ...result }); return result.promise },
  }
  function render() { cursor = 0; tree = module.exports.GatewayMemoryWorkspace({ client }); for (const run of effects.splice(0)) run() }
  function find(type) {
    const matches = []
    function visit(node) { if (!node || typeof node !== 'object') return; if (node.type === type) matches.push(node); for (const child of [node.props?.children].flat(Infinity)) visit(child) }
    visit(tree); return matches
  }
  return { render, find, calls, writes, text: () => JSON.stringify(tree), get params() { return params } }
}
async function flush() { for (let i = 0; i < 5; i++) await Promise.resolve() }
async function checkPreviewRecovery() {
  const storage = new Map()
  global.sessionStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }
  const load = (file, requireModule) => {
    const result = { exports: {} }
    new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(requireModule, result, result.exports)
    return result.exports
  }
  const transport = load('src/lib/gateway/transport.ts', () => { throw Error('Unexpected transport import') })
  const { createFakeGateway } = load('src/dev/fake-gateway.ts', name => {
    if (name === '@/lib/gateway/transport') return transport
    if (name === '@/lib/api/character-defaults') return { createCharacterStudio: () => ({}) }
    if (name === '@/lib/gateway/search') return { searchSources: [] }
    if (name === './fake-gateway-providers') return load('src/dev/fake-gateway-providers.ts', inner => { if (inner === '@/lib/gateway/transport') return transport; throw Error(`Unexpected preview import: ${inner}`) })
    throw Error(`Unexpected preview import: ${name}`)
  })
  const pendingPath = '/api/control/pi/memory/forget-pending', forgetPath = '/api/control/pi/memory/forget'
  let preview = createFakeGateway()
  assert.equal((await preview.request(pendingPath)).pending, null, 'Default preview has no previous deletion')
  const reviewed = await preview.request(`${forgetPath}/mem_judo`)
  const body = { request_id: 'synthetic_forget_request_1', memory_id: reviewed.memoryId, expected_revision: reviewed.revision }
  sessionStorage.setItem('conker-fake-fail', 'forget-response')
  await assert.rejects(preview.request(forgetPath, { method: 'POST', body }), error => error.kind === 'network')
  assert.ok(!sessionStorage.getItem('conker-preview-forget').includes(reviewed.text), 'Only synthetic recovery identity survives reload')
  preview = createFakeGateway()
  assert.deepEqual((await preview.request(pendingPath)).pending, { requestId: body.request_id, memoryId: body.memory_id, revision: 1 })
  await assert.rejects(preview.request(forgetPath, { method: 'POST', body: { ...body, request_id: 'synthetic_different_request' } }), error => error.code === 'forget_pending')
  const receipt = await preview.request(forgetPath, { method: 'POST', body })
  assert.equal(receipt.status, 'forgotten'); assert.equal(receipt.sourceConversationKept, true)
  assert.deepEqual(await preview.request(forgetPath, { method: 'POST', body }), receipt, 'Same preview request replays without another deletion')
  assert.equal((await preview.request(pendingPath)).pending, null)
  assert.equal(sessionStorage.getItem('conker-preview-forget'), null)
  assert.equal((await preview.request('/api/pi/sessions')).results.length, 3, 'Synthetic forgetting keeps source chats')
  delete global.sessionStorage
}
async function main() {
  let view = harness(); view.render(); await flush(); view.render()
  const deep = view.calls[0]
  view.find('RecordItem').find(row => row.props.title === 'Memory B').props.onOpen()
  assert.equal(deep.signal.aborted, true, 'Manual selection synchronously retires the pending deep-link read')
  view.render()
  const detail = view.calls[1]
  view.find('ForgetMemory')[0].props.onForgotten()
  // Deliver old private payloads before React can run any effect cleanup.
  deep.resolve(connections(card('B'))); detail.resolve(connections(card('B')))
  await flush(); view.render()
  assert.equal(view.find('WorkspaceInspector').length, 0, 'A forgotten record cannot return through either late read')
  assert.equal(view.params.has('record'), false); assert.equal(view.params.has('kind'), false)
  assert.equal(view.params.get('q'), 'keep-search'); assert.equal(view.params.get('view'), 'database')
  assert.equal(view.writes.at(-1)[1].replace, true, 'The deleted record link cannot return through Back')

  view = harness(); view.render(); await flush(); view.render()
  const recovering = view.calls[0]
  view.find('ForgetMemoryRecovery')[0].props.onResolved()
  assert.equal(recovering.signal.aborted, true, 'Recovered deletion invalidates a deep-link read before routing')
  recovering.resolve(connections(card('B')))
  await flush(); view.render()
  assert.equal(view.find('WorkspaceInspector').length, 0)
  assert.equal(view.params.has('record'), false)

  view = harness(); view.render(); await flush(); view.render()
  view.find('RecordItem').find(row => row.props.title === 'Memory B').props.onOpen(); view.render()
  const oldDetail = view.calls[1]
  view.find('RecordItem').find(row => row.props.title === 'Memory C').props.onOpen()
  oldDetail.reject(new Error('STALE_DETAIL_ERROR'))
  await flush(); view.render()
  assert.ok(!view.text().includes('STALE_DETAIL_ERROR'), 'A late failure cannot replace the newly selected memory status')
  assert.equal(view.find('WorkspaceInspector')[0].props.title, 'Memory C')
  delete global.window
  await checkPreviewRecovery()
  console.log('Memory reads: manual selection, forget/recovery deep-link retirement, synchronous detail fencing, URL continuity and synthetic lost-response replay passed.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
