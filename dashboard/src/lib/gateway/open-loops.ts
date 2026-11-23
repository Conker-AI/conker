import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { createPiClient, piData } from './pi-client'

const loop = z
  .object({
    id: z.string().regex(/^loop_[0-9a-f]{32}$/),
    sessionId: z.string(),
    sessionTitle: z.string(),
    messageId: z.string().nullable(),
    quote: z.string().nullable(),
    text: z.string(),
    promisedBy: z.enum(['owner', 'conker']),
    dueOn: z.string().nullable(),
    overdue: z.boolean(),
    state: z.enum(['open', 'done', 'dropped']),
    revision: z.number().int(),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .strict()
/** What Pi's GET /open-loops sends: promises in visible chats, soonest due first and undated last. Read only here. */
const loopPage = z.object({ today: z.string(), timeZone: z.string(), items: z.array(loop).max(100), nextAfter: z.string().nullable() }).strict()

export type OpenLoop = z.infer<typeof loop>
export type OpenLoopPage = z.infer<typeof loopPage>
export type OpenLoopFilter = 'open' | 'done'

export function createOpenLoopsClient(auth: Pick<GatewayAuthClient, 'request'>) {
  const pi = createPiClient(auth)
  return {
    async list(state: OpenLoopFilter, after?: string | null, signal?: AbortSignal): Promise<OpenLoopPage> {
      const query = { state, limit: 50, ...(after ? { after } : {}) }
      return piData(pi.GET('/open-loops', { params: { query }, signal }), loopPage)
    },
  }
}

export type OpenLoopsClient = ReturnType<typeof createOpenLoopsClient>
