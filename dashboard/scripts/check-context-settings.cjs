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

const { createChatContextClient } = load('src/lib/gateway/chat-context.ts')
const { createFakeChatContext } = load('src/dev/fake-gateway-chat-context.ts')
const { GatewayError } = load('src/lib/gateway/transport.ts')

const SES = 'ses_0000000000000001', OTHER = 'ses_0000000000000002'
const MSG1 = 'msg_0000000000000001', MSG2 = 'msg_0000000000000002', FOREIGN = 'msg_00000000000000ff'
const store = {
  sessions: [
    { id: SES, title: 'Test chat', created_at: 1, turns: [], messages: [
      { id: MSG1, session_id: SES, seq: 1, role: 'user', content: 'Hello', created_at: 1 },
      { id: MSG2, session_id: SES, seq: 2, role: 'assistant', content: 'Hi there', created_at: 2 },
    ] },
    { id: OTHER, title: 'Other chat', created_at: 1, turns: [], messages: [{ id: FOREIGN, session_id: OTHER, seq: 1, role: 'user', content: 'Hi', created_at: 1 }] },
  ],
  contexts: new Map(),
}
let clock = 1_700_000_000_000
const handle = createFakeChatContext(() => (clock += 1000), status => { throw new Error(`HTTP ${status}`) }, store)

let requests = 0
const auth = {
  request: async (requestPath, options = {}) => {
    requests++
    const value = handle(requestPath, options.method ?? 'GET', { body: options.body })
    if (value === undefined) throw new Error('unhandled ' + requestPath)
    return structuredClone(value)
  },
}
const client = createChatContextClient(auth)
const policy = { sessionInstructions: 'Answer briefly', messagePolicies: { [MSG1]: 'keep-exact', [MSG2]: 'exclude' }, budget: { contextWindowTokens: 128000, outputReserveTokens: 4096, otherInputTokens: 0 } }

async function rejects(promise, check) {
  try { await promise } catch (error) {
    assert.ok(error instanceof GatewayError, `expected GatewayError, got ${error}`)
    check(error)
    return
  }
  assert.fail('expected a rejection')
}
async function refusedBeforeRequest(promise) {
  const before = requests
  await rejects(promise, error => assert.equal(error.kind, 'validation'))
  assert.equal(requests, before, 'no request may be sent')
}
const pass = name => console.log(`ok - ${name}`)

