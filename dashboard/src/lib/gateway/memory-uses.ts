import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { createPiClient, piData } from './pi-client'

const use = z
  .object({
    sessionId: z.string(),
    sessionTitle: z.string(),
    turnId: z.string(),
    source: z.enum(['context', 'recall']),
    revision: z.number().int().nullable(),
    at: z.number(),
  })
  .strict()
/** What Pi's GET /memory/{id}/uses sends: the answers that used one memory (ids and chat titles, never its words). */
const usePage = z
  .object({
    memoryId: z.string(),
    since: z.number().nullable(),
    total: z.number().int().nonnegative(),
    chats: z.number().int().nonnegative(),
    items: z.array(use).max(200),
    nextAfter: z.string().nullable(),
  })
  .strict()

export type MemoryUsePage = z.infer<typeof usePage>

export function createMemoryUsesClient(auth: Pick<GatewayAuthClient, 'request'>) {
  const pi = createPiClient(auth)
  return {
    /** How many answers in how many chats used this memory. One item is enough: the totals come with the page. */
    uses: (id: string, signal?: AbortSignal): Promise<MemoryUsePage> => piData(pi.GET('/memory/{memory_id}/uses', { params: { path: { memory_id: id }, query: { limit: 1 } }, signal }), usePage),
  }
}

export type MemoryUsesClient = ReturnType<typeof createMemoryUsesClient>
