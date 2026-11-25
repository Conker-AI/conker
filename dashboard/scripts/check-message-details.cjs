const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'src/lib/chat/turn-details.ts'), 'utf8')
const loaded = { exports: {} }
new Function('require', 'module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(() => { throw new Error('Turn details must have no runtime dependencies') }, loaded, loaded.exports)
const { turnDetails: facts, shownDetails } = loaded.exports
const ALL = ['model', 'time', 'tokens', 'cost', 'route', 'tools']
// Every fact, as one line: the same join the transcript makes with the owner's choice.
const turnDetails = (row, shown = ALL, tools = 0) => {
  const text = shownDetails(facts(row, tools).details, shown)
  return text ? { details: text } : {}
}
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

// Settings > Appearance > Under each answer: only the chosen facts, always in the same order.
const full = turn({ inputTokens: 850, outputTokens: 0, costUsd: 0.0042 })
assert.deepEqual(turnDetails(full, ['model', 'time']), { details: 'qwen2.5:3b · 8 s' }, 'The default shows the model and how long it took')
assert.deepEqual(turnDetails(full, ['cost', 'model']), { details: 'qwen2.5:3b · $0.0042' }, 'The order is fixed, not the order of the list')
assert.deepEqual(turnDetails(full, []), {}, 'Nothing chosen shows nothing')
assert.deepEqual(turnDetails(full, ['tools'], 2), { details: '2 tools' }, 'Tools used counts the saved tool records of the turn')
assert.deepEqual(turnDetails(full, ['tools'], 0), {}, 'No tool records, no tools line')
const receipt = attempts => JSON.stringify({ modelConfigurationRevision: 3, attempts })
assert.deepEqual(turnDetails(turn({ detail: receipt([{ role: 'routing', modelId: 'm', status: 'completed' }, { role: 'answer', modelId: 'qwen', status: 'completed' }]) }), ['route']), { details: 'picked by Auto' })
assert.deepEqual(turnDetails(turn({ detail: receipt([{ role: 'answer', modelId: 'qwen', status: 'completed', selectionReason: 'single_eligible_model' }]) }), ['route']), { details: 'only model ready' })
assert.deepEqual(turnDetails(turn({ detail: receipt([{ role: 'answer', modelId: 'qwen', status: 'completed' }]) }), ['route']), {}, 'A model he picked himself has no route line')
assert.deepEqual(turnDetails(turn({ detail: 'The answer stopped.' }), ['route']), {}, 'A plain detail is not a receipt')

const runtime = fs.readFileSync(path.join(root, 'src/lib/gateway/runtime.ts'), 'utf8')
assert.match(runtime, /const turnId = row\.turn_id === undefined \|\| row\.turn_id === null \? null : id\(row\.turn_id\)/, 'Turn links are validated like any identifier')
const adapter = fs.readFileSync(path.join(root, 'src/lib/chat/gateway-adapter.ts'), 'utf8')
assert.match(adapter, /message\.role === 'assistant' && message\.turnId && !isForgotten\(state\) \? turnDetails/, 'Only saved replies of visible chats show turn facts')
const transcript = fs.readFileSync(path.join(root, 'src/components/chat/transcript.tsx'), 'utf8')
assert.ok(transcript.includes('<span className="truncate text-xs text-muted-foreground"><ShownTime at={message.createdAt} />{facts && `${times === \'hidden\' ? \'\' : \' · \'}${facts}`}</span>'), 'The header shows the time as Settings > Times says and the turn facts when saved')
assert.ok(transcript.includes("shownDetails(message.details, useServerSetting('appearance.answer_details', ['model', 'time']))"), 'The facts are the ones Under each answer names')
console.log('Message details: saved model, duration, tokens, cost, route and tools, as Under each answer chooses; running and forgotten turns show nothing.')
