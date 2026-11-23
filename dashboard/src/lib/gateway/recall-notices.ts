import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { createPiClient, piData } from './pi-client'
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

export function createRecallNoticesClient(auth: Pick<GatewayAuthClient, 'request'>) {
  const pi = createPiClient(auth)
  return {
    list: async (signal?: AbortSignal): Promise<RecallNotice[]> => (await piData(pi.GET('/memory/recall-notices', { signal }), page)).items,
    /** Hides the card. The answers stay listed in Pi (`conker memory used ID`). */
    async dismiss(id: string, signal?: AbortSignal): Promise<void> {
      if (!noticeId.safeParse(id).success) throw new GatewayError('validation')
      await piData(pi.POST('/memory/recall-notices/{notice_id}/dismiss', { params: { path: { notice_id: id } }, signal }), z.object({ id: z.literal(id), dismissed: z.literal(true), changed: z.boolean() }).strict())
    },
  }
}

export type RecallNoticesClient = ReturnType<typeof createRecallNoticesClient>
