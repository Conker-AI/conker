import { describe, expect, it } from 'vitest'
import { createChatContextClient, type ContextPolicy } from '../gateway/chat-context'
import { createChatSummaryClient } from '../gateway/chat-summary'
import { createMemoryDeliveryClient, parseMemoryDelivery, parseMemoryDeliveryRead } from '../gateway/memory-delivery'

type Call = { path: string; init: Record<string, unknown> }
function fakeAuth(...answers: unknown[]) {
  const calls: Call[] = []
  const queue = [...answers]
  const request = async (path: string, init: Record<string, unknown> = {}) => {
    calls.push({ path, init })
    return queue.length > 1 ? queue.shift() : queue[0]
  }
  return { calls, auth: { request } as never }
}
const kind = (promise: Promise<unknown>, expected: string) => expect(promise).rejects.toMatchObject({ name: 'GatewayError', kind: expected })
const hex = (character: string, length = 16) => character.repeat(length)
const sid = `ses_${hex('a')}`
const mid = (character: string) => `msg_${hex(character)}`
const context = `/api/control/pi/context/${sid}`

describe('chat summary client', () => {
  const wire = { revision: 2, summary: 'so far', source_session_id: null, versions: [{ revision: 1, summary: null, source_session_id: sid, created_at: 7, restored_from: 0 }] }
  const summary = { revision: 2, summary: 'so far', sourceSessionId: null, versions: [{ revision: 1, summary: null, sourceSessionId: sid, createdAt: 7, restoredFrom: 0 }] }

  it('reads the summary and camel-cases it, newest version first as Pi sends it', async () => {
    const { auth, calls } = fakeAuth(wire)
    expect(await createChatSummaryClient(auth).summary(sid)).toEqual(summary)
    expect(calls[0].path).toBe(`${context}/summary`)
    await kind(createChatSummaryClient(fakeAuth({ ...wire, extra: 1 }).auth).summary(sid), 'invalid-response')
    await kind(createChatSummaryClient(auth).summary('ses_1'), 'validation')
  })

  it('saves edited text against the revision it saw, within 16000 characters', async () => {
    const { auth, calls } = fakeAuth(wire)
    const client = createChatSummaryClient(auth)
    await client.save(sid, 'text', 2)
    expect(calls[0]).toEqual({ path: `${context}/summary`, init: { method: 'POST', body: { expected_revision: 2, summary: 'text' } } })
    await kind(client.save(sid, 'x'.repeat(16001), 2), 'validation')
    await kind(client.save(sid, 'x', -1), 'validation')
    await kind(client.save(sid, 'x', 1.5), 'validation')
    expect(calls).toHaveLength(1)
  })

  it('restores an earlier version', async () => {
    const { auth, calls } = fakeAuth(wire)
    const client = createChatSummaryClient(auth)
    await client.restore(sid, 1, 2)
    expect(calls[0]).toEqual({ path: `${context}/summary/restore`, init: { method: 'POST', body: { expected_revision: 2, revision: 1 } } })
    await kind(client.restore(sid, -1, 2), 'validation')
    await kind(client.restore(sid, 1, -1), 'validation')
  })

  it('drafts a summary, with a focus only when one is given and at most 500 characters', async () => {
    const draft = { summary: 'new', messageIds: [mid('1')], truncated: false, earlierSummaryIncluded: true, summaryRevision: 1, modelId: 'm', configurationRevision: 3 }
    const { auth, calls } = fakeAuth(draft)
    const client = createChatSummaryClient(auth)
    expect(await client.draft(sid)).toEqual(draft)
    await client.draft(sid, 'the trip')
    expect(calls.map(call => call.init.body)).toEqual([{}, { focus: 'the trip' }])
    await kind(client.draft(sid, 'x'.repeat(501)), 'validation')
    await kind(createChatSummaryClient(fakeAuth({ ...draft, summary: '' }).auth).draft(sid), 'invalid-response')
  })

  it('reads the compaction record and the policy revision', async () => {
    const compaction = { summaryRevision: 1, covered: [mid('1')], folded: [] }
    const { auth, calls } = fakeAuth(compaction, { revision: 6, policy: null })
    const client = createChatSummaryClient(auth)
    expect(await client.compaction(sid)).toEqual(compaction)
    expect(await client.policyRevision(sid)).toBe(6)
    expect(calls.map(call => call.path)).toEqual([`${context}/compaction`, context])
  })

  describe('compacting', () => {
    const params = { policyRevision: 3, summaryRevision: 1, summary: 'folded', covers: [mid('1'), mid('2')] }
    const result = { policyRevision: 4, summaryRevision: 2, covered: [mid('1'), mid('2')], folded: [] }

    it('folds the covered messages into the summary at the revisions it saw', async () => {
      const { auth, calls } = fakeAuth(result)
      expect(await createChatSummaryClient(auth).compact(sid, params)).toEqual(result)
      expect(calls[0]).toEqual({
        path: `${context}/compact`,
        init: { method: 'POST', body: { expected_policy_revision: 3, expected_summary_revision: 1, summary: 'folded', covers: params.covers } },
      })
    })

    it('refuses bad revisions, an empty or oversize summary, and bad or repeated message ids before sending', async () => {
      const { auth, calls } = fakeAuth(result)
      const client = createChatSummaryClient(auth)
      await kind(client.compact(sid, { ...params, policyRevision: 0 }), 'validation')
      await kind(client.compact(sid, { ...params, summaryRevision: -1 }), 'validation')
      await kind(client.compact(sid, { ...params, summary: '' }), 'validation')
      await kind(client.compact(sid, { ...params, summary: 'x'.repeat(16001) }), 'validation')
      await kind(client.compact(sid, { ...params, covers: [] }), 'validation')
      await kind(client.compact(sid, { ...params, covers: Array.from({ length: 10001 }, () => mid('1')) }), 'validation')
      await kind(client.compact(sid, { ...params, covers: ['bad'] }), 'validation')
      await kind(client.compact(sid, { ...params, covers: [mid('1'), mid('1')] }), 'validation')
      expect(calls).toEqual([])
      await kind(createChatSummaryClient(fakeAuth({ nope: 1 }).auth).compact(sid, params), 'invalid-response')
    })
  })

  describe('branching from the summary', () => {
    const forked = { session_id: `ses_${hex('b')}`, parent_id: sid, replayed: false }

    it('starts a new chat after the last message it reviewed, or from the start', async () => {
      const { auth, calls } = fakeAuth(forked)
      const client = createChatSummaryClient(auth)
      expect(await client.fork(sid, { policyRevision: 2, lastMessageId: mid('1'), summary: 'text' })).toEqual({ sessionId: `ses_${hex('b')}` })
      await client.fork(sid, { policyRevision: 2, lastMessageId: null, summary: '' })
      expect(calls[0]).toMatchObject({ path: `${context}/fork`, init: { body: { expected_revision: 2, expected_last_message_id: mid('1'), summary: 'text' } } })
      expect((calls[0].init.body as { request_id: string }).request_id).toMatch(/^[0-9a-f-]{36}$/)
      expect(calls[1].init.body).toMatchObject({ expected_last_message_id: null })
    })

    it('refuses a bad revision, a long summary or a bad message id before sending', async () => {
      const { auth, calls } = fakeAuth(forked)
      const client = createChatSummaryClient(auth)
      await kind(client.fork(sid, { policyRevision: 0, lastMessageId: null, summary: '' }), 'validation')
      await kind(client.fork(sid, { policyRevision: 1, lastMessageId: null, summary: 'x'.repeat(16001) }), 'validation')
      await kind(client.fork(sid, { policyRevision: 1, lastMessageId: 'nope', summary: '' }), 'validation')
      expect(calls).toEqual([])
      await kind(createChatSummaryClient(fakeAuth({ ...forked, replayed: 'no' }).auth).fork(sid, { policyRevision: 1, lastMessageId: null, summary: '' }), 'invalid-response')
    })
  })
})

