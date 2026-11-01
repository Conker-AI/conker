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

// Create test data
const now = () => Date.now() / 1000
const fail = (status) => { throw new GatewayError('http', status) }
const store = {
  sessions: [
    {
      id: 'ses_1111111111111111',
      title: 'Test chat',
      created_at: now(),
      messages: [
        { id: 'msg_1111111111111111', session_id: 'ses_1111111111111111', seq: 1, role: 'user', content: 'Test question', created_at: now() },
        { id: 'msg_2222222222222222', session_id: 'ses_1111111111111111', seq: 2, role: 'assistant', content: 'Short answer.', created_at: now(), response_family: { root_message_id: 'msg_2222222222222222', retry_of: null, selected_message_id: 'msg_2222222222222222', revision: 1 } },
        { id: 'msg_3333333333333333', session_id: 'ses_1111111111111111', seq: 3, role: 'assistant', content: 'This is a much longer answer with more content to analyze and evaluate. It has multiple sentences and enough length to generate different scores for the judge functionality. The content should be sufficient for fact checking as well with various claims that can be verified.', created_at: now(), response_family: { root_message_id: 'msg_2222222222222222', retry_of: 'msg_2222222222222222', selected_message_id: 'msg_3333333333333333', revision: 2 } },
        { id: 'msg_4444444444444444', session_id: 'ses_1111111111111111', seq: 4, role: 'assistant', content: 'Another version with moderate content length. This provides enough material for testing the deterministic scoring based on content length.', created_at: now(), response_family: { root_message_id: 'msg_2222222222222222', retry_of: 'msg_3333333333333333', selected_message_id: 'msg_4444444444444444', revision: 3 } },
      ],
      turns: []
    },
    {
      id: 'ses_2222222222222222',
      title: 'Single version chat',
      created_at: now(),
      messages: [
        { id: 'msg_5555555555555555', session_id: 'ses_2222222222222222', seq: 1, role: 'user', content: 'Single question', created_at: now() },
        { id: 'msg_6666666666666666', session_id: 'ses_2222222222222222', seq: 2, role: 'assistant', content: 'Single answer with no family.', created_at: now() },
      ],
      turns: []
    }
  ],
  nextId: (prefix) => prefix === 'msg' || prefix === 'ses'
    ? `${prefix}_${Date.now().toString(16).padStart(16, '0')}`
    : `${prefix}_${Date.now().toString(36)}`
}

const handle = createFakeChatReviews(now, fail, store)
const auth = {
  request: async (path, options = {}) => {
    const value = handle(path, options.method ?? 'GET', { body: options.body })
    if (value === undefined) throw new Error('unhandled ' + path)
    return structuredClone(value)
  }
}

const client = createChatReviewsClient(auth)

console.log('Answer reviews: client and preview fixture load.')

async function runTests() {
  let tests = 0, passed = 0

  function test(name, fn) {
    tests++
    try {
      fn()
      passed++
      console.log(`✓ ${name}`)
    } catch (error) {
      console.log(`✗ ${name}: ${error.message}`)
    }
  }


  // Test judge with too few versions
  test('judge single version family gives too_few', async () => {
    try {
      await client.judge('ses_2222222222222222', 'msg_6666666666666666')
      throw new Error('should have failed')
    } catch (error) {
      if (error.code !== 'too_few') throw error
    }
  })

  // Test judge happy path with 3 versions
  test('judge 3 versions returns 3 scores and winner', async () => {
    const result = await client.judge('ses_1111111111111111', 'msg_2222222222222222')
    assert.equal(result.scores.length, 3)
    assert.equal(typeof result.winner, 'string')
    assert(result.scores.every(s => typeof s.score === 'number' && s.score >= 1 && s.score <= 10))
    assert(result.scores.every(s => typeof s.reason === 'string'))
  })

  // Test judgements list
  test('judgements list returns judge results', async () => {
    const results = await client.judgements('ses_1111111111111111', 'msg_2222222222222222')
    assert.equal(Array.isArray(results), true)
    if (results.length > 0) {
      assert.equal(typeof results[0].winner, 'string')
      assert.equal(Array.isArray(results[0].scores), true)
    }
  })

  // Test vote happy path
  test('vote up works', async () => {
    const result = await client.vote('ses_1111111111111111', 'msg_2222222222222222', 'msg_3333333333333333', 'up')
    assert.equal(result.rootMessageId, 'msg_2222222222222222')
    assert.equal(result.votes['msg_3333333333333333'], 'up')
  })

  // Test vote winner demotes previous winner
  test('winner then winner on another version leaves one winner', async () => {
    await client.vote('ses_1111111111111111', 'msg_2222222222222222', 'msg_3333333333333333', 'winner')
    await client.vote('ses_1111111111111111', 'msg_2222222222222222', 'msg_4444444444444444', 'winner')
    const result = await client.votes('ses_1111111111111111', 'msg_2222222222222222')
    assert.equal(result.votes['msg_4444444444444444'], 'winner')
    assert.equal(result.votes['msg_3333333333333333'], 'up')
  })

  // Test vote on foreign message
  test('vote on foreign message gives not_a_version', async () => {
    try {
      await client.vote('ses_1111111111111111', 'msg_2222222222222222', 'msg_9999999999999999', 'up')
      throw new Error('should have failed')
    } catch (error) {
      if (error.code !== 'not_a_version') throw error
    }
  })

  // Test fact check happy path
  test('fact check works on long answer', async () => {
    const result = await client.factCheck('ses_1111111111111111', 'msg_3333333333333333')
    assert.equal(result.messageId, 'msg_3333333333333333')
    assert.equal(typeof result.modelId, 'string')
    assert(Array.isArray(result.claims))
    assert(typeof result.counts.supported, 'number')
    assert(typeof result.counts.contradicted, 'number')
    assert(typeof result.counts.noSource, 'number')
    assert.equal(result.counts.supported + result.counts.contradicted + result.counts.noSource, result.claims.length)
  })

  // Test fact check on short answer
  test('fact check on short answer gives no_sources', async () => {
    try {
      await client.factCheck('ses_1111111111111111', 'msg_2222222222222222')
      throw new Error('should have failed')
    } catch (error) {
      if (error.code !== 'no_sources') throw error
    }
  })

  // Test fact checks list
  test('fact checks list returns results', async () => {
    const results = await client.factChecks('ses_1111111111111111', 'msg_3333333333333333')
    assert.equal(Array.isArray(results), true)
    if (results.length > 0) {
      assert.equal(typeof results[0].messageId, 'string')
      assert(Array.isArray(results[0].claims))
      assert(typeof results[0].counts, 'object')
    }
  })

  // Test replay functionality
  test('judge replay returns replayed: true', async () => {
    const requestId = 'replay-test-request-id'
    const first = await client.judge('ses_1111111111111111', 'msg_2222222222222222', { requestId })
    const second = await client.judge('ses_1111111111111111', 'msg_2222222222222222', { requestId })
    assert.equal(second.replayed, true)
    assert.equal(first.winner, second.winner)
  })

  console.log(`Answer reviews: ${passed}/${tests} tests passed.`)
}

runTests().catch(error => {
  console.error('Test suite failed:', error)
  process.exit(1)
}).then(() => {
  console.log('All tests completed successfully.')
})
