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
  const filename = path.join(root, relative)
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8').replaceAll('import.meta.env', '({})'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const module = { exports: {} }
  cache.set(relative, module)
  new Function('require', 'module', 'exports', compiled.outputText)(request => {
    if (request === 'zod') return require('zod')
    assert.ok(request.startsWith('.'), `Unexpected runtime dependency: ${request}`)
    return load(path.posix.normalize(path.posix.join(path.posix.dirname(relative), `${request}.ts`)))
  }, module, module.exports)
  return module.exports
}

async function main() {
  const { createFixtureClient } = load('src/lib/api/fixture-adapter.ts')
  const { captureQueuedTurn, validateQueuedTurn, conversationRows, activeConversationMessages, contextBeforeMessage, messagesForFork } = load('src/lib/conversation-continuity.ts')
  const checks = []
  const check = async (name, test) => { await test(); checks.push(name) }
  const originalTimeout = globalThis.setTimeout
  globalThis.setTimeout = (callback, delay, ...args) => originalTimeout(callback, Math.min(delay, 1), ...args)
  try {
    await check('Queue captures independent text, reply, model, privacy and route without provider secrets', async () => {
      const data = await createFixtureClient().load()
      const entry = captureQueuedTurn(data, 'week', '  Send later  ', data.modelsConfiguration.defaultModelId, 'intent')
      assert.equal(entry.text, 'Send later')
      assert.equal(entry.replyTo, 'intent')
      assert.equal(validateQueuedTurn(entry, data), null)
      data.modelsConfiguration.providers[0].apiKeyDraft = 'never-retain-this-secret'
      assert.ok(!JSON.stringify(entry).includes('never-retain-this-secret'))
      data.conversations.week.privacy.memoryDisabled = true
      assert.equal(entry.privacy.memoryDisabled, false)
      assert.match(validateQueuedTurn(entry, data), /Incognito/)
      await assert.rejects(async () => captureQueuedTurn(data, 'week', ' ', entry.modelId), /4,000/)
    })

    await check('Queue invalidates archive, removal, handoff, disabled provider, changed route, revoked grants and redacted reply', async () => {
      const data = await createFixtureClient().load()
      const entry = captureQueuedTurn(data, 'week', 'Captured task', data.modelsConfiguration.defaultModelId, 'intent')
      const changed = edit => { const next = structuredClone(data); edit(next); return validateQueuedTurn(entry, next) }
      assert.match(changed(next => { next.sessions.find(item => item.id === 'week').archived = true }), /archived/)
      assert.match(changed(next => { delete next.conversations.week }), /removed/)
      assert.match(changed(next => { next.sessions.find(item => item.id === 'week').agentId = 'workshop' }), /agent/)
      assert.match(changed(next => { next.modelsConfiguration.providers[0].enabled = false }), /disabled/)
      assert.match(changed(next => { next.modelsConfiguration.models[0].route = 'changed/route' }), /route/)
      assert.match(changed(next => { next.conversations.week.grants = [{ id: 'old', status: 'revoked', label: 'Old', scope: 'none' }] }), /access/)
      assert.match(changed(next => { next.conversations.week.messages.find(item => item.id === 'intent').redacted = true }), /reply target/)
      assert.equal(validateQueuedTurn(entry, data), null)
    })

    await check('Retry of an earlier response captures its own boundary and preserves later history', async () => {
      const client = createFixtureClient()
      const later = await client.sendMessage('week', 'This is a later unrelated question')
      const laterReply = await client.streamReply('week', {}, () => {})
      const alternative = await client.streamReply('week', { retryMessageId: 'week-assistant', modelId: 'openai-gpt' }, () => {})
      assert.equal(alternative.responseFamilyId, 'week-assistant')
      assert.equal(alternative.contextMessageId, 'intent')
      assert.ok(!alternative.contextMessageIds.includes(later.id))
      assert.ok(!alternative.contextMessageIds.includes(laterReply.id))
      let messages = (await client.load()).conversations.week.messages
      const rows = conversationRows(messages)
      assert.equal(rows.find(item => item.familyId === 'week-assistant').message.id, 'week-assistant')
      assert.equal(rows.find(item => item.familyId === 'week-assistant').versions.length, 2)
      assert.equal(conversationRows(messages, { 'week-assistant': alternative.id }).find(item => item.familyId === 'week-assistant').message.id, alternative.id)
      assert.ok(activeConversationMessages(messages).some(item => item.id === laterReply.id))
      const next = await client.sendMessage('week', 'Continue original timeline')
      messages = (await client.load()).conversations.week.messages
      assert.ok(contextBeforeMessage(messages, next.id).some(item => item.id === 'week-assistant'))
      assert.ok(!contextBeforeMessage(messages, next.id).some(item => item.id === alternative.id))
      const fork = await client.forkConversation('week', alternative.id)
      const branch = (await client.load()).conversations[fork.id]
      assert.deepEqual(branch.messages.map(item => item.id), ['intent', alternative.id])
      assert.equal(branch.messages[1].modelId, 'openai-gpt')
      assert.equal(branch.messages[1].activity.id, alternative.activity.id)
    })

    await check('Terminal retry becomes default context; viewing another version never changes it', async () => {
      const client = createFixtureClient()
      const alternative = await client.streamReply('week', { retryMessageId: 'week-assistant' }, () => {})
      let messages = (await client.load()).conversations.week.messages
      assert.equal(conversationRows(messages).at(-1).message.id, alternative.id)
      assert.equal(conversationRows(messages, { 'week-assistant': 'week-assistant' }).at(-1).message.id, 'week-assistant')
      const sent = await client.sendMessage('week', 'Use the current answer')
      messages = (await client.load()).conversations.week.messages
      const context = contextBeforeMessage(messages, sent.id)
      assert.ok(context.some(item => item.id === alternative.id))
      assert.ok(!context.some(item => item.id === 'week-assistant'))
      assert.equal(conversationRows(messages).find(item => item.familyId === 'week-assistant').activeId, alternative.id)
    })

    await check('Earlier edits require explicit forks; redaction cannot leak through context or fork previews', async () => {
      const client = createFixtureClient()
      await assert.rejects(client.updateMessage('week', 'intent', { text: 'Edited question' }), /Fork/)
      const fork = await client.forkConversation('week', 'intent')
      await client.updateMessage(fork.id, 'intent', { text: 'Edited question' })
      assert.notEqual((await client.load()).conversations.week.messages[0].text, 'Edited question')
      const retry = await client.streamReply('week', { retryMessageId: 'week-assistant' }, () => {})
      await client.updateMessage('week', 'intent', { redacted: true })
      const messages = (await client.load()).conversations.week.messages
      assert.equal(contextBeforeMessage(messages, retry.id)[0].text, '')
      assert.equal(messagesForFork(messages, retry.id)[0].text, '')
      await client.updateMessage('week', retry.id, { redacted: true })
      assert.equal(conversationRows((await client.load()).conversations.week.messages).at(-1).message.text, '')
      await assert.rejects(client.streamReply('week', { retryMessageId: retry.id }, () => {}), /available companion/)
    })

    await check('Preview failure, waiting and stopped states are retained, and retries do not replay fixture actions', async () => {
      const client = createFixtureClient()
      await assert.rejects(client.streamReply('week', { previewScenario: 'tool-failure' }, () => {}), /fixture request failed/)
      const failed = (await client.load()).conversations.week.messages.at(-1)
      assert.equal(failed.status, 'failed')
      assert.equal(failed.activity.status, 'failed')
      const retry = await client.streamReply('week', { retryMessageId: failed.id }, () => {})
      assert.ok(retry.activity.steps.every(step => step.kind === 'phase'))
      const waiting = await client.streamReply('week', { previewScenario: 'approval-wait' }, () => {})
      assert.equal(waiting.activity.phase, 'waiting')
      assert.equal(waiting.activity.steps[0].approvalId, 'coach')
      const stopped = await client.streamReply('week', { previewScenario: 'stopped-children' }, () => {})
      assert.equal(stopped.status, 'stopped')
      assert.ok(stopped.activity.steps.every(step => step.status === 'stopped'))
      assert.notEqual(waiting.activity.id, stopped.activity.id)
    })

    await check('Saved queue requests cannot silently reuse edited text; disconnected service retains a retryable failure', async () => {
      const client = createFixtureClient()
      const data = await client.load()
      const entry = captureQueuedTurn(data, 'week', 'A queued request', data.modelsConfiguration.defaultModelId)
      const saved = await client.sendMessage('week', entry.text)
      entry.sentMessageId = saved.id
      assert.equal(validateQueuedTurn(entry, await client.load()), null)
      await client.updateMessage('week', saved.id, { text: 'Changed request' })
      assert.match(validateQueuedTurn(entry, await client.load()), /changed/)
      await assert.rejects(client.streamReply('week', { previewScenario: 'service-disconnected' }, () => {}), /disconnected/)
      const failed = (await client.load()).conversations.week.messages.at(-1)
      assert.equal(failed.status, 'failed')
      assert.equal(failed.text, '')
      assert.equal(failed.activity.status, 'failed')
      assert.match(failed.activity.steps[0].failure.recovery, /Normal preview/)
      const recovered = await client.streamReply('week', { retryMessageId: failed.id }, () => {})
      assert.equal(recovered.responseFamilyId, failed.id)
      assert.equal(recovered.contextMessageId, saved.id)
      assert.equal(recovered.status, 'complete')
    })
  } finally { globalThis.setTimeout = originalTimeout }
  process.stdout.write(`${JSON.stringify({ status: 'passed', checks }, null, 2)}\n`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