describe('chat context client', () => {
  const policy: ContextPolicy = {
    sessionInstructions: 'Be brief.',
    messagePolicies: { [mid('1')]: 'keep-exact' },
    budget: { contextWindowTokens: 8000, outputReserveTokens: 1000, otherInputTokens: 0 },
  }
  const wireItem = { id: `dec_${hex('c')}`, kind: 'decision', text: 'Use tea', author: 'owner', cites: [], state: 'active', replaces: null, created_at: 1, updated_at: 2 }
  const item = { id: `dec_${hex('c')}`, kind: 'decision', text: 'Use tea', author: 'owner', cites: [], state: 'active', replaces: null, createdAt: 1, updatedAt: 2 }

  it('reads the settings, where no policy yet is allowed', async () => {
    const { auth, calls } = fakeAuth({ revision: 0, policy: null }, { revision: 1, policy })
    const client = createChatContextClient(auth)
    expect(await client.get(sid)).toEqual({ revision: 0, policy: null })
    expect((await client.get(sid)).policy).toEqual(policy)
    expect(calls[0]).toEqual({ path: context, init: { signal: undefined } })
    await kind(client.get('nope'), 'validation')
  })

  it('saves the whole policy at the revision it saw', async () => {
    const { auth, calls } = fakeAuth({ revision: 2, policy })
    expect(await createChatContextClient(auth).save(sid, policy, 1)).toEqual({ revision: 2, policy })
    expect(calls[0]).toEqual({ path: context, init: { method: 'POST', body: { expected_revision: 1, policy } } })
  })

  it('refuses a policy out of range, a bad revision and a bad message id before sending', async () => {
    const { auth, calls } = fakeAuth({ revision: 2, policy })
    const client = createChatContextClient(auth)
    await kind(client.save(sid, { ...policy, budget: { ...policy.budget, outputReserveTokens: 8000 } }, 1), 'validation')
    await kind(client.save(sid, policy, -1), 'validation')
    await kind(client.save(sid, { ...policy, messagePolicies: { 'not-a-message': 'exclude' } }, 1), 'validation')
    const many = Object.fromEntries(Array.from({ length: 10001 }, (_, index) => [`msg_${index}`, 'exclude' as const]))
    await kind(client.save(sid, { ...policy, messagePolicies: many }, 1), 'validation')
    expect(calls).toEqual([])
    await kind(createChatContextClient(fakeAuth({ revision: 2 }).auth).save(sid, policy, 1), 'invalid-response')
  })

  it('lists the items with camel-case times', async () => {
    const { auth, calls } = fakeAuth({ revision: 3, items: [wireItem] })
    expect(await createChatContextClient(auth).items(sid)).toEqual({ revision: 3, items: [item] })
    expect(calls[0].path).toBe(`${context}/items`)
  })

  it('adds a decision or an open question, trimmed, and a decision may replace an active one', async () => {
    const { auth, calls } = fakeAuth({ revision: 4, item: wireItem })
    const client = createChatContextClient(auth)
    expect(await client.addItem(sid, { kind: 'thread', text: '  Which tea?  ' }, 3)).toEqual({ revision: 4, item })
    await client.addItem(sid, { kind: 'decision', text: 'Use coffee', replaces: `dec_${hex('d')}` }, 3)
    expect(calls[0].init.body).toEqual({ expected_revision: 3, kind: 'thread', text: 'Which tea?' })
    expect(calls[1].init.body).toEqual({ expected_revision: 3, kind: 'decision', text: 'Use coffee', replaces: `dec_${hex('d')}` })
  })

  it('refuses empty, long or control-character text, a bad kind and a bad replaces before sending', async () => {
    const { auth, calls } = fakeAuth({ revision: 4, item: wireItem })
    const client = createChatContextClient(auth)
    const add = (input: { kind: 'decision' | 'thread'; text: string; replaces?: string }) => client.addItem(sid, input, 1)
    await kind(add({ kind: 'decision', text: '   ' }), 'validation')
    await kind(add({ kind: 'decision', text: 'x'.repeat(501) }), 'validation')
    await kind(add({ kind: 'decision', text: 'tab\there' }), 'validation')
    await kind(add({ kind: 'decision', text: 'del\u007f' }), 'validation')
    await kind(add({ kind: 'idea' as never, text: 'ok' }), 'validation')
    await kind(add({ kind: 'thread', text: 'ok', replaces: `dec_${hex('d')}` }), 'validation')
    await kind(add({ kind: 'decision', text: 'ok', replaces: 'dec_1' }), 'validation')
    await kind(client.addItem(sid, { kind: 'decision', text: 'ok' }, -1), 'validation')
    expect(calls).toEqual([])
    await add({ kind: 'decision', text: 'line one\nline two' })
    expect(calls).toHaveLength(1)
  })

  it('moves an item between states at the revision it saw', async () => {
    const { auth, calls } = fakeAuth({ revision: 5 })
    const client = createChatContextClient(auth)
    expect(await client.setItemState(sid, `thr_${hex('e')}`, 'resolved', 4)).toEqual({ revision: 5 })
    expect(calls[0]).toEqual({ path: `${context}/items/thr_${hex('e')}/state`, init: { method: 'POST', body: { expected_revision: 4, state: 'resolved' } } })
    await kind(client.setItemState(sid, 'bad', 'resolved', 4), 'validation')
    await kind(client.setItemState(sid, `thr_${hex('e')}`, 'superseded' as never, 4), 'validation')
    await kind(client.setItemState(sid, `thr_${hex('e')}`, 'open', -1), 'validation')
  })
})

