import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

const loginId = z.string().regex(/^login_[0-9a-f]{32}$/)
const status = z.object({ available: z.boolean(), connected: z.boolean(), loginState: z.enum(['idle', 'pending', 'complete', 'failed', 'expired', 'canceled']), loginId: loginId.nullable(),
  authorizationUrl: z.string().max(4096).nullable().refine(value => { if (!value) return true; try { const url = new URL(value); return url.protocol === 'https:' && ['claude.ai', 'claude.com', 'console.anthropic.com', 'platform.claude.com'].includes(url.hostname) && !url.username && !url.password } catch { return false } }),
  credentialsIncluded: z.literal(false), runtime: z.literal('Claude Code'), models: z.array(z.string().max(200)).max(100) }).strict().refine(value => (value.loginState === 'pending') === Boolean(value.loginId))
const operation = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('login'), billing: z.enum(['subscription', 'api']).optional() }).strict(),
  z.object({ operation: z.literal('cancel'), loginId }).strict(),
  z.object({ operation: z.literal('logout') }).strict(),
])
export type NativeClaudeStatus = z.infer<typeof status>
export type NativeClaudeOperation = z.infer<typeof operation>
export function createNativeClaudeClient(auth: Pick<GatewayAuthClient, 'request'>) {
  function parse(value: unknown) { const result = status.safeParse(value); if (!result.success) throw new GatewayError('invalid-response'); return result.data }
  return {
    async status(signal?: AbortSignal) { return parse(await auth.request('/api/host/claude', { signal })) },
    async apply(value: NativeClaudeOperation, signal?: AbortSignal, onDispatch?: () => void) {
      const result = operation.safeParse(value)
      if (!result.success) throw new GatewayError('validation')
      return parse(await auth.request('/api/host/claude', { method: 'POST', body: result.data, signal, onDispatch }))
    },
  }
}
