import { describe, expect, it } from 'vitest'
import { createChatAnswersClient } from '../gateway/chat-answers'
import { chatForgetMessage, createChatForgetClient, type ChatForgetPlan } from '../gateway/chat-forget'
import { createChatNamesClient } from '../gateway/chat-names'
import { createChatReviewsClient } from '../gateway/chat-reviews'
import { GatewayError } from '../gateway/transport'

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
const tid = (character: string) => `trn_${hex(character)}`
const base = `/api/control/pi/sessions/${sid}`

describe('chat names and output', () => {
  const name = { revision: 2, title: 'Trip', source: 'owner', modelId: null }

  it('reads a chat title through Pi and refuses a bad chat id before sending', async () => {
    const { auth, calls } = fakeAuth(name)
    expect(await createChatNamesClient(auth).title(sid)).toEqual(name)
    expect(calls[0].path).toBe(`${base}/title`)
    await kind(createChatNamesClient(auth).title('ses_1'), 'validation')
  })

  it('renames with a trimmed title and the revision it saw', async () => {
    const { auth, calls } = fakeAuth(name)
    await createChatNamesClient(auth).rename(sid, '  Trip  ', 2)
    expect(calls).toEqual([{ path: `${base}/title`, init: { method: 'POST', body: { expected_revision: 2, title: 'Trip' } } }])
  })

  it('refuses an empty, too long or control-character title, and a bad revision', async () => {
    const { auth, calls } = fakeAuth(name)
    const client = createChatNamesClient(auth)
    await kind(client.rename(sid, '   ', 1), 'validation')
    await kind(client.rename(sid, 'x'.repeat(61), 1), 'validation')
    await kind(client.rename(sid, 'bad\u0007title', 1), 'validation')
    await kind(client.rename(sid, 'bad\u007ftitle', 1), 'validation')
    await kind(client.rename(sid, 'ok', -1), 'validation')
    expect(calls).toEqual([])
    await client.rename(sid, 'x'.repeat(60), 1)
    expect(calls).toHaveLength(1)
  })

  it('names a chat automatically', async () => {
    const { auth, calls } = fakeAuth(name)
    await createChatNamesClient(auth).autoName(sid, 3)
    expect(calls).toEqual([{ path: `${base}/title/auto`, init: { method: 'POST', body: { expected_revision: 3 } } }])
    await kind(createChatNamesClient(fakeAuth({ nope: 1 }).auth).autoName(sid, 3), 'invalid-response')
  })

  it('archives and trashes chats once each, up to 100, and the answer must name them', async () => {
    const a = fakeAuth({ sessions: [sid], archived: true })
    await createChatNamesClient(a.auth).archive([sid, sid], true)
    expect(a.calls).toEqual([{ path: '/api/control/pi/sessions/archive', init: { method: 'POST', body: { sessions: [sid], archived: true } } }])
    const t = fakeAuth({ sessions: [sid], trashed: false })
    await createChatNamesClient(t.auth).trash([sid], false)
    expect(t.calls[0]).toEqual({ path: '/api/control/pi/sessions/trash', init: { method: 'POST', body: { sessions: [sid], trashed: false } } })
    await kind(createChatNamesClient(a.auth).archive([], true), 'validation')
    await kind(createChatNamesClient(t.auth).trash([], true), 'validation')
    await kind(createChatNamesClient(a.auth).archive([sid], 'yes' as never), 'validation')
    await kind(createChatNamesClient(t.auth).trash([sid], 'yes' as never), 'validation')
    await kind(createChatNamesClient(fakeAuth({ sessions: [], archived: true }).auth).archive([sid], true), 'invalid-response')
  })

  it('reads a chat output setting, and an older Pi may leave level and effort out', async () => {
    const output = { revision: 1, output: { format: 'auto', length: 'short', language: 'en-GB' } }
    const { auth, calls } = fakeAuth(output)
    expect(await createChatNamesClient(auth).output(sid)).toEqual(output)
    expect(calls[0].path).toBe(`${base}/output`)
    await kind(createChatNamesClient(auth).output('x'), 'validation')
  })

  it('saves an output setting, sending level and effort only when they are not auto', async () => {
    const reply = { revision: 2, output: { format: 'list', length: 'long', language: 'auto' } }
    const { auth, calls } = fakeAuth(reply)
    const client = createChatNamesClient(auth)
    await client.saveOutput(sid, { format: 'list', length: 'long', language: 'auto' }, 1)
    await client.saveOutput(sid, { format: 'list', length: 'long', language: 'auto', level: 'auto', effort: 'auto' }, 1)
    await client.saveOutput(sid, { format: 'list', length: 'long', language: 'auto', level: 'deep', effort: 'high' }, 1)
    expect(calls.map(call => (call.init.body as { output: unknown }).output)).toEqual([
      { format: 'list', length: 'long', language: 'auto' },
      { format: 'list', length: 'long', language: 'auto' },
      { format: 'list', length: 'long', language: 'auto', level: 'deep', effort: 'high' },
    ])
    await kind(client.saveOutput(sid, { format: 'list', length: 'long', language: 'Klingon!' }, 1), 'validation')
  })
})

