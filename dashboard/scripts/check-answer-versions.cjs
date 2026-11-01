const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..'), cache = new Map()
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports
  const module = { exports: {} }; cache.set(relative, module)
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('require', 'module', 'exports', code)(request => request === 'zod' ? require('zod') :
    load(request.startsWith('@/') ? `src/${request.slice(2)}.ts` : `${path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))}.ts`), module, module.exports)
  return module.exports
}

const { createChatAnswersClient } = load('src/lib/gateway/chat-answers.ts')
const { createFakeChatAnswers } = load('src/dev/fake-gateway-chat-answers.ts')

assert.equal(typeof createChatAnswersClient, 'function')
assert.equal(typeof createFakeChatAnswers, 'function')

const SESSION = 'ses_1111111111111111'
const ids = { ask1: 'msg_0000000000000001', ans1: 'msg_0000000000000002', ask2: 'msg_0000000000000003', ans2: 'msg_0000000000000004' }
let counter = 100
const nextId = prefix => `${prefix}_${(++counter).toString(16).padStart(16, '0')}`
const message = (id, seq, role, content, turn) => ({ id, session_id: SESSION, seq, role, content, created_at: 1700000000 + seq, ...(turn ? { turn_id: turn } : {}) })
const store = {
  sessions: [{
    id: SESSION, title: 'Test chat', created_at: 1700000000, turns: [],
    messages: [
      message(ids.ask1, 1, 'user', 'Hello'), message(ids.ans1, 2, 'assistant', 'Hi there!', 'trn_00000000000000a1'),
      message(ids.ask2, 3, 'user', 'And tomorrow?'), message(ids.ans2, 4, 'assistant', 'Sunny.', 'trn_00000000000000a2'),
    ],
  }],
  nextId, contexts: new Map(),
}

const handle = createFakeChatAnswers(() => 1700000000000, status => { throw new Error(`HTTP ${status}`) }, store)
// The three reads of a branch and the model list belong to other screens' fixtures; this fake answers them.
const others = {
  [`/api/control/pi/sessions/${SESSION}/settings`]: { revision: 3, settings: {} },
  [`/api/control/pi/context/${SESSION}`]: { revision: 5, items: [] },
  [`/api/control/pi/context/${SESSION}/summary`]: { revision: 0, summary: null, versions: [] },
  '/api/control/pi/models/configuration': { revision: 1, configuration: { providers: [], models: [
    { id: 'model-1', name: 'Model 1', enabled: true, route: 'a' }, { id: 'model-2', name: 'Model 2', enabled: false, route: 'b' }, { id: 'model-3', name: 'Model 3', enabled: true, route: 'c' },
  ] } },
}
let requests = 0
const auth = {
  request: async (requestPath, options = {}) => {
    requests += 1
    const value = requestPath in others ? others[requestPath] : handle(requestPath, options.method ?? 'GET', { body: options.body })
    if (value === undefined) throw new Error('unhandled ' + requestPath)
    return structuredClone(value)
  },
}
const client = createChatAnswersClient(auth)

async function rejects(promise, expected) {
  let error
  try { await promise } catch (caught) { error = caught }
  assert.ok(error, 'expected a rejection')
  for (const [key, value] of Object.entries(expected)) assert.equal(error[key], value, `${key}: ${error[key]}`)
}

const failures = []
async function testCase(name, run) {
  try { await run(); console.log(`ok   ${name}`) } catch (error) { failures.push(name); console.log(`FAIL ${name}: ${error.message}`) }
}

