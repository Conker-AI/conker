const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { webcrypto } = require('node:crypto')

const dashboard = path.resolve(__dirname, '..')
// A staged source tree may fall back to the installed app for unchanged modules.
const baseArg = process.argv.indexOf('--base-root')
const base = baseArg < 0 ? dashboard : path.resolve(process.argv[baseArg + 1])
const ts = require(path.join(base, 'node_modules/typescript'))
const cache = new Map()
globalThis.crypto ??= webcrypto

function load(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/')
  if (cache.has(normalized)) return cache.get(normalized).exports
  const staged = path.join(dashboard, normalized)
  const filename = fs.existsSync(staged) ? staged : path.join(base, normalized)
  const source = fs.readFileSync(filename, 'utf8').replaceAll('import.meta.env', '({})')
  const compiled = ts.transpileModule(source, {
    fileName: filename,
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  assert.equal((compiled.diagnostics || []).length, 0, `Syntax diagnostics in ${normalized}`)
  const module = { exports: {} }
  cache.set(normalized, module)
  const resolve = request => {
    assert.ok(request.startsWith('.'), `Unexpected runtime dependency ${request}`)
    const imported = path.posix.normalize(path.posix.join(path.posix.dirname(normalized), request))
    return load(`${imported}.ts`)
  }
  new Function('require', 'module', 'exports', compiled.outputText)(resolve, module, module.exports)
  return module.exports
}

async function main() {
  const { createFixtureClient } = load('src/lib/api/fixture-adapter.ts')
  const { getAvailableModels } = load('src/lib/api/model-catalogue.ts')
  const checks = []
  const check = async (label, callback) => { await callback(); checks.push(label) }

  await check('Existing scenarios normalize once; main conversation begins empty', async () => {
    const state = await createFixtureClient().load()
    for (const session of state.sessions) {
      const conversation = state.conversations[session.id]
      assert.ok(conversation)
      const thread = state.threads[session.id]
      assert.equal(conversation.messages.length, thread ? thread.messages.length + 1 : 0)
      assert.equal(conversation.messages.filter(message => message.scenario).length, thread ? 1 : 0)
      assert.equal(conversation.usage.costUsd, null)
      assert.equal(conversation.usage.mode, 'sample')
      assert.equal(conversation.memory.writeEnabled, false)
      assert.deepEqual(conversation.grants, [])
      for (const message of conversation.messages) {
        if (!message.source?.href) continue
        const target = decodeURIComponent(new URL(message.source.href, 'http://localhost').hash.slice(1))
        assert.ok(conversation.messages.some(item => item.id === target), `Source must resolve to a real message in ${session.id}`)
      }
    }
    assert.equal(state.conversations.judo.parentSessionId, 'week')
    assert.deepEqual(state.conversations.companion.messages, [])
  })

  await check('Instances and returned snapshots cannot mutate each other', async () => {
    const client = createFixtureClient()
    const state = await client.load()
    state.conversations.week.messages[0].text = 'External mutation'
    state.modelsConfiguration.providers[0].apiKeyDraft = 'test-key-do-not-expose'
    const fresh = await client.load()
    assert.notEqual(fresh.conversations.week.messages[0].text, 'External mutation')
    assert.notEqual(fresh.modelsConfiguration.providers[0].apiKeyDraft, 'test-key-do-not-expose')
    await client.updateConversation('week', { title: 'Changed', pinned: false })
    assert.notEqual((await createFixtureClient().load()).sessions.find(item => item.id === 'week').title, 'Changed')
  })

  await check('New chats reuse empty drafts, select agents, and enter history on first send', async () => {
    const client = createFixtureClient()
    const [first, duplicate] = await Promise.all([client.createConversation('conker'), client.createConversation('conker')])
    assert.equal(first.id, duplicate.id)
    assert.notEqual(first.id, 'companion')
    assert.equal(first.isDraft, true)
    const workshop = await client.createConversation('workshop')
    assert.notEqual(first.id, workshop.id)
    assert.equal(workshop.agentId, 'workshop')
    await client.handoffConversation(first.id, 'workshop')
    let state = await client.load()
    assert.deepEqual(state.conversations[first.id].handoffs, [])
    assert.equal(state.conversations[first.id].initialAgentId, 'workshop')
    await client.sendMessage(first.id, '  Build a website\nfor my projects  ')
    state = await client.load()
    assert.equal(state.sessions[0].id, first.id)
    assert.equal(state.sessions[0].isDraft, false)
    assert.equal(state.sessions[0].title, 'Build a website for my projects')
    assert.equal(state.conversations.companion.messages.length, 0)
    await assert.rejects(client.createConversation('invented-agent'), /available agent/)
    await assert.rejects(client.handoffConversation('companion', 'workshop'), /keeps its identity/)
  })

  await check('Handoffs preserve authors and privacy; forks restore the agent at their message boundary', async () => {
    const client = createFixtureClient()
    const original = (await client.load()).conversations.week.messages
    await client.updateConversation('week', { privacy: { harnessDisabled: true } })
    await client.handoffConversation('week', 'workshop')
    let state = await client.load()
    assert.deepEqual(state.conversations.week.messages, original)
    assert.equal(state.conversations.week.handoffs.length, 1)
    assert.equal(state.sessions.find(session => session.id === 'week').agentId, 'workshop')
    assert.deepEqual(state.conversations.week.privacy, { memoryDisabled: false, harnessDisabled: true })
    assert.deepEqual(state.conversations.week.grants, [])
    const earlier = await client.forkConversation('week', original.at(-1).id)
    state = await client.load()
    assert.equal(earlier.agentId, 'conker')
    assert.deepEqual(state.conversations[earlier.id].handoffs, [])
    const sent = await client.sendMessage('week', 'Continue the work.')
    const controller = new AbortController()
    const running = client.streamReply('week', { signal: controller.signal }, () => controller.abort())
    await assert.rejects(client.handoffConversation('week', 'conker'), /Stop the current reply/)
    const reply = await running
    assert.equal(reply.agentId, 'workshop')
    assert.equal(reply.agentName, 'Workshop')
    const later = await client.forkConversation('week', sent.id)
    state = await client.load()
    assert.equal(later.agentId, 'workshop')
    assert.equal(state.conversations[later.id].handoffs.length, 1)
    await client.handoffConversation('week', 'conker')
    state = await client.load()
    assert.equal(state.conversations[later.id].handoffs.length, 1)
    assert.equal(state.conversations.week.handoffs.length, 2)
    await client.updateConversation('week', { archived: true })
    await assert.rejects(client.handoffConversation('week', 'workshop'), /Restore/)
  })

  await check('Send preserves reply context and synchronizes legacy local messages', async () => {
    const client = createFixtureClient()
    const sent = await client.sendMessage('week', '  This is my next turn.  ', { replyTo: 'intent' })
    const state = await client.load()
    assert.equal(state.messages.week[0].id, sent.id)
    assert.equal(state.messages.week[0].text, 'This is my next turn.')
    assert.equal(state.conversations.week.messages.at(-1).replyTo, 'intent')
    assert.equal(state.conversations.week.messages.at(-1).role, 'user')
    assert.equal(state.sessions.find(item => item.id === 'week').minutesAgo, 0)
    await assert.rejects(client.sendMessage('week', 'A reply', { replyTo: 'missing' }), /no longer available/)
    await assert.rejects(client.sendMessage('missing', 'A reply'), /not found/)
    await assert.rejects(client.sendMessage('week', 'x'.repeat(4001)), /4,000/)
    await assert.rejects(client.sendMessage('week', '   '), /4,000/)
  })

  await check('Edits invalidate scenario cards and update legacy source text', async () => {
    const client = createFixtureClient()
    const edited = await client.updateMessage('week', 'week-assistant', { text: 'A revised sample reply.' })
    assert.equal(edited.edited, true)
    assert.equal(edited.scenario, false)
    assert.equal((await client.load()).threads.week.reply, edited.text)
    const user = await client.updateMessage('week', 'intent', { text: 'A corrected question.' })
    assert.equal(user.edited, true)
    assert.equal((await client.load()).threads.week.messages[0].text, user.text)
    await assert.rejects(client.updateMessage('week', 'intent', { text: '' }), /4,000/)
  })

  await check('Redaction keeps an irreversible empty tombstone and scrubs compatibility copies', async () => {
    const client = createFixtureClient()
    const sent = await client.sendMessage('week', 'Private example text')
    await client.updateMessage('week', sent.id, { pinned: true })
    const redacted = await client.updateMessage('week', sent.id, { redacted: true })
    assert.equal(redacted.text, '')
    assert.equal(redacted.redacted, true)
    assert.equal(redacted.pinned, false)
    assert.equal(redacted.source, undefined)
    assert.equal((await client.load()).messages.week[0].text, '')
    await client.updateMessage('week', 'intent', { redacted: true })
    assert.equal((await client.load()).threads.week.messages[0].text, '')
    await assert.rejects(client.updateMessage('week', sent.id, { text: 'Restore' }), /cannot be restored/)
    await assert.rejects(client.forkConversation('week', sent.id), /available message/)
    await assert.rejects(client.sendMessage('week', 'Reply', { replyTo: sent.id }), /no longer available/)
  })

  await check('Forks copy only through the selected message with independent state and no grants', async () => {
    const client = createFixtureClient()
    await client.updateConversation('week', { incognito: true })
    const original = (await client.load()).conversations.week
    const fork = await client.forkConversation('week', 'intent')
    let state = await client.load()
    assert.equal(state.conversations[fork.id].messages.length, 1)
    assert.equal(state.conversations[fork.id].parentSessionId, 'week')
    assert.equal(state.conversations[fork.id].forkMessageId, 'intent')
    assert.equal(state.conversations[fork.id].incognito, true)
    assert.equal(state.conversations[fork.id].memory.scope, 'none')
    assert.deepEqual(state.conversations[fork.id].grants, [])
    assert.equal(state.conversations[fork.id].autonomy.level, 'ask')
    assert.ok(state.conversations[fork.id].messages.every(message => !message.scenario))
    assert.deepEqual(state.conversations.week, original)
    await client.updateMessage(fork.id, 'intent', { text: 'Only the fork changes.' })
    state = await client.load()
    assert.notEqual(state.conversations.week.messages[0].text, state.conversations[fork.id].messages[0].text)
    assert.equal(state.messages[fork.id][0].text, 'Only the fork changes.')
  })

  await check('Incognito changes read scope without pretending to enable remote privacy', async () => {
    const client = createFixtureClient()
    await client.updateConversation('week', { incognito: true })
    let state = await client.load()
    assert.deepEqual(state.conversations.week.memory, { scope: 'none', sources: [], writeEnabled: false })
    await client.updateConversation('week', { incognito: false })
    state = await client.load()
    assert.equal(state.conversations.week.memory.scope, 'conversation')
    assert.equal(state.conversations.week.memory.writeEnabled, false)
  })

  await check('Memory and harness exclusions are independent, scoped, and inherited by forks', async () => {
    const client = createFixtureClient()
    const originalMemory = (await client.load()).conversations.week.memory
    await client.updateConversation('week', { privacy: { harnessDisabled: true } })
    let state = await client.load()
    assert.deepEqual(state.conversations.week.privacy, { memoryDisabled: false, harnessDisabled: true })
    assert.deepEqual(state.conversations.week.memory, originalMemory)
    assert.equal(state.conversations.week.incognito, true)
    assert.equal(state.conversations.companion.incognito, false)
    const fork = await client.forkConversation('week', 'intent')
    state = await client.load()
    assert.deepEqual(state.conversations[fork.id].privacy, state.conversations.week.privacy)
    assert.equal(state.conversations[fork.id].memory.scope, 'conversation')
    await client.updateConversation('week', { privacy: { memoryDisabled: true } })
    state = await client.load()
    assert.deepEqual(state.conversations.week.privacy, { memoryDisabled: true, harnessDisabled: true })
    assert.equal(state.conversations.week.memory.scope, 'none')
    assert.equal(state.conversations[fork.id].privacy.memoryDisabled, false)
    await client.updateConversation('week', { privacy: { harnessDisabled: false } })
    state = await client.load()
    assert.deepEqual(state.conversations.week.privacy, { memoryDisabled: true, harnessDisabled: false })
    assert.equal(state.conversations.week.memory.scope, 'none')
    await client.updateConversation('week', { privacy: { memoryDisabled: false } })
    state = await client.load()
    assert.equal(state.conversations.week.incognito, false)
    assert.equal(state.conversations.week.memory.scope, 'conversation')
    await assert.rejects(client.updateConversation('week', { privacy: { memoryDisabled: 'yes' } }), /valid conversation privacy/)
    await assert.rejects(client.updateConversation('week', { privacy: { unknown: true } }), /valid conversation privacy/)
  })

  await check('Archive and restore work for regular and canonical conversations', async () => {
    const client = createFixtureClient()
    for (const id of ['week', 'companion']) {
      await client.updateConversation(id, { archived: true })
      assert.equal((await client.load()).sessions.find(item => item.id === id).archived, true)
      await assert.rejects(client.sendMessage(id, 'Hello'), /Restore/)
      await client.updateConversation(id, { archived: false })
      await client.sendMessage(id, 'Hello again')
    }
    await assert.rejects(client.updateConversation('week', { title: ' ' }), /120/)
    await assert.rejects(client.updateConversation('week', { title: 'x'.repeat(121) }), /120/)
    await assert.rejects(client.updateConversation('week', { pinned: 'yes' }), /valid conversation/)
  })

  await check('Deleting regular sessions removes their content; existing forks remain independent', async () => {
    const client = createFixtureClient()
    const fork = await client.forkConversation('week', 'intent')
    await client.requestReply('week')
    await client.deleteConversation('week')
    const state = await client.load()
    assert.equal(state.sessions.some(item => item.id === 'week'), false)
    for (const collection of ['messages', 'threads', 'conversations']) assert.equal(state[collection].week, undefined)
    assert.equal(state.replyRequests.includes('week'), false)
    assert.equal(state.conversations[fork.id].messages.length, 1)
    assert.equal(state.conversations[fork.id].parentSessionId, 'week')
    await assert.rejects(client.deleteConversation('missing'), /not found/)
  })

  await check('Clearing main conversation retains its stable workspace and clears mode/content', async () => {
    const client = createFixtureClient()
    await client.sendMessage('companion', 'Hello')
    await client.updateConversation('companion', { incognito: true, archived: true })
    await client.requestReply('companion')
    await client.deleteConversation('companion')
    const state = await client.load()
    assert.equal(state.companionSessionId, 'companion')
    assert.equal(state.sessions.filter(item => item.id === 'companion').length, 1)
    assert.equal(state.sessions.find(item => item.id === 'companion').archived, false)
    assert.deepEqual(state.conversations.companion.messages, [])
    assert.equal(state.conversations.companion.incognito, false)
    assert.equal(state.messages.companion, undefined)
    assert.equal(state.replyRequests.includes('companion'), false)
  })

  await check('Model overrides validate enabled catalogue and return to the default when disabled', async () => {
    const client = createFixtureClient()
    const config = (await client.load()).modelsConfiguration
    const enabled = getAvailableModels(config)
    assert.ok(enabled.length > 1)
    await client.updateConversation('week', { modelId: enabled[0].id })
    assert.equal((await client.load()).conversations.week.modelId, enabled[0].id)
    await assert.rejects(client.updateConversation('week', { modelId: 'invented-model' }), /enabled model/)
    config.models.find(model => model.id === enabled[0].id).enabled = false
    config.defaultModelId = enabled[1].id
    await client.saveModelsConfiguration(config)
    const state = await client.load()
    assert.equal(state.conversations.week.modelId, null)
    assert.equal(state.modelsConfiguration.defaultModelId, enabled[1].id)
    config.defaultModelId = 'invented-model'
    await assert.rejects(client.saveModelsConfiguration(config))
    assert.equal((await client.load()).modelsConfiguration.defaultModelId, enabled[1].id)
  })

  // The adapter still traverses real async boundaries; shorten only fixture pacing.
  const nativeTimeout = globalThis.setTimeout
  globalThis.setTimeout = (callback, delay, ...args) => nativeTimeout(callback, Math.min(delay, 2), ...args)
  try {
    await check('Simulation uses the selected default and emits deltas without executing anything', async () => {
      const client = createFixtureClient()
      await client.sendMessage('companion', 'Please help with a task.')
      const before = await client.load()
      let text = ''
      const reply = await client.streamReply('companion', {}, chunk => { text += chunk })
      const state = await client.load()
      assert.equal(reply.text, text)
      assert.match(reply.text, /^Simulated reply:/)
      assert.match(reply.text, /No tools have run/)
      assert.equal(reply.modelId, before.modelsConfiguration.defaultModelId)
      assert.equal(reply.status, 'complete')
      assert.equal(state.conversations.companion.messages.at(-1).id, reply.id)
      assert.equal(state.conversations.companion.usage.costUsd, null)
      for (const key of ['tickets', 'jobs', 'entries', 'replyRequests']) assert.deepEqual(state[key], before[key])
    })

    await check('A retry appends a response for its requested model and cannot replay scenario effects', async () => {
      const client = createFixtureClient()
      const before = await client.load()
      const chosen = getAvailableModels(before.modelsConfiguration).at(-1).id
      const reply = await client.streamReply('server', { modelId: chosen, retryMessageId: 'server-assistant' }, () => {})
      const state = await client.load()
      assert.equal(reply.retryOf, 'server-assistant')
      assert.equal(reply.modelId, chosen)
      assert.equal(reply.scenario, undefined)
      assert.equal(state.conversations.server.messages.length, before.conversations.server.messages.length + 1)
      for (const key of ['tickets', 'jobs', 'entries', 'threads', 'replyRequests']) assert.deepEqual(state[key], before[key])
      await assert.rejects(client.streamReply('server', { retryMessageId: 'intent' }, () => {}), /companion message/)
      await client.updateMessage('server', 'server-assistant', { redacted: true })
      await assert.rejects(client.streamReply('server', { retryMessageId: 'server-assistant' }, () => {}), /companion message/)
    })

    await check('Abort during thinking creates no phantom assistant message', async () => {
      const client = createFixtureClient()
      const controller = new AbortController()
      controller.abort()
      const before = (await client.load()).conversations.week.messages.length
      await assert.rejects(client.streamReply('week', { signal: controller.signal }, () => {}), { name: 'AbortError' })
      assert.equal((await client.load()).conversations.week.messages.length, before)
    })

    await check('Stop after a chunk preserves a partial stopped reply and releases the stream lock', async () => {
      const client = createFixtureClient()
      const controller = new AbortController()
      let chunks = 0
      const reply = await client.streamReply('week', { signal: controller.signal }, () => { chunks++; controller.abort() })
      assert.equal(chunks, 1)
      assert.equal(reply.status, 'stopped')
      assert.ok(reply.text.length > 0 && reply.text.length < 20)
      assert.equal((await client.load()).conversations.week.messages.at(-1).status, 'stopped')
      await client.sendMessage('week', 'A next turn can be sent.')
    })

    await check('Concurrent sends and destructive changes cannot corrupt an active stream', async () => {
      const client = createFixtureClient()
      const controller = new AbortController()
      const running = client.streamReply('week', { signal: controller.signal }, () => {})
      const stopped = running.catch(error => error)
      await assert.rejects(client.sendMessage('week', 'Conflicting turn'), /Stop/)
      await assert.rejects(client.streamReply('week', {}, () => {}), /Stop/)
      await assert.rejects(client.deleteConversation('week'), /Stop/)
      await assert.rejects(client.forkConversation('week', 'intent'), /Stop/)
      await assert.rejects(client.updateMessage('week', 'intent', { text: 'Conflicting edit' }), /Stop/)
      controller.abort()
      assert.equal((await stopped).name, 'AbortError')
    })

    await check('Provider key drafts stay out of conversation references and simulated responses', async () => {
      const client = createFixtureClient()
      const config = (await client.load()).modelsConfiguration
      config.providers[0].apiKeyDraft = 'test-key-do-not-expose'
      await client.saveModelsConfiguration(config)
      await client.streamReply('week', {}, () => {})
      const state = await client.load()
      assert.equal(JSON.stringify(state.conversations).includes('test-key-do-not-expose'), false)
    })
  } finally { globalThis.setTimeout = nativeTimeout }

  process.stdout.write(`${JSON.stringify({ status: 'passed', checks }, null, 2)}\n`)
}

main().catch(error => { console.error(error); process.exitCode = 1 })