describe('chat forgetting', () => {
  const confirmation = 'c'.repeat(64)
  const plan = (id: string) => ({ sessionId: id, sessionIds: [id], messages: 3, turns: 2, approvalRequests: 0, confirmation, alreadyForgotten: false })
  const overview = (ids: string[], extra: Record<string, unknown> = {}) => ({ supervised: true, pending: [], results: [], chats: ids.map(plan), ...extra })

  it('words each refusal and falls back to the standard message', () => {
    const code = (value: string) => chatForgetMessage(new GatewayError('http', 409, undefined, value as never))
    expect(code('not_supervised')).toContain('cannot restart itself')
    expect(code('scope_changed')).toContain('changed since you reviewed')
    expect(code('not_found')).toBe('One of these chats is no longer there.')
    expect(code('forgetting_unavailable')).toContain('Nothing was deleted')
    expect(chatForgetMessage(new GatewayError('network'))).toBe(new GatewayError('network').message)
    expect(chatForgetMessage('boom')).toBe(new GatewayError('network').message)
  })

  it('previews what deleting reaches, one query value per distinct chat', async () => {
    const { auth, calls } = fakeAuth(overview([sid]))
    const signal = new AbortController().signal
    expect(await createChatForgetClient(auth).preview([sid, sid], signal)).toEqual([plan(sid)])
    expect(calls).toEqual([{ path: '/api/control/pi/forgetting/chats', init: { query: { session: [sid] }, signal } }])
  })

  it('reads the status without a query when no chat is named', async () => {
    const { auth, calls } = fakeAuth(overview([]))
    expect((await createChatForgetClient(auth).status()).supervised).toBe(true)
    expect(calls[0].init.query).toBeUndefined()
  })

  it('refuses bad chat ids and more than 50 chats before sending', async () => {
    const { auth, calls } = fakeAuth(overview([]))
    const client = createChatForgetClient(auth)
    await kind(client.status(['bad id']), 'validation')
    await kind(client.status(Array.from({ length: 51 }, (_, index) => `chat_${index}`)), 'validation')
    expect(calls).toEqual([])
  })

  it('refuses a preview that lists other chats or a different number of them', async () => {
    await kind(createChatForgetClient(fakeAuth(overview(['other'])).auth).status([sid]), 'invalid-response')
    await kind(createChatForgetClient(fakeAuth(overview([sid, sid])).auth).status([sid]), 'invalid-response')
    await kind(createChatForgetClient(fakeAuth({ supervised: 'yes' }).auth).status(), 'invalid-response')
  })

  it('deletes the previewed chats with their confirmations and reports all done', async () => {
    const { auth, calls } = fakeAuth({ state: 'done', sessions: [sid] })
    const signal = new AbortController().signal
    expect(await createChatForgetClient(auth).remove([plan(sid)] as ChatForgetPlan[], { signal })).toEqual({ done: [sid], refused: [], waiting: [] })
    expect(calls).toEqual([{ path: '/api/control/pi/forgetting/chats', init: { method: 'POST', body: { chats: [{ session: sid, confirmation }] }, signal } }])
  })

  it('reports the chats Pi will delete after a restart as waiting', async () => {
    const { auth } = fakeAuth({ state: 'restarting', sessions: ['b'] })
    expect(await createChatForgetClient(auth).remove([plan(sid), plan('b')] as ChatForgetPlan[])).toEqual({ done: [sid], refused: [], waiting: ['b'] })
  })

  it('refuses no plans, too many, a bad confirmation and an answer naming an unasked chat', async () => {
    const { auth, calls } = fakeAuth({ state: 'done', sessions: ['other'] })
    const client = createChatForgetClient(auth)
    await kind(client.remove([]), 'validation')
    await kind(client.remove(Array.from({ length: 51 }, (_, index) => plan(`chat_${index}`)) as ChatForgetPlan[]), 'validation')
    await kind(client.remove([{ ...plan(sid), confirmation: 'short' }] as ChatForgetPlan[]), 'validation')
    expect(calls).toEqual([])
    await kind(client.remove([plan(sid)] as ChatForgetPlan[]), 'invalid-response')
  })
})

