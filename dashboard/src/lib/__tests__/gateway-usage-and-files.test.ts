import { describe, expect, it } from 'vitest'
import { createGatewayTurnUsageClient, parseTurnUsage, usageFields } from '../gateway/turn-usage'
import { createFilesystemRequestId, createGatewayFilesystemClient } from '../gateway/filesystem'

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const kind = (promise: Promise<unknown>, expected: string) => expect(promise).rejects.toMatchObject({ name: 'GatewayError', kind: expected })
function fakeAuth(...answers: unknown[]) {
  const calls: { path: string; init: Record<string, unknown> }[] = []
  const queue = [...answers]
  const request = async (path: string, init: Record<string, unknown> = {}) => {
    calls.push({ path, init })
    return queue.length > 1 ? queue.shift() : queue[0]
  }
  return { calls, auth: { request } as never }
}

const totals = (extra: Json = {}) => ({ input_tokens: 10, output_tokens: 5, cached_tokens: 0, cost_usd: 0.01, summed_call_ms: 200, ...extra })
const allTrue = () => Object.fromEntries(usageFields.map(field => [field, true]))
const noneMissing = () => Object.fromEntries(usageFields.map(field => [field, 0]))
const lane = (extra: Json = {}) => ({ attempt_count: 1, pending_count: 0, reported_count: 1, failed_count: 0, totals: totals(), known_subtotal: totals(), complete: allTrue(), unknown_counts: noneMissing(), ...extra })
const emptyLane = () =>
  lane({ attempt_count: 0, reported_count: 0, totals: totals({ input_tokens: 0, output_tokens: 0, cost_usd: 0, summed_call_ms: 0 }), known_subtotal: totals({ input_tokens: 0, output_tokens: 0, cost_usd: 0, summed_call_ms: 0 }) })
const attempt = (id: string, startedAt: number, extra: Json = {}) => ({
  id,
  lane: 'foreground',
  role: 'answer',
  provider_id: 'p',
  model_id: 'm',
  provider: 'P',
  model: 'M',
  actual_provider: null,
  actual_model: null,
  status: 'reported',
  failure_kind: null,
  started_at: startedAt,
  ended_at: startedAt + 1,
  elapsed_ms: 200,
  input_tokens: 10,
  output_tokens: 5,
  cached_tokens: 0,
  cost_usd: 0.01,
  ...extra,
})
const receipt = (extra: Json = {}): Json => ({
  schemaVersion: 1,
  turn_id: 't1',
  session_id: 's1',
  content_status: 'available',
  scope: 'turn_provider_attempts',
  coverage: 'complete',
  foreground: lane(),
  thinking: emptyLane(),
  attempts: [attempt('a1', 1)],
  attempts_truncated: false,
  ...extra,
})

