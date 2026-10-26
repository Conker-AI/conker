import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

const toolId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)
/** Whether Conker decides by his settings, and the tools that always ask him (the floor). */
const state = z.object({
  delegate: z.boolean(), sensitive: z.array(toolId).max(1000), floorExecutions: z.array(z.string().max(80)).max(20),
}).strict()
const deciders = ['tool_default', 'agent', 'chat', 'ai_reviewer', 'owner_request'] as const
const handled = z.object({
  schemaVersion: z.literal(1),
  results: z.array(z.object({
    id: z.string().regex(/^hnd_[0-9a-f]{32}$/), sessionId: z.string().max(128).nullable(), turnId: z.string().max(128).nullable(),
    toolId, decidedBy: z.enum(deciders), reason: z.string().max(500), createdAt: z.number().nonnegative(),
  }).strict()).max(200),
}).strict()

export type AccessState = z.infer<typeof state>
export type HandledAction = z.infer<typeof handled>['results'][number]
export type ChatAccess = 'default' | 'ask' | 'ai' | 'full'
export type ToolAccessLevel = 'allow' | 'ai' | 'ask'

function parse<T>(schema: z.ZodType<T>, value: unknown, input = false): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new GatewayError(input ? 'validation' : 'invalid-response')
  return result.data
}

export function createAccessClient(auth: Pick<GatewayAuthClient, 'request'>) {
  return {
    async state(signal?: AbortSignal): Promise<AccessState> {
      return parse(state, await auth.request('/api/owner/access', { signal }))
    },
    /** Asks for the password: lets Conker's own decisions skip asking him (never on the floor). */
    async setDelegate(enabled: boolean): Promise<boolean> {
      const result = parse(z.object({ delegate: z.boolean() }).strict(), await auth.request('/api/owner/access/delegate', { method: 'POST', body: { enabled } }))
      if (result.delegate !== enabled) throw new GatewayError('invalid-response')
      return result.delegate
    },
    /** Asks for the password: a sensitive tool always asks him, whatever the chat, agent or AI decides. */
    async setSensitive(id: string, sensitive: boolean): Promise<boolean> {
      const result = parse(z.object({ id: toolId, sensitive: z.boolean() }).strict(), await auth.request(`/api/owner/tools/${parse(toolId, id, true)}/sensitive`, { method: 'POST', body: { sensitive } }))
      if (result.id !== id || result.sensitive !== sensitive) throw new GatewayError('invalid-response')
      return result.sensitive
    },
    /** What ran in the last week without asking him, with who decided. */
    async handled(signal?: AbortSignal): Promise<HandledAction[]> {
      return parse(handled, await auth.request('/api/control/pi/access/handled', { signal })).results
    },
  }
}

export type AccessClient = ReturnType<typeof createAccessClient>
