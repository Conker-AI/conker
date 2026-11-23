import { describe, expect, it } from 'vitest'
import { createAutoSettingsClient, parseAutoSettings } from '../gateway/auto-settings'
import { createChatGPTClient } from '../gateway/chatgpt'
import { createNativeClaudeClient } from '../gateway/native-claude'
import { createAsksClient } from '../gateway/asks'
import { createBrowserSessionsClient } from '../gateway/browser-sessions'
import { createMemoryBeliefsClient } from '../gateway/memory-beliefs'
import { createOpenLoopsClient } from '../gateway/open-loops'
import { createGatewayPlansClient } from '../gateway/plans'
import { createGatewaySearchClient } from '../gateway/search'
import { createMemoryUsesClient } from '../gateway/memory-uses'
import { createMemoryCareClient } from '../gateway/memory-care'
import { codexResumeCommand, codexThreadId, createCodexSessionsClient } from '../gateway/codex-sessions'
import { createNativeSessionsClient, nativeAttachCommand, nativeSessionId } from '../gateway/native-sessions'
import { createPromptEnhanceClient } from '../gateway/prompt-enhance'
import { isStaleTemplate, promptMessage } from '../gateway/prompt-errors'
import { GatewayError } from '../gateway/transport'

type Call = { path: string; init: Record<string, unknown> }

/** A stand-in for the signed-in gateway session: records each request and answers with the next canned value. */
function fakeAuth(...answers: unknown[]) {
  const calls: Call[] = []
  const queue = [...answers]
  const request = async (path: string, init: Record<string, unknown> = {}) => {
    calls.push({ path, init })
    return queue.length > 1 ? queue.shift() : queue[0]
  }
  return { calls, auth: { request, getSession: () => ({ sessionId: 'current-session-identity' }) } as never }
}

const kind = (promise: Promise<unknown>, expected: string) => expect(promise).rejects.toMatchObject({ name: 'GatewayError', kind: expected })
const hex = (character: string, length = 32) => character.repeat(length)

describe('auto settings', () => {
  const reasons = { complexity: 'short ask', think: 'no need', research: 'known' }
  const valid = { complexity: 'easy', think: false, research: 'off', modelId: 'router', reasons }

  it('reads a proposal with and without effort and answer model', () => {
    expect(parseAutoSettings(valid)).toEqual(valid)
    const full = { ...valid, effort: 'high', answerModelId: 'big', reasons: { ...reasons, effort: 'hard', model: 'strong' } }
    expect(parseAutoSettings(full)).toEqual(full)
  })

  it('refuses every malformed proposal as a validation error', () => {
    const bad = (value: unknown) => expect(() => parseAutoSettings(value)).toThrow(expect.objectContaining({ kind: 'validation' }))
    bad(null)
    bad([])
    bad({ ...valid, reasons: null })
    bad({ ...valid, complexity: 'medium' })
    bad({ ...valid, research: 'maybe' })
    bad({ ...valid, think: 'yes' })
    bad({ ...valid, modelId: '' })
    bad({ ...valid, effort: 'high' })
    bad({ ...valid, effort: 'extreme', reasons: { ...reasons, effort: 'x' } })
    bad({ ...valid, effort: 'high', reasons: { ...reasons, effort: ' ' } })
    bad({ ...valid, reasons: { ...reasons, effort: 'orphan reason' } })
    bad({ ...valid, answerModelId: 'big' })
    bad({ ...valid, answerModelId: '', reasons: { ...reasons, model: 'x' } })
    bad({ ...valid, answerModelId: 7, reasons: { ...reasons, model: 'x' } })
    bad({ ...valid, reasons: { ...reasons, model: 'orphan reason' } })
    bad({ ...valid, reasons: { ...reasons, think: 'x'.repeat(161) } })
    bad({ ...valid, reasons: { ...reasons, extra: 'x' } })
    bad({ ...valid, reasons: { complexity: 'a', think: 'b' } })
  })

  it('asks the routing model with only the options that were set', async () => {
    const { auth, calls } = fakeAuth(valid)
    const client = createAutoSettingsClient(auth)
    expect(await client.propose('hello')).toEqual(valid)
    await client.propose('again', { sessionId: 's1', harnessDisabled: true, mode: 'deep' })
    await client.propose('third', { mode: 'auto', sessionId: null })
    const signal = new AbortController().signal
    await client.propose('fourth', { signal })
    expect(calls.map(call => call.init.body)).toEqual([{ text: 'hello' }, { text: 'again', session_id: 's1', harness_disabled: true, mode: 'deep' }, { text: 'third' }, { text: 'fourth' }])
    expect(calls[0]).toEqual({ path: '/api/pi/models/auto-settings', init: { method: 'POST', body: { text: 'hello' } } })
    expect(calls[3].init.signal).toBe(signal)
  })

  it('refuses a malformed reply', async () => kind(createAutoSettingsClient(fakeAuth({ nope: 1 }).auth).propose('x'), 'validation'))
})