describe('parseTurnUsage', () => {
  const bad = (value: unknown, turn = 't1', session = 's1') => expect(() => parseTurnUsage(value, turn, session)).toThrow(expect.objectContaining({ kind: 'invalid-response' }))

  it('accepts a complete receipt for the right turn', () => {
    const value = receipt()
    expect(parseTurnUsage(value, 't1', 's1')).toEqual(value)
  })

  it('refuses a receipt for another turn or chat', () => {
    bad(receipt(), 'other', 's1')
    bad(receipt(), 't1', 'other')
  })

  it('refuses a malformed receipt', () => {
    bad(null)
    bad(receipt({ schemaVersion: 2 }))
    bad(receipt({ content_status: 'forgotten' }))
    bad(receipt({ attempts: [attempt('a1', 1, { model: 'x'.repeat(301) })] }))
    bad(receipt({ attempts: [attempt('a1', 1, { role: 'chatting' })] }))
  })

  it('refuses counts that do not add up', () => {
    bad(receipt({ foreground: lane({ pending_count: 1 }) }))
    bad(receipt({ foreground: lane({ unknown_counts: { ...noneMissing(), cost_usd: 2 } }) }))
  })

  it('refuses totals that claim more than is known', () => {
    bad(receipt({ coverage: 'legacy_partial' }))
    bad(receipt({ foreground: lane({ unknown_counts: { ...noneMissing(), cost_usd: 1 } }) }))
    bad(receipt({ foreground: lane({ known_subtotal: totals({ cost_usd: null }) }) }))
    bad(receipt({ foreground: lane({ totals: totals({ cost_usd: 0.5 }) }) }))
    bad(receipt({ foreground: lane({ complete: { ...allTrue(), cost_usd: false } }) }))
  })

  it('accepts an incomplete field with no total, and needs a zero subtotal when nothing is known', () => {
    const incomplete = lane({ totals: totals({ cost_usd: null }), known_subtotal: totals({ cost_usd: 0 }), complete: { ...allTrue(), cost_usd: false }, unknown_counts: { ...noneMissing(), cost_usd: 1 } })
    expect(parseTurnUsage(receipt({ foreground: incomplete }), 't1', 's1').foreground.totals.cost_usd).toBeNull()
    bad(receipt({ foreground: { ...incomplete, known_subtotal: totals({ cost_usd: 0.3 }) } }))
    const unknownTotals = Object.fromEntries(usageFields.map(field => [field, null]))
    const unknownLane = (count: number) =>
      lane({
        attempt_count: count,
        reported_count: count,
        complete: Object.fromEntries(usageFields.map(field => [field, false])),
        totals: unknownTotals,
        unknown_counts: Object.fromEntries(usageFields.map(field => [field, count])),
        known_subtotal: totals({ input_tokens: 0, output_tokens: 0, cached_tokens: 0, cost_usd: 0, summed_call_ms: 0 }),
      })
    const partial = receipt({ coverage: 'legacy_partial', foreground: unknownLane(1), thinking: unknownLane(0) })
    expect(parseTurnUsage(partial, 't1', 's1').coverage).toBe('legacy_partial')
  })

  it('refuses duplicate or out-of-order attempts', () => {
    const second = lane({
      attempt_count: 2,
      reported_count: 2,
      totals: totals({ input_tokens: 20, output_tokens: 10, cost_usd: 0.02, summed_call_ms: 400 }),
      known_subtotal: totals({ input_tokens: 20, output_tokens: 10, cost_usd: 0.02, summed_call_ms: 400 }),
    })
    expect(parseTurnUsage(receipt({ foreground: second, attempts: [attempt('a1', 1), attempt('a2', 1)] }), 't1', 's1').attempts).toHaveLength(2)
    bad(receipt({ foreground: second, attempts: [attempt('a1', 1), attempt('a1', 2)] }))
    bad(receipt({ foreground: second, attempts: [attempt('a1', 5), attempt('a2', 2)] }))
    bad(receipt({ foreground: second, attempts: [attempt('b1', 1), attempt('a2', 1)] }))
  })

  it('refuses a list that shows more than counted, or fewer unless it says it was cut', () => {
    bad(receipt({ attempts: [attempt('a1', 1), attempt('a2', 2)] }))
    bad(receipt({ attempts: [] }))
    expect(parseTurnUsage(receipt({ attempts: [], attempts_truncated: true }), 't1', 's1').attempts).toEqual([])
  })
})

describe('turn usage client', () => {
  it('asks for one turn’s usage and checks it', async () => {
    const { auth, calls } = fakeAuth(receipt())
    expect((await createGatewayTurnUsageClient(auth).get('t1', 's1')).turn_id).toBe('t1')
    expect(calls[0]).toEqual({ path: '/api/pi/turns/t1/usage', init: {} })
  })

  it('refuses bad ids before sending and a reply for another turn', async () => {
    const { auth, calls } = fakeAuth(receipt())
    const client = createGatewayTurnUsageClient(auth)
    await kind(client.get('bad id', 's1'), 'validation')
    await kind(client.get('t1', '../s'), 'validation')
    expect(calls).toEqual([])
    await kind(client.get('t9', 's1'), 'invalid-response')
  })

  it('stops when the caller aborts, before or after the read', async () => {
    const before = new AbortController()
    before.abort()
    const { auth, calls } = fakeAuth(receipt())
    await kind(createGatewayTurnUsageClient(auth).get('t1', 's1', { signal: before.signal }), 'aborted')
    expect(calls).toEqual([])
    const during = new AbortController()
    const slow = {
      request: async () => {
        during.abort()
        return receipt()
      },
    } as never
    await kind(createGatewayTurnUsageClient(slow).get('t1', 's1', { signal: during.signal }), 'aborted')
  })
})

