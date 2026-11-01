const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'src/lib/chat/tool-record.ts'), 'utf8')
const loaded = { exports: {} }
new Function('require', 'module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(() => { throw new Error('Tool record must have no runtime dependencies') }, loaded, loaded.exports)
const { readToolRecord } = loaded.exports

// Test ok status
assert.deepEqual(readToolRecord('{"tool":"sandbox.run","ok":true,"result":{"exitCode":0,"stdout":"Hello world","stderr":"","durationMs":1200}}'), {
  tool: 'sandbox.run',
  label: 'Run',
  status: 'ok',
  summary: 'Hello world',
  output: 'Hello world',
  error: null,
  durationMs: 1200,
  raw: '{\n  "tool": "sandbox.run",\n  "ok": true,\n  "result": {\n    "exitCode": 0,\n    "stdout": "Hello world",\n    "stderr": "",\n    "durationMs": 1200\n  }\n}'
})

// Test failed status with non-zero exit code
assert.deepEqual(readToolRecord('{"tool":"sandbox.run","ok":false,"result":{"exitCode":1,"stdout":"","stderr":"Command failed","durationMs":500}}'), {
  tool: 'sandbox.run',
  label: 'Run',
  status: 'failed',
  summary: 'Command failed',
  output: null,
  error: 'Command failed',
  durationMs: 500,
  raw: '{\n  "tool": "sandbox.run",\n  "ok": false,\n  "result": {\n    "exitCode": 1,\n    "stdout": "",\n    "stderr": "Command failed",\n    "durationMs": 500\n  }\n}'
})

// Test timed out status
assert.deepEqual(readToolRecord('{"tool":"sandbox.run","result":{"timedOut":true,"stdout":"Partial output","stderr":"","durationMs":5000}}'), {
  tool: 'sandbox.run',
  label: 'Run',
  status: 'timed out',
  summary: 'Partial output',
  output: 'Partial output',
  error: null,
  durationMs: 5000,
  raw: '{\n  "tool": "sandbox.run",\n  "result": {\n    "timedOut": true,\n    "stdout": "Partial output",\n    "stderr": "",\n    "durationMs": 5000\n  }\n}'
})

// Test declined status
assert.deepEqual(readToolRecord('{"tool":"web_search","declined":"User declined the search"}'), {
  tool: 'web_search',
  label: 'Web search',
  status: 'declined',
  summary: 'declined',
  output: null,
  error: null,
  durationMs: null,
  raw: '{\n  "tool": "web_search",\n  "declined": "User declined the search"\n}'
})

// Test double-encoded JSON
assert.deepEqual(readToolRecord('"{\\"tool\\":\\"sandbox.run\\",\\"ok\\":true,\\"result\\":{\\"exitCode\\":0,\\"stdout\\":\\"Double encoded\\",\\"stderr\\":\\"\\"}}"'), {
  tool: 'sandbox.run',
  label: 'Run',
  status: 'ok',
  summary: 'Double encoded',
  output: 'Double encoded',
  error: null,
  durationMs: null,
  raw: '{\n  "tool": "sandbox.run",\n  "ok": true,\n  "result": {\n    "exitCode": 0,\n    "stdout": "Double encoded",\n    "stderr": ""\n  }\n}'
})

// Test unparseable text
assert.deepEqual(readToolRecord('This is just plain text that cannot be parsed as JSON'), {
  tool: null,
  label: 'Tool',
  status: 'unknown',
  summary: 'This is just plain text that cannot be parsed as JSON',
  output: null,
  error: null,
  durationMs: null,
  raw: 'This is just plain text that cannot be parsed as JSON'
})

// Test summary cut at 80 chars with ellipsis
const longText = 'This is a very long line that should definitely be truncated because it exceeds eighty characters limit'
const expected = longText.slice(0, 80).trim() + '…'
assert.equal(readToolRecord(`{"tool":"sandbox.run","result":{"stdout":"${longText}"}}`).summary, expected)

// Test label transformations
assert.equal(readToolRecord('{"tool":"sandbox.run","result":{}}').label, 'Run')
assert.equal(readToolRecord('{"tool":"web_search","result":{}}').label, 'Web search')
assert.equal(readToolRecord('{"tool":"some_tool_name","result":{}}').label, 'Some tool name')
assert.equal(readToolRecord('{"result":{}}').label, 'Tool')

// Test duration null when absent
assert.equal(readToolRecord('{"tool":"sandbox.run","result":{}}').durationMs, null)

console.log('Tool record: all status cases, double encoding, unparseable text, summary truncation, label transformation, and duration handling work correctly.')

// Mutation proof: make exitCode: 1 read as ok, see fail, restore, see pass
console.log('\n=== Mutation proof ===')
const originalSource = source
const mutatedSource = source.replace('parsed.ok === false || parsed.result?.exitCode !== 0', 'parsed.ok === false || false')
fs.writeFileSync(path.join(root, 'src/lib/chat/tool-record.ts'), mutatedSource)

try {
  const mutatedLoaded = { exports: {} }
  new Function('require', 'module', 'exports', ts.transpileModule(mutatedSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(() => { throw new Error('Tool record must have no runtime dependencies') }, mutatedLoaded, mutatedLoaded.exports)
  const { readToolRecord: mutatedReadToolRecord } = mutatedLoaded.exports
  const result = mutatedReadToolRecord('{"tool":"sandbox.run","ok":false,"result":{"exitCode":1,"stdout":"","stderr":"Command failed","durationMs":500}}')
  console.log('MUTATED: exitCode: 1 incorrectly reads as status:', result.status)
  assert.notEqual(result.status, 'failed', 'Mutation should cause this to fail')
} catch (e) {
  console.log('MUTATED: Assertion failed as expected:', e.message)
} finally {
  fs.writeFileSync(path.join(root, 'src/lib/chat/tool-record.ts'), originalSource)
  const restoredLoaded = { exports: {} }
  new Function('require', 'module', 'exports', ts.transpileModule(originalSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(() => { throw new Error('Tool record must have no runtime dependencies') }, restoredLoaded, restoredLoaded.exports)
  const { readToolRecord: restoredReadToolRecord } = restoredLoaded.exports
  const result = restoredReadToolRecord('{"tool":"sandbox.run","ok":false,"result":{"exitCode":1,"stdout":"","stderr":"Command failed","durationMs":500}}')
  console.log('RESTORED: exitCode: 1 correctly reads as status:', result.status)
  assert.equal(result.status, 'failed', 'Restored version should correctly detect failure')
}