async function main() {
  const roots = []
  await testCase('models() keeps only enabled models', async () => {
    assert.deepEqual(await client.models(), [{ id: 'model-1', name: 'Model 1' }, { id: 'model-3', name: 'Model 3' }])
  })

  await testCase('retry of a user message gives retry_unavailable', async () => {
    await rejects(client.retry(SESSION, ids.ask1, 'model-1'), { code: 'retry_unavailable' })
  })

  await testCase('family of an answer that was never retried gives not_found', async () => {
    await rejects(client.family(SESSION, ids.ans1), { code: 'not_found' })
  })

  await testCase('first retry creates a family of 2 and maps the receipt', async () => {
    const receipt = await client.retry(SESSION, ids.ans1, 'model-1')
    assert.equal(receipt.modelId, 'model-1')
    assert.equal(receipt.status, 'complete')
    assert.equal(receipt.replayed, false)
    assert.match(receipt.messageId, /^msg_[0-9a-f]{16}$/)
    assert.match(receipt.turnId, /^trn_[0-9a-f]{16}$/)
    assert.deepEqual(Object.keys(receipt).sort(), ['messageId', 'modelId', 'replayed', 'requestId', 'status', 'turnId'])
    const family = await client.family(SESSION, ids.ans1)
    assert.equal(family.rootId, ids.ans1)
    assert.equal(family.selectedId, receipt.messageId)
    assert.equal(family.revision, 1)
    assert.deepEqual(family.versions.map(v => v.messageId), [ids.ans1, receipt.messageId])
    assert.equal(family.versions[0].retryOf, null)
    assert.equal(family.versions[1].retryOf, ids.ans1)
    assert.match(family.versions[0].turnId, /^trn_[0-9a-f]{16}$/)
    roots.push(receipt.messageId)
    const added = store.sessions[0].messages.find(m => m.id === receipt.messageId)
    assert.equal(added.content, 'Another take from model-1: Hi there!')
    assert.equal(added.seq, 5)
  })

  await testCase('second retry makes a family of 3 sharing the root', async () => {
    const receipt = await client.retry(SESSION, roots[0], 'model-3')
    roots.push(receipt.messageId)
    const family = await client.family(SESSION, ids.ans1)
    assert.equal(family.versions.length, 3)
    assert.equal(family.rootId, ids.ans1)
    assert.equal(family.selectedId, receipt.messageId)
    assert.equal(family.revision, 2)
    for (const version of store.sessions[0].messages.filter(m => m.response_family)) assert.equal(version.response_family.root_message_id, ids.ans1)
    assert.equal(store.sessions[0].messages.filter(m => m.response_family).length, 3)
  })

  await testCase('retryStatus returns the receipt of a request', async () => {
    const receipt = await client.retry(SESSION, ids.ans2, 'model-1')
    const again = await client.retryStatus(SESSION, receipt.requestId)
    assert.equal(again.messageId, receipt.messageId)
    assert.equal(again.replayed, false)
    await rejects(client.retryStatus(SESSION, 'a'.repeat(20)), { code: 'not_found' })
  })

  await testCase('the same request id and body replays, another body is refused', async () => {
    const path = `/api/control/pi/sessions/${SESSION}/messages/${ids.ans1}/retry`
    const body = { request_id: 'replay-request-0001', model_id: 'model-1' }
    const first = handle(path, 'POST', { body }), second = handle(path, 'POST', { body })
    assert.equal(first.replayed, false)
    assert.equal(second.replayed, true)
    assert.equal(second.message.id, first.message.id)
    assert.throws(() => handle(path, 'POST', { body: { ...body, model_id: 'model-3' } }), { code: 'request_conflict' })
    // Take the extra version out again so the later cases count versions they know.
    const added = store.sessions[0].messages
    const index = added.findIndex(m => m.id === first.message.id)
    added.splice(index, 1)
    for (const m of added) if (m.response_family?.root_message_id === ids.ans1) m.response_family.selected_message_id = roots[1]
  })

  await testCase('select switches the selected version and bumps the revision', async () => {
    const before = await client.family(SESSION, ids.ans1)
    const updated = await client.select(SESSION, ids.ans1, ids.ans1, before.revision)
    assert.equal(updated.selectedId, ids.ans1)
    assert.equal(updated.revision, before.revision + 1)
    const same = await client.select(SESSION, ids.ans1, ids.ans1, updated.revision)
    assert.equal(same.revision, updated.revision)
  })

  await testCase('a stale select gives revision_conflict', async () => {
    await rejects(client.select(SESSION, ids.ans1, roots[0], 1), { code: 'revision_conflict' })
  })

  await testCase('selecting a message outside the family gives foreign_version', async () => {
    const family = await client.family(SESSION, ids.ans1)
    await rejects(client.select(SESSION, ids.ans1, ids.ans2, family.revision), { code: 'foreign_version' })
  })

  await testCase('forkBasis reads the three revisions and the summary', async () => {
    assert.deepEqual(await client.forkBasis(SESSION), { settingsRevision: 3, contextRevision: 5, reviewedSummary: null })
  })

  await testCase('fork from a later answer keeps one version per answer', async () => {
    await client.select(SESSION, ids.ans1, roots[1], (await client.family(SESSION, ids.ans1)).revision)
    const basis = await client.forkBasis(SESSION)
    const result = await client.fork(SESSION, ids.ans2, basis)
    assert.deepEqual(Object.keys(result), ['sessionId'])
    assert.notEqual(result.sessionId, SESSION)
    const branch = store.sessions.find(s => s.id === result.sessionId)
    assert.ok(branch, 'the new chat exists')
    assert.equal(branch.title, 'Test chat (branch)')
    assert.deepEqual(branch.messages.map(m => m.content), ['Hello', 'Another take from model-3: Another take from model-1: Hi there!', 'And tomorrow?', 'Sunny.'])
    assert.ok(branch.messages.every(m => m.session_id === result.sessionId && !m.response_family))
    assert.deepEqual(branch.messages.map(m => m.seq), [1, 2, 3, 4])
    assert.ok(branch.messages.every(m => ![...Object.values(ids), ...roots].includes(m.id)))
  })

  await testCase('fork from the first answer holds only the messages up to it', async () => {
    const result = await client.fork(SESSION, ids.ans1, await client.forkBasis(SESSION))
    const branch = store.sessions.find(s => s.id === result.sessionId)
    assert.deepEqual(branch.messages.map(m => m.content), ['Hello', 'Hi there!'])
  })

  await testCase('fork from a message of another chat gives foreign_message', async () => {
    await rejects(client.fork(SESSION, 'msg_00000000000000ff', { settingsRevision: 0, contextRevision: 0, reviewedSummary: null }), { code: 'foreign_message' })
  })

  await testCase('a retry in an unknown chat fails like any unknown chat', async () => {
    await rejects(client.retry('ses_9999999999999999', ids.ans1, 'model-1'), { message: 'HTTP 404' })
  })

  await testCase('malformed input is rejected before any request', async () => {
    const before = requests
    const bad = { kind: 'validation' }
    await rejects(client.family('invalid', ids.ans1), bad)
    await rejects(client.family(SESSION, 'invalid'), bad)
    await rejects(client.select(SESSION, ids.ans1, 'invalid', 1), bad)
    await rejects(client.select(SESSION, ids.ans1, ids.ans1, 0), bad)
    await rejects(client.retry(SESSION, 'invalid', 'model-1'), bad)
    await rejects(client.retry(SESSION, ids.ans1, ''), bad)
    await rejects(client.retry(SESSION, ids.ans1, 'x'.repeat(201)), bad)
    await rejects(client.retryStatus(SESSION, 'short'), bad)
    await rejects(client.fork(SESSION, 'invalid', { settingsRevision: 0, contextRevision: 0, reviewedSummary: null }), bad)
    await rejects(client.fork(SESSION, ids.ans1, { settingsRevision: -1, contextRevision: 0, reviewedSummary: null }), bad)
    await rejects(client.fork(SESSION, ids.ans1, { settingsRevision: 0, contextRevision: 0, reviewedSummary: 'x'.repeat(16001) }), bad)
    await rejects(client.forkBasis('invalid'), bad)
    assert.equal(requests, before, 'a bad input sent a request')
  })

  await testCase('malformed responses are rejected as invalid-response', async () => {
    const broken = value => createChatAnswersClient({ request: async () => value })
    const bad = { kind: 'invalid-response' }
    await rejects(broken({ root_message_id: 'x' }).family(SESSION, ids.ans1), bad)
    await rejects(broken({ root_message_id: ids.ans1, session_id: SESSION, selected_message_id: ids.ans1, revision: 1, versions: [], extra: true }).family(SESSION, ids.ans1), bad)
    const receipt = { request_id: 'r'.repeat(20), session_id: SESSION, source_message_id: ids.ans1, source_turn_id: 'trn_00000000000000a1', turn_id: 'trn_00000000000000a3', model_id: 'm', status: 'complete', input_message_id: null, replayed: false, message: null }
    assert.equal((await broken(receipt).retry(SESSION, ids.ans1, 'm')).messageId, null)
    await rejects(broken({ ...receipt, replayed: 'no' }).retry(SESSION, ids.ans1, 'm'), bad)
    await rejects(broken({ ...receipt, message: { content: 'no id' } }).retry(SESSION, ids.ans1, 'm'), bad)
    await rejects(broken({ session_id: SESSION }).fork(SESSION, ids.ans1, { settingsRevision: 0, contextRevision: 0, reviewedSummary: null }), bad)
    await rejects(broken({ revision: 'one' }).forkBasis(SESSION), bad)
    await rejects(broken({ configuration: { models: [{ id: 'a', name: 'A' }] } }).models(), bad)
    await rejects(broken({}).models(), bad)
  })

  if (failures.length) { console.error(`${failures.length} failed: ${failures.join('; ')}`); process.exit(1) }
  console.log('all cases passed')
}
main().catch(error => { console.error(error); process.exit(1) })
