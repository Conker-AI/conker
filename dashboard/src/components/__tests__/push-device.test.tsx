import { createHash } from 'node:crypto'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GatewayControlClient } from '@/lib/gateway/control'
import type { PushDeviceRow, PushState } from '@/lib/gateway/push'
import { GatewayError } from '@/lib/gateway/transport'
import { browserPush, pushDeviceId, PushRefused, type PushDevice, type PushSupport, type PushWindow } from '@/pwa/register'
import { PushDeviceBlock } from '@/settings/push-device'
import { PUSH_WORDS, REMOVE_FAILED } from '@/settings/push-words'

afterEach(() => cleanup())

const ID = 'a'.repeat(32)
const OTHER = 'b'.repeat(32)
const row = (id: string, created = 1_790_000_000, label = 'Chrome on Android'): PushDeviceRow => ({ id, created, label })
const PUBLIC_KEY = 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'
const KEYS = { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) } }

function fakeDevice(support: PushSupport = 'ok', mine: { id: string; endpoint: string } | null = null) {
  let current = mine
  return {
    support: vi.fn(() => support),
    current: vi.fn(async () => current),
    subscribe: vi.fn(async () => {
      current = { id: ID, endpoint: KEYS.endpoint }
      return KEYS
    }),
    unsubscribe: vi.fn(async () => {
      current = null
    }),
  } satisfies PushDevice
}

function fakeServer(devices: PushDeviceRow[] = []) {
  const state = vi.fn(async (): Promise<PushState> => ({ publicKey: PUBLIC_KEY, devices: [...devices], limit: 10 }))
  const subscribe = vi.fn(async () => {
    devices.push(row(ID))
    return { device: ID, devices: [...devices], limit: 10 }
  })
  const unsubscribe = vi.fn(async (id: string) => {
    const index = devices.findIndex(item => item.id === id)
    if (index >= 0) devices.splice(index, 1)
    return { removed: index >= 0, devices: [...devices], limit: 10 }
  })
  return { push: { state, subscribe, unsubscribe } }
}

const asClient = (value: ReturnType<typeof fakeServer>) => value as unknown as Pick<GatewayControlClient, 'push'>
const status = () => screen.getByRole('status')
const toggle = () => screen.getByRole('switch', { name: 'Notifications on this device' })