describe('ChatGPT subscription client', () => {
  const connectionId = `connection_${hex('a')}`
  const status = { available: true, connected: false, connectionId: null, plan: null, loginId: null, loginState: 'idle', problem: null, models: [], catalogueComplete: true, credentialsIncluded: false }
  const device = { verificationUrl: 'https://auth.openai.com/codex/device', userCode: 'ABCD-1234' }

  it('reads status and refuses a device code outside a login', async () => {
    const { auth, calls } = fakeAuth(status)
    expect(await createChatGPTClient(auth).status()).toEqual(status)
    expect(calls[0].path).toBe('/api/host/chatgpt')
    await kind(createChatGPTClient(fakeAuth({ ...status, deviceCode: device }).auth).status(), 'invalid-response')
  })

  it('refuses a status whose connection id disagrees with connected', async () => {
    await kind(createChatGPTClient(fakeAuth({ ...status, connected: true }).auth).status(), 'invalid-response')
    await kind(createChatGPTClient(fakeAuth({ ...status, connectionId }).auth).status(), 'invalid-response')
  })

  it('applies only well-formed operations', async () => {
    const pending = { ...status, loginState: 'pending', loginId: 'login-1', deviceCode: device }
    const { auth, calls } = fakeAuth(pending)
    const client = createChatGPTClient(auth)
    const onDispatch = () => undefined
    expect((await client.apply({ operation: 'login' }, undefined, onDispatch)).deviceCode).toEqual(device)
    expect(calls[0]).toEqual({ path: '/api/host/chatgpt', init: { method: 'POST', body: { operation: 'login' }, signal: undefined, onDispatch } })
    await kind(client.apply({ operation: 'cancel', loginId: 'bad id!' }), 'validation')
    await kind(client.apply({ operation: 'logout', connectionId: 'nope' }), 'validation')
    await kind(client.apply({ operation: 'models' }), 'invalid-response')
  })
})

describe('Claude subscription client', () => {
  const loginId = `login_${hex('b')}`
  const status = { available: true, connected: false, loginState: 'idle', loginId: null, authorizationUrl: null, credentialsIncluded: false, runtime: 'Claude Code', models: [] }

  it('reads status', async () => {
    const { auth, calls } = fakeAuth(status)
    expect(await createNativeClaudeClient(auth).status()).toEqual(status)
    expect(calls[0].path).toBe('/api/host/claude')
  })

  it('refuses authorization links outside Anthropic hosts', async () => {
    const pending = { ...status, loginState: 'pending', loginId }
    expect((await createNativeClaudeClient(fakeAuth({ ...pending, authorizationUrl: 'https://claude.ai/oauth?x=1' }).auth).status()).authorizationUrl).toBe('https://claude.ai/oauth?x=1')
    for (const authorizationUrl of ['http://claude.ai/oauth', 'https://evil.example/oauth', 'https://u:p@claude.ai/', 'not a url']) {
      await kind(createNativeClaudeClient(fakeAuth({ ...pending, authorizationUrl }).auth).status(), 'invalid-response')
    }
  })

  it('refuses a pending login with no login id, and the reverse', async () => {
    await kind(createNativeClaudeClient(fakeAuth({ ...status, loginState: 'pending' }).auth).status(), 'invalid-response')
    await kind(createNativeClaudeClient(fakeAuth({ ...status, loginId }).auth).status(), 'invalid-response')
  })

  it('applies login, cancel and logout and refuses bad operations', async () => {
    const { auth, calls } = fakeAuth(status)
    const client = createNativeClaudeClient(auth)
    await client.apply({ operation: 'login', billing: 'api' })
    await client.apply({ operation: 'logout' })
    expect(calls.map(call => call.init.body)).toEqual([{ operation: 'login', billing: 'api' }, { operation: 'logout' }])
    await kind(client.apply({ operation: 'cancel', loginId: 'x' }), 'validation')
    await kind(client.apply({ operation: 'login', billing: 'free' } as never), 'validation')
    await kind(createNativeClaudeClient(fakeAuth({ junk: true }).auth).apply({ operation: 'logout' }), 'invalid-response')
    await kind(createNativeClaudeClient(fakeAuth({ junk: true }).auth).status(), 'invalid-response')
  })
})

