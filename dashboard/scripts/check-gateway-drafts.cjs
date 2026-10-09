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
    const resolved = request.startsWith('@/') ? `src/${request.slice(2)}` : path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))
    assert.ok(request.startsWith('.') || request.startsWith('@/'), request)
    return load(`${resolved}.ts`)
  }, module, module.exports)
  return module.exports
}
const { createGatewayDraftClient, parseDraft, emptyDraft, draftBody, parseDraftStart, mergeDraftPrivacy } = load('src/lib/gateway/drafts.ts')
const { createDraftController, draftNeedsUnload, draftCanSend } = load('src/components/gateway/draft-controller.ts')
const { createGatewayRuntimeClient } = load('src/lib/gateway/runtime.ts')
const { createRequestOptions, retainedRequestOptions } = load('src/components/gateway/runtime-state.ts')
const { createGatewayTransport, GatewayError, isConversationWrite } = load('src/lib/gateway/transport.ts')
const { rememberDraftStart, readDraftStart, clearDraftStart } = load('src/components/gateway/draft-start-recovery.ts')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const statusModule = { exports: {} }
new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(path.join(root, 'src/components/gateway/draft-status.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText)(request => {
  if (request === 'react' || request === 'react/jsx-runtime') return require(request)
  if (request === '@/components/ui/button') return { Button: ({ children }) => React.createElement('button', null, children) }
  if (request === '@/components/design-system') return { ConfirmationDialog: () => null }
  throw new Error(`Unexpected draft status dependency: ${request}`)
}, statusModule, statusModule.exports)
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const raw = (key = 'new', patch = {}) => ({ schemaVersion: 1, session_id: key === 'new' ? null : key.split('/')[0], task_id: key.split('/')[1] ?? null, content_status: 'available', revision: 0, updated_at: null, text: '', model_id: null, skill_ids: [], think: false, research_mode: 'off', ...(key === 'new' ? { title: '', agent_id: null, privacy: {} } : {}), ...patch })
const saved = (key = 'new', patch = {}) => parseDraft(raw(key, patch), key)
const controllers = []
function server(key = 'new', initial = saved(key)) {
  let record = initial
  const calls = []
  const client = { load: async scope => { calls.push(['GET', scope]); return structuredClone(record) }, save: async (scope, value, revision) => {
    calls.push(['POST', scope, revision, structuredClone(value)])
    if (revision !== record.revision) throw new GatewayError('http', 409)
    record = { ...record, ...structuredClone(value), revision: revision + 1, updatedAt: 100 }
    return structuredClone(record)
  } }
  const controller = createDraftController(client, () => true, 1_000_000); controllers.push(controller)
  return { controller, client, calls, get record() { return record }, set record(value) { record = value } }
}