async function main() {
  // Reading
  assert.deepEqual(await client.get(SES), { revision: 0, policy: null })
  assert.equal(store.contexts.size, 0, 'a read must not create settings')
  pass('a chat without settings reads { revision: 0, policy: null }')

  await rejects(client.get('ses_0000000000000009'), error => { assert.equal(error.kind, 'http'); assert.equal(error.status, 404); assert.equal(error.code, 'unavailable') })
  await rejects(client.items('ses_0000000000000009'), error => assert.equal(error.code, 'unavailable'))
  pass('an unknown chat is refused with unavailable (404)')

  // Saving
  const saved = await client.save(SES, policy, 0)
  assert.equal(saved.revision, 1)
  assert.deepEqual(saved.policy, policy)
  assert.deepEqual(await client.get(SES), { revision: 1, policy })
  assert.equal(store.contexts.get(SES).revision, 1, 'the shared store holds the policy')
  pass('save then get round-trips (camelCase policy, shared store)')

  const cleared = await client.save(SES, { ...policy, messagePolicies: {} }, 1)
  assert.equal(cleared.revision, 2)
  assert.deepEqual(cleared.policy.messagePolicies, {})
  assert.equal(cleared.policy.sessionInstructions, 'Answer briefly')
  pass('clearing the message rules keeps instructions and budget')

  await refusedBeforeRequest(client.save(SES, { ...policy, budget: { contextWindowTokens: 1000, outputReserveTokens: 1000, otherInputTokens: 0 } }, 2))
  await refusedBeforeRequest(client.save(SES, { ...policy, budget: { contextWindowTokens: 1000, outputReserveTokens: 2000, otherInputTokens: 0 } }, 2))
  pass('a reserve equal to or above the window is refused before a request')

  for (const budget of [
    { contextWindowTokens: 1, outputReserveTokens: 1, otherInputTokens: 0 },
    { contextWindowTokens: 10_000_001, outputReserveTokens: 1, otherInputTokens: 0 },
    { contextWindowTokens: 1000.5, outputReserveTokens: 10, otherInputTokens: 0 },
    { contextWindowTokens: 1000, outputReserveTokens: 0, otherInputTokens: 0 },
    { contextWindowTokens: 1000, outputReserveTokens: 10, otherInputTokens: -1 },
    { contextWindowTokens: 1000, outputReserveTokens: 10, otherInputTokens: 1.5 },
  ]) await refusedBeforeRequest(client.save(SES, { ...policy, budget }, 2))
  await refusedBeforeRequest(client.save(SES, { ...policy, sessionInstructions: 'x'.repeat(16001) }, 2))
  await refusedBeforeRequest(client.save(SES, { ...policy, messagePolicies: { [MSG1]: 'pin' } }, 2))
  await refusedBeforeRequest(client.save(SES, { ...policy, messagePolicies: { 'not-a-message': 'exclude' } }, 2))
  await refusedBeforeRequest(client.save(SES, policy, -1))
  pass('out-of-range budget, long instructions, unknown rules and bad message ids are refused before a request')

  await rejects(client.save(SES, policy, 1), error => { assert.equal(error.code, 'revision_conflict'); assert.equal(error.status, 409) })
  pass('a stale save gives revision_conflict')

  await rejects(client.save(SES, { ...policy, messagePolicies: { [FOREIGN]: 'keep-exact' } }, 2), error => { assert.equal(error.code, 'outside_boundary'); assert.equal(error.status, 422) })
  assert.equal((await client.get(SES)).revision, 2, 'a refused save changes nothing')
  pass('a rule on a message of another chat gives outside_boundary')

  // Items
  const first = await client.items(SES)
  assert.equal(first.revision, 0)
  assert.equal(first.items.length, 2)
  const [seedDecision, seedThread] = first.items
  assert.deepEqual([seedDecision.kind, seedDecision.author, seedDecision.state, seedDecision.text], ['decision', 'ai', 'active', 'Keep answers short unless asked for detail.'])
  assert.deepEqual([seedThread.kind, seedThread.author, seedThread.state, seedThread.text], ['thread', 'ai', 'open', 'Which city should the weather use?'])
  assert.match(seedDecision.id, /^dec_[0-9a-f]{16}$/)
  assert.match(seedThread.id, /^thr_[0-9a-f]{16}$/)
  assert.equal(typeof seedDecision.createdAt, 'number')
  assert.equal(typeof seedDecision.updatedAt, 'number')
  assert.equal('created_at' in seedDecision, false, 'the client maps snake_case to camelCase')
  assert.deepEqual(seedDecision.cites, [])
  assert.equal(seedDecision.replaces, null)
  pass('a chat is seeded with one AI decision and one open AI question; items are camelCase')

  const added = await client.addItem(SES, { kind: 'decision', text: '  Use metric units.  ' }, 0)
  assert.equal(added.revision, 1)
  assert.deepEqual([added.item.kind, added.item.author, added.item.state, added.item.text], ['decision', 'owner', 'active', 'Use metric units.'])
  assert.deepEqual(await client.setItemState(SES, added.item.id, 'withdrawn', 1), { revision: 2 })
  const afterWithdraw = await client.items(SES)
  assert.equal(afterWithdraw.revision, 2)
  assert.equal(afterWithdraw.items.find(item => item.id === added.item.id).state, 'withdrawn')
  pass('add then withdraw a decision')

  const question = await client.addItem(SES, { kind: 'thread', text: 'Which units?' }, 2)
  assert.equal(question.item.state, 'open')
  await client.setItemState(SES, question.item.id, 'resolved', 3)
  assert.equal((await client.items(SES)).items.find(item => item.id === question.item.id).state, 'resolved')
  pass('add then resolve an open question')

  await rejects(client.setItemState(SES, seedDecision.id, 'resolved', 4), error => { assert.equal(error.code, 'invalid_state'); assert.equal(error.status, 409) })
  await rejects(client.setItemState(SES, seedThread.id, 'active', 4), error => assert.equal(error.code, 'invalid_state'))
  pass('resolving a decision gives invalid_state')

  const replaced = await client.addItem(SES, { kind: 'decision', text: 'Keep answers detailed.', replaces: seedDecision.id }, 4)
  assert.equal(replaced.revision, 5)
  assert.equal(replaced.item.replaces, seedDecision.id)
  assert.equal((await client.items(SES)).items.find(item => item.id === seedDecision.id).state, 'superseded')
  await rejects(client.setItemState(SES, seedDecision.id, 'withdrawn', 5), error => assert.equal(error.code, 'superseded'))
  await rejects(client.addItem(SES, { kind: 'decision', text: 'Again', replaces: seedDecision.id }, 5), error => assert.equal(error.code, 'not_replaceable'))
  pass('replaces supersedes the old decision, which can no longer change or be replaced')

  await rejects(client.addItem(SES, { kind: 'thread', text: 'Late' }, 0), error => assert.equal(error.code, 'revision_conflict'))
  await rejects(client.setItemState(SES, seedThread.id, 'withdrawn', 0), error => assert.equal(error.code, 'revision_conflict'))
  await rejects(client.setItemState(SES, 'thr_00000000000000ee', 'withdrawn', 5), error => { assert.equal(error.code, 'not_found'); assert.equal(error.status, 404) })
  pass('stale item writes give revision_conflict; an unknown item gives not_found')

  // Input checks, all before any request
  await refusedBeforeRequest(client.get('invalid'))
  await refusedBeforeRequest(client.items('ses_xyz'))
  await refusedBeforeRequest(client.save('invalid', policy, 0))
  await refusedBeforeRequest(client.addItem('invalid', { kind: 'decision', text: 'x' }, 0))
  await refusedBeforeRequest(client.setItemState('invalid', seedThread.id, 'withdrawn', 0))
  await refusedBeforeRequest(client.setItemState(SES, 'dec_short', 'withdrawn', 0))
  await refusedBeforeRequest(client.setItemState(SES, seedThread.id, 'superseded', 0))
  await refusedBeforeRequest(client.addItem(SES, { kind: 'decision', text: '   ' }, 5))
  await refusedBeforeRequest(client.addItem(SES, { kind: 'decision', text: 'x'.repeat(501) }, 5))
  await refusedBeforeRequest(client.addItem(SES, { kind: 'decision', text: 'a\tb' }, 5))
  await refusedBeforeRequest(client.addItem(SES, { kind: 'decision', text: 'a\u0008b' }, 5))
  await refusedBeforeRequest(client.addItem(SES, { kind: 'decision', text: 'a\u0000b' }, 5))
  await refusedBeforeRequest(client.addItem(SES, { kind: 'decision', text: 'ok', replaces: 'bogus' }, 5))
  await refusedBeforeRequest(client.addItem(SES, { kind: 'thread', text: 'ok', replaces: seedDecision.id }, 5))
  await refusedBeforeRequest(client.addItem(SES, { kind: 'idea', text: 'ok' }, 5))
  const multiline = await client.addItem(SES, { kind: 'decision', text: 'Line one\nline two' }, 5)
  assert.equal(multiline.item.text, 'Line one\nline two')
  assert.equal((await client.addItem(SES, { kind: 'decision', text: 'x'.repeat(500) }, 6)).revision, 7)
  pass('malformed ids, text, kinds and states are refused before a request; a line feed and 500 characters are allowed')

  // Malformed responses
  const answering = reply => createChatContextClient({ request: async () => structuredClone(reply) })
  const item = { id: 'dec_0000000000000001', kind: 'decision', text: 'Text', author: 'owner', cites: [], state: 'active', replaces: null, created_at: 1, updated_at: 1 }
  const wire = { sessionInstructions: '', messagePolicies: {}, budget: { contextWindowTokens: 100, outputReserveTokens: 10, otherInputTokens: 0 } }
  const invalid = promise => rejects(promise, error => assert.equal(error.kind, 'invalid-response'))
  const itemId = 'dec_0000000000000001'
  await invalid(answering({ revision: 1, policy: { session_instructions: '', message_policies: {}, budget: {} } }).get(SES))
  await invalid(answering({ revision: 1, policy: { ...wire, extra: true } }).get(SES))
  await invalid(answering({ revision: 1, policy: { ...wire, budget: { ...wire.budget, outputReserveTokens: 100 } } }).get(SES))
  await invalid(answering({ revision: 1, policy: { ...wire, messagePolicies: { [MSG1]: 'pin' } } }).get(SES))
  await invalid(answering({ revision: 'one', policy: null }).get(SES))
  await invalid(answering({ revision: 1, policy: null }).save(SES, policy, 0))
  await invalid(answering({ revision: 1, items: [{ ...item, created_at: undefined }] }).items(SES))
  await invalid(answering({ revision: 1, items: [{ ...item, createdAt: 1 }] }).items(SES))
  await invalid(answering({ revision: 1, items: [{ ...item, state: 'done' }] }).items(SES))
  await invalid(answering({ revision: 1, item: { ...item, id: 'xyz' } }).addItem(SES, { kind: 'decision', text: 'x' }, 0))
  await invalid(answering({ revision: 1 }).setItemState(SES, itemId, 'withdrawn', 0).then(() => answering({ revision: 1, extra: 1 }).setItemState(SES, itemId, 'withdrawn', 0)))
  assert.deepEqual(await answering({ revision: 1, policy: wire }).get(SES), { revision: 1, policy: wire })
  assert.deepEqual(await answering({ revision: 4 }).setItemState(SES, itemId, 'withdrawn', 0), { revision: 4 })
  pass('responses with a wrong shape, snake_case policy, extra fields or bad values give invalid-response')

  console.log('Context settings: all cases passed')
}

main().catch(error => { console.error(error); process.exit(1) })