describe('asks client', () => {
  const id = `ask_${hex('c')}`
  const ask = { id, sessionId: 's1', chatTitle: 'Plans', question: 'Which one?', options: ['A', 'B'], state: 'open', answer: null, chosen: null, createdAt: 1, answeredAt: null }

  it('lists questions and refuses a reply with the wrong shape', async () => {
    const { auth, calls } = fakeAuth({ schemaVersion: 1, results: [ask] })
    expect(await createAsksClient(auth).list()).toEqual([ask])
    expect(calls[0].path).toBe('/api/control/pi/asks')
    await kind(createAsksClient(fakeAuth({ schemaVersion: 2, results: [] }).auth).list(), 'invalid-response')
    await kind(createAsksClient(fakeAuth({ schemaVersion: 1, results: [{ ...ask, options: ['only one'] }] }).auth).list(), 'invalid-response')
  })

  it('sends a trimmed answer and refuses empty, oversized or foreign ids', async () => {
    const { auth, calls } = fakeAuth({ ...ask, state: 'answered', answer: 'A', chosen: true, answeredAt: 2 })
    const client = createAsksClient(auth)
    expect((await client.answer(id, '  A  ', true)).state).toBe('answered')
    expect(calls[0]).toEqual({ path: `/api/control/pi/asks/${id}/answer`, init: { method: 'POST', body: { text: 'A', chosen: true } } })
    await kind(client.answer(id, '   ', false), 'validation')
    await kind(client.answer(id, 'x'.repeat(4001), false), 'validation')
    await kind(client.answer('../etc', 'A', false), 'validation')
    await kind(client.dismiss('ask_short'), 'validation')
    expect(calls).toHaveLength(1)
  })

  it('dismisses without an answer', async () => {
    const { auth, calls } = fakeAuth({ ...ask, state: 'dismissed' })
    expect((await createAsksClient(auth).dismiss(id)).state).toBe('dismissed')
    expect(calls[0]).toEqual({ path: `/api/control/pi/asks/${id}/dismiss`, init: { method: 'POST', body: {} } })
    await kind(createAsksClient(fakeAuth({ nope: 1 }).auth).dismiss(id), 'invalid-response')
  })
})

describe('browser sessions client', () => {
  const current = 'current-session-identity'
  const row = (id: string) => ({ id, created: 1, touched: 2, expires: 3 })
  const other = 'other-session-identity'

  it('marks the session this browser holds', async () => {
    const { auth, calls } = fakeAuth({ results: [row(current), row(other)] })
    expect((await createBrowserSessionsClient(auth, () => undefined).list()).map(item => [item.id, item.current])).toEqual([
      [current, true],
      [other, false],
    ])
    expect(calls[0].path).toBe('/auth/sessions')
    await kind(createBrowserSessionsClient(fakeAuth({ results: [{ id: 'short', created: 1, touched: 2, expires: 3 }] }).auth, () => undefined).list(), 'invalid-response')
  })

  it('tells the app only when the current session was revoked', async () => {
    let revoked = 0
    const { auth, calls } = fakeAuth({ revoked: true })
    const client = createBrowserSessionsClient(auth, () => revoked++)
    await client.revoke(other)
    expect(revoked).toBe(0)
    await client.revoke(current)
    await client.revoke(null)
    expect(revoked).toBe(2)
    expect(calls.map(call => call.path)).toEqual([`/auth/sessions/${other}/revoke`, `/auth/sessions/${current}/revoke`, '/auth/revoke-all'])
  })

  it('refuses a bad id before sending and a reply that does not confirm', async () => {
    const { auth, calls } = fakeAuth({ revoked: false })
    const client = createBrowserSessionsClient(auth, () => undefined)
    await kind(client.revoke('../x'), 'validation')
    expect(calls).toEqual([])
    await kind(client.revoke(other), 'invalid-response')
  })
})

