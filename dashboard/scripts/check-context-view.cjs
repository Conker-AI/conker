const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

// Stub transport module
const transportCode = `
class GatewayError extends Error {
  constructor(kind, message) {
    super(message)
    this.kind = kind
  }
}
module.exports = { GatewayError }
`

function transpile(file) {
  const source = path.resolve(__dirname, '..', file)
  return ts.transpileModule(fs.readFileSync(source, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
}

function loadWithStub(file, stubs = {}) {
  const code = transpile(file)
  const module = { exports: {} }
  const require = name => {
    if (name === './transport') return { GatewayError: class GatewayError extends Error { constructor(kind) { super(kind); this.kind = kind } } }
    if (stubs[name]) return stubs[name]
    throw new Error(`Unexpected import: ${name}`)
  }
  new Function('require', 'module', 'exports', code)(require, module, module.exports)
  return module.exports
}

function checkContextRead() {
  const { parseContextPolicy, parseContextSummary, createContextReadClient } = loadWithStub('src/lib/gateway/context-read.ts')
  
  // Test full policy parsing
  const fullPolicy = {
    revision: 1,
    policy: {
      sessionInstructions: 'Answer briefly.',
      messagePolicies: { msg_x: 'keep-exact' },
      budget: { contextWindowTokens: 8000, outputReserveTokens: 1000, otherInputTokens: 0 }
    }
  }
  const parsed = parseContextPolicy(fullPolicy)
  assert.equal(parsed.revision, 1)
  assert.equal(parsed.policy.sessionInstructions, 'Answer briefly.')
  assert.equal(parsed.policy.messagePolicies.msg_x, 'keep-exact')
  assert.equal(parsed.policy.budget.contextWindowTokens, 8000)
  
  // Test empty policy parsing
  const emptyPolicy = { revision: 0, policy: null }
  const parsedEmpty = parseContextPolicy(emptyPolicy)
  assert.equal(parsedEmpty.revision, 0)
  assert.equal(parsedEmpty.policy, null)
  
  // Test validation errors
  assert.throws(() => parseContextPolicy({ revision: -1 }), /validation/)
  assert.throws(() => parseContextPolicy({ revision: 1, policy: { sessionInstructions: 'x'.repeat(16001) } }), /validation/)
  assert.throws(() => parseContextPolicy({ revision: 1, policy: { sessionInstructions: 'test', messagePolicies: { msg_x: 'invalid' } } }), /validation/)
  assert.throws(() => parseContextPolicy({ revision: 1, policy: { sessionInstructions: 'test', messagePolicies: {}, budget: { contextWindowTokens: -1 } } }), /validation/)
  
  // Test summary parsing
  const summary = { revision: 1, summary: 'text', source_session_id: null, versions: [{ revision: 1, summary: '...', source_session_id: null, created_at: 1792240794.5, restored_from: null }] }
  const parsedSummary = parseContextSummary(summary)
  assert.equal(parsedSummary.text, 'text')
  assert.equal(parsedSummary.versions, 1)
  
  // Test summary validation errors
  assert.throws(() => parseContextSummary({ revision: 1, summary: 'text', versions: 'not-array' }), /validation/)
  
  // Test client
  let calledPaths = []
  const auth = {
    request: (path, options) => {
      calledPaths.push(path)
      if (path === '/api/control/pi/context/ses_test') return Promise.resolve(fullPolicy)
      if (path === '/api/control/pi/context/ses_test/summary') return Promise.resolve(summary)
      return Promise.reject(new Error('Not found'))
    }
  }
  
  const client = createContextReadClient(auth)
  return client.read('ses_test').then(result => {
    assert.deepEqual(calledPaths, ['/api/control/pi/context/ses_test', '/api/control/pi/context/ses_test/summary'])
    assert.equal(result.revision, 1)
    assert.equal(result.summary.text, 'text')
  })
}

function checkConversationViews() {
  const code = fs.readFileSync(path.resolve(__dirname, '../src/components/gateway/conversation-views.tsx'), 'utf8')
  assert.ok(code.includes('readContext('), 'Should call readContext')
  assert.ok(code.includes('Instructions'), 'Should include Instructions header')
  assert.ok(code.includes('Message rules'), 'Should include Message rules header')
  assert.ok(code.includes('Budget'), 'Should include Budget header')
  assert.ok(!code.includes('setInterval'), 'Should not use setInterval')
  assert.ok(!code.includes('Math.random'), 'Should not use Math.random')
}

function checkFakeGateway() {
  const code = fs.readFileSync(path.resolve(__dirname, '../src/dev/fake-gateway.ts'), 'utf8')
  assert.ok(code.includes('fakeAutoSettings('), 'Should call fakeAutoSettings')
  assert.ok(code.includes('fakeContext('), 'Should call fakeContext')
}

async function main() {
  await checkContextRead()
  checkConversationViews()
  checkFakeGateway()
  console.log('Context view checks: parsing, validation, client calls, UI components, and fake gateway passed.')
}

main().catch(error => { console.error(error); process.exitCode = 1 })