async function main() {
  const comparison = { status: 'conflict', value: { ...emptyDraft(), title: 'My proposed title' }, conflict: { ...saved(), revision: 2, title: 'The saved title' }, base: null, error: null, version: 1, unknownSave: null }
  const renderComparison = (entry, draftKey) => renderToStaticMarkup(React.createElement(statusModule.exports.DraftSaveStatus, { entry, draftKey, controller: {} })).replace(/<[^>]*>/g, '')
  const newComparison = renderComparison(comparison, 'new')
  assert.ok(newComparison.includes('Title: My proposed title') && newComparison.includes('Title: The saved title'), 'The overwrite review must show both new-chat titles')
  assert.ok(!renderComparison(comparison, 'ses_one').includes('Title:'), 'Session drafts cannot rename the authoritative chat title')
  assert.ok(renderComparison({ ...comparison, value: emptyDraft() }, 'new').includes('Title: Automatic from the first message'), 'An inherited title needs an honest visible fallback')
  assert.deepEqual(draftBody('new', emptyDraft(), 0).privacy, {}, 'Default draft inherits server privacy; it must not opt into memory')
  const explicit = parseDraft(raw('new', { privacy: { memoryDisabled: false, harnessDisabled: true } }), 'new')
  assert.deepEqual(draftBody('new', explicit, 0).privacy, { memoryDisabled: false, harnessDisabled: true }, 'CLI-authored explicit privacy is preserved')
  assert.deepEqual(mergeDraftPrivacy({ memoryDisabled: false }, { memoryDisabled: false, harnessDisabled: true }), { memoryDisabled: false, harnessDisabled: true }, 'Editing a different switch preserves explicit CLI privacy')
  assert.deepEqual(mergeDraftPrivacy({ memoryDisabled: true }, { memoryDisabled: false, harnessDisabled: false }), {}, 'Removing a UI restriction restores inheritance')
  assert.ok(!('privacy' in draftBody('ses_one', explicit, 0)), 'Session drafts cannot replace authoritative session privacy')
  assert.equal(parseDraft(raw('ses_one', { text: '😀'.repeat(100_000) }), 'ses_one').text.length, 200_000, 'Legacy Unicode drafts remain readable')
  assert.throws(() => draftBody('new', { ...emptyDraft(), text: 'x'.repeat(16001) }, 0), error => error.kind === 'validation')
  assert.throws(() => draftBody('new', { ...emptyDraft(), text: '\0'.repeat(16000) }, 0), error => error.kind === 'too-large')
  assert.throws(() => parseDraft(raw('ses_other'), 'ses_one'), error => error.kind === 'invalid-response')
  const transportCalls = []
  const transport = createGatewayTransport({ origin: 'https://draft.test', fetch: async (url, options) => {
    transportCalls.push([url, options])
    return new Response(JSON.stringify(raw('ses_one', { text: '😀'.repeat(100_000) })), { headers: { 'Content-Type': 'application/json' } })
  } })
  const api = createGatewayDraftClient({ request: (route, options) => transport.request(route, { ...options, csrfToken: 'c'.repeat(32) }) })
  assert.equal((await api.load('ses_one')).text.length, 200_000, 'Actual transport allows legitimate legacy reads above the default response helper limit')
  for (const route of ['/api/control/pi/drafts/new', '/api/control/pi/drafts/ses_one', '/api/control/pi/drafts/ses_one/tasks/task_one', '/api/control/pi/drafts/new/start']) assert.equal(isConversationWrite(route), true, `Session-only routine write: ${route}`)
  assert.equal(isConversationWrite('/api/control/pi/drafts/new/start/request_12345678'), false, 'Receipt lookup is read-only')
  await assert.rejects(api.load('../owner'), error => error.kind === 'validation')
  await assert.rejects(transport.request('/api/control/pi/drafts/new/start/request_12345678', { method: 'POST', body: {}, csrfToken: 'c'.repeat(32) }), error => error.kind === 'validation')
  const starts = [], requestId = 'draft_start_request_123'
  const receipt = { schemaVersion: 1, request_id: requestId, session_id: 'ses_one', content_status: 'available', source_revision: 4, draft_revision: 1 }
  const startApi = createGatewayDraftClient({ request: async (route, options) => { starts.push([route, options]); return receipt } })
  await startApi.start(requestId, 4); await startApi.checkStart(requestId)
  assert.deepEqual(starts[0][1].body, { request_id: requestId, expected_revision: 4 })
  assert.equal(starts[1][0], `/api/control/pi/drafts/new/start/${requestId}`)
  assert.equal(starts[1][1].method, undefined, 'Checking a start never creates a chat or invokes a model')
  assert.equal(parseDraftStart({ ...receipt, content_status: 'forgotten', source_revision: 999, draft_revision: 999 }, requestId).draftRevision, null)

  let setup = server(); await setup.controller.load('new')
  setup.controller.edit('new', { text: 'hello', modelId: 'chosen', skillIds: ['review-code'], think: true })
  assert.equal(draftNeedsUnload(setup.controller.current('new')), true)
  const flushed = await setup.controller.flush('new')
  assert.equal(flushed.text, 'hello'); assert.equal(flushed.revision, 1); assert.equal(flushed.think, true)
  assert.equal(draftNeedsUnload(setup.controller.current('new')), false)

  // Local typing during the initial GET cannot be overwritten by hydration.
  setup = server(); const reading = deferred(); setup.client.load = () => reading.promise
  const pendingRead = setup.controller.load('new'); setup.controller.edit('new', { text: 'typed during load' })
  reading.resolve(saved()); await pendingRead
  assert.equal(setup.controller.current('new').value.text, 'typed during load')
  assert.equal(setup.controller.current('new').status, 'dirty')

  // Two tabs: preserve both versions, and explicit Keep mine still uses CAS.
  setup = server(); await setup.controller.load('new'); setup.controller.edit('new', { text: 'mine' })
  setup.record = saved('new', { revision: 1, text: 'other tab' })
  await assert.rejects(setup.controller.flush('new'))
  assert.equal(setup.controller.current('new').status, 'conflict'); assert.equal(setup.controller.current('new').value.text, 'mine')
  assert.equal(setup.controller.current('new').conflict.text, 'other tab'); assert.equal(draftCanSend(setup.controller.current('new')), false)
  setup.record = saved('new', { revision: 2, text: 'other tab newer' })
  await setup.controller.choose('new', 'mine', { revision: 1, version: setup.controller.current('new').version })
  assert.equal(setup.controller.current('new').status, 'conflict', 'A later remote edit defeats explicit replacement of the reviewed revision')
  assert.equal(await setup.controller.choose('new', 'saved', { revision: 1, version: setup.controller.current('new').version }), false, 'A stale confirmation cannot apply an unseen remote version')
  await setup.controller.choose('new', 'saved', { revision: 2, version: setup.controller.current('new').version })
  assert.equal(setup.controller.current('new').value.text, 'other tab newer')

  // Lost POST response with a failed reconciliation GET, followed by newer local edits.
  setup = server(); await setup.controller.load('new'); setup.controller.edit('new', { text: 'saved despite failure' })
  const originalSave = setup.client.save, originalLoad = setup.client.load
  setup.client.save = async (...args) => { await originalSave(...args); throw new GatewayError('network') }
  setup.client.load = async () => { throw new GatewayError('network') }
  await assert.rejects(setup.controller.flush('new'))
  assert.equal(setup.controller.current('new').status, 'unknown')
  setup.controller.edit('new', { text: 'newer edit' }); setup.client.load = originalLoad; setup.client.save = originalSave
  await setup.controller.retry('new')
  assert.equal(setup.controller.current('new').status, 'saved'); assert.equal(setup.record.text, 'newer edit'); assert.equal(setup.record.revision, 2)
  assert.equal(setup.calls.filter(call => call[0] === 'POST').length, 2, 'Reconciliation does not blindly repeat the first write')

  // A newer edit survives an older successful save and exact revision consumption.
  setup = server('ses_one'); await setup.controller.load('ses_one'); setup.controller.edit('ses_one', { text: 'sending' })
  const writing = deferred(); const realSave = setup.client.save
  setup.client.save = async (...args) => { const result = await realSave(...args); await writing.promise; return result }
  const pendingSave = setup.controller.flush('ses_one'); await Promise.resolve(); await Promise.resolve()
  setup.controller.edit('ses_one', { text: 'next message' }); writing.resolve(); await assert.rejects(pendingSave)
  assert.equal(setup.controller.current('ses_one').value.text, 'next message')
  setup.record = { ...setup.record, ...emptyDraft(), revision: 2 }
  await setup.controller.consumed('ses_one', 1)
  assert.equal(setup.controller.current('ses_one').value.text, 'next message'); assert.equal(setup.controller.current('ses_one').status, 'dirty')

  // Forgotten chats cannot be resurrected by a delayed draft read or write.
  setup = server('ses_one'); const delayed = deferred(); setup.client.load = () => delayed.promise
  const forgetRead = setup.controller.load('ses_one'); setup.controller.edit('ses_one', { text: 'private' }); setup.controller.forget(['ses_one'])
  delayed.resolve(saved('ses_one', { revision: 1, text: 'PRIVATE' })); await forgetRead
  assert.equal(setup.controller.current('ses_one').status, 'unavailable'); assert.equal(setup.controller.current('ses_one').value.text, '')
  setup.controller.edit('ses_one', { text: 'resurrect' }); assert.equal(setup.controller.current('ses_one').value.text, '')
  setup = server(); const old = deferred(); setup.client.load = () => old.promise
  const oldRead = setup.controller.load('new'); setup.controller.reset(); old.resolve(saved('new', { text: 'old owner' })); await oldRead
  assert.deepEqual(setup.controller.store.getState().entries, {}, 'An auth-epoch reset fences all in-flight content')

  // New-chat start recovery must not clear a newer staging draft.
  setup = server('new', saved('new', { revision: 5, text: 'newer staging draft' })); await setup.controller.load('new')
  await setup.controller.consumed('new', 2)
  assert.equal(setup.controller.current('new').value.text, 'newer staging draft')

  const frozen = createRequestOptions('chosen', ['review-code'], true, 7, 'deep')
  assert.deepEqual(retainedRequestOptions({ requestOptions: frozen, submission: { draftRevision: 100 } }), frozen)
  assert.equal(retainedRequestOptions({ submission: { draftRevision: 7, researchMode: 'web' } }).draftRevision, 7)
  let sent
  const runtime = createGatewayRuntimeClient({ request: async (route, options) => { sent = options.body; throw new GatewayError('http', 409, undefined, 'draft_changed') } })
  await assert.rejects(runtime.submitRequest('ses_one', 'original', requestId, frozen), error => error.outcome === 'rejected')
  assert.equal(sent.draft_revision, 7); assert.equal(sent.research_mode, 'deep')

  const storage = new Map()
  global.sessionStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }
  rememberDraftStart({ requestId, revision: 4, identity: 'owner-session', text: 'NEVER STORE' })
  assert.ok(![...storage.values()].join().includes('NEVER STORE'))
  assert.equal(readDraftStart('owner-session').requestId, requestId)
  assert.equal(readDraftStart('another-session'), null); assert.equal(storage.size, 0)
  clearDraftStart()
  const source = fs.readFileSync(path.join(root, 'src/components/gateway/runtime-workspace.tsx'), 'utf8')
  assert.match(source, /finishChatStart\(receipt, false\)/, 'Recovered starts never auto-send a new turn request')
  assert.match(source, /draftController\.flush\(id\)[\s\S]*createRequestOptions\(saved.modelId, saved.skillIds, saved.think, saved.revision, saved.researchMode\)/)
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'src/components/gateway/draft-controller.ts'), 'utf8'), /localStorage|sessionStorage|indexedDB/, 'Draft content remains private server state plus transient memory')
  console.log('Private draft client, transport, CAS conflicts, uncertain-save reconciliation, concurrent edits, exact consumption, auth/forget fences, privacy inheritance and start recovery checks passed.')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => { for (const controller of controllers) controller.reset() })
