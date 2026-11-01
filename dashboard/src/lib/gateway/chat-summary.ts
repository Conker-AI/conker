import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

const sessionId = z.string().regex(/^ses_[0-9a-f]{16}$/)
const messageId = z.string().regex(/^msg_[0-9a-f]{16}$/)

const chatSummaryVersion = z.object({
  revision: z.number().int().nonnegative(),
  summary: z.string().nullable(),
  sourceSessionId: z.string().nullable(),
  createdAt: z.number(),
  restoredFrom: z.number().nullable(),
}).strict()

const chatSummary = z.object({
  revision: z.number().int().nonnegative(),
  summary: z.string().nullable(),
  sourceSessionId: z.string().nullable(),
  versions: z.array(chatSummaryVersion).max(100),
}).strict()

const summaryDraft = z.object({
  summary: z.string().min(1).max(16000),
  messageIds: z.array(messageId),
  truncated: z.boolean(),
  earlierSummaryIncluded: z.boolean(),
  summaryRevision: z.number().int().nonnegative(),
  modelId: z.string(),
  configurationRevision: z.number().int(),
}).strict()

const compaction = z.object({
  summaryRevision: z.number().int().nonnegative(),
  covered: z.array(messageId),
  folded: z.array(messageId),
}).strict()

const compactResult = z.object({
  policyRevision: z.number().int().nonnegative(),
  summaryRevision: z.number().int().nonnegative(),
  covered: z.array(messageId),
  folded: z.array(messageId),
}).strict()

const forkResult = z.object({
  sessionId: sessionId,
  parentId: sessionId,
  replayed: z.boolean(),
}).strict()

function parse<T>(schema: z.ZodType<T>, value: unknown, input = false): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new GatewayError(input ? 'validation' : 'invalid-response')
  return result.data
}

/** One chat's summary: read, edit, draft, restore, compaction, and a new chat from the summary. */
export function createChatSummaryClient(auth: Pick<GatewayAuthClient, 'request'>) {
  return {
    async summary(sessionId: string, signal?: AbortSignal) {
      const id = parse(z.string().regex(/^ses_[0-9a-f]{16}$/), sessionId, true)
      const response = await auth.request(`/api/control/pi/context/${id}/summary`, { signal })
      return parse(chatSummary, response)
    },

    async save(sessionId: string, text: string, expectedRevision: number) {
      const id = parse(z.string().regex(/^ses_[0-9a-f]{16}$/), sessionId, true)
      if (text.length > 16000) throw new GatewayError('validation')
      if (expectedRevision < 0) throw new GatewayError('validation')
      const response = await auth.request(`/api/control/pi/context/${id}/summary`, {
        method: 'POST',
        body: { expected_revision: expectedRevision, summary: text }
      })
      return parse(chatSummary, response)
    },

    async restore(sessionId: string, revision: number, expectedRevision: number) {
      const id = parse(z.string().regex(/^ses_[0-9a-f]{16}$/), sessionId, true)
      if (revision < 0) throw new GatewayError('validation')
      if (expectedRevision < 0) throw new GatewayError('validation')
      const response = await auth.request(`/api/control/pi/context/${id}/summary/restore`, {
        method: 'POST',
        body: { expected_revision: expectedRevision, revision }
      })
      return parse(chatSummary, response)
    },

    async draft(sessionId: string, focus?: string) {
      const id = parse(z.string().regex(/^ses_[0-9a-f]{16}$/), sessionId, true)
      if (focus && focus.length > 500) throw new GatewayError('validation')
      const response = await auth.request(`/api/control/pi/context/${id}/summary/draft`, {
        method: 'POST',
        body: focus ? { focus } : {}
      })
      return parse(summaryDraft, response)
    },

    async compaction(sessionId: string, signal?: AbortSignal) {
      const id = parse(z.string().regex(/^ses_[0-9a-f]{16}$/), sessionId, true)
      const response = await auth.request(`/api/control/pi/context/${id}/compaction`, { signal })
      return parse(compaction, response)
    },

    async compact(sessionId: string, params: { policyRevision: number; summaryRevision: number; summary: string; covers: string[] }) {
      const id = parse(z.string().regex(/^ses_[0-9a-f]{16}$/), sessionId, true)
      if (params.policyRevision < 1) throw new GatewayError('validation')
      if (params.summaryRevision < 0) throw new GatewayError('validation')
      if (params.summary.length < 1 || params.summary.length > 16000) throw new GatewayError('validation')
      if (params.covers.length < 1 || params.covers.length > 10000) throw new GatewayError('validation')
      if (new Set(params.covers).size !== params.covers.length) throw new GatewayError('validation')

      const response = await auth.request(`/api/control/pi/context/${id}/compact`, {
        method: 'POST',
        body: {
          expected_policy_revision: params.policyRevision,
          expected_summary_revision: params.summaryRevision,
          summary: params.summary,
          covers: params.covers
        }
      })
      return parse(compactResult, response)
    },

    async policyRevision(sessionId: string, signal?: AbortSignal) {
      const id = parse(z.string().regex(/^ses_[0-9a-f]{16}$/), sessionId, true)
      const response = await auth.request(`/api/control/pi/context/${id}`, { signal })
      return parse(z.object({ revision: z.number().int().nonnegative() }).strict(), response).revision
    },

    async fork(sessionId: string, params: { policyRevision: number; lastMessageId: string | null; summary: string }) {
      const id = parse(z.string().regex(/^ses_[0-9a-f]{16}$/), sessionId, true)
      if (params.policyRevision < 1) throw new GatewayError('validation')
      if (params.summary.length > 16000) throw new GatewayError('validation')
      if (params.lastMessageId && !messageId.safeParse(params.lastMessageId).success) {
        throw new GatewayError('validation')
      }

      const requestId = crypto.randomUUID()
      const response = await auth.request(`/api/control/pi/context/${id}/fork`, {
        method: 'POST',
        body: {
          expected_revision: params.policyRevision,
          expected_last_message_id: params.lastMessageId,
          summary: params.summary,
          request_id: requestId
        }
      })
      return parse(forkResult, response)
    }
  }
}

export type ChatSummaryClient = ReturnType<typeof createChatSummaryClient>

export type ChatSummary = z.infer<typeof chatSummary>
export type SummaryDraft = z.infer<typeof summaryDraft>
export type Compaction = z.infer<typeof compaction>
export type CompactResult = z.infer<typeof compactResult>
export type ForkResult = z.infer<typeof forkResult>
