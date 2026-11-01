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

const { createChatReviewsClient } = load('src/lib/gateway/chat-reviews.ts')
const { createFakeChatReviews } = load('src/dev/fake-gateway-chat-reviews.ts')
const { GatewayError } = load('src/lib/gateway/transport.ts')
assert.equal(typeof createChatReviewsClient, 'function')
assert.equal(typeof createFakeChatReviews, 'function')
console.log('Answer reviews: client and preview fixture load.')

const id = (prefix, n) => `${prefix}_${n.toString(16).padStart(16, '0')}`
const A = id('ses', 1), B = id('ses', 2), user = id('msg', 1)
const v1 = id('msg', 2), v2 = id('msg', 3), v3 = id('msg', 4), foreign = id('msg', 9), single = id('msg', 6), shortId = id('msg', 7)
const family = (root, selected, retryOf, revision) => ({ root_message_id: root, retry_of: retryOf, selected_message_id: selected, revision })
const text = 'Sunlight scatters in the air. Blue scatters the most. Sunsets look red because the light crosses more air.'
const clock = { time: 1_700_000_000_000 }
const now = () => clock.time
const fail = status => { throw new GatewayError('http', status) }
const store = {
  sessions: [
    { id: A, title: 'Three versions', created_at: 1, turns: [], messages: [
      { id: user, session_id: A, seq: 1, role: 'user', content: 'Why is the sky blue?', created_at: 1 },
      { id: v1, session_id: A, seq: 2, role: 'assistant', content: 'Short answer about air and light, nothing more.', created_at: 2, response_family: family(v1, v3, null, 1) },
      { id: v2, session_id: A, seq: 3, role: 'assistant', content: text, created_at: 3, response_family: family(v1, v3, v1, 2) },
      { id: v3, session_id: A, seq: 4, role: 'assistant', content: `${text} Violet scatters even more, but our eyes see it poorly.`, created_at: 4, response_family: family(v1, v3, v2, 3) },
      { id: foreign, session_id: A, seq: 5, role: 'assistant', content: 'An answer that was never retried, so it has no family.', created_at: 5 },
    ] },
    { id: B, title: 'One version', created_at: 1, turns: [], messages: [
      { id: single, session_id: B, seq: 1, role: 'assistant', content: text, created_at: 2, response_family: family(single, single, null, 1) },
      { id: shortId, session_id: B, seq: 2, role: 'assistant', content: 'Too short.', created_at: 3 },
    ] },
  ],
  nextId: prefix => id(prefix, 1000),
  contexts: new Map(),
}

const handle = createFakeChatReviews(now, fail, store)
let requests = 0
const call = (path, options = {}) => {
  requests++
  const value = handle(path, options.method ?? 'GET', { body: options.body })
  if (value === undefined) throw new Error('unhandled ' + path)
  return structuredClone(value)
}
const auth = { request: async (path, options = {}) => call(path, options) }
const client = createChatReviewsClient(auth)
const urls = { judge: (s, r) => `/api/control/pi/sessions/${s}/response-families/${r}/judge`, vote: (s, r) => `/api/control/pi/sessions/${s}/response-families/${r}/vote`, check: (s, m) => `/api/control/pi/sessions/${s}/messages/${m}/fact-check` }

async function refused(promise, kind, code) {
  try { await promise } catch (error) {
    assert.ok(error instanceof GatewayError, `a GatewayError, got ${error}`)
    assert.equal(error.kind, kind)
    if (code) assert.equal(error.code, code)
    return
  }
  assert.fail(`should have been refused as ${kind}${code ? ` ${code}` : ''}`)
}
async function noRequest(promise, kind) {
  const before = requests
  await refused(promise, kind)
  assert.equal(requests, before, 'no request was sent')
}
const withReply = (change) => createChatReviewsClient({ request: async (path, options = {}) => change(call(path, options), path) })

let cases = 0
async function check(name, run) { await run(); cases++; console.log(`ok  ${name}`) }

