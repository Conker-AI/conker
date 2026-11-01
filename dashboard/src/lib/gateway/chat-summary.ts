import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

const sessionIdPattern = /^ses_[0-9a-f]{16}$/
const messageIdPattern = /^msg_[0-9a-f]{16}$/
const messageId = z.string().regex(messageIdPattern)

/** Pi sends the summary routes in snake_case; the types below are what the screen uses. */
const wireVersion = z.object({
  revision: z.number().int().nonnegative(),
  summary: z.string().nullable(),
  source_session_id: z.string().nullable(),
  created_at: z.number(),
  restored_from: z.number().int().nonnegative().nullable(),
}).strict()

const wireSummary = z.object({
  revision: z.number().int().nonnegative(),
  summary: z.string().nullable(),
  source_session_id: z.string().nullable(),
  versions: z.array(wireVersion).max(100),
}).strict()

const wireFork = z.object({
  session_id: z.string().regex(sessionIdPattern),
  parent_id: z.string().regex(sessionIdPattern),
  replayed: z.boolean(),
}).strict()

/** The draft, the compaction record and the compact result are camelCase on the wire. */
const summaryDraftSchema = z.object({
  summary: z.string().min(1).max(16000),
  messageIds: z.array(messageId),
  truncated: z.boolean(),
  earlierSummaryIncluded: z.boolean(),
  summaryRevision: z.number().int().nonnegative(),
  modelId: z.string(),
  configurationRevision: z.number().int().nonnegative(),
}).strict()

const compactionSchema = z.object({
  summaryRevision: z.number().int().nonnegative(),
  covered: z.array(messageId),
  folded: z.array(messageId),
}).strict()

const compactResultSchema = z.object({
  policyRevision: z.number().int().nonnegative(),
  summaryRevision: z.number().int().nonnegative(),
  covered: z.array(messageId),
  folded: z.array(messageId),
}).strict()

/** Only the revision is read here; the context settings screen owns the rest of this route. */
const policyHead = z.object({ revision: z.number().int().nonnegative() }).passthrough()

export type ChatSummaryVersion = {
  revision: number
  summary: string | null
  sourceSessionId: string | null
  createdAt: number
  restoredFrom: number | null
}
/** `versions` is newest first, as Pi sends it. */
export type ChatSummary = {
  revision: number
  summary: string | null
  sourceSessionId: string | null
  versions: ChatSummaryVersion[]
}
export type SummaryDraft = z.infer<typeof summaryDraftSchema>
export type Compaction = z.infer<typeof compactionSchema>
export type CompactResult = z.infer<typeof compactResultSchema>

function parse<T>(schema: z.ZodType<T>, value: unknown, input = false): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new GatewayError(input ? 'validation' : 'invalid-response')
  return result.data
}

function check(ok: boolean) {
  if (!ok) throw new GatewayError('validation')
}

const revisionOk = (value: number, min = 0) => Number.isInteger(value) && value >= min

function readSummary(value: unknown): ChatSummary {
  const wire = parse(wireSummary, value)
  return {
    revision: wire.revision,
    summary: wire.summary,
    sourceSessionId: wire.source_session_id,
    versions: wire.versions.map(version => ({
      revision: version.revision,
      summary: version.summary,
      sourceSessionId: version.source_session_id,
      createdAt: version.created_at,
      restoredFrom: version.restored_from,
    })),
  }
}

/** One chat's summary: read, edit, draft, restore, compaction, and a new chat from the summary. */
export function createChatSummaryClient(auth: Pick<GatewayAuthClient, 'request'>) {
  const base = (sessionId: string) => `/api/control/pi/context/${parse(z.string().regex(sessionIdPattern), sessionId, true)}`

  return {
    async summary(sessionId: string, signal?: AbortSignal): Promise<ChatSummary> {
      return readSummary(await auth.request(`${base(sessionId)}/summary`, { signal }))
    },

    async save(sessionId: string, text: string, expectedRevision: number): Promise<ChatSummary> {
      const path = `${base(sessionId)}/summary`
      check(text.length <= 16000 && revisionOk(expectedRevision))
      return readSummary(await auth.request(path, { method: 'POST', body: { expected_revision: expectedRevision, summary: text } }))
    },

    async restore(sessionId: string, revision: number, expectedRevision: number): Promise<ChatSummary> {
      const path = `${base(sessionId)}/summary/restore`
      check(revisionOk(revision) && revisionOk(expectedRevision))
      return readSummary(await auth.request(path, { method: 'POST', body: { expected_revision: expectedRevision, revision } }))
    },

    async draft(sessionId: string, focus?: string): Promise<SummaryDraft> {
      const path = `${base(sessionId)}/summary/draft`
      check(!focus || focus.length <= 500)
      return parse(summaryDraftSchema, await auth.request(path, { method: 'POST', body: focus ? { focus } : {} }))
    },

    async compaction(sessionId: string, signal?: AbortSignal): Promise<Compaction> {
      return parse(compactionSchema, await auth.request(`${base(sessionId)}/compaction`, { signal }))
    },

    async compact(sessionId: string, params: { policyRevision: number; summaryRevision: number; summary: string; covers: string[] }): Promise<CompactResult> {
      const path = `${base(sessionId)}/compact`
      check(revisionOk(params.policyRevision, 1) && revisionOk(params.summaryRevision))
      check(params.summary.length >= 1 && params.summary.length <= 16000)
      check(params.covers.length >= 1 && params.covers.length <= 10000)
      check(params.covers.every(id => messageIdPattern.test(id)) && new Set(params.covers).size === params.covers.length)
      const response = await auth.request(path, {
        method: 'POST',
        body: {
          expected_policy_revision: params.policyRevision,
          expected_summary_revision: params.summaryRevision,
          summary: params.summary,
          covers: params.covers,
        },
      })
      return parse(compactResultSchema, response)
    },

    async policyRevision(sessionId: string, signal?: AbortSignal): Promise<number> {
      return parse(policyHead, await auth.request(base(sessionId), { signal })).revision
    },

    async fork(sessionId: string, params: { policyRevision: number; lastMessageId: string | null; summary: string }): Promise<{ sessionId: string }> {
      const path = `${base(sessionId)}/fork`
      check(revisionOk(params.policyRevision, 1) && params.summary.length <= 16000)
      check(params.lastMessageId === null || messageIdPattern.test(params.lastMessageId))
      const response = await auth.request(path, {
        method: 'POST',
        body: {
          expected_revision: params.policyRevision,
          expected_last_message_id: params.lastMessageId,
          summary: params.summary,
          request_id: crypto.randomUUID(),
        },
      })
      return { sessionId: parse(wireFork, response).session_id }
    },
  }
}

export type ChatSummaryClient = ReturnType<typeof createChatSummaryClient>