describe('memory beliefs client', () => {
  const page = { agentId: 'companion', total: 0, nextAfter: null, counts: { stated: 0, concluded: 0, needsReview: 0 }, items: [] }

  it('asks for fifty at a time, after a cursor when there is one', async () => {
    const { auth, calls } = fakeAuth(page)
    const client = createMemoryBeliefsClient(auth)
    expect(await client.list({ origin: 'all', state: 'all' })).toEqual(page)
    await client.list({ origin: 'stated', state: 'needs_review', after: 'cur' })
    expect(calls.map(call => call.init.query)).toEqual([
      { origin: 'all', state: 'all', limit: 50 },
      { origin: 'stated', state: 'needs_review', limit: 50, after: 'cur' },
    ])
  })

  it('refuses a malformed page', async () => kind(createMemoryBeliefsClient(fakeAuth({ ...page, total: -1 }).auth).list({ origin: 'all', state: 'all' }), 'invalid-response'))
})

describe('open loops client', () => {
  const page = { today: '2026-01-01', timeZone: 'UTC', items: [], nextAfter: null }

  it('lists a state, after a cursor when given', async () => {
    const { auth, calls } = fakeAuth(page)
    const client = createOpenLoopsClient(auth)
    expect(await client.list('open')).toEqual(page)
    await client.list('done', 'cur')
    expect(calls.map(call => call.init.query)).toEqual([
      { state: 'open', limit: 50 },
      { state: 'done', limit: 50, after: 'cur' },
    ])
    await kind(createOpenLoopsClient(fakeAuth({ items: [] }).auth).list('open'), 'invalid-response')
  })
})

describe('plan usage client', () => {
  it('reads percentages and refuses out-of-range ones', async () => {
    const window = { provider: 'claude', window: 'five_hour', label: '5 hour', usedPercent: 40, resetsAt: null, checkedAt: 5 }
    expect(await createGatewayPlansClient(fakeAuth({ windows: [window] }).auth).usage()).toEqual({ windows: [window] })
    await kind(createGatewayPlansClient(fakeAuth({ windows: [{ ...window, usedPercent: 101 }] }).auth).usage(), 'invalid-response')
  })
})

