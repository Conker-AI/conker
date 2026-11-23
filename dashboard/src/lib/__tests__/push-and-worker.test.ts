import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { createPushClient } from '../gateway/push'
import { GatewayError } from '../gateway/transport'

type Call = { path: string; init: Record<string, unknown> }
function fakeAuth(answer: unknown) {
  const calls: Call[] = []
  const request = async (path: string, init: Record<string, unknown> = {}) => {
    calls.push({ path, init })
    return answer
  }
  return { calls, client: createPushClient({ request } as never) }
}
const kind = (promise: Promise<unknown>, expected: string) => expect(promise).rejects.toMatchObject({ name: 'GatewayError', kind: expected })
const ID = 'a'.repeat(32)
const ROW = { id: ID, created: 1_790_000_000, label: 'Chrome on Android' }
const PUBLIC_KEY = 'B' + 'A'.repeat(86)
const KEYS = { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) } }

describe('push client', () => {
  it('reads the public key and the devices that are on', async () => {
    const { calls, client } = fakeAuth({ publicKey: PUBLIC_KEY, devices: [ROW], limit: 10 })
    expect(await client.state()).toEqual({ publicKey: PUBLIC_KEY, devices: [ROW], limit: 10 })
    expect(calls[0]?.path).toBe('/api/push')
    expect(calls[0]?.init.method).toBeUndefined()
  })

  it.each([
    { publicKey: PUBLIC_KEY, devices: [ROW], limit: 10, privateKey: 'x' },
    { publicKey: 'short', devices: [], limit: 10 },
    { publicKey: PUBLIC_KEY, devices: [{ ...ROW, id: '../x' }], limit: 10 },
    { publicKey: PUBLIC_KEY, devices: [ID], limit: 10 },
    { publicKey: PUBLIC_KEY, devices: [{ ...ROW, endpoint: 'https://fcm.googleapis.com/x' }], limit: 10 },
    { publicKey: PUBLIC_KEY, devices: [{ ...ROW, label: 'x'.repeat(41) }], limit: 10 },
    { publicKey: PUBLIC_KEY, devices: Array(11).fill(ROW), limit: 10 },
    null,
  ])('refuses an answer of any other shape', async answer => {
    await kind(fakeAuth(answer).client.state(), 'invalid-response')
  })

  it('sends only the endpoint and the two keys when turning on', async () => {
    const { calls, client } = fakeAuth({ device: ID, devices: [ROW], limit: 10 })
    expect(await client.subscribe({ ...KEYS, extra: 'x' } as never)).toEqual({ device: ID, devices: [ROW], limit: 10 })
    expect(calls[0]).toEqual({ path: '/api/push/subscriptions', init: { method: 'POST', body: KEYS, signal: undefined } })
  })

  it('a renewal sends the same subscription with renew: true, and is checked the same way', async () => {
    const { calls, client } = fakeAuth({ device: ID, devices: [ROW], limit: 10 })
    expect(await client.renew({ ...KEYS, renew: false } as never)).toEqual({ device: ID, devices: [ROW], limit: 10 })
    expect(calls[0]).toEqual({ path: '/api/push/subscriptions', init: { method: 'POST', body: { ...KEYS, renew: true }, signal: undefined } })
    await kind(client.renew({ ...KEYS, endpoint: 'http://fcm.googleapis.com/x' }), 'validation')
    expect(calls).toHaveLength(1)
  })

  it.each([
    { ...KEYS, endpoint: 'http://fcm.googleapis.com/x' },
    { ...KEYS, endpoint: 'https://fcm.googleapis.com/' + 'x'.repeat(1000) },
    { ...KEYS, keys: { p256dh: '', auth: KEYS.keys.auth } },
    { ...KEYS, keys: { p256dh: KEYS.keys.p256dh, auth: 'a/b' } },
  ])('refuses a subscription it should not send', async value => {
    const { calls, client } = fakeAuth({})
    await kind(client.subscribe(value), 'validation')
    expect(calls).toEqual([])
  })

  it('turns one device off with an empty body', async () => {
    const { calls, client } = fakeAuth({ removed: true, devices: [], limit: 10 })
    expect((await client.unsubscribe(ID)).removed).toBe(true)
    expect(calls[0]).toEqual({ path: `/api/push/subscriptions/${ID}/delete`, init: { method: 'POST', body: {}, signal: undefined } })
    await kind(client.unsubscribe('../push'), 'validation')
    expect(calls).toHaveLength(1)
    await kind(fakeAuth({ removed: 'yes', devices: [], limit: 10 }).client.unsubscribe(ID), 'invalid-response')
  })

  it('keeps its errors as server-call errors', () => {
    expect(new GatewayError('validation').message).not.toContain(KEYS.endpoint)
  })
})

