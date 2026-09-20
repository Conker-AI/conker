const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { webcrypto } = require('node:crypto')
globalThis.crypto ??= webcrypto
const root = path.resolve(__dirname, '..')
const cache = new Map()
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports
  const source = fs.readFileSync(path.join(root, relative), 'utf8').replaceAll('import.meta.env', '({})')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const module = { exports: {} }
  cache.set(relative, module)
  new Function('require', 'module', 'exports', compiled.outputText)(request => {
    if (request === 'zod') return require('zod')
    assert.ok(request.startsWith('.'), `Unexpected dependency: ${request}`)
    return load(`${path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))}.ts`)
  }, module, module.exports)
  return module.exports
}
async function main() {
  const { createFixtureClient } = load('src/lib/api/fixture-adapter.ts')
  const { createContextPolicy } = load('src/lib/api/context-policy.ts')
  const { captureQueuedTurn, validateQueuedTurn } = load('src/lib/conversation-continuity.ts')
  const client = createFixtureClient()
  const agentInput = { name: 'Context specialist', role: 'Check context', instructions: 'Keep source references.', modelId: null, toolIds: [], memory: { scope: 'conversation', memoryIds: [] } }
  const agent = await client.createAgent(agentInput)
  const session = await client.createConversation(agent.id)
  const id = session.id
  const policy = { ...createContextPolicy(8192, 1024), sessionInstructions: '  Answer concisely.\n' }
  await assert.rejects(client.updateConversation(id, { contextPolicy: { ...policy, messagePolicies: { missing: 'exclude' } } }), /available messages/)
  await assert.rejects(client.updateConversation(id, { contextPolicy: { ...policy, budget: { ...policy.budget, outputReserveTokens: 0 } } }), /reserve/)
  assert.equal((await client.load()).conversations[id].contextPolicy, undefined)
  await client.updateConversation(id, { contextPolicy: policy })
  policy.sessionInstructions = 'External mutation'
  let data = await client.load()
  assert.equal(data.conversations[id].contextPolicy.sessionInstructions, '  Answer concisely.\n')
  const modelId = data.modelsConfiguration.defaultModelId
  const queued = captureQueuedTurn(data, id, 'Queued question', modelId)
  queued.contextPolicy.sessionInstructions = 'External queue mutation'
  assert.equal(data.conversations[id].contextPolicy.sessionInstructions, '  Answer concisely.\n')
  assert.equal(validateQueuedTurn(queued, data), null)
  await client.updateConversation(id, { contextPolicy: { ...policy, sessionInstructions: 'Changed instructions' } })
  assert.match(validateQueuedTurn(queued, await client.load()), /Context instructions/)
  data = await client.load()
  const reviewed = captureQueuedTurn(data, id, queued.text, modelId)
  assert.equal(validateQueuedTurn(reviewed, data), null)
  await client.saveAgent(agent.id, { ...agentInput, instructions: 'New inherited instructions' })
  assert.match(validateQueuedTurn(reviewed, await client.load()), /Context instructions/)
  const first = await client.sendMessage(id, 'Do not include this old request')
  const second = await client.sendMessage(id, 'Use this request')
  const effective = { ...createContextPolicy(8192, 1024), sessionInstructions: 'Saved response instructions', messagePolicies: { [first.id]: 'exclude', [second.id]: 'keep-exact' } }
  await client.updateConversation(id, { contextPolicy: effective })
  const attempt = client.streamReply(id, {}, () => {})
  await assert.rejects(client.updateConversation(id, { contextPolicy: policy }), /Stop the current reply/)
  const reply = await attempt
  assert.deepEqual(reply.contextMessageIds, [second.id], 'Excluded transcript content is absent from effective reply context')
  assert.equal(reply.contextPolicySnapshot.sessionInstructions, 'Saved response instructions')
  assert.equal(reply.agentInstructionsSnapshot, 'New inherited instructions')
  await client.updateConversation(id, { contextPolicy: { ...effective, sessionInstructions: 'Newer instructions', messagePolicies: { [first.id]: 'keep-exact' } } })
  const retry = await client.streamReply(id, { retryMessageId: reply.id }, () => {})
  assert.deepEqual(retry.contextMessageIds, [second.id])
  assert.equal(retry.contextPolicySnapshot.sessionInstructions, 'Saved response instructions', 'Retry keeps its original policy snapshot')
  const later = await client.sendMessage(id, 'Later message outside an earlier fork')
  await client.updateConversation(id, { contextPolicy: { ...effective, messagePolicies: { [first.id]: 'exclude', [second.id]: 'keep-exact', [later.id]: 'exclude' } } })
  const fork = await client.forkConversation(id, reply.id)
  const forkState = (await client.load()).conversations[fork.id]
  assert.ok(!forkState.contextPolicy.messagePolicies[later.id])
  assert.equal(forkState.contextPolicy.messagePolicies[second.id], 'keep-exact')
  assert.equal(forkState.contextPolicy.sessionInstructions, effective.sessionInstructions)
  await client.updateMessage(id, second.id, { redacted: true })
  data = await client.load()
  assert.ok(!Object.hasOwn(data.conversations[id].contextPolicy.messagePolicies, second.id))
  assert.ok(data.conversations[id].messages.every(message => !message.contextPolicySnapshot || !Object.hasOwn(message.contextPolicySnapshot.messagePolicies, second.id)))
  await assert.rejects(client.updateConversation(id, { contextPolicy: effective }), /available messages/)
  const pinnedQueue = captureQueuedTurn(data, id, 'Review pins', modelId)
  await client.updateMessage(id, first.id, { pinned: true })
  assert.match(validateQueuedTurn(pinnedQueue, await client.load()), /exact pins/)
  await client.updateConversation(id, { contextPolicy: { ...createContextPolicy(8192, 1024), messagePolicies: { [first.id]: 'exclude' } } })
  await assert.rejects(client.streamReply(id, {}, () => {}), /pinned/)
  await client.updateMessage(id, first.id, { pinned: false })
  await client.updateConversation(id, { contextPolicy: createContextPolicy(20, 10) })
  const count = (await client.load()).conversations[id].messages.length
  await assert.rejects(client.streamReply(id, {}, () => {}), /context window/)
  assert.equal((await client.load()).conversations[id].messages.length, count, 'Overflow never creates a phantom reply')
  await client.updateConversation(id, { contextPolicy: { ...createContextPolicy(8192, 1024), messagePolicies: { [first.id]: 'retrieve' } } })
  await assert.rejects(client.streamReply(id, {}, () => {}), /Retrieval is not connected/)
  await client.updateConversation(id, { privacy: { harnessDisabled: true, memoryDisabled: false } })
  await assert.rejects(client.streamReply(id, {}, () => {}), /No harness/)
  await client.updateConversation(id, { contextPolicy: createContextPolicy(8192, 1024), privacy: { harnessDisabled: true, memoryDisabled: true } })
  const privateReply = await client.streamReply(id, {}, () => {})
  assert.ok(privateReply.contextMessageIds.includes(later.id), 'No harness does not erase ordinary conversation history')
  assert.deepEqual((await client.load()).conversations[id].privacy, { memoryDisabled: true, harnessDisabled: true })
  console.log('Conversation context checks passed: validation, source snapshots, queue invalidation, exclusion, retries, fork pruning, redaction, exact pins, overflow/retrieval blocks and privacy regression.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
