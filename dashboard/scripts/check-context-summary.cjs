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

// Setup fake store
const store = {
  sessions: [
    {
      id: 'ses_1111111111111111',
      title: 'Test Chat',
      created_at: 1640995200,
      messages: [
        { id: 'msg_1111111111111111', session_id: 'ses_1111111111111111', seq: 1, role: 'user', content: 'Hello', created_at: 1640995200 },
        { id: 'msg_2222222222222222', session_id: 'ses_1111111111111111', seq: 2, role: 'assistant', content: 'Hi there!', created_at: 1640995300 },
        { id: 'msg_3333333333333333', session_id: 'ses_1111111111111111', seq: 3, role: 'user', content: 'How are you?', created_at: 1640995400 },
      ],
      turns: []
    },
    {
      id: 'ses_2222222222222222',
      title: 'Short Chat',
      created_at: 1640995500,
      messages: [
        { id: 'msg_4444444444444444', session_id: 'ses_2222222222222222', seq: 1, role: 'user', content: 'Hi', created_at: 1640995500 },
        { id: 'msg_5555555555555555', session_id: 'ses_2222222222222222', seq: 2, role: 'assistant', content: 'Hello', created_at: 1640995600 },
      ],
      turns: []
    }
  ],
  nextId: (prefix) => {
    let counter = store.sessions.length + (store.messages?.length || 0)
    return prefix === 'msg' || prefix === 'ses'
      ? `${prefix}_${(++counter).toString(16).padStart(16, '0')}`
      : `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}`
  },
  contexts: new Map()
}

const now = () => Date.now() / 1000
const fail = (status) => { throw new Error(`HTTP ${status}`) }
const handle = createFakeChatSummary(now, fail, store)

const auth = {
  request: async (path, options = {}) => {
    const value = handle(path, options.method ?? 'GET', { body: options.body })
    if (value === undefined) throw new Error('unhandled ' + path)
    return structuredClone(value)
  }
}

const client = createChatSummaryClient(auth)

async function runTests() {
  let requests = 0
  const originalRequest = auth.request
  auth.request = async (path, options = {}) => {
    requests++
    return originalRequest(path, options)
  }

  try {
    console.log('Context summary: client and preview fixture load.')

    // Test validation of bad IDs
    try {
      await client.summary('bad_id')
      assert.fail('Should have thrown validation error')
    } catch (err) {
      assert.equal(err.kind, 'validation')
      console.log('✓ Bad session ID rejected with validation error')
    }

    // Test get summary (no versions yet)
    requests = 0
    const summary1 = await client.summary('ses_1111111111111111')
    assert.equal(summary1.revision, 0)
    assert.equal(summary1.summary, null)
    assert.equal(summary1.versions.length, 0)
    assert.equal(requests, 1)
    console.log('✓ Get empty summary')

    // Test save summary
    requests = 0
    const summary2 = await client.save('ses_1111111111111111', 'Test summary', 0)
    assert.equal(summary2.revision, 1)
    assert.equal(summary2.summary, 'Test summary')
    assert.equal(summary2.versions.length, 1)
    assert.equal(requests, 1)
    console.log('✓ Save summary')

    // Test stale save
    requests = 0
    try {
      await client.save('ses_1111111111111111', 'Updated', 0)
      assert.fail('Should have thrown revision conflict')
    } catch (err) {
      assert.equal(err.code, 'revision_conflict')
      assert.equal(requests, 1)
      console.log('✓ Stale save throws revision_conflict')
    }

    // Test restore
    requests = 0
    const summary3 = await client.restore('ses_1111111111111111', 1, 1)
    assert.equal(summary3.revision, 2)
    assert.equal(summary3.summary, 'Test summary')
    assert.equal(summary3.versions.length, 2)
    assert.equal(summary3.versions[0].restoredFrom, 1) // First version (newest) should have restoredFrom
    assert.equal(requests, 1)
    console.log('✓ Restore creates version with restoredFrom')

    // Test draft on sufficient messages
    requests = 0
    const draft = await client.draft('ses_1111111111111111')
    assert.equal(draft.summary.startsWith('Preview summary:'), true)
    assert.equal(draft.messageIds.length, 1) // First message only (last 2 excluded)
    assert.equal(draft.modelId, 'preview-summary')
    assert.equal(requests, 1)
    console.log('✓ Draft works on chat with 3+ messages')

    // Test draft on too few messages
    requests = 0
    try {
      await client.draft('ses_2222222222222222')
      assert.fail('Should have thrown empty error')
    } catch (err) {
      assert.equal(err.code, 'empty')
      assert.equal(requests, 1)
      console.log('✓ Draft on 2-message chat throws empty')
    }

    // Test compaction without policy
    requests = 0
    try {
      await client.compact('ses_1111111111111111', {
        policyRevision: 1,
        summaryRevision: 2,
        summary: 'Compact summary',
        covers: ['msg_1111111111111111']
      })
      assert.fail('Should have thrown no_settings')
    } catch (err) {
      assert.equal(err.code, 'no_settings')
      assert.equal(requests, 1)
      console.log('✓ Compact without policy throws no_settings')
    }

    // Set up policy for compact test
    store.contexts.set('ses_1111111111111111', {
      revision: 1,
      policy: {
        sessionInstructions: '',
        messagePolicies: {},
        budget: { contextWindowTokens: 128000, outputReserveTokens: 4096, otherInputTokens: 0 }
      }
    })

    // Test compact with policy
    requests = 0
    const compactResult = await client.compact('ses_1111111111111111', {
      policyRevision: 1,
      summaryRevision: 2,
      summary: 'Compact summary',
      covers: ['msg_1111111111111111']
    })
    assert.equal(compactResult.policyRevision, 2)
    assert.equal(compactResult.summaryRevision, 3)
    assert.deepEqual(compactResult.covered, ['msg_1111111111111111'])
    assert.deepEqual(compactResult.folded, ['msg_1111111111111111'])
    assert.equal(requests, 1)

    // Check policy was updated
    const updatedContext = store.contexts.get('ses_1111111111111111')
    assert.equal(updatedContext.revision, 2)
    assert.equal(updatedContext.policy.messagePolicies['msg_1111111111111111'], 'allow-summary')
    console.log('✓ Compact with policy folds messages and bumps revision')

    // Test fork with stale last message
    requests = 0
    try {
      await client.fork('ses_1111111111111111', {
        policyRevision: 2,
        lastMessageId: 'msg_9999999999999999', // Wrong ID
        summary: 'Fork summary'
      })
      assert.fail('Should have thrown boundary_changed')
    } catch (err) {
      assert.equal(err.code, 'boundary_changed')
      assert.equal(requests, 1)
      console.log('✓ Fork with stale last message throws boundary_changed')
    }

    // Test successful fork
    requests = 0
    const forkResult = await client.fork('ses_1111111111111111', {
      policyRevision: 2,
      lastMessageId: 'msg_3333333333333333', // Correct last message
      summary: 'Fork summary'
    })
    assert(forkResult.sessionId.startsWith('ses_'))
    assert.equal(forkResult.parentId, 'ses_1111111111111111')
    assert.equal(forkResult.replayed, false)
    assert.equal(requests, 1)

    // Check new session was created
    const newSession = store.sessions.find(s => s.id === forkResult.sessionId)
    assert(newSession)
    assert.equal(newSession.title, 'Test Chat (continued)')
    assert.equal(newSession.messages.length, 0)
    console.log('✓ Fork with correct last message creates new chat')

    console.log('Context summary: all tests passed.')

  } catch (err) {
    console.error('Test failed:', err)
    process.exit(1)
  }
}

runTests()