describe('search client', () => {
  const configuration = { sources: ['memory', 'tasks'], exactText: true, semantic: false, reranking: false }
  const hit = { id: 'h1', source: 'memory', recordId: 'r1', title: 'T', excerpt: 'E', href: '/memory/r1', matchType: 'text', role: null }
  const page = { results: [hit], stage: 'text', nextCursor: null, coverage: [{ source: 'memory', status: 'searched' }], ranking: { status: 'disabled' } }

  it('reads settings and capabilities', async () => {
    const { auth, calls } = fakeAuth({ revision: 3, configuration })
    expect(await createGatewaySearchClient(auth).settings()).toEqual({ revision: 3, configuration })
    expect(calls[0].path).toBe('/api/control/pi/search/settings')
    const capabilities = { sources: ['memory'], exactText: true, semanticSources: [], reranking: false, indexing: 'source-owned', scanLimit: 100 }
    expect(await createGatewaySearchClient(fakeAuth(capabilities).auth).capabilities()).toEqual(capabilities)
    await kind(createGatewaySearchClient(fakeAuth({ ...capabilities, indexing: 'client' }).auth).capabilities(), 'invalid-response')
  })

  it('saves settings only when the revision moves by one', async () => {
    const { auth, calls } = fakeAuth({ revision: 4, configuration })
    const client = createGatewaySearchClient(auth)
    expect((await client.save(configuration as never, 3)).revision).toBe(4)
    expect(calls[0].init).toEqual({ method: 'POST', body: { configuration, expected_revision: 3 } })
    await kind(client.save(configuration as never, 9), 'invalid-response')
    await kind(client.save({ ...configuration, sources: ['memory', 'memory'] } as never, 3), 'invalid-response')
    await kind(client.save(configuration as never, -1), 'invalid-response')
  })

  it('queries one stage at a time and refuses a different stage back', async () => {
    const { auth, calls } = fakeAuth(page)
    const client = createGatewaySearchClient(auth)
    expect((await client.query('  tax  ', 'text')).results).toEqual([hit])
    await client.query('tax', 'text', undefined, 'cur')
    expect(calls.map(call => call.init.query)).toEqual([
      { q: 'tax', stage: 'text' },
      { q: 'tax', stage: 'text', cursor: 'cur' },
    ])
    await kind(client.query('tax', 'semantic'), 'invalid-response')
    await kind(client.query('   ', 'text'), 'invalid-response')
    await kind(client.query('x', 'fuzzy' as never), 'invalid-response')
    await kind(createGatewaySearchClient(fakeAuth({ ...page, results: [{ ...hit, href: '/etc/passwd' }] }).auth).query('x', 'text'), 'invalid-response')
  })

  it('accepts only the app’s own link shapes in results', async () => {
    const link = (href: string) => createGatewaySearchClient(fakeAuth({ ...page, results: [{ ...hit, href }] }).auth).query('x', 'text')
    expect((await link('/chat?id=1')).results[0].href).toBe('/chat?id=1')
    await kind(link('/chat\\evil'), 'invalid-response')
    await kind(link('//evil.example'), 'invalid-response')
    await kind(link('/memory/a\nb'), 'invalid-response')
  })
})

describe('memory uses client', () => {
  const page = { memoryId: 'm1', since: null, total: 3, chats: 2, items: [], nextAfter: null }

  it('asks for one item and the totals', async () => {
    const { auth, calls } = fakeAuth(page)
    expect(await createMemoryUsesClient(auth).uses('m1')).toEqual(page)
    expect(calls[0]).toEqual({ path: '/api/control/pi/memory/m1/uses', init: { query: { limit: 1 }, signal: undefined } })
  })

  it('refuses a path-like id before sending and a bad page after', async () => {
    const { auth, calls } = fakeAuth(page)
    await kind(createMemoryUsesClient(auth).uses('../secrets'), 'validation')
    expect(calls).toEqual([])
    await kind(createMemoryUsesClient(fakeAuth({ ...page, chats: -1 }).auth).uses('m1'), 'invalid-response')
  })
})

describe('memory care client', () => {
  const group = { items: [{ ids: ['a', 'b'], reason: 'same' }], total: 1 }
  const empty = { items: [], total: 0 }
  const page = { agentId: 'c', checkedAt: 'now', memoriesChecked: 2, truncated: false, exactDuplicates: group, nearDuplicates: empty, contradictions: empty, expired: empty, notRecalled: empty }

  it('reads the five upkeep groups', async () => {
    expect(await createMemoryCareClient(fakeAuth(page).auth).upkeep()).toEqual(page)
    await kind(createMemoryCareClient(fakeAuth({ ...page, exactDuplicates: { items: [{ ids: [], reason: '' }], total: 1 } }).auth).upkeep(), 'invalid-response')
  })
})

