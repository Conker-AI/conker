import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

const noticeId = z.string().regex(/^mrn_[0-9a-f]{32}$/)
const chat = z.object({ id: z.string().min(1).max(128), title: z.string().max(500) }).strict()
/**
 * What Pi's GET /memory/recall-notices sends (pi/conversation/recall_notices.py): a memory the owner
 * corrected or forgot was used by earlier answers. Ids, counts and chat titles only, never the
 * memory's words, and only chats he can see.
 */
const notice = z.object({
  kind: z.literal('memory-recall'), id: noticeId, title: z.string().max(200), since: z.number().finite().nonnegative(),
  memoryId: z.string().min(1).max(200), change: z.enum(['corrected', 'forgotten', 'changed']),
  answers: z.number().int().nonnegative(), chats: z.number().int().nonnegative(),
  sessionIds: z.array(z.string().min(1).max(128)).max(20), sessions: z.array(chat).max(20),
  source: z.object({ kind: z.literal('memory-recall'), noticeId, memoryId: z.string().min(1).max(200) }).strict(),
}).strict()
const page = z.object({ items: z.array(notice).max(100) }).strict()

export type RecallNotice = z.infer<typeof notice>
export type RecallNoticePage = z.infer<typeof page>

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new GatewayError('invalid-response')
  return result.data
}

export function createRecallNoticesClient(auth: Pick<GatewayAuthClient, 'request'>) {
  return {
    async list(signal?: AbortSignal): Promise<RecallNotice[]> {
      return parse(page, await auth.request('/api/control/pi/memory/recall-notices', { signal })).items
    },
    /** Hides the card. The answers stay listed in Pi (`conker memory used ID`). */
    async dismiss(id: string, signal?: AbortSignal): Promise<void> {
      if (!noticeId.safeParse(id).success) throw new GatewayError('validation')
      parse(z.object({ id: z.literal(id), dismissed: z.literal(true), changed: z.boolean() }).strict(), await auth.request(`/api/control/pi/memory/recall-notices/${id}/dismiss`, { method: 'POST', body: {}, signal }))
    },
  }
}

export type RecallNoticesClient = ReturnType<typeof createRecallNoticesClient>
