import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

const memoryId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/)
const use = z.object({
  sessionId: z.string(), sessionTitle: z.string(), turnId: z.string(), source: z.enum(['context', 'recall']),
  revision: z.number().int().nullable(), at: z.number(),
}).strict()
/** What Pi's GET /memory/{id}/uses sends: the answers that used one memory (ids and chat titles, never its words). */
const usePage = z.object({
  memoryId: z.string(), since: z.number().nullable(), total: z.number().int().nonnegative(), chats: z.number().int().nonnegative(),
  items: z.array(use).max(200), nextAfter: z.string().nullable(),
}).strict()

export type MemoryUsePage = z.infer<typeof usePage>

export function createMemoryUsesClient(auth: Pick<GatewayAuthClient, 'request'>) {
  return {
    /** How many answers in how many chats used this memory. One item is enough: the totals come with the page. */
    async uses(id: string, signal?: AbortSignal): Promise<MemoryUsePage> {
      const parsedId = memoryId.safeParse(id)
      if (!parsedId.success) throw new GatewayError('validation')
      const result = usePage.safeParse(await auth.request(`/api/control/pi/memory/${parsedId.data}/uses`, { query: { limit: 1 }, signal }))
      if (!result.success) throw new GatewayError('invalid-response')
      return result.data
    },
  }
}

export type MemoryUsesClient = ReturnType<typeof createMemoryUsesClient>
