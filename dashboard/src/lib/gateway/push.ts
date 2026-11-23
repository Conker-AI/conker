import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

/**
 * Notifications on the owner's devices (Pi's docs/web-push.md): the gateway's public push key and
 * the devices that have them on. The server's private key never reaches the browser; a device id
 * is the first 32 hex digits of the SHA-256 of its endpoint.
 */
const device = z.string().regex(/^[0-9a-f]{32}$/)
const devices = { devices: z.array(device).max(10), limit: z.number().int().min(1).max(10) }
const state = z.object({ publicKey: z.string().regex(/^[A-Za-z0-9_-]{87}$/), ...devices }).strict()
const added = z.object({ device, ...devices }).strict()
const removed = z.object({ removed: z.boolean(), ...devices }).strict()
const base64url = /^[A-Za-z0-9_-]{1,200}$/

export type PushState = z.infer<typeof state>
export type PushSubscriptionKeys = { endpoint: string; keys: { p256dh: string; auth: string } }

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new GatewayError('invalid-response')
  return result.data
}

export function createPushClient(auth: Pick<GatewayAuthClient, 'request'>) {
  return {
    async state(signal?: AbortSignal): Promise<PushState> {
      return parse(state, await auth.request('/api/push', { signal }))
    },
    /** Turns notifications on for this browser's subscription; answers with its device id. */
    async subscribe(value: PushSubscriptionKeys, signal?: AbortSignal) {
      if (!value.endpoint.startsWith('https://') || value.endpoint.length > 1024 || !base64url.test(value.keys.p256dh) || !base64url.test(value.keys.auth)) throw new GatewayError('validation')
      const body = { endpoint: value.endpoint, keys: { p256dh: value.keys.p256dh, auth: value.keys.auth } }
      return parse(added, await auth.request('/api/push/subscriptions', { method: 'POST', body, signal }))
    },
    /** Turns notifications off for one device; one that is already off answers `removed: false`. */
    async unsubscribe(id: string, signal?: AbortSignal) {
      if (!device.safeParse(id).success) throw new GatewayError('validation')
      return parse(removed, await auth.request(`/api/push/subscriptions/${id}/delete`, { method: 'POST', body: {}, signal }))
    },
  }
}
