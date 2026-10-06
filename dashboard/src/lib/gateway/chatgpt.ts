import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

const loginId = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/)
const connectionId = z.string().regex(/^connection_[0-9a-f]{32}$/)
const status = z.object({
  available: z.boolean(), connected: z.boolean(), connectionId: connectionId.nullable(), plan: z.string().max(80).nullable(),
  loginId: loginId.nullable(), loginState: z.enum(['idle', 'pending', 'complete', 'failed', 'expired', 'canceled']),
  problem: z.enum(['runtime_unavailable', 'runtime_version_mismatch', 'provider_operation_failed']).nullable(),
  models: z.array(z.object({ id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/), name: z.string().min(1).max(160) }).strict()).max(100),
  catalogueComplete: z.boolean(), credentialsIncluded: z.literal(false),
  deviceCode: z.object({ verificationUrl: z.literal('https://auth.openai.com/codex/device'), userCode: z.string().regex(/^[A-Z0-9-]{4,32}$/) }).strict().nullable().optional(),
}).strict().refine(value => value.connected === Boolean(value.connectionId))
const operation = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('login') }).strict(), z.object({ operation: z.literal('models') }).strict(),
  z.object({ operation: z.literal('cancel'), loginId }).strict(), z.object({ operation: z.literal('logout'), connectionId }).strict(),
])
export type ChatGPTStatus = z.infer<typeof status>
export type ChatGPTOperation = z.infer<typeof operation>

export function createChatGPTClient(auth: Pick<GatewayAuthClient, 'request'>) {
  function parse(value: unknown, login = false) {
    const result = status.safeParse(value)
    if (!result.success || result.data.deviceCode && !login) throw new GatewayError('invalid-response')
    return result.data
  }
  return {
    async status(signal?: AbortSignal) { return parse(await auth.request('/api/host/chatgpt', { signal })) },
    async apply(value: ChatGPTOperation, signal?: AbortSignal) {
      const result = operation.safeParse(value)
      if (!result.success) throw new GatewayError('validation')
      return parse(await auth.request('/api/host/chatgpt', { method: 'POST', body: result.data, signal }), result.data.operation === 'login')
    },
  }
}