describe('filesystem client', () => {
  const id = 'browser_' + 'a'.repeat(32)
  const configured = {
    schemaVersion: 1,
    authority: 'none',
    execution: 'directory-listing-only',
    contentIncluded: false,
    mode: 'configured',
    code: null,
    roots: [{ id: 'home', path: '/home/me' }],
    capabilities: { list: true, read: false, write: false },
  }
  const unavailable = { ...configured, mode: 'unavailable', code: 'disabled', roots: [], capabilities: null }
  const listing = (path = '', entries: Json[] = [{ name: 'a.txt', path: path ? `${path}/a.txt` : 'a.txt', kind: 'file' }]) => ({ mode: 'observed', rootId: 'home', path, truncated: false, sampledAt: '2026-01-01T00:00:00Z', entries })
  const directory = (extra: Json = {}) => ({
    schemaVersion: 1,
    requestId: id,
    state: 'complete',
    limit: 200,
    rootId: 'home',
    path: '',
    approvalRequired: false,
    errorCode: null,
    listing: listing(),
    receiptStatus: null,
    currentAgeSeconds: 1,
    createdAt: 1,
    updatedAt: 2,
    source: 'toolgate/system.files-list',
    refreshRequiresNewRequest: true,
    authority: 'none',
    contentIncluded: false,
    execution: 'directory-listing-only',
    ...extra,
  })

  it('makes a browser request id', () => {
    expect(createFilesystemRequestId()).toMatch(/^browser_[0-9a-f]{32}$/)
    expect(createFilesystemRequestId()).not.toBe(createFilesystemRequestId())
  })

  it('reads the configured roots, or why there are none', async () => {
    const { auth, calls } = fakeAuth(configured)
    expect(await createGatewayFilesystemClient(auth).roots()).toEqual(configured)
    expect(calls[0].path).toBe('/api/control/pi/system/files/roots')
    expect((await createGatewayFilesystemClient(fakeAuth(unavailable).auth).roots()).mode).toBe('unavailable')
    await kind(createGatewayFilesystemClient(fakeAuth({ ...configured, roots: [] }).auth).roots(), 'invalid-response')
    await kind(createGatewayFilesystemClient(fakeAuth({ ...unavailable, roots: [{ id: 'x', path: '/x' }] }).auth).roots(), 'invalid-response')
    await kind(createGatewayFilesystemClient(fakeAuth({ ...configured, capabilities: { list: true, read: true, write: false } }).auth).roots(), 'invalid-response')
  })

  it('requests a listing and checks the reply is for the same request', async () => {
    const { auth, calls } = fakeAuth(directory())
    const client = createGatewayFilesystemClient(auth)
    expect((await client.request(id, 'home')).state).toBe('complete')
    expect(calls[0]).toEqual({ path: '/api/control/pi/system/files/listings', init: { method: 'POST', body: { request_id: id, root_id: 'home', path: '', limit: 200 }, signal: undefined } })
    await kind(client.request(id, 'home', 'docs'), 'invalid-response')
    await kind(client.request(id, 'home', '', 50), 'invalid-response')
    await kind(client.request(id, 'other'), 'invalid-response')
    await kind(client.request('browser_' + 'b'.repeat(32), 'home'), 'invalid-response')
  })

  it('refuses unsafe paths, ids and limits before sending', async () => {
    const { auth, calls } = fakeAuth(directory())
    const client = createGatewayFilesystemClient(auth)
    await kind(client.request('short', 'home'), 'validation')
    await kind(client.request(id, 'bad root!'), 'validation')
    for (const path of ['..', 'a/../b', '/abs', 'a//b', 'a\\b', 'a/./b', 'bad\u0007name', 'x'.repeat(256)]) await kind(client.request(id, 'home', path), 'validation')
    await kind(client.request(id, 'home', '', 0), 'validation')
    await kind(client.request(id, 'home', '', 201), 'validation')
    expect(calls).toEqual([])
    await client.request(id, 'home', 'docs', 5).catch(() => undefined)
    expect(calls[0].init.body as { path: string; limit: number }).toMatchObject({ path: 'docs', limit: 5 })
  })

  it('refuses listings whose entries are not unique children of the path', async () => {
    const good = directory({
      path: 'docs',
      listing: listing('docs', [
        { name: 'a', path: 'docs/a', kind: 'directory' },
        { name: 'b', path: 'docs/b', kind: 'symlink' },
      ]),
    })
    expect((await createGatewayFilesystemClient(fakeAuth(good).auth).inspect(id)).listing?.entries).toHaveLength(2)
    await kind(createGatewayFilesystemClient(fakeAuth(directory({ listing: listing('', [{ name: 'a', path: 'elsewhere/a', kind: 'file' }]) })).auth).inspect(id), 'invalid-response')
    await kind(
      createGatewayFilesystemClient(
        fakeAuth(
          directory({
            listing: listing('', [
              { name: 'a', path: 'a', kind: 'file' },
              { name: 'a', path: 'a', kind: 'file' },
            ]),
          }),
        ).auth,
      ).inspect(id),
      'invalid-response',
    )
    await kind(createGatewayFilesystemClient(fakeAuth(directory({ listing: listing('', [{ name: 'a', path: 'a', kind: 'socket' }]) })).auth).inspect(id), 'invalid-response')
  })

  it('inspects and resumes one request, checking the id comes back', async () => {
    const { auth, calls } = fakeAuth(directory({ state: 'awaiting_approval', approvalRequired: true, listing: null }))
    const client = createGatewayFilesystemClient(auth)
    expect((await client.inspect(id)).state).toBe('awaiting_approval')
    expect((await client.resume(id)).approvalRequired).toBe(true)
    expect(calls.map(call => [call.path, call.init.method])).toEqual([
      [`/api/control/pi/system/files/listings/${id}`, undefined],
      [`/api/control/pi/system/files/listings/${id}/resume`, 'POST'],
    ])
    await kind(client.inspect('nope'), 'validation')
    await kind(client.resume('nope'), 'validation')
    const other = createGatewayFilesystemClient(fakeAuth(directory({ requestId: 'browser_' + 'c'.repeat(32) })).auth)
    await kind(other.inspect(id), 'invalid-response')
    await kind(other.resume(id), 'invalid-response')
  })
})
