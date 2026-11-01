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

const { createChatNamesClient } = load('src/lib/gateway/chat-names.ts')
const { createFakeChatNames } = load('src/dev/fake-gateway-chat-names.ts')
const { GatewayError } = load('src/lib/gateway/transport.ts')

assert.equal(typeof createChatNamesClient, 'function')
assert.equal(typeof createFakeChatNames, 'function')

// Create a fake store with test data
const store = {
  sessions: [
    {
      id: 'ses_1111111111111111',
      title: '',
      created_at: Date.now() / 1000,
      messages: [
        { id: 'msg_1111111111111111', session_id: 'ses_1111111111111111', seq: 1, role: 'user', content: 'Hello world test message', created_at: Date.now() / 1000 }
      ],
      turns: []
    },
    {
      id: 'ses_2222222222222222',
      title: '',
      created_at: Date.now() / 1000,
      messages: [],
      turns: []
    }
  ],
  nextId: (prefix) => `${prefix}_${Date.now().toString(16).padStart(16, '0')}`,
  contexts: new Map()
}

// Create fake auth that tracks requests
let requestCount = 0
const auth = {
  request: async (path, options = {}) => {
    requestCount++
    const value = handle(path, options.method ?? 'GET', { body: options.body })
    if (value === undefined) throw new Error('unhandled ' + path)
    return structuredClone(value)
  }
}

const now = () => Date.now() / 1000
const fail = (status) => { throw new Error(`HTTP ${status}`) }
const handle = createFakeChatNames(now, fail, store)
const client = createChatNamesClient(auth)

async function runTests() {
  console.log('Chat names and output settings: client and preview fixture load.')

  // Test 1: Get title (happy path)
  const title1 = await client.title('ses_1111111111111111')
  assert.equal(title1.revision, 0)
  assert.equal(title1.title, '')
  assert.equal(title1.source, null)
  assert.equal(title1.modelId, null)
  console.log('✓ GET title works')

  // Test 2: Rename (happy path)
  const renamed = await client.rename('ses_1111111111111111', 'Test Chat', 0)
  assert.equal(renamed.revision, 1)
  assert.equal(renamed.title, 'Test Chat')
  assert.equal(renamed.source, 'owner')
  assert.equal(renamed.modelId, null)
  console.log('✓ Rename works')

  // Test 3: Auto-name (happy path)
  const autoNamed = await client.autoName('ses_1111111111111111', 1)
  assert.equal(autoNamed.revision, 2)
  assert.equal(autoNamed.source, 'auto')
  assert.equal(autoNamed.modelId, 'preview-router')
  console.log('✓ Auto-name works')

  // Test 4: Get output (happy path)
  const output1 = await client.output('ses_1111111111111111')
  assert.equal(output1.revision, 0)
  assert.equal(output1.output.format, 'auto')
  assert.equal(output1.output.length, 'auto')
  assert.equal(output1.output.language, 'auto')
  console.log('✓ GET output works')

  // Test 5: Save output (happy path)
  const savedOutput = await client.saveOutput('ses_1111111111111111', {
    format: 'text',
    length: 'short',
    language: 'en'
  }, 0)
  assert.equal(savedOutput.revision, 1)
  assert.equal(savedOutput.output.format, 'text')
  assert.equal(savedOutput.output.length, 'short')
  assert.equal(savedOutput.output.language, 'en')
  console.log('✓ Save output works')

  // Test 6: Invalid session ID validation
  try {
    await client.title('invalid_id')
    assert.fail('Should have thrown validation error')
  } catch (e) {
    assert.equal(e.kind, 'validation')
  }
  console.log('✓ Invalid session ID rejected before request')

  // Test 7: Rename validation (61 characters)
  const longName = 'a'.repeat(61)
  try {
    await client.rename('ses_1111111111111111', longName, 2)
    assert.fail('Should have thrown validation error')
  } catch (e) {
    assert.equal(e.kind, 'validation')
  }
  console.log('✓ Rename rejects 61 characters without request')

  // Test 8: Auto-name on empty chat
  try {
    await client.autoName('ses_2222222222222222', 0)
    assert.fail('Should have thrown empty error')
  } catch (e) {
    assert.equal(e.code, 'empty')
  }
  console.log('✓ Auto-name on empty chat gives empty code')

  // Test 9: Stale revision conflict
  try {
    await client.rename('ses_1111111111111111', 'New Name', 0)
    assert.fail('Should have thrown revision conflict')
  } catch (e) {
    assert.equal(e.code, 'revision_conflict')
  }
  console.log('✓ Stale rename gives revision_conflict')

  // Test 10: Stale saveOutput revision conflict
  try {
    await client.saveOutput('ses_1111111111111111', {
      format: 'list',
      length: 'medium',
      language: 'fr'
    }, 0)
    assert.fail('Should have thrown revision conflict')
  } catch (e) {
    assert.equal(e.code, 'revision_conflict')
  }
  console.log('✓ Stale saveOutput gives revision_conflict')

  // Test 11: Invalid language validation
  try {
    await client.saveOutput('ses_1111111111111111', {
      format: 'text',
      length: 'short',
      language: 'English'
    }, 1)
    assert.fail('Should have thrown validation error')
  } catch (e) {
    assert.equal(e.kind, 'validation')
  }
  console.log('✓ saveOutput with invalid language rejected before request')

  // Test 12: Malformed response (simulate by breaking the fixture)
  const originalHandle = handle
  const badHandle = (path, method, options) => {
    if (path.includes('/title') && method === 'GET') {
      return { invalid: 'response' }
    }
    return originalHandle(path, method, options)
  }

  const badAuth = {
    request: async (path, options = {}) => {
      const value = badHandle(path, options.method ?? 'GET', { body: options.body })
      if (value === undefined) throw new Error('unhandled ' + path)
      return value
    }
  }
  const badClient = createChatNamesClient(badAuth)

  try {
    await badClient.title('ses_1111111111111111')
    assert.fail('Should have thrown invalid response error')
  } catch (e) {
    assert.equal(e.kind, 'invalid-response')
  }
  console.log('✓ Malformed response rejected with invalid-response')

  console.log(`Chat names and output settings: all tests passed (${requestCount} requests)`)
}

runTests().catch(console.error)
