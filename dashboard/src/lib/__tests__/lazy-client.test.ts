import { describe, expect, it, vi } from 'vitest'
import { lazyClient } from '../gateway/lazy-client'
import { GatewayError } from '../gateway/transport'
import { createLazyGatewayControlClient } from '../gateway/control-lazy'

describe('clients that load on first use', () => {
  it('loads once on the first call and calls the loaded member with its arguments', async () => {
    const real = {
      prefix: 'got',
      async top(value: number) {
        return value + 1
      },
      group: {
        async read(this: { tag: string }, a: string, b: string) {
          return `${this.tag}:${a}${b}`
        },
        tag: 'group',
      },
    }
    const load = vi.fn(async () => real as unknown as { top(value: number): Promise<number>; group: { read(a: string, b: string): Promise<string> } })
    const { client } = lazyClient(load)
    expect(load).not.toHaveBeenCalled()
    await expect(client.top(1)).resolves.toBe(2)
    await expect(client.group.read('a', 'b')).resolves.toBe('group:ab')
    const read = client.group.read
    await expect(read('c', 'd')).resolves.toBe('group:cd')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('gives the same member on every read and is never a thenable', async () => {
    const { client } = lazyClient(async () => ({
      group: {
        async read() {
          return 1
        },
      },
    }))
    expect(client.group).toBe(client.group)
    expect(client.group.read).toBe(client.group.read)
    expect((client as unknown as { then?: unknown }).then).toBeUndefined()
    await expect(Promise.resolve(client)).resolves.toBe(client)
  })

  it('reports a failed load as a network error, sends nothing, and tries again on the next call', async () => {
    const load = vi.fn<() => Promise<{ read(): Promise<string> }>>()
    load.mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'))
    load.mockResolvedValueOnce({
      async read() {
        return 'ok'
      },
    })
    const { client } = lazyClient(load)
    const failed = await client.read().catch((error: unknown) => error)
    expect(failed).toBeInstanceOf(GatewayError)
    expect((failed as GatewayError).kind).toBe('network')
    await expect(client.read()).resolves.toBe('ok')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('preload starts the load without a call, and a failed preload stays quiet', async () => {
    const load = vi.fn(async () => {
      throw new Error('offline')
    })
    const { preload } = lazyClient<{ read(): Promise<void> }>(load)
    preload()
    await Promise.resolve()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('the control client subscribes to model changes before its code loads, and its calls reach the server', async () => {
    const request = vi.fn(async () => ({ status: 'ok' }))
    const auth = { request, audio: vi.fn(), getSession: vi.fn(), download: vi.fn(), upload: vi.fn() } as unknown as Parameters<typeof createLazyGatewayControlClient>[0]
    const { control } = createLazyGatewayControlClient(auth, () => undefined)
    const listener = vi.fn()
    const stop = control.subscribeModels(listener)
    expect(typeof stop).toBe('function')
    expect(request).not.toHaveBeenCalled()
    await control.gatewayHealth().catch(() => undefined)
    expect(request).toHaveBeenCalledWith('/health', expect.objectContaining({}))
    stop()
  })
})
