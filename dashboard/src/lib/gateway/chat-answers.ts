import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

const sessionIdSchema = z.string().regex(/^ses_[0-9a-f]{16}$/)
const messageIdSchema = z.string().regex(/^msg_[0-9a-f]{16}$/)
const turnIdSchema = z.string().regex(/^trn_[0-9a-f]{16}$/)
const requestIdSchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/)

/** One answer and every retried version of it. The shown version is `selectedId`; `revision` guards a switch. */
const answerFamily = z.object({
  root_message_id: messageIdSchema,
  session_id: sessionIdSchema,
  selected_message_id: messageIdSchema,
  revision: z.number().int().min(1),
  versions: z.array(z.object({ message_id: messageIdSchema, retry_of: messageIdSchema.nullable(), turn_id: turnIdSchema }).strict()),
}).strict()

/** The receipt of a retry. Only the new message's id is read from `message`; the chat reload brings the rest. */
const retryReceipt = z.object({
  request_id: requestIdSchema,
  session_id: sessionIdSchema,
  source_message_id: messageIdSchema,
  source_turn_id: turnIdSchema,
  turn_id: turnIdSchema,
  model_id: z.string().min(1).max(200),
  status: z.string(),
  input_message_id: messageIdSchema.nullable(),
  replayed: z.boolean(),
  message: z.object({ id: messageIdSchema }).passthrough().nullable(),
}).strict()

const forkReceipt = z.object({
  session_id: sessionIdSchema,
  parent_id: sessionIdSchema,
  message_id: messageIdSchema,
  replayed: z.boolean(),
  privacy: z.object({ memoryDisabled: z.boolean(), harnessDisabled: z.boolean() }).strict().optional(),
}).strict()

// The three reads of a branch belong to other screens: only the one field needed is read.
const revisionOf = z.object({ revision: z.number().int().min(0) }).passthrough()
const summaryOf = z.object({ summary: z.string().max(16000).nullable() }).passthrough()
const modelSettings = z.object({
  configuration: z.object({
    models: z.array(z.object({ id: z.string().min(1).max(200), name: z.string(), enabled: z.boolean() }).passthrough()),
  }).passthrough(),
}).passthrough()

export type AnswerFamily = { rootId: string; selectedId: string; revision: number; versions: { messageId: string; retryOf: string | null; turnId: string }[] }
export type RetryReceipt = { requestId: string; turnId: string; modelId: string; status: string; replayed: boolean; messageId: string | null }
/** What a branch must prove it has seen: the chat's settings and context revisions and the summary it reviewed. */
export type ForkBasis = { settingsRevision: number; contextRevision: number; reviewedSummary: string | null }
export type AnswerModel = { id: string; name: string }

function parse<T>(schema: z.ZodType<T>, value: unknown, input = false): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new GatewayError(input ? 'validation' : 'invalid-response')
  return result.data
}

function toFamily(value: z.infer<typeof answerFamily>): AnswerFamily {
  return {
    rootId: value.root_message_id, selectedId: value.selected_message_id, revision: value.revision,
    versions: value.versions.map(version => ({ messageId: version.message_id, retryOf: version.retry_of, turnId: version.turn_id })),
  }
}

function toReceipt(value: z.infer<typeof retryReceipt>): RetryReceipt {
  return { requestId: value.request_id, turnId: value.turn_id, modelId: value.model_id, status: value.status, replayed: value.replayed, messageId: value.message?.id ?? null }
}

/** Answer versions for one chat: retry with another model, compare, switch versions, branch from a message. */
export function createChatAnswersClient(auth: Pick<GatewayAuthClient, 'request'>) {
  const sessionPath = (sessionId: string) => `/api/control/pi/sessions/${parse(sessionIdSchema, sessionId, true)}`
  return {
    async family(sessionId: string, rootId: string, signal?: AbortSignal): Promise<AnswerFamily> {
      const path = `${sessionPath(sessionId)}/response-families/${parse(messageIdSchema, rootId, true)}`
      return toFamily(parse(answerFamily, await auth.request(path, { signal })))
    },

    async select(sessionId: string, rootId: string, messageId: string, expectedRevision: number): Promise<AnswerFamily> {
      const path = `${sessionPath(sessionId)}/response-families/${parse(messageIdSchema, rootId, true)}/select`
      const id = parse(messageIdSchema, messageId, true)
      if (!Number.isInteger(expectedRevision) || expectedRevision < 1) throw new GatewayError('validation')
      return toFamily(parse(answerFamily, await auth.request(path, { method: 'POST', body: { message_id: id, expected_revision: expectedRevision } })))
    },

    /** Asks the same question again with another model; the new answer joins the family. */
    async retry(sessionId: string, messageId: string, modelId: string): Promise<RetryReceipt> {
      const path = `${sessionPath(sessionId)}/messages/${parse(messageIdSchema, messageId, true)}/retry`
      if (typeof modelId !== 'string' || modelId.length < 1 || modelId.length > 200) throw new GatewayError('validation')
      return toReceipt(parse(retryReceipt, await auth.request(path, { method: 'POST', body: { request_id: crypto.randomUUID(), model_id: modelId } })))
    },

    async retryStatus(sessionId: string, requestId: string): Promise<RetryReceipt> {
      const path = `${sessionPath(sessionId)}/response-retries/${parse(requestIdSchema, requestId, true)}`
      return toReceipt(parse(retryReceipt, await auth.request(path)))
    },

    /** Starts a new chat from this message; returns the new chat's id. */
    async fork(sessionId: string, messageId: string, basis: ForkBasis): Promise<{ sessionId: string }> {
      const path = `${sessionPath(sessionId)}/messages/${parse(messageIdSchema, messageId, true)}/fork`
      const checked = parse(z.object({
        settingsRevision: z.number().int().min(0), contextRevision: z.number().int().min(0), reviewedSummary: z.string().max(16000).nullable(),
      }).strict(), basis, true)
      const body = { request_id: crypto.randomUUID(), expected_settings_revision: checked.settingsRevision, expected_context_revision: checked.contextRevision, reviewed_summary: checked.reviewedSummary }
      return { sessionId: parse(forkReceipt, await auth.request(path, { method: 'POST', body })).session_id }
    },

    async forkBasis(sessionId: string, signal?: AbortSignal): Promise<ForkBasis> {
      const sid = parse(sessionIdSchema, sessionId, true)
      const [settings, context, summary] = await Promise.all([
        auth.request(`/api/control/pi/sessions/${sid}/settings`, { signal }),
        auth.request(`/api/control/pi/context/${sid}`, { signal }),
        auth.request(`/api/control/pi/context/${sid}/summary`, { signal }),
      ])
      return {
        settingsRevision: parse(revisionOf, settings).revision,
        contextRevision: parse(revisionOf, context).revision,
        reviewedSummary: parse(summaryOf, summary).summary,
      }
    },

    /** The models that may answer again: the enabled ones. */
    async models(signal?: AbortSignal): Promise<AnswerModel[]> {
      const value = parse(modelSettings, await auth.request('/api/control/pi/models/configuration', { signal }))
      return value.configuration.models.filter(model => model.enabled).map(model => ({ id: model.id, name: model.name }))
    },
  }
}

export type ChatAnswersClient = ReturnType<typeof createChatAnswersClient>