/** The real public/sw.js, run with a fake service worker global. */
function worker(scope = 'https://conker.test/') {
  const handlers: Record<string, (event: unknown) => void> = {}
  const shown: { title: string; options: { tag: string; icon: string; data: { url: string } } }[] = []
  const windows: { url: string; focus: ReturnType<typeof vi.fn>; navigate: ReturnType<typeof vi.fn> }[] = []
  const openWindow = vi.fn(async () => null)
  const self = {
    registration: { scope, showNotification: async (title: string, options: never) => void shown.push({ title, options }) },
    location: { origin: new URL(scope).origin },
    addEventListener: (name: string, handler: (event: unknown) => void) => (handlers[name] = handler),
    clients: { matchAll: async () => windows, openWindow },
  }
  const source = readFileSync(fileURLToPath(new URL('../../../public/sw.js', import.meta.url)), 'utf8')
  runInNewContext(source, { self, URL, Response, Request, caches: {}, fetch })
  async function dispatch(name: string, event: Record<string, unknown>) {
    let work: Promise<unknown> = Promise.resolve()
    handlers[name]?.({ ...event, waitUntil: (promise: Promise<unknown>) => (work = promise) })
    await work
  }
  const push = async (data: unknown) => {
    const payload = data === undefined ? null : { json: () => (typeof data === 'string' ? JSON.parse(data) : data) }
    await dispatch('push', { data: payload })
    return shown.at(-1)!
  }
  const click = (data: unknown) => {
    const close = vi.fn()
    return dispatch('notificationclick', { notification: { data, close } }).then(() => close)
  }
  return { push, click, windows, openWindow }
}

describe('service worker notifications', () => {
  it('shows the fixed title, its tag and the Inbox link the server sent', async () => {
    const shown = await worker().push({ title: 'Conker needs your approval', url: '/inbox', tag: 'conker-0123456789abcdef' })
    expect(shown.title).toBe('Conker needs your approval')
    expect(shown.options.tag).toBe('conker-0123456789abcdef')
    expect(shown.options.data.url).toBe('/inbox')
    expect(shown.options.icon).toBe('https://conker.test/icons/icon-192.png')
  })

  it.each([undefined, 'not json', [], { title: 42 }, { title: '   ' }, { title: 'x'.repeat(81) }])('an unreadable payload still says something needs the owner', async data => {
    const shown = await worker().push(data)
    expect(shown.title).toBe('Conker needs you')
    expect(shown.options.tag).toBe('conker')
    expect(shown.options.data.url).toBe('/inbox')
  })

  it.each(['https://evil.example/inbox', 'https://conker.test/app/inbox', '/api/push', 'javascript:alert(1)', '//evil.example/x', '/\\evil.example/x', '/app/in box', 42, '/' + 'x'.repeat(200), 'http://[::1', '/other/inbox'])(
    'opens only a path of this app (%s goes to the Inbox)',
    async url => {
      const shown = await worker('https://conker.test/app/').push({ title: 'Conker needs you', url, tag: 'conker-<b>' })
      expect(shown.options.data.url).toBe('/app/inbox')
      expect(shown.options.tag).toBe('conker')
    },
  )

  it('keeps a page of this app the payload names', async () => {
    const shown = await worker('https://conker.test/app/').push({ title: 'Conker needs you', url: '/app/inbox?from=push' })
    expect(shown.options.data.url).toBe('/app/inbox?from=push')
  })

  it('a click follows only a path of this app, whatever the notification data says', async () => {
    for (const [data, opened] of [
      [{ url: '/settings?group=notifications' }, 'https://conker.test/settings?group=notifications'],
      [{ url: 'https://conker.test/settings' }, 'https://conker.test/inbox'],
      [{ url: '//evil.example/x' }, 'https://conker.test/inbox'],
      [{ url: '/\\evil.example/x' }, 'https://conker.test/inbox'],
      [{ url: 'javascript:alert(1)' }, 'https://conker.test/inbox'],
      [{ url: '/auth/logout' }, 'https://conker.test/inbox'],
    ] as const) {
      const sw = worker()
      await sw.click(data)
      expect(sw.openWindow).toHaveBeenCalledWith(opened)
    }
  })

  it('a click brings an open Conker window to the Inbox', async () => {
    const sw = worker()
    const other = { url: 'https://elsewhere.test/', focus: vi.fn(), navigate: vi.fn() }
    const mine = { url: 'https://conker.test/chat', focus: vi.fn(async () => null), navigate: vi.fn(async () => undefined) }
    sw.windows.push(other, mine)
    const close = await sw.click({ url: 'https://conker.test/inbox' })
    expect(close).toHaveBeenCalled()
    expect(mine.focus).toHaveBeenCalled()
    expect(mine.navigate).toHaveBeenCalledWith('https://conker.test/inbox')
    expect(other.focus).not.toHaveBeenCalled()
    expect(sw.openWindow).not.toHaveBeenCalled()
  })

  it('a window that cannot be moved is still focused', async () => {
    const sw = worker()
    const focused = { url: 'https://conker.test/', focus: vi.fn(), navigate: vi.fn(async () => Promise.reject(new Error('uncontrolled'))) }
    const mine = { url: 'https://conker.test/chat', focus: vi.fn(async () => focused), navigate: vi.fn() }
    sw.windows.push(mine)
    await sw.click(null)
    expect(focused.navigate).toHaveBeenCalledWith('https://conker.test/inbox')
  })

  it('with no Conker window open a click opens the Inbox, never another site', async () => {
    const sw = worker()
    await sw.click({ url: 'https://evil.example/' })
    expect(sw.openWindow).toHaveBeenCalledWith('https://conker.test/inbox')
  })
})
