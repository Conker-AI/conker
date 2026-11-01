const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'src/lib/chat/turn-details.ts'), 'utf8')
const loaded = { exports: {} }
new Function('require', 'module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(() => { throw new Error('Turn details must have no runtime dependencies') }, loaded, loaded.exports)
const { turnDetails } = loaded.exports
const turn = (extra = {}) => ({ id: 'trn_1', model: 'qwen2.5:3b', startedAt: '2026-10-17T10:00:00Z', endedAt: '2026-10-17T10:00:08Z', costUsd: null, inputTokens: null, outputTokens: null, ...extra })

assert.deepEqual(turnDetails(turn()), { details: 'qwen2.5:3b · 8 s' })
assert.deepEqual(turnDetails(turn({ costUsd: 0 })), { details: 'qwen2.5:3b · 8 s · free' })
assert.deepEqual(turnDetails(turn({ costUsd: 0.0042 })), { details: 'qwen2.5:3b · 8 s · $0.0042' })
assert.deepEqual(turnDetails(turn({ costUsd: 0.13 })), { details: 'qwen2.5:3b · 8 s · $0.13' })
assert.deepEqual(turnDetails(turn({ model: null })), { details: '8 s' })
assert.deepEqual(turnDetails(turn({ endedAt: null })), {}, 'A running turn shows nothing until Pi records its end')
assert.deepEqual(turnDetails(undefined), {})

// Token tests
assert.deepEqual(turnDetails(turn({ inputTokens: 850, outputTokens: 0 })), { details: 'qwen2.5:3b · 8 s · 850 tokens' })
assert.deepEqual(turnDetails(turn({ inputTokens: 1000, outputTokens: 234 })), { details: 'qwen2.5:3b · 8 s · 1.2k tokens' })
assert.deepEqual(turnDetails(turn({ inputTokens: 2000, outputTokens: 0 })), { details: 'qwen2.5:3b · 8 s · 2k tokens' })
assert.deepEqual(turnDetails(turn({ inputTokens: 12345, outputTokens: 0 })), { details: 'qwen2.5:3b · 8 s · 12k tokens' })
assert.deepEqual(turnDetails(turn({ inputTokens: null, outputTokens: null })), { details: 'qwen2.5:3b · 8 s' })
assert.deepEqual(turnDetails(turn({ inputTokens: 500, outputTokens: null })), { details: 'qwen2.5:3b · 8 s · 500 tokens' })
assert.deepEqual(turnDetails(turn({ inputTokens: null, outputTokens: 300 })), { details: 'qwen2.5:3b · 8 s · 300 tokens' })
assert.deepEqual(turnDetails(turn({ inputTokens: 850, outputTokens: 0, costUsd: 0.0042 })), { details: 'qwen2.5:3b · 8 s · 850 tokens · $0.0042' })

const runtime = fs.readFileSync(path.join(root, 'src/lib/gateway/runtime.ts'), 'utf8')
assert.match(runtime, /const turnId = row\.turn_id === undefined \|\| row\.turn_id === null \? null : id\(row\.turn_id\)/, 'Turn links are validated like any identifier')
const adapter = fs.readFileSync(path.join(root, 'src/lib/chat/gateway-adapter.ts'), 'utf8')
assert.match(adapter, /message\.role === 'assistant' && message\.turnId && !isForgotten\(state\) \? turnDetails/, 'Only saved replies of visible chats show turn facts')
const transcript = fs.readFileSync(path.join(root, 'src/components/chat/transcript.tsx'), 'utf8')
assert.ok(transcript.includes('<span className="truncate text-xs text-muted-foreground"><time dateTime={message.createdAt} title={createdAt.toLocaleString()} aria-label={createdAt.toLocaleString()}>{shortTime}</time>{message.details && ` · ${message.details}`}</span>'), 'The header shows the time always and the turn facts when saved')
console.log('Message details: saved model, duration and cost only; running and forgotten turns show nothing.')
