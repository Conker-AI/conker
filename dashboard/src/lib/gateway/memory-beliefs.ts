import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

const text = z.string().nullable()
const belief = z.object({
  id: z.string().min(1).max(200), revision: z.number().int().nonnegative(), text: z.string(), memoryType: z.string(),
  origin: z.enum(['stated', 'concluded']), sourceType: text, confidence: text, state: z.enum(['current', 'needs_review']),
  validFrom: text, validUntil: text, reviewBy: text, createdAt: text, updatedAt: text, lastRecalledAt: text,
  evidence: z.object({ supporting: z.number().int().nonnegative(), withdrawn: z.number().int().nonnegative() }).strict(),
  lineage: z.array(z.object({ objectType: z.string(), objectId: z.string(), withdrawn: z.boolean() }).strict()),
  conflicts: z.array(z.object({ conflictId: z.string(), memoryId: z.string() }).strict()),
}).strict()
/** What Pi's GET /memory/beliefs sends: what Conker holds about the owner, told apart from what it concluded. */
const beliefPage = z.object({
  agentId: z.string(), total: z.number().int().nonnegative(), nextAfter: z.string().nullable(),
  counts: z.object({ stated: z.number().int().nonnegative(), concluded: z.number().int().nonnegative(), needsReview: z.number().int().nonnegative() }).strict(),
  items: z.array(belief).max(200),
}).strict()

export type Belief = z.infer<typeof belief>
export type BeliefPage = z.infer<typeof beliefPage>
export type BeliefFilter = { origin: 'all' | 'stated' | 'concluded'; state: 'all' | 'needs_review'; after?: string | null }

export function createMemoryBeliefsClient(auth: Pick<GatewayAuthClient, 'request'>) {
  return {
    async list(filter: BeliefFilter, signal?: AbortSignal): Promise<BeliefPage> {
      const query = { origin: filter.origin, state: filter.state, limit: 50, ...(filter.after ? { after: filter.after } : {}) }
      const result = beliefPage.safeParse(await auth.request('/api/control/pi/memory/beliefs', { query, signal }))
      if (!result.success) throw new GatewayError('invalid-response')
      return result.data
    },
  }
}

export type MemoryBeliefsClient = ReturnType<typeof createMemoryBeliefsClient>
