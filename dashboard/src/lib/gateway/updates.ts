import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'
import { RELEASE } from './host-ops'

/**
 * Conker updates as Pi keeps them (pi/owner/updates.py): the newest release the server's daily
 * check found and the owner has not skipped, and how each finished update ended. Pi only stores
 * what the host reported; the update itself is the host action `update.run` (host-ops.ts).
 */
const version = z.string().regex(RELEASE)
const offer = z.object({
  version, title: z.string().max(200), notes: z.string().max(20000),
  url: z.string().regex(/^https:\/\/github\.com\/Conker-AI\/conker\/releases\/tag\/v\d{1,4}\.\d{1,4}\.\d{1,4}$/),
  publishedAt: z.string().max(40).nullable(), foundAt: z.number().finite().nonnegative(),
}).strict()
const result = z.object({
  id: z.string().regex(/^[0-9a-f]{32}$/), version, outcome: z.enum(['applied', 'rolled_back', 'held', 'failed']),
  title: z.string().max(200), reason: z.string().max(300).nullable(), finishedAt: z.number().finite().nonnegative(),
}).strict()
const overview = z.object({ offer: offer.nullable(), results: z.array(result).max(200) }).strict()

export type UpdateOffer = z.infer<typeof offer>
export type UpdateResult = z.infer<typeof result>
export type UpdatesOverview = z.infer<typeof overview>

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new GatewayError('invalid-response')
  return parsed.data
}

export function createUpdatesClient(auth: Pick<GatewayAuthClient, 'request'>) {
  return {
    list: async (signal?: AbortSignal): Promise<UpdatesOverview> => parse(overview, await auth.request('/api/control/pi/updates', { signal })),
    /** "Skip this version": remembered, so the daily check never offers it again; a newer one still comes. */
    async skip(selected: string, signal?: AbortSignal): Promise<void> {
      if (!RELEASE.test(selected)) throw new GatewayError('validation')
      parse(z.object({ version: z.literal(selected), dismissed: z.literal(true) }).strict(), await auth.request(`/api/control/pi/updates/offers/${selected}/dismiss`, { method: 'POST', body: {}, signal }))
    },
    async dismiss(id: string, signal?: AbortSignal): Promise<void> {
      if (!/^[0-9a-f]{32}$/.test(id)) throw new GatewayError('validation')
      parse(z.object({ id: z.literal(id), dismissed: z.literal(true) }).strict(), await auth.request(`/api/control/pi/updates/results/${id}/dismiss`, { method: 'POST', body: {}, signal }))
    },
  }
}
export type UpdatesClient = ReturnType<typeof createUpdatesClient>
