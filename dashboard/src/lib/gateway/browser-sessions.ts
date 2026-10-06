import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

const identity = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/)
const timestamp = z.number().finite().nonnegative()
const result = z.object({ results: z.array(z.object({ id: identity, created: timestamp, touched: timestamp, expires: timestamp }).strict()).max(1000) }).strict()

export function createBrowserSessionsClient(auth: Pick<GatewayAuthClient, 'request' | 'getSession' | 'lock'>) {
  return {
    async list(signal?: AbortSignal) {
      const parsed = result.safeParse(await auth.request('/auth/sessions', { signal }))
      if (!parsed.success) throw new GatewayError('invalid-response')
      return parsed.data.results.map(session => ({ ...session, current: session.id === auth.getSession()?.sessionId }))
    },
    async revoke(id: string | null, signal?: AbortSignal) {
      if (id !== null && !identity.safeParse(id).success) throw new GatewayError('validation')
      const current = id === null || id === auth.getSession()?.sessionId
      const parsed = z.object({ revoked: z.literal(true) }).strict().safeParse(await auth.request(id === null ? '/auth/revoke-all' : `/auth/sessions/${id}/revoke`, { method: 'POST', body: {}, signal }))
      if (!parsed.success) throw new GatewayError('invalid-response')
      if (current) auth.lock()
    },
  }
}
