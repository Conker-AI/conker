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

const { createChatSummaryClient } = load('src/lib/gateway/chat-summary.ts')
const { createFakeChatSummary } = load('src/dev/fake-gateway-chat-summary.ts')
const { GatewayError } = load('src/lib/gateway/transport.ts')

assert.equal(typeof createChatSummaryClient, 'function')
assert.equal(typeof createFakeChatSummary, 'function')

const A = 'ses_1111111111111111', B = 'ses_2222222222222222'
const M = n => `msg_${String(n).repeat(16)}`
const message = (session, n, role, content) => ({ id: M(n), session_id: session, seq: n, role, content, created_at: 1640995200 + n })
let counter = 0x100
const store = {
  sessions: [
    { id: A, title: 'Test Chat', created_at: 1640995200, turns: [], messages: [message(A, 1, 'user', 'Hello there my friend how are you today'), message(A, 2, 'assistant', 'Hi there!'), message(A, 3, 'user', 'How are you?'), message(A, 4, 'assistant', 'Fine')] },
    { id: B, title: 'Short Chat', created_at: 1640995500, turns: [], messages: [message(B, 5, 'user', 'Hi'), message(B, 6, 'assistant', 'Hello')] },
  ],
  nextId: prefix => `${prefix}_${(counter++).toString(16).padStart(16, '0')}`,
  contexts: new Map(),
}
const now = () => Date.now() / 1000
const fail = status => { throw new Error(`HTTP ${status}`) }
const handle = createFakeChatSummary(now, fail, store)
const raw = (sessionId, tail, method = 'GET', body) => handle(`/api/control/pi/context/${sessionId}${tail}`, method, { body })

let requests = 0, override
const auth = {
  request: async (requestPath, options = {}) => {
    requests++
    const value = handle(requestPath, options.method ?? 'GET', { body: options.body })
    if (value === undefined) throw new Error('unhandled ' + requestPath)
    return structuredClone(override ? override(requestPath, value) : value)
  },
}
const client = createChatSummaryClient(auth)

async function rejects(work, expected, label, sent) {
  requests = 0
  let error
  try { await work() } catch (caught) { error = caught }
  assert.ok(error, `${label}: should have thrown`)
  assert.ok(error instanceof GatewayError, `${label}: GatewayError`)
  for (const [key, value] of Object.entries(expected)) assert.equal(error[key], value, `${label}: ${key}`)
  assert.equal(requests, sent, `${label}: requests sent`)
  console.log(`ok  ${label}`)
}

