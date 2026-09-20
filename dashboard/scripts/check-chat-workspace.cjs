const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { createRequire } = require('node:module')
const { webcrypto } = require('node:crypto')
globalThis.crypto ??= webcrypto
const root = path.resolve(__dirname, '..')
const fromRoot = createRequire(path.join(root, 'package.json'))
const { build } = createRequire(fromRoot.resolve('vite'))('esbuild')
const tick = () => new Promise(resolve => setImmediate(resolve))
const settle = async () => { for (let index = 0; index < 12; index++) await tick() }

async function main() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'conker-workspace-'))
  try {
    const output = path.join(temporary, 'workspace.cjs')
    await build({ stdin: { contents: 'export {useConversationWorkspace} from "./src/lib/conversation-workspace"; export {useConkerStore} from "./src/lib/api/store"; export {conkerClient} from "./src/lib/api"; export {prepareAttachments, attachmentPreview} from "./src/lib/conversation-attachments";', resolveDir: root }, outfile: output, bundle: true, platform: 'node', format: 'cjs', define: { 'import.meta.env': '{}' }, tsconfig: path.join(root, 'tsconfig.app.json'), logLevel: 'silent' })
    const { useConversationWorkspace: workspace, useConkerStore: store, conkerClient: client, prepareAttachments, attachmentPreview } = require(output)
    const originalSend = client.sendMessage
    const originalStream = client.streamReply
    const calls = []
    client.streamReply = (id, options) => new Promise((resolve, reject) => {
      let ended = false
      const finish = (error) => {
        if (ended) return
        ended = true
        options.signal?.removeEventListener('abort', abort)
        if (error) reject(error)
        else resolve({ id: crypto.randomUUID(), role: 'assistant', text: 'Controlled transport response', createdAt: new Date().toISOString(), status: 'complete' })
      }
      const abort = () => { const error = new Error('Stopped'); error.name = 'AbortError'; finish(error) }
      calls.push({ id, options, complete: () => finish(), fail: () => finish(new Error('Controlled transport failure')) })
      options.signal?.addEventListener('abort', abort, { once: true })
      if (options.signal?.aborted) abort()
    })
    const controlledStream = client.streamReply
    await store.getState().load()
    const make = async () => { const session = await client.createConversation('conker'); workspace.getState().reset(session.id); store.getState().setDraft(session.id, ''); await store.getState().load(); return session.id }
    const draft = (id, text) => store.getState().setDraft(id, text)
    const w = () => workspace.getState()
    const users = id => store.getState().data.conversations[id].messages.filter(message => message.role === 'user')
    const checks = [], failures = []
    const check = async (label, action) => {
      try { await action(); checks.push(label) }
      catch (error) { failures.push({ label, error }); }
      finally { client.sendMessage = originalSend; client.streamReply = controlledStream; for (const id of Object.keys(w().streams)) if (w().streams[id]) w().stop(id); await settle() }
    }

    await check('Queue drains once, preserves captured model and accepts edit/remove while streaming', async () => {
      const id = await make(), start = calls.length
      draft(id, 'first'); const sending = w().send(id); await settle()
      assert.equal(calls.length, start + 1)
      w().setNextModel(id, 'openrouter-gpt'); draft(id, 'second'); w().enqueue(id)
      const second = w().queues[id].entries[0]
      draft(id, 'third'); w().enqueue(id)
      const third = w().queues[id].entries[1]
      assert.equal(w().editQueued(id, second.id, 'second edited'), true)
      w().removeQueued(id, third.id)
      w().setNextModel(id, 'anthropic-sonnet')
      calls[start].complete(); await settle()
      assert.equal(calls.length, start + 2)
      assert.equal(calls[start + 1].options.modelId, 'openrouter-gpt')
      assert.deepEqual(users(id).map(message => message.text), ['first', 'second edited'])
      calls[start + 1].complete(); await sending
      assert.equal(w().queues[id].entries.length, 0)
      assert.equal(w().nextModels[id], 'anthropic-sonnet')
    })

    await check('Stop pauses unsent entries; explicit Resume dispatches once', async () => {
      const id = await make(), start = calls.length
      draft(id, 'first'); const sending = w().send(id); await settle()
      draft(id, 'queued'); w().enqueue(id); w().stop(id); await sending
      assert.equal(w().queues[id].paused, true); assert.equal(calls.length, start + 1)
      const resuming = w().resumeQueue(id); await settle()
      assert.equal(calls.length, start + 2); calls[start + 1].complete(); await resuming
      assert.deepEqual(users(id).map(message => message.text), ['first', 'queued'])
    })

    await check('Response failure retains a saved queue entry; Resume does not duplicate its user message', async () => {
      const id = await make(), start = calls.length
      draft(id, 'queued failure'); w().enqueue(id); await settle()
      calls[start].fail(); await settle()
      assert.equal(users(id).length, 1); assert.ok(w().queues[id].entries[0].sentMessageId)
      assert.equal(w().queues[id].paused, true)
      const resuming = w().resumeQueue(id); await settle(); calls[start + 1].complete(); await resuming
      assert.equal(users(id).length, 1); assert.equal(w().queues[id].entries.length, 0)
    })

    await check('Save failure retains the unsent entry and never starts a response', async () => {
      const id = await make(), start = calls.length
      client.sendMessage = async () => { throw new Error('Controlled save failure') }
      draft(id, 'save me'); w().enqueue(id); await settle()
      assert.equal(calls.length, start); assert.equal(users(id).length, 0)
      assert.equal(w().queues[id].entries[0].text, 'save me'); assert.equal(w().queues[id].paused, true)
    })

    await check('Privacy changes pause queued requests and require explicit review before dispatch', async () => {
      const id = await make(), start = calls.length
      w().pauseQueue(id); draft(id, 'private request'); w().enqueue(id)
      await client.updateConversation(id, { privacy: { memoryDisabled: true } }); await store.getState().load()
      await w().resumeQueue(id); assert.equal(calls.length, start)
      assert.match(w().queues[id].reason, /Incognito/)
      assert.equal(w().reviewQueued(id, w().queues[id].entries[0].id), true)
      const resuming = w().resumeQueue(id); await settle(); assert.equal(calls.length, start + 1, JSON.stringify({ queue: w().queues[id], notice: w().notices[id], pending: store.getState().pending, error: store.getState().error }))
      calls[start].complete(); await resuming
    })

    await check('A saved queued request edited after failure must not resume under stale queued text', async () => {
      const id = await make(), start = calls.length
      draft(id, 'original'); w().enqueue(id); await settle(); calls[start].fail(); await settle()
      const entry = w().queues[id].entries[0]
      await client.updateMessage(id, entry.sentMessageId, { text: 'changed request' }); await store.getState().load()
      const resuming = w().resumeQueue(id); await settle()
      assert.equal(calls.length, start + 1, 'Edited saved request was dispatched using stale queue metadata')
      await resuming
    })

    await check('Authority is revalidated after saving a queued message, before response dispatch', async () => {
      const id = await make(), start = calls.length
      client.sendMessage = async (...args) => {
        const message = await originalSend(...args)
        await client.updateConversation(id, { privacy: { harnessDisabled: true } })
        return message
      }
      draft(id, 'captured privacy'); w().enqueue(id); await settle()
      assert.equal(calls.length, start, 'Response started after its privacy snapshot became invalid during save')
      assert.equal(w().queues[id].paused, true)
    })

    await check('A queued turn with no reply target never inherits a later composer reply selection', async () => {
      const id = await make(), start = calls.length
      const original = await client.sendMessage(id, 'Existing context'); await store.getState().load()
      w().pauseQueue(id); draft(id, 'No reply target'); w().enqueue(id)
      w().setReply(id, original.id)
      const resuming = w().resumeQueue(id); await settle()
      const saved = users(id).find(message => message.text === 'No reply target')
      assert.equal(saved.replyTo, undefined, 'Queued request inherited a reply selection made after it was captured')
      assert.equal(calls.length, start + 1); calls[start].complete(); await resuming
      assert.equal(w().replies[id], original.id, 'Future composer reply selection must stay available')
    })

    await check('Queue limit keeps the sixth draft and never silently drops an entry', async () => {
      const id = await make()
      w().pauseQueue(id)
      for (let index = 1; index <= 6; index++) { draft(id, `Request ${index}`); w().enqueue(id) }
      assert.equal(w().queues[id].entries.length, 5)
      assert.equal(store.getState().drafts[id], 'Request 6')
      assert.match(w().notices[id], /up to 5/)
    })

    await check('Disabled model blocks a captured queue even when another model becomes the default', async () => {
      const id = await make(), start = calls.length
      w().pauseQueue(id); draft(id, 'Keep my route'); w().enqueue(id)
      const config = structuredClone(store.getState().data.modelsConfiguration)
      config.models.find(model => model.id === 'openrouter-sonnet').enabled = false
      config.defaultModelId = 'openrouter-gpt'
      await client.saveModelsConfiguration(config); await store.getState().load()
      await w().resumeQueue(id); assert.equal(calls.length, start); assert.match(w().queues[id].reason, /disabled/)
      config.models.find(model => model.id === 'openrouter-sonnet').enabled = true
      config.defaultModelId = 'openrouter-sonnet'
      await client.saveModelsConfiguration(config); await store.getState().load()
      assert.equal(w().queues[id].paused, true); assert.equal(calls.length, start)
    })

    await check('Two conversation streams and queues remain isolated when one conversation stops', async () => {
      const first = await make(), start = calls.length
      draft(first, 'First chat'); const firstSending = w().send(first); await settle()
      const second = await make()
      assert.notEqual(first, second)
      draft(second, 'Second chat'); const secondSending = w().send(second); await settle()
      draft(first, 'First queued'); w().enqueue(first)
      draft(second, 'Second queued'); w().enqueue(second)
      w().stop(first); await firstSending
      calls[start + 1].complete(); await settle()
      assert.equal(calls[start + 2].id, second)
      calls[start + 2].complete(); await secondSending
      assert.deepEqual(users(first).map(message => message.text), ['First chat'])
      assert.deepEqual(users(second).map(message => message.text), ['Second chat', 'Second queued'])
      assert.equal(w().queues[first].entries[0].text, 'First queued')
      assert.equal(w().queues[first].paused, true)
      assert.equal(w().queues[second].entries.length, 0)
    })

    await check('Retrying response text does not replay the selected action preview scenario', async () => {
      const start = calls.length
      w().setPreview('week', 'search-read')
      const retrying = w().retry('week', 'week-assistant', 'openrouter-sonnet'); await settle()
      assert.equal(calls.length, start + 1)
      assert.equal(calls[start].options.retryMessageId, 'week-assistant')
      assert.equal(calls[start].options.previewScenario, undefined, 'A response retry inherited action preview selection')
      calls[start].complete(); await retrying
    })

    await check('Retrying past an unresolved approval cannot bypass queue pause; resolved and redacted waits do not block', async () => {
      const id = await make(), start = calls.length
      await originalSend(id, 'Request needing approval')
      const waiting = await originalStream(id, { previewScenario: 'approval-wait' }, () => {})
      await originalStream(id, { retryMessageId: waiting.id }, () => {})
      await store.getState().load()
      assert.notEqual(store.getState().data.conversations[id].messages.at(-1).id, waiting.id)
      w().pauseQueue(id); draft(id, 'Queued behind pending approval'); w().enqueue(id)
      await w().resumeQueue(id)
      assert.equal(calls.length, start, 'A newer successful retry hid an unresolved earlier approval')
      assert.match(w().queues[id].reason, /decision/)

      await client.updateMessage(id, waiting.id, { redacted: true }); await store.getState().load()
      const afterRedaction = w().resumeQueue(id); await settle()
      assert.equal(calls.length, start + 1, 'Redacted wait incorrectly blocks the queue')
      calls[start].complete(); await afterRedaction

      await originalStream(id, { previewScenario: 'approval-wait' }, () => {})
      await store.getState().load()
      w().pauseQueue(id); draft(id, 'Queued until resolved'); w().enqueue(id)
      await w().resumeQueue(id)
      assert.equal(calls.length, start + 1)
      await client.decideTicket('coach', 'Denied'); await store.getState().load()
      const afterDecision = w().resumeQueue(id); await settle()
      assert.equal(calls.length, start + 2, 'A resolved Inbox request incorrectly blocks the queue')
      calls[start + 1].complete(); await afterDecision
    })

    await check('Context-blocked saved request can recover without duplicate input or invented attempt', async () => {
      const id = await make()
      client.streamReply = originalStream
      const budget = { contextWindowTokens: 20, outputReserveTokens: 10, otherInputTokens: 0 }
      await client.updateConversation(id, { contextPolicy: { sessionInstructions: '', messagePolicies: {}, budget } }); await store.getState().load()
      draft(id, 'This request deliberately exceeds the tiny configured context budget and must be preserved for recovery.')
      await w().send(id)
      const request = users(id)[0]
      assert.ok(request)
      assert.equal(w().unanswered[id].messageId, request.id)
      assert.equal(store.getState().drafts[id], '')
      assert.equal(store.getState().data.conversations[id].messages.length, 1, 'Preflight rejection must not invent an assistant/execution record')
      assert.equal(w().activities[id], undefined)
      await client.updateConversation(id, { contextPolicy: { sessionInstructions: '', messagePolicies: {}, budget: { ...budget, contextWindowTokens: 8192 } } }); await store.getState().load()
      draft(id, 'A separate unsent next-turn draft')
      w().setPreview(id, 'search-read')
      assert.equal(await w().retryUnanswered(id), true)
      const messages = store.getState().data.conversations[id].messages
      assert.equal(users(id).length, 1)
      assert.equal(messages.length, 2)
      assert.equal(messages[1].contextMessageId, request.id)
      assert.ok(messages[1].activity.steps.every(step => step.kind === 'phase'), 'Recovery must not run the selected action preview')
      assert.equal(w().unanswered[id], undefined)
      assert.equal(store.getState().drafts[id], 'A separate unsent next-turn draft')
      assert.equal(w().previews[id], 'search-read')
      assert.equal(w().queues[id].paused, true)
    })

    await check('Unanswered recovery refuses redacted or superseded requests', async () => {
      const id = await make()
      client.streamReply = originalStream
      await client.updateConversation(id, { contextPolicy: { sessionInstructions: '', messagePolicies: {}, budget: { contextWindowTokens: 20, outputReserveTokens: 10, otherInputTokens: 0 } } }); await store.getState().load()
      draft(id, 'An over-budget request with enough text to force the context preflight to reject it.')
      await w().send(id)
      const request = users(id)[0]
      assert.ok(w().unanswered[id])
      await client.updateMessage(id, request.id, { redacted: true }); await store.getState().load()
      assert.equal(await w().retryUnanswered(id), false)
      assert.equal(store.getState().data.conversations[id].messages.length, 1)
      assert.equal(users(id)[0].text, '')
      draft(id, 'Another over-budget request whose captured boundary must never be silently replaced.')
      await w().send(id)
      const blockedId = w().unanswered[id].messageId
      await originalSend(id, 'A later saved request'); await store.getState().load()
      assert.notEqual(users(id).at(-1).id, blockedId)
      const count = store.getState().data.conversations[id].messages.length
      assert.equal(await w().retryUnanswered(id), false)
      assert.equal(store.getState().data.conversations[id].messages.length, count)
    })

    await check('Attachment-only drafts survive failed saves and queue review without loss or duplication', async () => {
      const id = await make()
      const file = { id: 'attached-file', name: 'diagram.png', type: 'image/png', size: 120, lastModified: 1 }
      store.getState().setAttachments(id, [file])
      client.sendMessage = async () => { throw new Error('Save unavailable') }
      await w().send(id)
      assert.deepEqual(store.getState().attachmentDrafts[id], [file])
      assert.equal(users(id).length, 0)
      client.sendMessage = originalSend
      const sending = w().send(id)
      await settle()
      assert.deepEqual(users(id)[0].attachments, [file])
      assert.deepEqual(store.getState().attachmentDrafts[id], [])
      const queuedFile = { ...file, id: 'queued-file', name: 'queued.png' }
      store.getState().setAttachments(id, [queuedFile])
      w().enqueue(id)
      w().pauseQueue(id)
      const queued = w().queues[id].entries[0]
      assert.deepEqual(queued.attachments, [queuedFile])
      assert.equal(w().editQueued(id, queued.id, ''), true)
      assert.equal(w().reviewQueued(id, queued.id), true)
      assert.deepEqual(w().queues[id].entries[0].attachments, [queuedFile])
      calls.at(-1).complete(); await sending; await settle()
      const resuming = w().resumeQueue(id); await settle()
      assert.deepEqual(users(id).at(-1).attachments, [queuedFile])
      calls.at(-1).fail(); await resuming; await settle()
      const retrying = w().resumeQueue(id); await settle()
      assert.equal(users(id).length, 2, 'Resuming a saved queued attachment must not resend it')
      calls.at(-1).complete(); await retrying
      assert.equal(w().queues[id].entries.length, 0)
    })

    await check('Local file previews prune only after the last message, fork, queue, or draft reference disappears', async () => {
      const id = await make()
      const files = prepareAttachments([new File(['png fixture'], 'preview.png', { type: 'image/png' })], [])
      store.getState().setAttachments(id, files)
      const url = attachmentPreview(files[0])
      assert.ok(url)
      const sending = w().send(id); await settle()
      assert.equal(attachmentPreview(files[0]), url, 'Save/refresh must not revoke the transitioning draft')
      calls.at(-1).complete(); await sending
      let fork
      await store.getState().mutate(async () => { fork = await client.forkConversation(id, users(id)[0].id) })
      await store.getState().mutate(() => client.updateMessage(id, users(id)[0].id, { redacted: true }))
      assert.equal(attachmentPreview(files[0]), url, 'An independent fork keeps its preview after source redaction')
      await store.getState().mutate(() => client.deleteConversation(fork.id))
      assert.equal(attachmentPreview(files[0]), undefined, 'Last reference deletion releases file bytes and URL')
      const queuedFiles = prepareAttachments([new File(['fixture'], 'queue.png', { type: 'image/png' })], [])
      store.getState().setAttachments(id, queuedFiles)
      w().pauseQueue(id); w().enqueue(id)
      assert.ok(attachmentPreview(queuedFiles[0]))
      w().removeQueued(id, w().queues[id].entries[0].id)
      assert.equal(attachmentPreview(queuedFiles[0]), undefined)
      const draftFiles = prepareAttachments([new File(['fixture'], 'draft.png', { type: 'image/png' })], [])
      store.getState().setAttachments(id, draftFiles)
      assert.ok(attachmentPreview(draftFiles[0]))
      w().reset(id)
      assert.equal(attachmentPreview(draftFiles[0]), undefined)
    })

    console.log(`Workspace checks passed (${checks.length}):\n${checks.map(label => `- ${label}`).join('\n')}`)
    for (const failure of failures) console.error(`FAIL: ${failure.label}\n${failure.error.stack}`)
    if (failures.length) process.exitCode = 1
  } finally {
    assert.ok(path.resolve(temporary).startsWith(`${path.resolve(os.tmpdir())}${path.sep}conker-workspace-`))
    await fs.rm(temporary, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
