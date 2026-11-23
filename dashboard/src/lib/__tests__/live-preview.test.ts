import { describe, expect, it } from 'vitest'
import { LIVE_PREVIEW_BYTE_LIMIT, applyPreviewEvent, followLivePreview, parseSseEvents } from '../gateway/live-preview'

const event = (name: string, data = '', id: number | null = null) => ({ event: name, id, data })

describe('parseSseEvents', () => {
  it('splits complete events and keeps the unfinished rest', () => {
    const { events, rest } = parseSseEvents('event: delta\nid: 4\ndata: {"text":"a"}\n\nevent: done\n\nid: 5\ndata: par')
    expect(events).toEqual([event('delta', '{"text":"a"}', 4), event('done')])
    expect(rest).toBe('id: 5\ndata: par')
  })

  it('reads CRLF, comments, joined data lines and a field with no colon', () => {
    const { events, rest } = parseSseEvents(': keep-alive\r\n\r\ndata: one\r\ndata:two\r\ndata\r\n\r\n')
    expect(events).toEqual([event('message', 'one\ntwo\n')])
    expect(rest).toBe('')
  })

  it('ignores a block with no data and no event name, and an id that is not a number', () => {
    const { events } = parseSseEvents('id: 3\n\nid: x1\ndata: hi\n\nretry: 10\n\n')
    expect(events).toEqual([event('message', 'hi')])
  })

  it('returns nothing from an empty buffer', () => expect(parseSseEvents('')).toEqual({ events: [], rest: '' }))
})

describe('applyPreviewEvent', () => {
  it('appends text from deltas', () => {
    expect(applyPreviewEvent('a', event('delta', '{"text":"b"}'))).toEqual({ text: 'ab' })
  })
  it('clears on reset and ends on done or unavailable', () => {
    expect(applyPreviewEvent('abc', event('reset'))).toEqual({ text: '' })
    expect(applyPreviewEvent('abc', event('done'))).toEqual({ text: 'abc', end: 'done' })
    expect(applyPreviewEvent('abc', event('unavailable'))).toEqual({ text: 'abc', end: 'unavailable' })
  })
  it('ignores unknown events and deltas it cannot read', () => {
    expect(applyPreviewEvent('a', event('ping'))).toEqual({ text: 'a' })
    for (const data of ['not json', 'null', '"x"', '{"text":5}', '{}']) expect(applyPreviewEvent('a', event('delta', data))).toEqual({ text: 'a' })
  })
})

