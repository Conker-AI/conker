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
const { createProviderReadiness } = loader()('src/components/gateway/provider-readiness.ts')
function controllerHarness() {
  const authStore = createStore(() => owner('owner_A')), calls = [], timers = new Map(); let id = 0
  const controller = createProviderReadiness({ authStore, read: signal => { const request = { signal, ...deferred() }; calls.push(request); return request.promise },
    schedule: (run, delay) => { const key = ++id; timers.set(key, { run, delay }); return key }, unschedule: key => timers.delete(key) })
  const stop = controller.start()
  return { authStore, controller, calls, timers, stop, timeout: () => { const [key, timer] = timers.entries().next().value; assert.equal(timer.delay, 15000); timers.delete(key); timer.run() } }
}
async function controllerCases() {
  const initial = controllerHarness(), loading = initial.controller.refresh()
  initial.calls[0].reject(new Error('Initial failure')); await loading
  assert.deepEqual(initial.controller.store.getState(), { phase: 'unavailable', rows: [] })
  const empty = initial.controller.refresh(); initial.calls[1].resolve([]); await empty
  assert.deepEqual(initial.controller.store.getState(), { phase: 'current', rows: [] }, 'Empty success is distinct from failed evidence')
  initial.stop()
  const h = controllerHarness()
  let pending = h.controller.refresh(); await h.controller.refresh(); assert.equal(h.calls.length, 1)
  h.calls[0].resolve([row()]); await pending
  assert.equal(h.controller.store.getState().phase, 'current')
  pending = h.controller.refresh(); assert.equal(h.controller.store.getState().phase, 'checking')
  assert.equal(h.controller.store.getState().rows[0].model, 'previous-model')
  h.timeout(); await pending; assert.equal(h.calls[1].signal.aborted, true)
  assert.equal(h.controller.store.getState().phase, 'unavailable')
  h.calls[1].resolve([row('late-model')]); await flush()
  assert.equal(h.controller.store.getState().rows[0].model, 'previous-model', 'Timed-out late replies cannot restore current evidence')
  pending = h.controller.refresh(); h.calls[2].resolve([row('current-model')]); await pending
  assert.equal(h.controller.store.getState().rows[0].model, 'current-model')
  pending = h.controller.refresh()
  h.authStore.setState(owner('owner_B')); assert.equal(h.calls[3].signal.aborted, true)
  assert.deepEqual(h.controller.store.getState().rows, [], 'Owner changes clear even retained evidence synchronously')
  h.calls[3].resolve([row('owner-A-private')]); await pending; assert.deepEqual(h.controller.store.getState().rows, [])
  h.calls[4].resolve([row('owner-B-model')]); await flush()
  assert.equal(h.controller.store.getState().rows[0].model, 'owner-B-model')
  pending = h.controller.refresh(); h.authStore.setState({ pending: true })
  h.calls[5].reject(new Error('Old auth read')); await pending
  assert.equal(h.controller.store.getState().phase, 'inactive'); assert.deepEqual(h.controller.store.getState().rows, [])
  h.authStore.setState(owner('owner_B')); h.stop(); h.calls[6].resolve([row('after teardown')]); await flush()
  assert.deepEqual(h.controller.store.getState().rows, []); assert.equal(h.timers.size, 0)

  const replaced = controllerHarness(), first = replaced.controller.refresh(), second = replaced.controller.refresh(true)
  assert.equal(replaced.calls[0].signal.aborted, true)
  replaced.calls[1].resolve([row('new')]); await second; replaced.calls[0].resolve([row('old')]); await first
  assert.equal(replaced.controller.store.getState().rows[0].model, 'new'); replaced.stop()
  const returned = controllerHarness(), oldOwnerRead = returned.controller.refresh()
  returned.authStore.setState(owner('owner_B')); returned.authStore.setState(owner('owner_A'))
  returned.calls[0].resolve([row('old A')]); returned.calls[1].resolve([row('B')]); await oldOwnerRead; await flush()
  assert.deepEqual(returned.controller.store.getState().rows, [], 'A to B to A rejects both earlier identities')
  returned.calls[2].resolve([row('new A')]); await flush()
  assert.equal(returned.controller.store.getState().rows[0].model, 'new A'); returned.stop()
}
const walk = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(walk) : [node, ...walk(node.props?.children), ...walk(node.props?.action)]
const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : ''
function componentHarness() {
  const slots = [], effects = []; let cursor = 0, dirty = false, tree
  const hooks = {
    useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; dirty = true }] },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial } },
    useMemo(factory, deps) { const i = cursor++; if (!slots[i] || deps.some((value, index) => value !== slots[i].deps[index])) slots[i] = { value: factory(), deps }; return slots[i].value },
    useEffect(effect, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((value, index) => value !== old.deps[index])) { slots[i] = { deps, effect }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = effect() }) } },
  }
  const subscriptions = new Map()
  const mocks = { react: hooks, zustand: { useStore(store) { if (!subscriptions.has(store)) subscriptions.set(store, store.subscribe(() => { dirty = true })); return store.getState() } },
    'lucide-react': { ExternalLink: 'svg', LogIn: 'svg', RefreshCw: 'svg' }, '@/app/settings/models-providers': { ModelsProviders: 'ModelsProviders' },
    '@/components/ui/button': { Button: 'button' }, '@/components/ui/badge': { Badge: 'Badge' }, '@/components/ui/sheet': { Sheet: 'Sheet', SheetTrigger: 'SheetTrigger', SheetContent: 'SheetContent', SheetHeader: 'SheetHeader', SheetTitle: 'SheetTitle', SheetPanel: 'SheetPanel' }, '@/components/design-system': { WorkspaceSection: 'section' }, './page-frame': { GatewayPageFrame: 'main' },
    './chatgpt-connection': { ChatGPTConnection: function ChatGPTConnection() {} }, './native-claude-connection': { NativeClaudeConnection: 'NativeClaudeConnection' }, './provider-credentials': { ProviderCredentials: 'ProviderCredentials' } }
  const { GatewayProvidersSettings } = loader(mocks)('src/components/gateway/providers-settings.tsx')
  const authStore = createStore(() => owner('owner_A')), reads = [], models = [], writes = []
  let client = { providers(signal) { const value = { signal, ...deferred() }; reads.push(value); return value.promise },
    models(signal) { const value = { signal, ...deferred() }; models.push(value); return value.promise },
    saveModels(configuration, revision, signal) { const value = { configuration, revision, signal, ...deferred() }; writes.push(value); return value.promise } }
  const initialClient = client
  function render() { cursor = 0; dirty = false; tree = GatewayProvidersSettings({ client, authStore }); effects.splice(0).forEach(run => run()); return tree }
  return { render, reads, models, writes, authStore,
    async settle() { await flush(); for (let index = 0; dirty; index++) { assert.ok(index < 10); render(); await flush() } },
    section: () => walk(tree).find(node => node.props?.title === 'Connections'),
    editor: () => walk(tree).find(node => node.type === 'ModelsProviders'),
    credentials: () => walk(tree).find(node => node.type === 'ProviderCredentials'),
    button: label => walk(tree).find(node => node.type === 'button' && text(node) === label),
    connection: () => walk(tree).find(node => typeof node.type === 'function' && node.type.name === 'ChatGPTConnection'),
    replaceClient: () => { client = { ...client }; render() },
    restoreClient: () => { client = initialClient; render() },
    stop: () => { slots.forEach(slot => slot?.cleanup?.()); subscriptions.forEach(stop => stop()) },
  }
}
async function actualComponentCases() {
  const h = componentHarness(); h.render()
  assert.match(text(h.section()), /Checking provider readiness/)
  const configuration = { providers: [], models: [], defaultModelId: null, roleSettings: { roles: {} } }
  h.models[0].resolve({ revision: 1, configuration }); h.reads[0].resolve([row()]); await h.settle()
  assert.match(text(h.section()), /Ready/)
  // New assertions
  const tree = h.render()
  assert.equal(walk(tree).find(node => node.props?.title === 'Runtime readiness'), undefined, 'no node anywhere in the tree has props.title === "Runtime readiness"')
  assert.equal(walk(tree).find(node => node.props?.className?.includes('max-w-3xl')), undefined, 'no node\'s className contains max-w-3xl')
  const sheetContents = walk(tree).filter(node => node.type === 'SheetContent')
  assert.equal(sheetContents.length, 3, 'there are exactly 3 SheetContent nodes')
  assert.ok(sheetContents.every(sheet => sheet.props.portalProps?.keepMounted === true), 'every SheetContent node has props.portalProps.keepMounted === true')
  assert.ok(sheetContents.some(sheet => walk(sheet).some(node => node.type?.name === 'ChatGPTConnection' || (typeof node.type === 'function' && node.type.name === 'ChatGPTConnection'))), 'the ChatGPTConnection node is inside a SheetContent')
  const detailsNode = walk(tree).find(node => node.type === 'details')
  assert.ok(detailsNode, 'there is a details node')
  assert.equal(text(detailsNode.props.children), 'Advanced: model list', 'the details summary text is "Advanced: model list"')
  assert.ok(walk(detailsNode).some(node => node.type === 'ModelsProviders'), 'the ModelsProviders node is inside a details node')
  // Test with resolved reads[0] to check Connect button and Ready state
  h.reads[0] = { resolve: () => {}, signal: { aborted: false } }
  h.reads[0].resolve([row()])
  await h.settle()
  const updatedTree = h.render()
  // Find the specific ChatGPT row by looking for a div that contains "ChatGPT subscription" but not all the other content
  const allRows = walk(updatedTree).filter(node => text(node).includes('ChatGPT subscription'))
  const chatgptRow = allRows.find(node => {
    const nodeText = text(node)
    return nodeText.includes('ChatGPT subscription') && !nodeText.includes('Claude subscription')
  })
  assert.ok(chatgptRow, 'chatgpt row exists')
  const sheetTrigger = chatgptRow.props?.children?.[1]?.props?.children?.[1]?.props?.children?.[0]
  assert.ok(sheetTrigger, 'chatgpt SheetTrigger exists')
  assert.equal(sheetTrigger.props?.children, 'Connect', 'chatgpt row\'s trigger text is Connect when not ready')
  const ollamaRow = walk(updatedTree).find(node => text(node).includes('Local model') && !text(node).includes('Refresh'))
  assert.ok(ollamaRow, 'ollama row exists')
  assert.match(text(ollamaRow), /Local model.*previous-model.*Ready/, 'ollama row shows Local model, previous-model and Ready')
  const editor = h.editor(); h.section().props.action.props.onClick(); await h.settle()
  assert.doesNotMatch(text(h.section()), /Ready/); assert.match(text(h.section()), /Last checked model: previous-model/)
  assert.equal(h.models.length, 1, 'Health refresh does not reread or replace an unsaved catalogue')
  assert.equal(h.editor().key, editor.key)
  assert.equal(h.section().props.action.props.disabled, false, 'Checking preserves keyboard focus on the same action')
  assert.equal(h.section().props.action.props['aria-disabled'], true)
  h.section().props.action.props.onClick(); await h.settle()
  assert.equal(h.reads.length, 2, 'A checking action does not start another read')
  h.reads[1].reject(new Error('Host down')); await h.settle()
  assert.match(text(h.section()), /could not be checked/); assert.match(text(h.section()), /Unavailable/); assert.doesNotMatch(text(h.section()), /Ready/)
  assert.equal(text(h.section().props.action), 'Try again')
  assert.equal(h.connection().props.onConnection, undefined, 'Connection-card cache cannot override runtime evidence')
  h.section().props.action.props.onClick(); await h.settle()
  h.reads[2].resolve([row('new-model'), row(null, 'unavailable', 'chatgpt')]); await h.settle()
  assert.doesNotMatch(text(h.section()), /previous-model|Last checked|could not be checked|Connected, inference not verified/)
  assert.match(text(h.section()), /new-modelReady/); assert.match(text(h.section()), /ChatGPT subscriptionUnavailable/)
  h.section().props.action.props.onClick(); await h.settle()
  h.reads[3].resolve([row(null, 'unverified', 'openrouter'), row(null, 'unverified', 'chatgpt')]); await h.settle()
  assert.match(text(h.section()), /OpenRouterConnected, not tested/); assert.doesNotMatch(text(h.section()), /Ready/)
  assert.match(text(h.section()), /ChatGPT subscriptionConnected, not tested/); assert.doesNotMatch(text(h.section()), /Not connected/)
  h.section().props.action.props.onClick(); await h.settle()
  h.reads[4].resolve([row(null, 'unavailable', 'openrouter')]); await h.settle()
  assert.match(text(h.section()), /OpenRouterUnavailable/)

  h.credentials().props.onChanged(); await h.settle()
  assert.equal(h.models.length, 2)
  const saving = h.editor().props.onSave(configuration); await h.settle()
  h.writes[0].resolve({ revision: 2, configuration }); await saving; await h.settle()
  assert.equal(h.editor().key, '2')
  h.models[1].resolve({ revision: 1, configuration }); await h.settle()
  assert.equal(h.editor().key, '2', 'A pre-save catalogue response cannot roll back a saved revision')
  assert.equal(h.models[1].signal.aborted, true)
  const replacedWrite = h.editor().props.onSave(configuration); await h.settle()
  assert.equal(h.editor().props.pending, true)
  h.replaceClient(); assert.equal(h.editor(), undefined, 'Replacement client cannot display old catalogue identity')
  h.models.at(-1).resolve({ revision: 5, configuration }); await h.settle()
  assert.equal(h.editor().props.pending, false, 'A prior client save cannot strand the replacement editor')
  h.writes[1].resolve({ revision: 3, configuration }); await replacedWrite; await h.settle()
  assert.equal(h.editor().key, '5'); assert.equal(h.editor().props.pending, false)
  const write = h.editor().props.onSave(configuration); const duplicate = h.editor().props.onSave(configuration)
  assert.equal(h.writes.length, 3, 'Synchronous duplicate save guard works before React renders'); await duplicate
  h.authStore.setState(owner('owner_B')); await h.settle()
  assert.equal(h.writes[2].signal.aborted, true)
  h.writes[2].resolve({ revision: 6, configuration }); await write; await h.settle()
  assert.equal(h.editor(), undefined, 'Owner change clears catalogue and rejects late save publication')
  assert.doesNotMatch(text(h.section()), /previous-model|new-model|Ready/)
  const beforeReplacement = h.reads.at(-1)
  h.replaceClient(); assert.equal(beforeReplacement.signal.aborted, true)
  beforeReplacement.resolve([row('old client')]); await h.settle()
  assert.doesNotMatch(text(h.section()), /old client/)
  const lastRead = h.reads.at(-1), lastCatalogue = h.models.at(-1)
  h.stop()
  lastRead.resolve([row('unmounted')]); lastCatalogue.resolve({ revision: 9, configuration }); await flush()
  assert.equal(lastRead.signal.aborted, true); assert.equal(lastCatalogue.signal.aborted, true)
}
async function returnedClientDuringSave() {
  const h = componentHarness(), configuration = { providers: [], models: [], defaultModelId: null, roleSettings: { roles: {} } }
  h.render(); h.models[0].resolve({ revision: 1, configuration }); h.reads[0].resolve([row('original A')]); await h.settle()
  const oldSave = h.editor().props.onSave(configuration); await h.settle()
  assert.equal(h.editor().props.pending, true)
  h.replaceClient(); assert.equal(h.editor(), undefined)
  const secondClientRead = h.models.at(-1), secondHealthRead = h.reads.at(-1)
  h.restoreClient(); assert.equal(h.editor(), undefined, 'A to B to A cannot revive the retired A catalogue')
  assert.equal(secondClientRead.signal.aborted, true)
  secondClientRead.resolve({ revision: 2, configuration }); secondHealthRead.resolve([row('old B')])
  h.writes[0].resolve({ revision: 3, configuration }); await oldSave; await h.settle()
  assert.equal(h.editor(), undefined, 'Old A save and B read cannot publish into the new A lifetime')
  h.models.at(-1).resolve({ revision: 4, configuration }); h.reads.at(-1).resolve([row('new A')]); await h.settle()
  assert.equal(h.editor().key, '4'); assert.equal(h.editor().props.pending, false, 'Returning to A cannot revive retired pending state')
  assert.match(text(h.section()), /new A/); assert.doesNotMatch(text(h.section()), /original A|old B/)
  h.stop()
}
async function catalogueTimeout() {
  const original = { setTimeout: global.setTimeout, clearTimeout: global.clearTimeout }, timers = new Map(); let next = 0
  global.setTimeout = (run, delay) => { const id = ++next; timers.set(id, { run, delay }); return id }
  global.clearTimeout = id => timers.delete(id)
  const h = componentHarness(), configuration = { providers: [], models: [], defaultModelId: null, roleSettings: { roles: {} } }
  try {
    h.render(); h.reads[0].resolve([row()]); await h.settle()
    assert.equal(timers.size, 1, 'Only the held initial catalogue deadline remains')
    const [id, timer] = timers.entries().next().value; assert.equal(timer.delay, 15000); timers.delete(id); timer.run(); await h.settle()
    assert.equal(h.models[0].signal.aborted, true)
    assert.ok(h.button('Retry model settings'), 'Hung initial catalogue exposes an explicit recovery action')
    h.button('Retry model settings').props.onClick(); await h.settle()
    h.models[1].resolve({ revision: 2, configuration }); await h.settle()
    assert.equal(h.editor().key, '2')
    h.models[0].resolve({ revision: 1, configuration }); await h.settle()
    assert.equal(h.editor().key, '2', 'Late initial read cannot replace retry result')
  } finally { h.stop(); global.setTimeout = original.setTimeout; global.clearTimeout = original.clearTimeout }
}
async function clientCases() {
  const { createGatewayControlClient } = loader()('src/lib/gateway/control.ts')
  const calls = []
  let hosted = { provider: 'openrouter', status: 'unverified', allow_paid: true }
  const client = createGatewayControlClient({ request: async (path, options) => { calls.push({ path, options }); return { local: { provider: 'ollama', model: 'local-route', health: { status: 'ok' } }, direct: {}, hosted } } })
  let rows = await client.providers()
  assert.deepEqual(rows.find(row => row.id === 'openrouter'), { id: 'openrouter', status: 'unverified', capabilities: ['text'] })
  hosted = { provider: 'openrouter', status: 'unavailable', allow_paid: true }
  rows = await client.providers()
  assert.deepEqual(rows.find(row => row.id === 'openrouter'), { id: 'openrouter', status: 'unavailable', capabilities: ['text'] }, 'Configured hosted failure retains source identity')
  assert.ok(calls.every(call => call.path === '/api/pi/models' && !call.options.method), 'Readiness only issues GETs')
}
async function main() { await controllerCases(); await actualComponentCases(); await returnedClientDuringSave(); await catalogueTimeout(); await clientCases(); console.log('Provider readiness controller and actual component: current/pending/unavailable/recovery, deadlines, auth/teardown fences, independent catalogue, ordered save publication and hosted client contract passed.') }
main().catch(error => { console.error(error); process.exitCode = 1 })