async function main() {
  console.log('Context summary: client and preview fixture load.')

  // Validation happens before any request.
  await rejects(() => client.summary('bad_id'), { kind: 'validation' }, 'bad session id rejected before any request', 0)
  await rejects(() => client.save(A, 'x'.repeat(16001), 0), { kind: 'validation' }, 'summary over 16000 characters rejected', 0)
  await rejects(() => client.draft(A, 'x'.repeat(501)), { kind: 'validation' }, 'focus over 500 characters rejected', 0)
  await rejects(() => client.compact(A, { policyRevision: 1, summaryRevision: 0, summary: 'S', covers: [] }), { kind: 'validation' }, 'compact with no covers rejected', 0)
  await rejects(() => client.compact(A, { policyRevision: 1, summaryRevision: 0, summary: 'S', covers: [M(1), M(1)] }), { kind: 'validation' }, 'compact with duplicate covers rejected', 0)
  await rejects(() => client.compact(A, { policyRevision: 1, summaryRevision: 0, summary: 'S', covers: ['nope'] }), { kind: 'validation' }, 'compact with a bad message id rejected', 0)
  await rejects(() => client.fork(A, { policyRevision: 1, lastMessageId: 'nope', summary: '' }), { kind: 'validation' }, 'fork with a bad message id rejected', 0)

  // Empty summary: Pi's snake_case on the wire, camelCase in the client.
  assert.deepEqual(Object.keys(raw(A, '/summary')).sort(), ['revision', 'source_session_id', 'summary', 'versions'])
  assert.deepEqual(await client.summary(A), { revision: 0, summary: null, sourceSessionId: null, versions: [] })
  console.log('ok  empty summary')

  assert.equal(await client.policyRevision(A), 0)
  console.log('ok  policy revision is 0 without context settings')

  // Save; versions are newest first and mapped to camelCase.
  const saved = await client.save(A, 'First', 0)
  assert.equal(saved.revision, 1)
  assert.equal(saved.summary, 'First')
  assert.equal(saved.versions[0].sourceSessionId, null)
  assert.equal(saved.versions[0].restoredFrom, null)
  assert.equal(typeof saved.versions[0].createdAt, 'number')
  const wire = raw(A, '/summary')
  assert.ok(wire.versions[0].created_at > 1e9 && wire.versions[0].created_at < 1e11, 'created_at is in seconds')
  assert.deepEqual(Object.keys(wire.versions[0]).sort(), ['created_at', 'restored_from', 'revision', 'source_session_id', 'summary'])
  const second = await client.save(A, 'Second', 1)
  assert.deepEqual(second.versions.map(version => version.revision), [2, 1], 'versions are newest first')
  assert.equal(second.versions[0].summary, 'Second')
  console.log('ok  save appends versions, newest first')

  await rejects(() => client.save(A, 'Late', 1), { kind: 'http', code: 'revision_conflict' }, 'stale save gives revision_conflict', 1)

  // Restore appends a version with restoredFrom.
  const restored = await client.restore(A, 1, 2)
  assert.equal(restored.revision, 3)
  assert.equal(restored.summary, 'First')
  assert.equal(restored.versions[0].restoredFrom, 1)
  assert.deepEqual(restored.versions.map(version => version.revision), [3, 2, 1])
  console.log('ok  restore appends a version with restoredFrom')
  await rejects(() => client.restore(A, 9, 3), { code: 'missing_revision' }, 'restore of an unknown version gives missing_revision', 1)
  await rejects(() => client.restore(A, 1, 2), { code: 'revision_conflict' }, 'stale restore gives revision_conflict', 1)

  // Draft.
  const draft = await client.draft(A)
  assert.ok(draft.summary.startsWith('Preview summary: '))
  assert.deepEqual(draft.messageIds, [M(1), M(2)], 'the last two messages are not read')
  assert.equal(draft.modelId, 'preview-summary')
  assert.equal(draft.summaryRevision, 3)
  assert.equal(draft.truncated, false)
  assert.equal((await client.draft(A, 'focus on dates')).messageIds.length, 2)
  console.log('ok  draft reads all but the last two messages')
  await rejects(() => client.draft(B), { code: 'empty' }, 'draft on a two-message chat gives empty', 1)

  // Compaction record; compact needs context settings.
  assert.deepEqual(await client.compaction(A), { summaryRevision: 0, covered: [], folded: [] })
  console.log('ok  compaction record starts empty')
  await rejects(() => client.compact(A, { policyRevision: 1, summaryRevision: 3, summary: draft.summary, covers: draft.messageIds }), { code: 'no_settings' }, 'compact without a policy gives no_settings', 1)

  const policy = { sessionInstructions: '', messagePolicies: {}, budget: { contextWindowTokens: 128000, outputReserveTokens: 4096, otherInputTokens: 0 } }
  store.contexts.set(A, { revision: 1, policy })
  assert.equal(await client.policyRevision(A), 1)
  await rejects(() => client.compact(A, { policyRevision: 5, summaryRevision: 3, summary: 'S', covers: [M(1)] }), { code: 'revision_conflict' }, 'compact with a stale policy gives revision_conflict', 1)
  await rejects(() => client.compact(A, { policyRevision: 1, summaryRevision: 0, summary: 'S', covers: [M(1)] }), { code: 'revision_conflict' }, 'compact with a stale summary gives revision_conflict', 1)
  await rejects(() => client.compact(A, { policyRevision: 1, summaryRevision: 3, summary: 'S', covers: [M(7)] }), { code: 'outside_boundary' }, 'compact outside the chat gives outside_boundary', 1)

  const compact = await client.compact(A, { policyRevision: 1, summaryRevision: 3, summary: draft.summary, covers: draft.messageIds })
  assert.deepEqual(compact, { policyRevision: 2, summaryRevision: 4, covered: [M(1), M(2)], folded: [M(1), M(2)] })
  const context = store.contexts.get(A)
  assert.equal(context.revision, 2)
  assert.equal(context.policy.messagePolicies[M(1)], 'allow-summary')
  assert.equal(context.policy.messagePolicies[M(2)], 'allow-summary')
  assert.deepEqual(policy.messagePolicies, {}, 'the original policy object is not mutated')
  assert.deepEqual(await client.compaction(A), { summaryRevision: 4, covered: [M(1), M(2)], folded: [M(1), M(2)] })
  const afterCompact = await client.summary(A)
  assert.equal(afterCompact.revision, 4)
  assert.equal(afterCompact.summary, draft.summary)
  assert.deepEqual(afterCompact.versions.map(version => version.revision), [4, 3, 2, 1])
  console.log('ok  compact folds the draft messages, bumps both revisions and records the compaction')

  // Fork.
  await rejects(() => client.fork(A, { policyRevision: 1, lastMessageId: M(4), summary: 'S' }), { code: 'revision_conflict' }, 'fork with a stale policy gives revision_conflict', 1)
  await rejects(() => client.fork(A, { policyRevision: 2, lastMessageId: M(3), summary: 'S' }), { code: 'boundary_changed' }, 'fork with a stale last message gives boundary_changed', 1)
  await rejects(() => client.fork(B, { policyRevision: 1, lastMessageId: M(6), summary: 'S' }), { code: 'revision_conflict' }, 'fork without context settings gives revision_conflict', 1)
  const sessionsBefore = store.sessions.length
  const wireFork = raw(A, '/fork', 'POST', { expected_revision: 2, expected_last_message_id: M(4), summary: 'Carry on', request_id: 'a'.repeat(20) })
  assert.deepEqual(Object.keys(wireFork).sort(), ['parent_id', 'replayed', 'session_id'])
  assert.equal(wireFork.parent_id, A)
  assert.equal(store.sessions.length, sessionsBefore + 1)
  const forked = await client.fork(A, { policyRevision: 2, lastMessageId: M(4), summary: 'Carry on from here' })
  assert.deepEqual(Object.keys(forked), ['sessionId'])
  assert.match(forked.sessionId, /^ses_[0-9a-f]{16}$/)
  const child = store.sessions.find(item => item.id === forked.sessionId)
  assert.equal(child.title, 'Test Chat (continued)')
  assert.equal(child.messages.length, 0)
  const childSummary = await client.summary(forked.sessionId)
  assert.equal(childSummary.summary, 'Carry on from here')
  assert.equal(childSummary.sourceSessionId, A)
  assert.equal(childSummary.versions.length, 1)
  console.log('ok  fork starts a new chat from the summary')

  // Unknown chat is a coded refusal.
  await rejects(() => client.summary('ses_ffffffffffffffff'), { kind: 'http', status: 404, code: 'unavailable' }, 'unknown chat gives unavailable', 1)

  // Malformed responses.
  override = (requestPath, value) => requestPath.endsWith('/summary') ? { ...value, extra: 1 } : value
  await rejects(() => client.summary(A), { kind: 'invalid-response' }, 'summary with an unknown field rejected', 1)
  override = (requestPath, value) => requestPath.endsWith('/summary') ? { ...value, versions: value.versions.map(({ created_at, ...rest }) => rest) } : value
  await rejects(() => client.summary(A), { kind: 'invalid-response' }, 'summary version without created_at rejected', 1)
  override = (requestPath, value) => requestPath.endsWith('/summary') ? { ...value, versions: value.versions.map(version => ({ ...version, sourceSessionId: null })) } : value
  await rejects(() => client.summary(A), { kind: 'invalid-response' }, 'camelCase summary response rejected (Pi sends snake_case)', 1)
  override = (requestPath, value) => requestPath.endsWith('/draft') ? { ...value, messageIds: ['x'] } : value
  await rejects(() => client.draft(A), { kind: 'invalid-response' }, 'draft with a bad message id rejected', 1)
  override = (requestPath, value) => requestPath.endsWith('/fork') ? { sessionId: value.session_id, parentId: value.parent_id, replayed: false } : value
  await rejects(() => client.fork(A, { policyRevision: 2, lastMessageId: M(4), summary: '' }), { kind: 'invalid-response' }, 'camelCase fork response rejected (Pi sends snake_case)', 1)
  override = undefined

  console.log('Context summary: all checks passed.')
}

main().catch(error => { console.error(error); process.exit(1) })