describe('followLivePreview', () => {
  const encoder = new TextEncoder()
  const stream = (...chunks: string[]) =>
    new Response(
      new ReadableStream({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
          controller.close()
        },
      }),
      { headers: { 'content-type': 'text/event-stream; charset=utf-8' } },
    )
  const options = (fetch: typeof globalThis.fetch, extra: Record<string, unknown> = {}) => ({ signal: new AbortController().signal, fetch, origin: 'https://conker.test', retryDelayMs: 0, ...extra })
  const delta = (text: string, id?: number) => `${id === undefined ? '' : `id: ${id}\n`}event: delta\ndata: ${JSON.stringify({ text })}\n\n`

  it('refuses a request id that is not a plain token, without fetching', async () => {
    let fetched = 0
    const fetch = (async () => {
      fetched++
      return stream()
    }) as typeof globalThis.fetch
    for (const id of ['', 'has space', '../x', 'a'.repeat(201)]) expect(await followLivePreview(id, () => undefined, options(fetch))).toBe('unavailable')
    expect(fetched).toBe(0)
  })

  it('streams text until done, sending the right request', async () => {
    const seen: { url: string; init: RequestInit }[] = []
    const fetch = (async (url: URL, init: RequestInit) => {
      seen.push({ url: url.toString(), init })
      return stream(delta('Hel', 1), delta('lo', 2) + 'event: done\n\n')
    }) as unknown as typeof globalThis.fetch
    const texts: string[] = []
    expect(await followLivePreview('req_1', text => texts.push(text), options(fetch))).toBe('done')
    expect(texts).toEqual(['Hel', 'Hello'])
    expect(seen[0].url).toBe('https://conker.test/api/pi/turn-submissions/req_1/stream')
    expect(seen[0].init).toMatchObject({ credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: { Accept: 'text/event-stream' } })
  })

  it('joins an event split across chunks and reports a reset', async () => {
    const fetch = (async () => stream('event: del', `ta\ndata: {"text":"x"}\n\nevent: reset\n\n${delta('y')}event: done\n\n`)) as unknown as typeof globalThis.fetch
    const texts: string[] = []
    let resets = 0
    expect(await followLivePreview('req_1', text => texts.push(text), options(fetch, { onReset: () => resets++ }))).toBe('done')
    expect(texts).toEqual(['x', '', 'y'])
    expect(resets).toBe(1)
  })

  it('ends as unavailable when the server says so', async () => {
    const fetch = (async () => stream('event: unavailable\n\n')) as unknown as typeof globalThis.fetch
    expect(await followLivePreview('req_1', () => undefined, options(fetch))).toBe('unavailable')
  })

  it('gives up quietly on a refusal, a wrong content type or no body', async () => {
    for (const response of [
      new Response('no', { status: 404, headers: { 'content-type': 'text/event-stream' } }),
      new Response('{}', { headers: { 'content-type': 'application/json' } }),
      new Response(null, { headers: { 'content-type': 'text/event-stream' } }),
    ]) {
      const fetch = (async () => response) as unknown as typeof globalThis.fetch
      expect(await followLivePreview('req_1', () => undefined, options(fetch))).toBe('unavailable')
    }
  })

  it('stops reading a stream that grows past the limit', async () => {
    const big = 'x'.repeat(LIVE_PREVIEW_BYTE_LIMIT + 1)
    const fetch = (async () => stream(big)) as unknown as typeof globalThis.fetch
    expect(await followLivePreview('req_1', () => undefined, options(fetch))).toBe('unavailable')
  })

  it('does not mind a stream that cannot be cancelled', async () => {
    const refused = (async () => ({ ok: false, headers: new Headers(), body: { cancel: () => Promise.reject(new Error('stuck')) } })) as unknown as typeof globalThis.fetch
    expect(await followLivePreview('req_1', () => undefined, options(refused))).toBe('unavailable')
    const chunk = new Uint8Array(LIVE_PREVIEW_BYTE_LIMIT + 1)
    const reader = { read: async () => ({ done: false, value: chunk }), cancel: () => Promise.reject(new Error('stuck')), releaseLock: () => undefined }
    const huge = (async () => ({ ok: true, headers: new Headers({ 'content-type': 'text/event-stream' }), body: { getReader: () => reader } })) as unknown as typeof globalThis.fetch
    expect(await followLivePreview('req_1', () => undefined, options(huge))).toBe('unavailable')
  })

  it('reconnects after a drop, resuming after the last event it saw, a few times only', async () => {
    const urls: string[] = []
    let calls = 0
    const fetch = (async (url: URL) => {
      urls.push(url.toString())
      calls++
      if (calls === 1) return stream(delta('a', 7))
      throw new Error('network down')
    }) as unknown as typeof globalThis.fetch
    const texts: string[] = []
    expect(await followLivePreview('req_1', text => texts.push(text), options(fetch))).toBe('unavailable')
    expect(texts).toEqual(['a'])
    expect(urls).toHaveLength(4)
    expect(urls[1]).toBe('https://conker.test/api/pi/turn-submissions/req_1/stream?after=7')
  })

  it('reports stopped when the caller aborts', async () => {
    const abort = new AbortController()
    abort.abort()
    let fetched = 0
    const stopped = (async () => {
      fetched++
      return stream()
    }) as typeof globalThis.fetch
    expect(await followLivePreview('req_1', () => undefined, { ...options(stopped), signal: abort.signal })).toBe('stopped')
    expect(fetched).toBe(0)
    const later = new AbortController()
    const failing = (async () => {
      later.abort()
      throw new Error('aborted')
    }) as typeof globalThis.fetch
    expect(await followLivePreview('req_1', () => undefined, { ...options(failing), signal: later.signal })).toBe('stopped')
  })

  it('takes the page origin and the global fetch when none are given', async () => {
    const original = globalThis.fetch
    const seen: string[] = []
    globalThis.fetch = (async (url: URL) => {
      seen.push(url.toString())
      return stream('event: done\n\n')
    }) as unknown as typeof globalThis.fetch
    Object.assign(globalThis, { window: { location: { origin: 'https://page.test' } } })
    try {
      expect(await followLivePreview('req_1', () => undefined, { signal: new AbortController().signal })).toBe('done')
      expect(seen).toEqual(['https://page.test/api/pi/turn-submissions/req_1/stream'])
    } finally {
      globalThis.fetch = original
      delete (globalThis as { window?: unknown }).window
    }
  })
})
