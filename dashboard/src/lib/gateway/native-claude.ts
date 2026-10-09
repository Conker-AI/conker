import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

const status = z.object({ available: z.boolean(), connected: z.boolean(), loginState: z.enum(['idle', 'pending', 'complete', 'failed', 'expired', 'canceled']),
  authorizationUrl: z.string().max(4096).nullable().refine(value => { if (!value) return true; try { const url = new URL(value); return url.protocol === 'https:' && ['claude.ai', 'claude.com', 'console.anthropic.com', 'platform.claude.com'].includes(url.hostname) && !url.username && !url.password } catch { return false } }),
  credentialsIncluded: z.literal(false), runtime: z.literal('Claude Code'), models: z.array(z.string().max(200)).max(100) }).strict()
export type NativeClaudeStatus = z.infer<typeof status>
export function createNativeClaudeClient(auth: Pick<GatewayAuthClient, 'request'>) {
  function parse(value: unknown) { const result = status.safeParse(value); if (!result.success) throw new GatewayError('invalid-response'); return result.data }
  return {
    async status(signal?: AbortSignal) { return parse(await auth.request('/api/host/claude', { signal })) },
    async apply(operation: 'login' | 'cancel' | 'logout', billing?: 'subscription' | 'api', signal?: AbortSignal) {
      return parse(await auth.request('/api/host/claude', { method: 'POST', body: { operation, ...(billing ? { billing } : {}) }, signal }))
    },
  }
}
