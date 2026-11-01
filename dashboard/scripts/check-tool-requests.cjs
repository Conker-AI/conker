const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'src/lib/chat/tool-requests.ts'), 'utf8')
const loaded = { exports: {} }
new Function('require', 'module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(() => { throw new Error('Tool requests must have no runtime dependencies') }, loaded, loaded.exports)
const { foldToolRequests, readToolRequest } = loaded.exports

const message = (role, kind, text) => ({ role, content: { kind, text } })

// Owner's sequence: user, assistant request, tool, assistant answer
const ownerSequence = [
  message('user', 'text', 'What time is it?'),
  message('assistant', 'text', '{"tool": "sandbox.run", "args": {"command": "date -u \'+%Y-%m-%d %H:%M:%S UTC\'"}}'),
  message('tool', 'text', '{"tool": "sandbox.run", "ok": true, "result": {"exitCode": 0, "stdout": "2026-11-01 12:00:00 UTC"}}'),
  message('assistant', 'text', 'No, I can\'t reach Google.')
]
const ownerResult = foldToolRequests(ownerSequence)
assert.equal(ownerResult.length, 3, 'Owner sequence: 3 messages shown')
assert.deepEqual(ownerResult[1].request, { tool: 'sandbox.run', args: { command: 'date -u \'+%Y-%m-%d %H:%M:%S UTC\'' } }, 'Tool message carries the folded request')

// Double-encoded request and record
const doubleEncoded = [
  message('assistant', 'text', '"{\\"tool\\":\\"sandbox.run\\",\\"args\\":{\\"command\\":\\"echo hello\\"}}"'),
  message('tool', 'text', '"{\\"tool\\":\\"sandbox.run\\",\\"ok\\":true,\\"result\\":{\\"exitCode\\":0,\\"stdout\\":\\"hello\\"}}"'),
  message('assistant', 'text', 'Done')
]
const doubleResult = foldToolRequests(doubleEncoded)
assert.equal(doubleResult.length, 2, 'Double-encoded: 2 messages shown')
assert.deepEqual(doubleResult[0].request, { tool: 'sandbox.run', args: { command: 'echo hello' } }, 'Double-encoded folds correctly')

// Fenced ```json request
const fencedRequest = [
  message('user', 'text', 'Run something'),
  message('assistant', 'text', '```json\n{"tool": "sandbox.run", "args": {"command": "ls"}}\n```'),
  message('tool', 'text', '{"tool": "sandbox.run", "ok": true, "result": {"exitCode": 0, "stdout": "file1\\nfile2"}}'),
  message('assistant', 'text', 'Files listed')
]
const fencedResult = foldToolRequests(fencedRequest)
assert.equal(fencedResult.length, 3, 'Fenced: 3 messages shown')
assert.deepEqual(fencedResult[1].request, { tool: 'sandbox.run', args: { command: 'ls' } }, 'Fenced request folds correctly')

// Request followed by user message (no fold)
const userAfter = [
  message('user', 'text', 'First'),
  message('assistant', 'text', '{"tool": "sandbox.run", "args": {"command": "echo 1"}}'),
  message('user', 'text', 'Never mind'),
  message('assistant', 'text', 'OK')
]
const userAfterResult = foldToolRequests(userAfter)
assert.equal(userAfterResult.length, 4, 'User after: all 4 messages shown')
assert.deepEqual(userAfterResult[1].request, null, 'Request before user message has null request')
assert.deepEqual(userAfterResult[2].request, null, 'User message has null request')

// Request followed by assistant message (no fold)
const assistantAfter = [
  message('user', 'text', 'Help'),
  message('assistant', 'text', '{"tool": "sandbox.run", "args": {"command": "pwd"}}'),
  message('assistant', 'text', 'Actually, let me just tell you: /home')
]
const assistantAfterResult = foldToolRequests(assistantAfter)
assert.equal(assistantAfterResult.length, 3, 'Assistant after: all 3 messages shown')
assert.deepEqual(assistantAfterResult[1].request, null, 'Request before assistant message has null request')

// Tool record for different tool (no fold)
const differentTool = [
  message('user', 'text', 'Test'),
  message('assistant', 'text', '{"tool": "sandbox.run", "args": {"command": "echo a"}}'),
  message('tool', 'text', '{"tool": "web.fetch", "ok": true, "result": {"status": 200}}'),
  message('assistant', 'text', 'Done')
]
const differentToolResult = foldToolRequests(differentTool)
assert.equal(differentToolResult.length, 4, 'Different tool: all 4 messages shown')
assert.deepEqual(differentToolResult[1].request, null, 'Request before different tool record has null request')
assert.deepEqual(differentToolResult[2].request, null, 'Different tool record has null request')

// Request at end of list (no fold)
const endOfList = [
  message('user', 'text', 'Last'),
  message('assistant', 'text', '{"tool": "sandbox.run", "args": {"command": "echo end"}}')
]
const endResult = foldToolRequests(endOfList)
assert.equal(endResult.length, 2, 'End of list: all 2 messages shown')
assert.deepEqual(endResult[1].request, null, 'Request at end has null request')

// Prose with JSON (not a request)
assert.equal(readToolRequest('I think {"tool": "sandbox"} is useful'), null, 'Prose with JSON is not a request')
assert.equal(readToolRequest('{"tool": "x"}'), null, 'Missing args is not a request')
assert.equal(readToolRequest('{"tool": "x", "args": []}'), null, 'Array args is not a request')
assert.equal(readToolRequest('{"tool": "x", "args": {}, "extra": 1}'), null, 'Extra key is not a request')
assert.equal(readToolRequest('{"tool": "x", "args": null}'), null, 'Null args is not a request')

// Unavailable content
const unavailable = [
  message('user', 'text', 'Test'),
  message('assistant', 'text', '{"tool": "sandbox.run", "args": {"command": "date"}}'),
  message('tool', 'content', 'unavailable')
]
const unavailableResult = foldToolRequests(unavailable)
assert.equal(unavailableResult.length, 3, 'Unavailable: all 3 messages shown')
assert.deepEqual(unavailableResult[1].request, null, 'Request before unavailable content has null request')
assert.deepEqual(unavailableResult[2].request, null, 'Unavailable content has null request')

// Two tool steps in a row (both fold)
const twoSteps = [
  message('user', 'text', 'Do two things'),
  message('assistant', 'text', '{"tool": "sandbox.run", "args": {"command": "echo first"}}'),
  message('tool', 'text', '{"tool": "sandbox.run", "ok": true, "result": {"exitCode": 0, "stdout": "first"}}'),
  message('assistant', 'text', '{"tool": "sandbox.run", "args": {"command": "echo second"}}'),
  message('tool', 'text', '{"tool": "sandbox.run", "ok": true, "result": {"exitCode": 0, "stdout": "second"}}'),
  message('assistant', 'text', 'Done both')
]
const twoStepsResult = foldToolRequests(twoSteps)
assert.equal(twoStepsResult.length, 4, 'Two steps: 4 messages shown')
assert.deepEqual(twoStepsResult[1].request, { tool: 'sandbox.run', args: { command: 'echo first' } }, 'First step folds')
assert.deepEqual(twoStepsResult[2].request, { tool: 'sandbox.run', args: { command: 'echo second' } }, 'Second step folds')

// Mutation proof: drop the "same tool" comparison
console.log('=== Mutation proof: dropping "same tool" comparison ===')
const sameToolSource = source.replace(/toolRecord\.tool === request\.tool/, 'true')
const mutatedLoaded = { exports: {} }
new Function('require', 'module', 'exports', ts.transpileModule(sameToolSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(() => { throw new Error('Tool requests must have no runtime dependencies') }, mutatedLoaded, mutatedLoaded.exports)
const mutatedFold = mutatedLoaded.exports.foldToolRequests

const differentToolTest = [
  message('user', 'text', 'Test'),
  message('assistant', 'text', '{"tool": "sandbox.run", "args": {"command": "echo a"}}'),
  message('tool', 'text', '{"tool": "web.fetch", "ok": true, "result": {"status": 200}}'),
  message('assistant', 'text', 'Done')
]
const mutatedResult = mutatedFold(differentToolTest)
console.log('Mutated result (should incorrectly fold different tools):', mutatedResult.map(r => ({ role: r.message.role, request: r.request })))
const originalResult = foldToolRequests(differentToolTest)
console.log('Original result (correct):', originalResult.map(r => ({ role: r.message.role, request: r.request })))

assert.notDeepEqual(mutatedResult[1].request, originalResult[1].request, 'Mutation should change behavior')
assert.equal(mutatedResult[1].request?.tool, 'sandbox.run', 'Mutated version incorrectly folds different tool')
assert.equal(originalResult[1].request, null, 'Original version correctly rejects different tool')

console.log('Tool requests: assistant tool requests fold into the next tool record when they match; all other cases are preserved with null request.')