describe('chat answers', () => {
  const family = {
    root_message_id: mid('1'),
    session_id: sid,
    selected_message_id: mid('2'),
    revision: 2,
    versions: [
      { message_id: mid('1'), retry_of: null, turn_id: tid('1') },
      { message_id: mid('2'), retry_of: mid('1'), turn_id: tid('2') },
    ],
  }
  const receipt = (message: unknown = { id: mid('3'), text: 'x' }) => ({
    request_id: 'r'.repeat(20),
    session_id: sid,
    source_message_id: mid('1'),
    source_turn_id: tid('1'),
    turn_id: tid('3'),
    model_id: 'big',
    status: 'done',
    input_message_id: null,
    replayed: false,
    message,
  })

  it('reads a family and camel-cases it', async () => {
    const { auth, calls } = fakeAuth(family)
    expect(await createChatAnswersClient(auth).family(sid, mid('1'))).toEqual({
      rootId: mid('1'),
      selectedId: mid('2'),
      revision: 2,
      versions: [
        { messageId: mid('1'), retryOf: null, turnId: tid('1') },
        { messageId: mid('2'), retryOf: mid('1'), turnId: tid('2') },
      ],
    })
    expect(calls[0].path).toBe(`${base}/response-families/${mid('1')}`)
  })

  it('switches version with the revision it saw, and refuses a revision below 1', async () => {
    const { auth, calls } = fakeAuth(family)
    const client = createChatAnswersClient(auth)
    await client.select(sid, mid('1'), mid('2'), 2)
    expect(calls).toEqual([{ path: `${base}/response-families/${mid('1')}/select`, init: { method: 'POST', body: { message_id: mid('2'), expected_revision: 2 } } }])
    await kind(client.select(sid, mid('1'), mid('2'), 0), 'validation')
    await kind(client.select(sid, mid('1'), mid('2'), 1.5), 'validation')
    await kind(client.select(sid, mid('1'), 'bad', 1), 'validation')
  })

  it('retries with another model under a fresh request id, and reads the retry back', async () => {
    const { auth, calls } = fakeAuth(receipt(), receipt(null))
    const client = createChatAnswersClient(auth)
    expect(await client.retry(sid, mid('1'), 'big')).toMatchObject({ turnId: tid('3'), modelId: 'big', status: 'done', replayed: false, messageId: mid('3') })
    expect(calls[0]).toMatchObject({ path: `${base}/messages/${mid('1')}/retry`, init: { method: 'POST', body: { model_id: 'big' } } })
    expect((calls[0].init.body as { request_id: string }).request_id).toMatch(/^[0-9a-f-]{36}$/)
    expect((await client.retryStatus(sid, 'r'.repeat(20))).messageId).toBeNull()
    expect(calls[1].path).toBe(`${base}/response-retries/${'r'.repeat(20)}`)
    await kind(client.retry(sid, mid('1'), ''), 'validation')
    await kind(client.retry(sid, mid('1'), 'm'.repeat(201)), 'validation')
    await kind(client.retry(sid, mid('1'), 7 as never), 'validation')
    await kind(client.retryStatus(sid, 'short'), 'validation')
  })

  it('branches from a message with the context it reviewed', async () => {
    const { auth, calls } = fakeAuth({ session_id: `ses_${hex('b')}`, parent_id: sid, message_id: mid('1'), replayed: false })
    const client = createChatAnswersClient(auth)
    expect(await client.fork(sid, mid('1'), { settingsRevision: 1, contextRevision: 2, reviewedSummary: null })).toEqual({ sessionId: `ses_${hex('b')}` })
    expect(calls[0].init.body).toMatchObject({ expected_settings_revision: 1, expected_context_revision: 2, reviewed_summary: null })
    await kind(client.fork(sid, mid('1'), { settingsRevision: -1, contextRevision: 2, reviewedSummary: null }), 'validation')
  })

  it('collects the revisions and summary a branch must prove it has seen', async () => {
    const { auth, calls } = fakeAuth({ revision: 4, extra: true }, { revision: 5 }, { summary: 'so far' })
    expect(await createChatAnswersClient(auth).forkBasis(sid)).toEqual({ settingsRevision: 4, contextRevision: 5, reviewedSummary: 'so far' })
    expect(calls.map(call => call.path).sort()).toEqual([`/api/control/pi/context/${sid}`, `/api/control/pi/context/${sid}/summary`, `${base}/settings`])
    await kind(createChatAnswersClient(auth).forkBasis('x'), 'validation')
  })

  it('lists only the enabled models', async () => {
    const { auth } = fakeAuth({
      configuration: {
        models: [
          { id: 'a', name: 'A', enabled: true },
          { id: 'b', name: 'B', enabled: false },
        ],
      },
    })
    expect(await createChatAnswersClient(auth).models()).toEqual([{ id: 'a', name: 'A' }])
    await kind(createChatAnswersClient(fakeAuth({}).auth).models(), 'invalid-response')
  })
})

