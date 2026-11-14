import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

/** When someone typed a wrong password against this gateway: when, and from where. */
export type PasswordAlert = { at: number; origin: 'new_device' | 'known_device' | 'signed_in'; seen: boolean }
export type PasswordAlerts = { unseen: number; results: PasswordAlert[] }

const origin = z.enum(['new_device', 'known_device', 'signed_in'])
const result = z.object({
  unseen: z.number().int().nonnegative(),
  results: z.array(z.object({ at: z.number().finite().nonnegative(), origin, seen: z.boolean() }).strict()).max(50),
}).strict()

/** Pi keeps every wrong password against the owner's account; the Inbox shows the ones he has not seen. */
export function createPasswordAlertsClient(auth: Pick<GatewayAuthClient, 'request'>) {
  return {
    async list(signal?: AbortSignal): Promise<PasswordAlerts> {
      const parsed = result.safeParse(await auth.request('/auth/alerts', { signal }))
      if (!parsed.success) throw new GatewayError('invalid-response')
      return parsed.data
    },
    /** Marks every attempt seen; the signed-in session is enough, never a password. */
    async seen(signal?: AbortSignal): Promise<void> {
      const parsed = z.object({ seen: z.literal(true) }).strict().safeParse(await auth.request('/auth/alerts/seen', { method: 'POST', body: {}, signal }))
      if (!parsed.success) throw new GatewayError('invalid-response')
    },
  }
}