describe('native Claude sessions client', () => {
  const id = 'session-1'
  const identity = hex('a', 64)
  const row = { id, identity, sessionId: null, name: null, cwd: '/work', startedAt: 1, state: 'working', processStatus: 'busy', waitingFor: null, canStop: true }
  const envelope = { schemaVersion: 1, provider: 'claude' }
  const collection = { ...envelope, scope: 'background_sessions', results: [row], truncated: false, omittedCount: 0 }

  it('checks ids and builds the attach command', () => {
    expect(nativeSessionId.safeParse('abc-1_2').success).toBe(true)
    expect(nativeSessionId.safeParse('abc\n').success).toBe(false)
    expect(nativeSessionId.safeParse('-abc').success).toBe(false)
    expect(nativeAttachCommand('abc-1')).toBe('python scripts/conker.py native claude attach abc-1')
    expect(() => nativeAttachCommand('abc; rm -rf /')).toThrow(expect.objectContaining({ kind: 'validation' }))
  })

  it('lists sessions and refuses duplicates or a stop button on a finished one', async () => {
    expect(await createNativeSessionsClient(fakeAuth(collection).auth).list()).toEqual(collection)
    await kind(createNativeSessionsClient(fakeAuth({ ...collection, results: [row, row] }).auth).list(), 'invalid-response')
    await kind(createNativeSessionsClient(fakeAuth({ ...collection, results: [{ ...row, state: 'done' }] }).auth).list(), 'invalid-response')
    await kind(createNativeSessionsClient(fakeAuth({ ...collection, results: [{ ...row, cwd: 'a\u0007b' }] }).auth).list(), 'invalid-response')
  })

  it('gets one session and refuses a different one back', async () => {
    const { auth, calls } = fakeAuth({ ...envelope, result: row })
    expect(await createNativeSessionsClient(auth).get(id)).toEqual(row)
    expect(calls[0].path).toBe(`/api/host/claude/sessions/${id}`)
    await kind(createNativeSessionsClient(fakeAuth({ ...envelope, result: { ...row, id: 'other' } }).auth).get(id), 'invalid-response')
    await kind(createNativeSessionsClient(auth).get('bad id'), 'validation')
  })

  it('reads output only for the identity that was asked about', async () => {
    const reply = { ...envelope, id, identity, text: 'line\n', truncated: false, outputPersisted: false }
    const client = createNativeSessionsClient(fakeAuth(reply).auth)
    expect(await client.output({ id, identity })).toEqual(reply)
    await kind(client.output({ id, identity: hex('b', 64) }), 'invalid-response')
    await kind(client.output({ id: 'other', identity }), 'invalid-response')
    await kind(client.output({ id, identity: 'short' }), 'validation')
    await kind(createNativeSessionsClient(fakeAuth({ ...reply, text: 'a\u0000b' }).auth).output({ id, identity }), 'invalid-response')
  })

  it('stops a session by identity, once, with the dispatch signal', async () => {
    const reply = { ...envelope, id, identity, status: 'stop_requested', automaticReplay: false }
    const { auth, calls } = fakeAuth(reply)
    const onDispatch = () => undefined
    expect(await createNativeSessionsClient(auth).stop({ id, identity }, undefined, onDispatch)).toEqual(reply)
    expect(calls[0]).toEqual({ path: `/api/host/claude/sessions/${id}/stop`, init: { method: 'POST', body: { expectedIdentity: identity }, signal: undefined, onDispatch } })
    await kind(createNativeSessionsClient(fakeAuth({ ...reply, identity: hex('c', 64) }).auth).stop({ id, identity }), 'invalid-response')
    await kind(createNativeSessionsClient(fakeAuth({ ...reply, automaticReplay: true }).auth).stop({ id, identity }), 'invalid-response')
    await kind(createNativeSessionsClient(auth).stop({ id: '', identity }), 'validation')
  })
})

