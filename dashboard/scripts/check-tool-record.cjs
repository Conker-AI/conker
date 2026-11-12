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

// Summary: first non-empty line, at most 80 characters with the cut marked
const longText = 'x'.repeat(100)
assert.equal(readToolRecord(`{"tool":"sandbox.run","result":{"stdout":"${longText}"}}`).summary, `${'x'.repeat(79)}…`)
assert.equal(readToolRecord(JSON.stringify({ tool: 'sandbox.run', result: { stdout: '\n  \nsecond line\nthird' } })).summary, 'second line')
assert.equal(readToolRecord('{"tool":"sandbox.run","result":{"exitCode":0,"stdout":""}}').summary, 'ok')

// Labels
assert.equal(readToolRecord('{"tool":"sandbox.run","result":{}}').label, 'Run')
assert.equal(readToolRecord('{"tool":"web_search","result":{}}').label, 'Web search')
assert.equal(readToolRecord('{"tool":"some_tool_name","result":{}}').label, 'Some tool name')
assert.equal(readToolRecord('{"result":{}}').label, 'Tool')
assert.equal(readToolRecord('{"tool":42,"result":{}}').tool, null)

// Status: only a real non-zero exit code or ok:false fails; results without an exit code are ok
assert.equal(readToolRecord('{"tool":"sandbox.run","ok":true,"result":{"exitCode":1}}').status, 'failed', 'A non-zero exit code fails even when the call itself went through')
assert.equal(readToolRecord('{"tool":"web_search","result":{"items":[]}}').status, 'ok')
assert.equal(readToolRecord('{"tool":"web_search","result":"plain"}').output, 'plain')
assert.equal(readToolRecord('{"tool":"x","declined":""}').status, 'declined')
assert.equal(readToolRecord('{"tool":"x"}').status, 'unknown')

// Never throws; non-objects are shown as text
for (const value of ['null', '[1,2]', '42', '"just a string"', '', '{']) {
  const view = readToolRecord(value)
  assert.equal(view.status, 'unknown')
  assert.equal(view.raw, value)
}

// Duration
assert.equal(readToolRecord('{"tool":"sandbox.run","result":{}}').durationMs, null)
assert.equal(readToolRecord('{"tool":"sandbox.run","result":{"durationMs":0}}').durationMs, 0)
assert.equal(readToolRecord('{"tool":"sandbox.run","result":{"durationMs":"5"}}').durationMs, null)

assert.doesNotMatch(source, /^\s*import\s/m, 'Tool record parsing has no imports')
// Conker's own tools: the outcome only; the found items and the other agent's reply are never in the record.
const recalled = readToolRecord(JSON.stringify({ tool: 'conker.recall', result: { status: 'found', recallId: 'rcl_1', count: 3, outside: false, message: 'Found 3.' } }))
assert.deepEqual([recalled.label, recalled.status, recalled.summary, recalled.output], ['Searched memory', 'ok', '3 found', null])
assert.equal(readToolRecord(JSON.stringify({ tool: 'conker.recall', result: { status: 'none', count: 0 } })).summary, '0 found')
assert.deepEqual(['status', 'summary'].map(key => readToolRecord(JSON.stringify({ tool: 'conker.recall', result: { status: 'off', message: 'Memory is off.' } }))[key]), ['failed', 'Couldn’t search memory'])
const ran = readToolRecord(JSON.stringify({ tool: 'conker.run_agent', result: { status: 'done', callId: 'c1', agentId: 'agent_1', agentName: 'Research partner', sessionId: 'ses_1', outside: true, message: 'This is its reply.' } }))
assert.deepEqual([ran.label, ran.status, ran.chat, ran.output], ['Ran Research partner', 'ok', 'ses_1', null], 'Ran <agent>, its chat, and no reply text')
const unfinished = readToolRecord(JSON.stringify({ tool: 'conker.run_agent', result: { status: 'failed', agentName: 'Editor', sessionId: 'ses_2', message: 'Editor could not finish.' } }))
assert.deepEqual([unfinished.status, unfinished.chat], ['failed', 'ses_2'])
const refused = readToolRecord(JSON.stringify({ tool: 'conker.run_agent', result: { status: 'refused', message: 'No.', outside: false } }))
assert.deepEqual([refused.label, refused.status, refused.summary, 'chat' in refused], ['Ran an agent', 'failed', 'Not run', false])
console.log('Tool record: every status, double encoding, non-object and unparseable text, summary cut, labels and duration.')
