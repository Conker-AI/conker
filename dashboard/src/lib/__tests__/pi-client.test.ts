import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createPiClient, piData } from '../gateway/pi-client'
import { GatewayError } from '../gateway/transport'

type Call = { path: string; init: Record<string, unknown> }

/** The signed-in gateway session: records each request and answers with one canned value, or fails. */
function fakeAuth(answer: unknown) {
  const calls: Call[] = []
  const request = async (path: string, init: Record<string, unknown> = {}) => {
    calls.push({ path, init })
    if (answer instanceof Error) throw answer
    return answer as Record<string, unknown>
  }
  return { calls, auth: { request } }
}

const kind = (promise: Promise<unknown>, expected: string) => expect(promise).rejects.toMatchObject({ name: 'GatewayError', kind: expected })
const anything = z.unknown()

describe('generated Pi client', () => {
  it('sends a read through the session with the control prefix, its query and the caller signal', async () => {
    const { auth, calls } = fakeAuth({ ok: true })
    const signal = new AbortController().signal
    const pi = createPiClient(auth)
    expect((await pi.GET('/memory/{memory_id}/uses', { params: { path: { memory_id: 'm1' }, query: { limit: 1, after: 'c2' } }, signal })).data).toEqual({ ok: true })
    expect(calls).toEqual([{ path: '/api/control/pi/memory/m1/uses', init: { query: { limit: 1, after: 'c2' }, signal } }])
  })

  it('sends a write with its body, and an empty one when Pi takes none', async () => {
    const { auth, calls } = fakeAuth({})
    const pi = createPiClient(auth)
    await pi.POST('/open-loops/{loop_id}/state', { params: { path: { loop_id: 'loop_1' } }, body: { state: 'done', expected_revision: 2 } })
    await pi.POST('/memory/recall-notices/{notice_id}/dismiss', { params: { path: { notice_id: 'mrn_1' } } })
    expect(calls).toEqual([
      { path: '/api/control/pi/open-loops/loop_1/state', init: { method: 'POST', body: { state: 'done', expected_revision: 2 }, signal: undefined } },
      { path: '/api/control/pi/memory/recall-notices/mrn_1/dismiss', init: { method: 'POST', body: {}, signal: undefined } },
    ])
  })

  it('serves the /api/pi routes under their own prefix', async () => {
    const { auth, calls } = fakeAuth({})
    await createPiClient(auth, '/api/pi').GET('/health')
    expect(calls[0].path).toBe('/api/pi/health')
  })

  it('refuses a path-like or empty id, and Pi key headers, before anything is sent', async () => {
    const { auth, calls } = fakeAuth({})
    const pi = createPiClient(auth)
    for (const id of ['..', '.', '', '../secrets', 'a/b', 'a b']) await kind(pi.GET('/memory/{memory_id}/uses', { params: { path: { memory_id: id } } }), 'validation')
    await kind(pi.GET('/memory/upkeep', { params: { header: { 'X-Pi-Owner-Key': 'k' } } }), 'validation')
    expect(calls).toEqual([])
  })

  it('sends a number path parameter as its digits and refuses one that is not a whole number', async () => {
    const { auth, calls } = fakeAuth({})
    const pi = createPiClient(auth)
    await pi.GET('/collaboration/teams/{identity}/versions/{revision}', { params: { path: { identity: 'team_1', revision: 3 } } })
    expect(calls).toEqual([{ path: '/api/control/pi/collaboration/teams/team_1/versions/3', init: { signal: undefined } }])
    for (const revision of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) await kind(pi.GET('/collaboration/teams/{identity}/versions/{revision}', { params: { path: { identity: 'team_1', revision } } }), 'validation')
    expect(calls).toHaveLength(1)
    // The generated types keep a number parameter a number: text is a compile error (tsc -b). Never called.
    // @ts-expect-error revision is a number in Pi's OpenAPI
    const text = () => pi.GET('/collaboration/teams/{identity}/versions/{revision}', { params: { path: { identity: 'team_1', revision: '3' } } })
    void text
  })

  it('passes the session error through unchanged', async () => {
    const failure = new GatewayError('verification-required', 428)
    await expect(piData(createPiClient(fakeAuth(failure).auth).POST('/memory/recall-notices/{notice_id}/dismiss', { params: { path: { notice_id: 'mrn_1' } } }), anything)).rejects.toBe(failure)
  })

  it('refuses a reply its schema does not accept', async () => {
    const { auth } = fakeAuth({ items: 'no' })
    // A route Pi types as unknown takes any schema; the schema still decides at run time.
    await kind(piData(createPiClient(auth).POST('/memory/recall-notices/{notice_id}/dismiss', { params: { path: { notice_id: 'mrn_1' } } }), z.object({ items: z.array(z.string()) }).strict()), 'invalid-response')
  })

  it('reports a client that cannot load as the server not being reached, with nothing sent', async () => {
    vi.resetModules()
    vi.doMock('openapi-fetch', () => {
      throw new Error('chunk failed')
    })
    const { createPiClient: fresh } = await import('../gateway/pi-client')
    const { auth, calls } = fakeAuth({})
    await kind(fresh(auth).GET('/memory/upkeep'), 'network')
    expect(calls).toEqual([])
    vi.doUnmock('openapi-fetch')
  })
})