describe('memory delivery receipts', () => {
  const row = (overrides: Record<string, unknown> = {}) => ({ state: 'pending', reason_code: 'queued', admission_method: null, memory_id: null, ...overrides })
  const refuses = (value: unknown) => expect(() => parseMemoryDelivery(value)).toThrow(expect.objectContaining({ kind: 'invalid-response' }))

  it('reads a saved memory with its memory id and how it was admitted', () => {
    expect(parseMemoryDelivery(row({ state: 'saved', reason_code: null, admission_method: 'owner_requested', memory_id: 'mem_1' }))).toEqual({
      state: 'saved',
      reasonCode: null,
      admissionMethod: 'owner_requested',
      memoryId: 'mem_1',
    })
    expect(parseMemoryDelivery(row({ state: 'saved', reason_code: null, memory_id: 'mem_1' })).admissionMethod).toBeNull()
  })

  it('reads the other states with a reason and no memory id', () => {
    expect(parseMemoryDelivery(row())).toEqual({ state: 'pending', reasonCode: 'queued', admissionMethod: null, memoryId: null })
    expect(parseMemoryDelivery(row({ state: 'filtered', reason_code: null })).state).toBe('filtered')
    expect(parseMemoryDelivery(row({ state: 'filtered', reason_code: null, admission_method: 'filtered' })).admissionMethod).toBe('filtered')
  })

  it('refuses anything that is not an object, and unknown states, reasons and admission methods', () => {
    for (const value of [null, [], 'saved', 3]) refuses(value)
    refuses(row({ state: 'done' }))
    refuses(row({ reason_code: 'because' }))
    refuses(row({ admission_method: 'magic' }))
  })

  it('refuses a saved memory without a good memory id, or admitted as filtered, or with a reason', () => {
    const saved = (overrides: Record<string, unknown>) => row({ state: 'saved', reason_code: null, memory_id: 'mem_1', ...overrides })
    refuses(saved({ memory_id: null }))
    refuses(saved({ memory_id: '../x' }))
    refuses(saved({ admission_method: 'filtered' }))
    refuses(saved({ reason_code: 'queued' }))
  })

  it('refuses a memory id on anything but a saved memory, and a filtered one with a reason or another method', () => {
    refuses(row({ memory_id: 'mem_1' }))
    refuses(row({ state: 'filtered', reason_code: 'queued' }))
    refuses(row({ state: 'filtered', reason_code: null, admission_method: 'signal' }))
    refuses(row({ admission_method: 'signal' }))
  })

  describe('a chat or message read', () => {
    const entry = (id: string) => ({ message_id: id, ...row() })
    const read = (overrides: Record<string, unknown> = {}) => ({ schemaVersion: 1, session_id: 'chat1', content_status: 'available', truncated: false, results: [entry('m1')], ...overrides })
    const refusesRead = (value: unknown, messageId?: string) => expect(() => parseMemoryDeliveryRead(value, 'chat1', messageId)).toThrow(expect.objectContaining({ kind: 'invalid-response' }))

    it('reads every message in the chat', () => {
      expect(parseMemoryDeliveryRead(read({ results: [entry('m1'), entry('m2')], truncated: true }), 'chat1')).toEqual({
        sessionId: 'chat1',
        forgotten: false,
        truncated: true,
        results: [
          { messageId: 'm1', delivery: { state: 'pending', reasonCode: 'queued', admissionMethod: null, memoryId: null } },
          { messageId: 'm2', delivery: { state: 'pending', reasonCode: 'queued', admissionMethod: null, memoryId: null } },
        ],
      })
      expect(parseMemoryDeliveryRead(read(), 'chat1', 'm1').results).toHaveLength(1)
    })

    it('gives no receipts back for a forgotten chat, even a malformed one', () => {
      expect(parseMemoryDeliveryRead(read({ content_status: 'forgotten', results: 'junk' }), 'chat1')).toEqual({ sessionId: 'chat1', forgotten: true, results: [], truncated: false })
    })

    it('refuses another version, another chat, an unknown status and a missing truncated flag', () => {
      refusesRead(read({ schemaVersion: 2 }))
      refusesRead(read({ session_id: 'other' }))
      refusesRead(read({ content_status: 'gone' }))
      refusesRead(read({ truncated: 'no' }))
      refusesRead(null)
    })

    it('refuses results that are not a list, too many, repeated, misnamed or for another message', () => {
      refusesRead(read({ results: 'junk' }))
      refusesRead(read({ results: Array.from({ length: 101 }, (_, index) => entry(`m${index}`)) }))
      refusesRead(read({ results: [entry('m1'), entry('m1')] }))
      refusesRead(read({ results: [entry('bad id')] }))
      refusesRead(read({ results: [{ ...row() }] }))
      refusesRead(read({ results: [entry('m1'), entry('m2')] }), 'm1')
      refusesRead(read({ results: [entry('m2')] }), 'm1')
      refusesRead(read({ truncated: true }), 'm1')
    })
  })

  describe('client', () => {
    const answer = { schemaVersion: 1, session_id: 'chat1', content_status: 'available', truncated: false, results: [{ message_id: 'm1', ...row() }] }

    it('reads a chat or one message through the owner-less Pi route', async () => {
      const { auth, calls } = fakeAuth(answer)
      const read = createMemoryDeliveryClient(auth)
      const signal = new AbortController().signal
      expect((await read('chat1', { signal })).results).toHaveLength(1)
      await read('chat1', { messageId: 'm1' })
      expect(calls).toEqual([
        { path: '/api/pi/sessions/chat1/memory-delivery', init: { signal } },
        { path: '/api/pi/sessions/chat1/messages/m1/memory-delivery', init: { signal: undefined } },
      ])
    })

    it('refuses bad ids before sending', async () => {
      const { auth, calls } = fakeAuth(answer)
      const read = createMemoryDeliveryClient(auth)
      await kind(read('bad id'), 'validation')
      await kind(read('chat1', { messageId: '../x' }), 'validation')
      expect(calls).toEqual([])
    })
  })
})