async function main() {
  await check('the fixture answers in Pi shapes (snake_case ids and times)', async () => {
    const raw = call(urls.judge(A, v1), { method: 'POST', body: { request_id: 'shape-check-request-1' } })
    assert.deepEqual(Object.keys(raw).sort(), ['created_at', 'excluded', 'judgeModelId', 'replayed', 'request_id', 'rubric', 'scores', 'winner'])
    assert.deepEqual(Object.keys(raw.scores[0]).sort(), ['message_id', 'reason', 'score'])
    assert.equal(raw.created_at, clock.time / 1000)
    const voted = call(urls.vote(A, v1), { method: 'POST', body: { message_id: v2, vote: 'up' } })
    assert.deepEqual(Object.keys(voted).sort(), ['root_message_id', 'votes'])
    call(urls.vote(A, v1), { method: 'POST', body: { message_id: v2, vote: 'clear' } })
    const checked = call(urls.check(A, v2), { method: 'POST', body: { request_id: 'shape-check-request-2' } })
    assert.deepEqual(Object.keys(checked).sort(), ['claims', 'counts', 'created_at', 'message_id', 'modelId', 'replayed', 'request_id', 'sources', 'sourcesTruncated'])
    assert.deepEqual(Object.keys(checked.counts).sort(), ['contradicted', 'no-source', 'supported'])
  })

  await check('judge: three versions give three scores and a winner among them, in camelCase', async () => {
    const result = await client.judge(A, v1)
    assert.deepEqual(result.scores.map(item => item.messageId), [v1, v2, v3])
    assert.ok(result.scores.every(item => Number.isInteger(item.score) && item.score >= 1 && item.score <= 10 && item.reason.length > 0))
    assert.ok(result.scores.some(item => item.messageId === result.winner))
    assert.equal(result.winner, result.scores.reduce((best, item) => item.score > best.score ? item : best).messageId)
    assert.deepEqual(result.excluded, [])
    assert.equal(result.createdAt, clock.time / 1000)
    assert.equal(result.rubric, '')
    assert.ok(!('replayed' in result) && !('request_id' in result))
  })

  await check('judge: the model and rubric are sent only when given', async () => {
    const sent = []
    const spy = createChatReviewsClient({ request: async (path, options = {}) => { sent.push(options.body); return call(path, options) } })
    await spy.judge(A, v1)
    await spy.judge(A, v1, { modelId: null })
    const result = await spy.judge(A, v1, { modelId: 'model-x', rubric: 'Prefer short answers.' })
    assert.deepEqual(Object.keys(sent[0]), ['request_id'])
    assert.deepEqual(Object.keys(sent[1]), ['request_id'])
    assert.deepEqual(Object.keys(sent[2]).sort(), ['model_id', 'request_id', 'rubric'])
    assert.equal(result.judgeModelId, 'model-x')
    assert.equal(result.rubric, 'Prefer short answers.')
    assert.equal(new Set(sent.map(item => item.request_id)).size, 3, 'every call has its own request id')
  })

  await check('judgements: newest first', async () => {
    const results = await client.judgements(A, v1)
    assert.ok(results.length >= 2)
    assert.equal(results[0].rubric, 'Prefer short answers.')
    assert.equal(results[0].judgeModelId, 'model-x')
    assert.ok(results.every(item => Array.isArray(item.scores) && typeof item.requestId === 'string'))
  })

  await check('judge: a single-version family gives too_few', async () => {
    await refused(client.judge(B, single), 'http', 'too_few')
  })

  await check('judge: an unknown family is not_found', async () => {
    await refused(client.judge(A, foreign), 'http')
    await refused(client.judgements(A, foreign), 'http')
  })

  await check('judge: the same request id replays; other values with it are refused', async () => {
    const body = { request_id: 'replay-request-id-001', rubric: 'Be strict.' }
    const first = call(urls.judge(A, v1), { method: 'POST', body })
    const second = call(urls.judge(A, v1), { method: 'POST', body })
    assert.equal(first.replayed, false)
    assert.equal(second.replayed, true)
    assert.deepEqual({ ...second, replayed: false }, first)
    await refused(Promise.resolve().then(() => call(urls.judge(A, v1), { method: 'POST', body: { ...body, rubric: 'Other.' } })), 'http', 'request_conflict')
  })

  await check('judge: a bad body is Pi\'s plain 422', async () => {
    for (const body of [{}, { request_id: 'short' }, { request_id: 'valid-request-id-0001', extra: 1 }, { request_id: 'valid-request-id-0001', rubric: 'x'.repeat(2001) }, { request_id: 'valid-request-id-0001', model_id: '' }]) {
      await refused(Promise.resolve().then(() => call(urls.judge(A, v1), { method: 'POST', body })), 'http')
    }
  })

  await check('votes: up, down, clear and back to empty', async () => {
    assert.deepEqual(await client.votes(A, v1), {})
    assert.deepEqual(await client.vote(A, v1, v2, 'up'), { [v2]: 'up' })
    assert.deepEqual(await client.vote(A, v1, v3, 'down'), { [v2]: 'up', [v3]: 'down' })
    assert.deepEqual(await client.votes(A, v1), { [v2]: 'up', [v3]: 'down' })
    await client.vote(A, v1, v2, 'clear')
    assert.deepEqual(await client.vote(A, v1, v3, 'clear'), {})
  })

  await check('votes: winner then winner on another version leaves one winner and demotes the first to up', async () => {
    await client.vote(A, v1, v2, 'winner')
    const result = await client.vote(A, v1, v3, 'winner')
    assert.deepEqual(result, { [v2]: 'up', [v3]: 'winner' })
    assert.equal(Object.values(result).filter(item => item === 'winner').length, 1)
    assert.deepEqual(await client.votes(A, v1), result)
  })

  await check('votes: a message outside the family is not_a_version', async () => {
    await refused(client.vote(A, v1, foreign, 'up'), 'http', 'not_a_version')
    await refused(client.vote(A, v1, id('msg', 99), 'up'), 'http', 'not_a_version')
    await refused(client.votes(A, foreign), 'http')
  })

  await check('votes: keys of the reply are message ids', async () => {
    const wrong = withReply(value => ({ ...value, votes: { 'not a message id': 'up' } }))
    await refused(wrong.votes(A, v1), 'invalid-response')
    await refused(wrong.vote(A, v1, v2, 'up'), 'invalid-response')
    const unknownVote = withReply(value => ({ ...value, votes: { [v2]: 'maybe' } }))
    await refused(unknownVote.votes(A, v1), 'invalid-response')
  })

  await check('fact check: counts match the claims; marks, sources and camelCase fields come through', async () => {
    const result = await client.factCheck(A, v3)
    assert.equal(result.messageId, v3)
    assert.equal(result.claims.length, 3)
    assert.deepEqual(result.claims.map(item => item.mark), ['supported', 'no-source', 'contradicted'])
    const count = mark => result.claims.filter(item => item.mark === mark).length
    assert.deepEqual(result.counts, { supported: count('supported'), contradicted: count('contradicted'), noSource: count('no-source') })
    assert.ok(result.claims.every(item => item.mark === 'no-source' ? item.sources.length === 0 : item.sources.length >= 1))
    assert.deepEqual(result.sources, [{ id: 'cite:preview-1', title: 'Preview source', url: 'https://example.com/' }])
    assert.equal(result.sourcesTruncated, false)
    assert.equal(result.createdAt, clock.time / 1000)
    assert.ok(!('replayed' in result) && !('request_id' in result) && !('created_at' in result))
  })

  await check('fact checks: newest first, kept per answer', async () => {
    clock.time += 1000
    const again = await client.factCheck(A, v3, 'model-y')
    const results = await client.factChecks(A, v3)
    assert.equal(results.length, 2)
    assert.equal(results[0].requestId, again.requestId)
    assert.equal(results[0].modelId, 'model-y')
    assert.deepEqual(await client.factChecks(A, foreign), [])
  })

  await check('fact check: a short answer gives no_sources', async () => {
    await refused(client.factCheck(B, shortId), 'http', 'no_sources')
  })

  await check('fact check: a user message or an unknown message is not_found', async () => {
    await refused(client.factCheck(A, user), 'http')
    await refused(client.factCheck(A, id('msg', 99)), 'http')
    await refused(client.factChecks(A, user), 'http')
  })

  await check('validation: bad input is refused before any request', async () => {
    const bad = [
      client.judge('ses_1', v1), client.judge(A, 'msg_1'), client.judge(A, v1, { rubric: 'x'.repeat(2001) }), client.judge(A, v1, { modelId: '' }),
      client.judgements('nope', v1), client.judgements(A, ''),
      client.vote(A, v1, 'msg_x', 'up'), client.vote(A, v1, v2, 'sideways'), client.vote(A, '', v2, 'up'), client.vote('x', v1, v2, 'up'),
      client.votes('x', v1), client.votes(A, 'x'),
      client.factCheck('x', v2), client.factCheck(A, 'x'), client.factCheck(A, v2, ''),
      client.factChecks('x', v2), client.factChecks(A, 'x'),
    ]
    for (const promise of bad) { promise.catch(() => {}) }
    const before = requests
    for (const promise of bad) await refused(promise, 'validation')
    assert.equal(requests, before, 'client-side validation sent no request')
    // The same checks one at a time, so each one proves that it alone sent nothing.
    await noRequest(client.judge(A, v1, { rubric: 'x'.repeat(2001) }), 'validation')
    await noRequest(client.vote(A, v1, v2, 'sideways'), 'validation')
    await noRequest(client.factCheck(A, 'msg_zz'), 'validation')
    // The longest allowed rubric is sent.
    await client.judge(A, v1, { rubric: 'x'.repeat(2000) })
  })

  await check('invalid response: replies that break the shape are rejected', async () => {
    const camel = withReply(value => ({ ...value, requestId: value.request_id, request_id: undefined }))
    await refused(camel.judge(A, v1), 'invalid-response')
    const score = withReply(value => ({ ...value, scores: value.scores.map(item => ({ ...item, score: 11 })) }))
    await refused(score.judge(A, v1), 'invalid-response')
    const winner = withReply(value => ({ ...value, winner: 'nobody' }))
    await refused(winner.judge(A, v1), 'invalid-response')
    const extra = withReply(value => ({ ...value, unexpected: true }))
    await refused(extra.judge(A, v1), 'invalid-response')
    await refused(extra.judgements(A, v1), 'invalid-response')
    const list = withReply(value => ({ results: [{ ...value.results[0], created_at: 'yesterday' }] }))
    await refused(list.judgements(A, v1), 'invalid-response')
    const counts = withReply(value => ({ ...value, counts: { supported: 1, contradicted: 0, noSource: 0 } }))
    await refused(counts.factCheck(A, v3), 'invalid-response')
    const mark = withReply(value => ({ ...value, claims: value.claims.map(item => ({ ...item, mark: 'true' })) }))
    await refused(mark.factCheck(A, v3), 'invalid-response')
    const results = withReply(() => ({ results: [{}] }))
    await refused(results.factChecks(A, v3), 'invalid-response')
  })

  await check('preview data: a fresh store gets one answer with several versions', async () => {
    const fresh = { sessions: [{ id: A, title: 'Sky', created_at: 1, turns: [], messages: [
      { id: user, session_id: A, seq: 1, role: 'user', content: 'Why?', created_at: 1 },
      { id: v1, session_id: A, seq: 2, role: 'assistant', content: text, created_at: 2 },
    ] }], nextId: (() => { let n = 100; return prefix => id(prefix, n++) })(), contexts: new Map() }
    createFakeChatReviews(now, fail, fresh)
    const versions = fresh.sessions[0].messages.filter(item => item.response_family)
    assert.equal(versions.length, 3)
    assert.ok(versions.every(item => item.response_family.root_message_id === v1 && item.response_family.selected_message_id === versions[2].id))
  })

  console.log(`Answer reviews: ${cases} cases passed.`)
}

main().catch(error => { console.error(error); process.exit(1) })
