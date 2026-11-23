import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { createPiClient, piData } from './pi-client'

const memoryId = z.string().min(1).max(200)
const group = z
  .object({
    items: z.array(z.object({ ids: z.array(memoryId).min(1).max(50), reason: z.string().max(1000), conflictId: z.string().max(200).nullish() }).strict()).max(500),
    total: z.number().int().nonnegative(),
  })
  .strict()
const known = z
  .object({
    text: z.string(),
    revision: z.number().int().nonnegative(),
    memoryType: z.string().nullable(),
    sourceType: z.string().nullable(),
    state: z.enum(['current', 'needs_review']),
  })
  .strict()
/** What Pi's GET /memory/upkeep sends: memories worth tidying, in five groups, with each one's words. */
const upkeepPage = z
  .object({
    agentId: z.string(),
    checkedAt: z.string(),
    memoriesChecked: z.number().int().nonnegative(),
    truncated: z.boolean(),
    exactDuplicates: group,
    nearDuplicates: group,
    contradictions: group,
    expired: group,
    notRecalled: group,
    memories: z.record(z.string(), known).optional(),
  })
  .strict()

export type MemoryUpkeepPage = z.infer<typeof upkeepPage>
export type MemoryUpkeepGroup = 'exactDuplicates' | 'nearDuplicates' | 'contradictions' | 'expired' | 'notRecalled'

export function createMemoryCareClient(auth: Pick<GatewayAuthClient, 'request'>) {
  const pi = createPiClient(auth)
  return { upkeep: (signal?: AbortSignal): Promise<MemoryUpkeepPage> => piData(pi.GET('/memory/upkeep', { signal }), upkeepPage) }
}

export type MemoryCareClient = ReturnType<typeof createMemoryCareClient>