describe('PushDeviceBlock: what the line says', () => {
  it('checks first, then says off when this browser has no subscription', async () => {
    const device = fakeDevice()
    render(<PushDeviceBlock client={asClient(fakeServer())} device={device} />)
    expect(status().textContent).toBe(PUSH_WORDS.checking)
    expect(toggle().getAttribute('aria-disabled')).toBe('true')
    await waitFor(() => expect(status().textContent).toBe(PUSH_WORDS.off))
    expect(toggle().getAttribute('aria-checked')).toBe('false')
    // Nothing is asked of the browser before the owner flips the switch.
    expect(device.subscribe).not.toHaveBeenCalled()
  })

  it('says on only when this browser is subscribed and the server lists it', async () => {
    render(<PushDeviceBlock client={asClient(fakeServer([row(ID)]))} device={fakeDevice('ok', { id: ID, endpoint: KEYS.endpoint })} />)
    await waitFor(() => expect(status().textContent).toBe(PUSH_WORDS.on))
    expect(toggle().getAttribute('aria-checked')).toBe('true')
  })

  it('says off when the browser is subscribed but the server no longer lists it', async () => {
    render(<PushDeviceBlock client={asClient(fakeServer([]))} device={fakeDevice('ok', { id: ID, endpoint: KEYS.endpoint })} />)
    await waitFor(() => expect(status().textContent).toBe(PUSH_WORDS.off))
  })

  it.each(['blocked', 'insecure', 'unsupported'] as const)('says %s and keeps the switch off, but still lists the devices', async support => {
    const server = fakeServer([row(OTHER)]),
      device = fakeDevice(support)
    render(<PushDeviceBlock client={asClient(server)} device={device} />)
    await waitFor(() => expect(status().textContent).toBe(PUSH_WORDS[support]))
    expect(toggle().getAttribute('aria-disabled')).toBe('true')
    // A browser that cannot get notifications can still see and remove the ones that do.
    expect(await screen.findByRole('button', { name: /^Remove Chrome on Android, added / })).toBeTruthy()
    expect(device.current).not.toHaveBeenCalled()
    expect(device.subscribe).not.toHaveBeenCalled()
  })

  it('says it cannot check when the server does not answer, and checks again on request', async () => {
    const server = fakeServer()
    server.push.state.mockRejectedValueOnce(new GatewayError('network'))
    render(<PushDeviceBlock client={asClient(server)} device={fakeDevice()} />)
    await waitFor(() => expect(status().textContent).toBe(PUSH_WORDS.unknown))
    expect(toggle().getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    await waitFor(() => expect(status().textContent).toBe(PUSH_WORDS.off))
    expect(screen.queryByRole('button', { name: 'Check again' })).toBeNull()
  })

  it('ignores a check that finishes after the block is gone', async () => {
    let answer: (value: PushState) => void = () => undefined
    let refuse: (error: Error) => void = () => undefined
    const first = fakeServer(),
      second = fakeServer()
    first.push.state.mockReturnValueOnce(new Promise(resolve => (answer = resolve)))
    second.push.state.mockReturnValueOnce(new Promise((_, reject) => (refuse = reject)))
    const one = render(<PushDeviceBlock client={asClient(first)} device={fakeDevice()} />)
    one.unmount()
    const two = render(<PushDeviceBlock client={asClient(second)} device={fakeDevice()} />)
    two.unmount()
    await act(async () => {
      answer({ publicKey: PUBLIC_KEY, devices: [], limit: 10 })
      refuse(new Error('late'))
    })
    expect(document.body.textContent).toBe('')
  })
})

describe('PushDeviceBlock: turning it on and off', () => {
  it('subscribes with the server key, tells the server, then says on', async () => {
    const server = fakeServer(),
      device = fakeDevice()
    render(<PushDeviceBlock client={asClient(server)} device={device} />)
    await waitFor(() => expect(status().textContent).toBe(PUSH_WORDS.off))
    fireEvent.click(toggle())
    expect(status().textContent).toBe('Turning on…')
    await waitFor(() => expect(status().textContent).toBe(PUSH_WORDS.on))
    expect(device.subscribe).toHaveBeenCalledWith(PUBLIC_KEY)
    expect(server.push.subscribe).toHaveBeenCalledWith(KEYS)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('turns off here and on the server, then says off', async () => {
    const server = fakeServer([row(ID)]),
      device = fakeDevice('ok', { id: ID, endpoint: KEYS.endpoint })
    render(<PushDeviceBlock client={asClient(server)} device={device} />)
    await waitFor(() => expect(status().textContent).toBe(PUSH_WORDS.on))
    fireEvent.click(toggle())
    expect(status().textContent).toBe('Turning off…')
    await waitFor(() => expect(status().textContent).toBe(PUSH_WORDS.off))
    expect(device.unsubscribe).toHaveBeenCalledTimes(1)
    expect(server.push.unsubscribe).toHaveBeenCalledWith(ID)
  })

  it('turning off with no subscription in this browser leaves the server alone', async () => {
    const server = fakeServer([row(ID)]),
      device = fakeDevice('ok', { id: ID, endpoint: KEYS.endpoint })
    render(<PushDeviceBlock client={asClient(server)} device={device} />)
    await waitFor(() => expect(status().textContent).toBe(PUSH_WORDS.on))
    device.current.mockResolvedValueOnce(null)
    fireEvent.click(toggle())
    await waitFor(() => expect(device.unsubscribe).toHaveBeenCalled())
    expect(server.push.unsubscribe).not.toHaveBeenCalled()
  })

  it('says so when the server did not confirm turning off', async () => {
    const server = fakeServer([row(ID)]),
      device = fakeDevice('ok', { id: ID, endpoint: KEYS.endpoint })
    server.push.unsubscribe.mockRejectedValueOnce(new GatewayError('network'))
    render(<PushDeviceBlock client={asClient(server)} device={device} />)
    await waitFor(() => expect(status().textContent).toBe(PUSH_WORDS.on))
    fireEvent.click(toggle())
    expect((await screen.findByRole('alert')).textContent).toMatch(/didn’t confirm/)
    await waitFor(() => expect(status().textContent).toBe(PUSH_WORDS.off))
  })

  it('a browser that fails to unsubscribe keeps the switch on and says so', async () => {
    const device = fakeDevice('ok', { id: ID, endpoint: KEYS.endpoint })
    device.unsubscribe.mockRejectedValueOnce(new DOMException('no', 'AbortError'))
    render(<PushDeviceBlock client={asClient(fakeServer([row(ID)]))} device={device} />)
    await waitFor(() => expect(status().textContent).toBe(PUSH_WORDS.on))
    fireEvent.click(toggle())
    expect((await screen.findByRole('alert')).textContent).toMatch(/couldn’t set up/)
    expect(status().textContent).toBe(PUSH_WORDS.on)
  })

  it.each([
    ['a closed prompt', new PushRefused('dismissed'), /weren’t allowed/],
    ['no service worker', new PushRefused('no-worker'), /Needs HTTPS/],
    ['a browser failure', new DOMException('no', 'AbortError'), /couldn’t set up/],
  ])('%s changes nothing and says why', async (_, failure, words) => {
    const server = fakeServer(),
      device = fakeDevice()
    device.subscribe.mockRejectedValueOnce(failure)
    render(<PushDeviceBlock client={asClient(server)} device={device} />)
    await waitFor(() => expect(status().textContent).toBe(PUSH_WORDS.off))
    fireEvent.click(toggle())
    expect((await screen.findByRole('alert')).textContent).toMatch(words)
    expect(server.push.subscribe).not.toHaveBeenCalled()
    expect(status().textContent).toBe(PUSH_WORDS.off)
  })

  it('a refusal in the browser prompt shows the blocked line, with no extra error', async () => {
    const server = fakeServer(),
      device = fakeDevice()
    device.subscribe.mockImplementationOnce(async () => {
      device.support.mockReturnValue('blocked')
      throw new PushRefused('blocked')
    })
    render(<PushDeviceBlock client={asClient(server)} device={device} />)
    await waitFor(() => expect(status().textContent).toBe(PUSH_WORDS.off))
    fireEvent.click(toggle())
    await waitFor(() => expect(status().textContent).toBe(PUSH_WORDS.blocked))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it.each([
    ['the device limit', new GatewayError('http', 409), /already on for 10 devices/],
    ['push off on the server', new GatewayError('dependency', 503), /unavailable on your Conker server/],
    ['another refusal', new GatewayError('validation', 422), /can’t do that from the browser/],
  ])('when the server refuses (%s) this browser drops its subscription too', async (_, failure, words) => {
    const server = fakeServer(),
      device = fakeDevice()
    server.push.subscribe.mockRejectedValueOnce(failure)
    render(<PushDeviceBlock client={asClient(server)} device={device} />)
    await waitFor(() => expect(status().textContent).toBe(PUSH_WORDS.off))
    fireEvent.click(toggle())
    expect((await screen.findByRole('alert')).textContent).toMatch(words)
    expect(device.unsubscribe).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(status().textContent).toBe(PUSH_WORDS.off))
  })

  it('a failed rollback still reports the server refusal', async () => {
    const server = fakeServer(),
      device = fakeDevice()
    server.push.subscribe.mockRejectedValueOnce(new GatewayError('dependency', 503))
    device.unsubscribe.mockRejectedValueOnce(new Error('gone'))
    render(<PushDeviceBlock client={asClient(server)} device={device} />)
    await waitFor(() => expect(status().textContent).toBe(PUSH_WORDS.off))
    fireEvent.click(toggle())
    expect((await screen.findByRole('alert')).textContent).toMatch(/unavailable/)
  })

  it('uses this browser when no device is given (jsdom has no push)', async () => {
    render(<PushDeviceBlock client={asClient(fakeServer())} />)
    render(<PushDeviceBlock client={asClient(fakeServer())} />)
    await waitFor(() => expect(screen.getAllByRole('status').every(line => line.textContent !== PUSH_WORDS.checking)).toBe(true))
    for (const line of screen.getAllByRole('status')) expect([PUSH_WORDS.insecure, PUSH_WORDS.unsupported]).toContain(line.textContent)
  })
})

describe('PushDeviceBlock: the devices with notifications on', () => {
  const added = (seconds: number) => `Added ${new Date(seconds * 1000).toLocaleString()}`
  const rows = () => screen.getAllByRole('listitem').map(item => item.textContent)

  it('lists every device newest first, with when it was added, and marks this one', async () => {
    const server = fakeServer([row(OTHER, 1_790_000_000, 'Firefox on Windows'), row(ID, 1_790_000_500)])
    render(<PushDeviceBlock client={asClient(server)} device={fakeDevice('ok', { id: ID, endpoint: KEYS.endpoint })} />)
    await waitFor(() => expect(status().textContent).toBe(PUSH_WORDS.on))
    expect(screen.getByRole('list', { name: 'Devices with notifications on' })).toBeTruthy()
    expect(rows()).toEqual([`Chrome on Android (this device)${added(1_790_000_500)}Remove`, `Firefox on Windows${added(1_790_000_000)}Remove`])
  })

  it('Remove takes another device off on the server and leaves this one on', async () => {
    const server = fakeServer([row(ID, 1_790_000_500), row(OTHER, 1_790_000_000, 'Firefox on Windows')]),
      device = fakeDevice('ok', { id: ID, endpoint: KEYS.endpoint })
    render(<PushDeviceBlock client={asClient(server)} device={device} />)
    await waitFor(() => expect(status().textContent).toBe(PUSH_WORDS.on))
    fireEvent.click(screen.getByRole('button', { name: `Remove Firefox on Windows, added ${new Date(1_790_000_000_000).toLocaleString()}` }))
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(server.push.unsubscribe).toHaveBeenCalledWith(OTHER)
    expect(device.unsubscribe).not.toHaveBeenCalled()
    expect(status().textContent).toBe(PUSH_WORDS.on)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('Remove on this device turns it off here and on the server', async () => {
    const server = fakeServer([row(ID)]),
      device = fakeDevice('ok', { id: ID, endpoint: KEYS.endpoint })
    render(<PushDeviceBlock client={asClient(server)} device={device} />)
    await waitFor(() => expect(status().textContent).toBe(PUSH_WORDS.on))
    fireEvent.click(screen.getByRole('button', { name: /^Remove Chrome on Android, added / }))
    await waitFor(() => expect(status().textContent).toBe(PUSH_WORDS.off))
    expect(device.unsubscribe).toHaveBeenCalledTimes(1)
    expect(server.push.unsubscribe).toHaveBeenCalledWith(ID)
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('a Remove the server did not confirm says so and keeps the row', async () => {
    const server = fakeServer([row(OTHER)])
    server.push.unsubscribe.mockRejectedValueOnce(new GatewayError('network'))
    render(<PushDeviceBlock client={asClient(server)} device={fakeDevice()} />)
    await waitFor(() => expect(status().textContent).toBe(PUSH_WORDS.off))
    fireEvent.click(screen.getByRole('button', { name: /^Remove Chrome on Android, added / }))
    expect((await screen.findByRole('alert')).textContent).toBe(REMOVE_FAILED)
    await waitFor(() => expect(server.push.state).toHaveBeenCalledTimes(2))
    expect(rows()).toHaveLength(1)
  })
})

type Subscription = { endpoint: string; options: { applicationServerKey: ArrayBuffer | null }; unsubscribe: ReturnType<typeof vi.fn>; toJSON: () => PushSubscriptionJSON }

function browser({ secure = true, permission = 'default' as NotificationPermission, answer = 'granted' as NotificationPermission, worker = true, existing = null as Subscription | null, keys = true } = {}) {
  const made: Subscription = { endpoint: KEYS.endpoint, options: { applicationServerKey: null }, unsubscribe: vi.fn(async () => true), toJSON: () => (keys ? { endpoint: KEYS.endpoint, keys: KEYS.keys } : { endpoint: KEYS.endpoint }) }
  let current = existing
  const pushManager = {
    getSubscription: vi.fn(async () => current),
    subscribe: vi.fn<(options: PushSubscriptionOptionsInit) => Promise<Subscription>>(async () => (current = made)),
  }
  const requestPermission = vi.fn(async () => answer)
  const view = {
    isSecureContext: secure,
    crypto: globalThis.crypto,
    PushManager: class {},
    Notification: { permission, requestPermission },
    navigator: { serviceWorker: { getRegistration: vi.fn(async () => (worker ? { pushManager } : undefined)) } },
  }
  return { view: view as unknown as PushWindow, pushManager, requestPermission, made }
}

const digest = (endpoint: string) => createHash('sha256').update(endpoint).digest('hex').slice(0, 32)
const keyBytes = (text: string) => new Uint8Array(Buffer.from(text, 'base64url')).buffer

describe('browserPush (register.ts)', () => {
  it('names what the browser allows before asking anything', () => {
    expect(browserPush('/', browser({ secure: false }).view).support()).toBe('insecure')
    expect(browserPush('/', { isSecureContext: true, navigator: {} } as unknown as PushWindow).support()).toBe('unsupported')
    expect(browserPush('/', browser({ permission: 'denied' }).view).support()).toBe('blocked')
    const { view, requestPermission } = browser()
    expect(browserPush('/', view).support()).toBe('ok')
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('names a device the way the server does', async () => {
    expect(await pushDeviceId(KEYS.endpoint)).toBe(digest(KEYS.endpoint))
  })

  it('asks for permission only when subscribing, then subscribes with the server key', async () => {
    const { view, pushManager, requestPermission } = browser()
    const push = browserPush('/', view)
    expect(await push.current()).toBeNull()
    expect(await push.subscribe(PUBLIC_KEY)).toEqual(KEYS)
    expect(requestPermission).toHaveBeenCalledTimes(1)
    const options = pushManager.subscribe.mock.calls[0]![0]
    expect(options.userVisibleOnly).toBe(true)
    expect(Buffer.from(options.applicationServerKey as Uint8Array).toString('base64url')).toBe(PUBLIC_KEY)
    expect(await push.current()).toEqual({ id: digest(KEYS.endpoint), endpoint: KEYS.endpoint })
    await push.unsubscribe()
  })

  it.each([
    ['denied', 'blocked'],
    ['default', 'dismissed'],
  ] as const)('a %s prompt subscribes nothing', async (answer, reason) => {
    const { view, pushManager } = browser({ answer })
    await expect(browserPush('/', view).subscribe(PUBLIC_KEY)).rejects.toMatchObject({ reason })
    expect(pushManager.subscribe).not.toHaveBeenCalled()
  })

  it('without a service worker nothing is subscribed', async () => {
    const { view } = browser({ worker: false })
    await expect(browserPush('/', view).subscribe(PUBLIC_KEY)).rejects.toMatchObject({ reason: 'no-worker' })
    expect(await browserPush('/', view).current()).toBeNull()
    await browserPush('/', view).unsubscribe()
  })

  it('keeps a subscription made with this server key and replaces one made with another', async () => {
    const same: Subscription = { endpoint: KEYS.endpoint, options: { applicationServerKey: keyBytes(PUBLIC_KEY) }, unsubscribe: vi.fn(), toJSON: () => ({ endpoint: KEYS.endpoint, keys: KEYS.keys }) }
    const kept = browser({ existing: same })
    await browserPush('/', kept.view).subscribe(PUBLIC_KEY)
    expect(kept.pushManager.subscribe).not.toHaveBeenCalled()
    const other = { ...same, options: { applicationServerKey: keyBytes('B' + 'A'.repeat(86)) }, unsubscribe: vi.fn(async () => true) }
    const replaced = browser({ existing: other })
    await browserPush('/', replaced.view).subscribe(PUBLIC_KEY)
    expect(other.unsubscribe).toHaveBeenCalled()
    expect(replaced.pushManager.subscribe).toHaveBeenCalled()
    const short = { ...same, options: { applicationServerKey: new Uint8Array(3).buffer }, unsubscribe: vi.fn(async () => true) }
    await browserPush('/', browser({ existing: short }).view).subscribe(PUBLIC_KEY)
    expect(short.unsubscribe).toHaveBeenCalled()
  })

  it('a subscription without keys gives empty keys, which the client refuses to send', async () => {
    const { view } = browser({ keys: false })
    expect((await browserPush('/', view).subscribe(PUBLIC_KEY)).keys).toEqual({ p256dh: '', auth: '' })
  })
})
