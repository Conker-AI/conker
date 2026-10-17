const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'src/lib/chat/turn-details.ts'), 'utf8')
const loaded = { exports: {} }
new Function('require', 'module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(() => { throw new Error('Turn details must have no runtime dependencies') }, loaded, loaded.exports)
const { turnDetails } = loaded.exports
const turn = (extra = {}) => ({ id: 'trn_1', model: 'qwen2.5:3b', startedAt: '2026-10-17T10:00:00Z', endedAt: '2026-10-17T10:00:08Z', costUsd: null, ...extra })

assert.deepEqual(turnDetails(turn()), { details: 'qwen2.5:3b · 8 s' })
assert.deepEqual(turnDetails(turn({ costUsd: 0 })), { details: 'qwen2.5:3b · 8 s · free' })
assert.deepEqual(turnDetails(turn({ costUsd: 0.0042 })), { details: 'qwen2.5:3b · 8 s · $0.0042' })
assert.deepEqual(turnDetails(turn({ costUsd: 0.13 })), { details: 'qwen2.5:3b · 8 s · $0.13' })
assert.deepEqual(turnDetails(turn({ model: null })), { details: '8 s' })
assert.deepEqual(turnDetails(turn({ endedAt: null })), {}, 'A running turn shows nothing until Pi records its end')
assert.deepEqual(turnDetails(undefined), {})

const runtime = fs.readFileSync(path.join(root, 'src/lib/gateway/runtime.ts'), 'utf8')
assert.match(runtime, /const turnId = row\.turn_id === undefined \|\| row\.turn_id === null \? null : id\(row\.turn_id\)/, 'Turn links are validated like any identifier')
const adapter = fs.readFileSync(path.join(root, 'src/lib/chat/gateway-adapter.ts'), 'utf8')
assert.match(adapter, /message\.role === 'assistant' && message\.turnId && !isForgotten\(state\) \? turnDetails/, 'Only saved replies of visible chats show turn facts')
const transcript = fs.readFileSync(path.join(root, 'src/components/chat/transcript.tsx'), 'utf8')
assert.match(transcript, /message\.details && <span className="text-muted-foreground">· \{message\.details\}<\/span>/)
console.log('Message details: saved model, duration and cost only; running and forgotten turns show nothing.')