describe('chat reviews', () => {
  const judgement = (replayed?: boolean) => ({
    request_id: 'r'.repeat(20),
    judgeModelId: 'judge',
    rubric: 'clear',
    scores: [{ message_id: mid('1'), score: 7, reason: 'good' }],
    winner: mid('1'),
    excluded: [],
    created_at: 9,
    ...(replayed === undefined ? {} : { replayed }),
  })
  const mapped = { requestId: 'r'.repeat(20), judgeModelId: 'judge', rubric: 'clear', scores: [{ messageId: mid('1'), score: 7, reason: 'good' }], winner: mid('1'), excluded: [], createdAt: 9 }
  const check = (replayed?: boolean) => ({
    request_id: 'r'.repeat(20),
    message_id: mid('1'),
    modelId: 'checker',
    claims: [{ claim: 'Sky is blue', mark: 'supported', sources: ['s1'], note: '' }],
    counts: { supported: 1, contradicted: 0, 'no-source': 2 },
    sources: [{ id: 's1', title: 'T', url: 'https://example.com' }],
    sourcesTruncated: false,
    created_at: 4,
    ...(replayed === undefined ? {} : { replayed }),
  })
  const family = `${base}/response-families/${mid('1')}`

  it('judges a family with no extras, or with a model and a rubric', async () => {
    const { auth, calls } = fakeAuth(judgement(), judgement(true))
    const client = createChatReviewsClient(auth)
    expect(await client.judge(sid, mid('1'))).toEqual(mapped)
    await client.judge(sid, mid('1'), { modelId: 'judge', rubric: 'clear' })
    await client.judge(sid, mid('1'), { modelId: null })
    expect(Object.keys(calls[0].init.body as object)).toEqual(['request_id'])
    expect(calls[1]).toMatchObject({ path: `${family}/judge`, init: { method: 'POST', body: { model_id: 'judge', rubric: 'clear' } } })
    expect(Object.keys(calls[2].init.body as object)).toEqual(['request_id'])
    await kind(client.judge(sid, mid('1'), { modelId: '' }), 'validation')
    await kind(client.judge(sid, mid('1'), { rubric: 'x'.repeat(2001) }), 'validation')
  })

  it('counts a rubric in characters, not in UTF-16 units', async () => {
    const { auth } = fakeAuth(judgement())
    await createChatReviewsClient(auth).judge(sid, mid('1'), { rubric: '😀'.repeat(2000) })
  })

  it('lists earlier judgements and refuses a malformed one', async () => {
    const { auth, calls } = fakeAuth({ results: [judgement()] })
    expect(await createChatReviewsClient(auth).judgements(sid, mid('1'))).toEqual([mapped])
    expect(calls[0].path).toBe(`${family}/judgements`)
    await kind(createChatReviewsClient(fakeAuth({ results: [{ ...judgement(), scores: [{ message_id: mid('1'), score: 11, reason: 'x' }] }] }).auth).judgements(sid, mid('1')), 'invalid-response')
  })

  it('votes and reads votes, where clear takes a vote back', async () => {
    const { auth, calls } = fakeAuth({ root_message_id: mid('1'), votes: { [mid('2')]: 'up' } })
    const client = createChatReviewsClient(auth)
    expect(await client.vote(sid, mid('1'), mid('2'), 'clear')).toEqual({ [mid('2')]: 'up' })
    expect(calls[0]).toEqual({ path: `${family}/vote`, init: { method: 'POST', body: { message_id: mid('2'), vote: 'clear' } } })
    expect(await client.votes(sid, mid('1'))).toEqual({ [mid('2')]: 'up' })
    expect(calls[1].path).toBe(`${family}/votes`)
    await kind(client.vote(sid, mid('1'), mid('2'), 'maybe' as never), 'validation')
  })

  it('fact-checks an answer, with or without a model, and maps no-source to noSource', async () => {
    const { auth, calls } = fakeAuth(check(), check(false))
    const client = createChatReviewsClient(auth)
    expect((await client.factCheck(sid, mid('1'))).counts).toEqual({ supported: 1, contradicted: 0, noSource: 2 })
    await client.factCheck(sid, mid('1'), 'checker')
    await client.factCheck(sid, mid('1'), null)
    expect(Object.keys(calls[0].init.body as object)).toEqual(['request_id'])
    expect(calls[1]).toMatchObject({ path: `${base}/messages/${mid('1')}/fact-check`, init: { body: { model_id: 'checker' } } })
    expect(Object.keys(calls[2].init.body as object)).toEqual(['request_id'])
    await kind(client.factCheck(sid, mid('1'), ''), 'validation')
  })

  it('lists earlier fact checks of one answer', async () => {
    const { auth, calls } = fakeAuth({ results: [check()] })
    const [first] = await createChatReviewsClient(auth).factChecks(sid, mid('1'))
    expect(first).toMatchObject({ requestId: 'r'.repeat(20), messageId: mid('1'), modelId: 'checker', sourcesTruncated: false, createdAt: 4 })
    expect(calls[0].path).toBe(`${base}/messages/${mid('1')}/fact-checks`)
    await kind(createChatReviewsClient(fakeAuth({ results: [{ ...check(), extra: 1 }] }).auth).factChecks(sid, mid('1')), 'invalid-response')
  })
})