describe('Codex sessions client', () => {
  const id = '0123abcd-0123-0123-0123-0123456789ab'
  const row = { id, name: null, preview: 'p', previewTruncated: false, cwd: '/work', createdAt: 1, updatedAt: 2, modelProvider: 'openai', source: 'cli' }
  const envelope = { schemaVersion: 1, provider: 'codex', scope: 'saved_threads', runtimeVisibility: 'observer_only' }
  const page = { ...envelope, archived: false, results: [row], nextCursor: null }

  it('checks thread ids and builds the resume command', () => {
    expect(codexThreadId.safeParse(id).success).toBe(true)
    expect(codexThreadId.safeParse('0123ABCD-0123-0123-0123-0123456789ab').success).toBe(false)
    expect(codexResumeCommand(id)).toBe(`python scripts/conker.py native codex resume ${id}`)
    expect(() => codexResumeCommand('nope')).toThrow(expect.objectContaining({ kind: 'validation' }))
  })

  it('lists with defaults, a limit and a cursor', async () => {
    const { auth, calls } = fakeAuth(page)
    const client = createCodexSessionsClient(auth)
    expect(await client.list({ archived: false })).toEqual(page)
    await client.list({ archived: false, limit: 5, cursor: 'abc_-' })
    expect(calls.map(call => call.init.query)).toEqual([
      { archived: false, limit: 25 },
      { archived: false, limit: 5, cursor: 'abc_-' },
    ])
  })

  it('refuses bad options and replies that contradict the request', async () => {
    const { auth, calls } = fakeAuth(page)
    const client = createCodexSessionsClient(auth)
    await kind(client.list({ archived: 'no' as never }), 'validation')
    await kind(client.list({ archived: false, limit: 0 }), 'validation')
    await kind(client.list({ archived: false, limit: 51 }), 'validation')
    await kind(client.list({ archived: false, cursor: 'bad cursor' }), 'validation')
    expect(calls).toEqual([])
    await kind(client.list({ archived: true }), 'invalid-response')
    await kind(createCodexSessionsClient(fakeAuth({ ...page, results: [row, { ...row, name: 'b' }, row] }).auth).list({ archived: false, limit: 2 }), 'invalid-response')
    await kind(createCodexSessionsClient(fakeAuth({ ...page, results: [row, row] }).auth).list({ archived: false }), 'invalid-response')
  })

  it('gets one thread and refuses a different one back', async () => {
    const { auth, calls } = fakeAuth({ ...envelope, session: row })
    expect(await createCodexSessionsClient(auth).get(id)).toEqual(row)
    expect(calls[0].path).toBe(`/api/host/codex/sessions/${id}`)
    await kind(createCodexSessionsClient(fakeAuth({ ...envelope, session: { ...row, id: '11111111-1111-1111-1111-111111111111' } }).auth).get(id), 'invalid-response')
    await kind(createCodexSessionsClient(auth).get('nope'), 'validation')
  })
})

describe('prompt enhance client', () => {
  const reply = { text: 'Better', notes: ['shorter'], modelId: 'm1' }

  it('sends the draft with only the options that were set', async () => {
    const { auth, calls } = fakeAuth(reply)
    const client = createPromptEnhanceClient(auth)
    expect(await client.enhance('draft')).toEqual(reply)
    await client.enhance('draft', { sessionId: 's1', templateId: 't1', privacy: { memoryDisabled: true } })
    await client.enhance('draft', { sessionId: null, templateId: null, privacy: {} })
    expect(calls.map(call => call.init.body)).toEqual([{ text: 'draft' }, { text: 'draft', sessionId: 's1', templateId: 't1', privacy: { memoryDisabled: true } }, { text: 'draft' }])
    expect(calls[0].path).toBe('/api/control/pi/prompts/enhance')
  })

  it('refuses an empty rewrite', async () => kind(createPromptEnhanceClient(fakeAuth({ ...reply, text: '' }).auth).enhance('draft'), 'invalid-response'))
})

describe('prompt errors', () => {
  it('turns a refusal code into plain words', () => {
    expect(promptMessage(new GatewayError('http', 409, undefined, 'revision_conflict'))).toBe('This template changed somewhere else, so nothing was saved.')
    expect(promptMessage(new GatewayError('http', 400, undefined, 'too_many'))).toBe('You already have 100 templates. Delete one first.')
  })
  it('uses the standard message for other failures', () => {
    expect(promptMessage(new GatewayError('network'))).toBe(new GatewayError('network').message)
    expect(promptMessage(new Error('boom'))).toBe(new GatewayError('network').message)
    expect(promptMessage(new GatewayError('http', 500, undefined, 'something_else' as never))).toBe(new GatewayError('http').message)
  })
  it('spots a stale template', () => {
    expect(isStaleTemplate(new GatewayError('http', 409, undefined, 'revision_conflict'))).toBe(true)
    expect(isStaleTemplate(new GatewayError('http', 409, undefined, 'unusable'))).toBe(false)
    expect(isStaleTemplate('x')).toBe(false)
  })
})
