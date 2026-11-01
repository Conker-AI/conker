import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

const messageId = z.string().regex(/^msg_[0-9a-f]{16}$/)
const requestId = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/)

const score = z.object({
  messageId,
  score: z.number().int().min(1).max(10),
  reason: z.string().min(1).max(300),
}).strict()

const judgement = z.object({
  requestId,
  judgeModelId: z.string(),
  rubric: z.string(),
  scores: z.array(score),
  winner: messageId,
  excluded: z.array(messageId),
  createdAt: z.number(),
}).strict()

const judgementsResponse = z.object({
  results: z.array(judgement),
}).strict()

const votes = z.record(z.enum(['up', 'down', 'winner']))
const votesResponse = z.object({
  rootMessageId: messageId,
  votes,
}).strict()

const claim = z.object({
  claim: z.string().min(1).max(300),
  mark: z.enum(['supported', 'contradicted', 'no-source']),
  sources: z.array(z.string()),
  note: z.string().max(300),
}).strict()

const source = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
}).strict()

const factCheck = z.object({
  requestId,
  messageId,
  modelId: z.string(),
  claims: z.array(claim),
  counts: z.object({
    supported: z.number().int(),
    contradicted: z.number().int(),
    noSource: z.number().int(),
  }).strict(),
  sources: z.array(source),
  sourcesTruncated: z.boolean(),
  createdAt: z.number(),
}).strict()

const factChecksResponse = z.object({
  results: z.array(factCheck),
}).strict()

function parse<T>(schema: z.ZodType<T>, value: unknown, input = false): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new GatewayError(input ? 'validation' : 'invalid-response')
  return result.data
}

/** Reviews of one answer: blind judge, owner votes and fact checks. */
export function createChatReviewsClient(auth: Pick<GatewayAuthClient, 'request'>) {
  return {
    async judge(sessionId: string, rootId: string, options: { modelId?: string | null; rubric?: string } = {}): Promise<z.infer<typeof judgement>> {
      const sid = parse(z.string().regex(/^ses_[0-9a-f]{16}$/), sessionId, true)
      const rid = parse(messageId, rootId, true)
      const requestId = crypto.randomUUID()

      const body: Record<string, unknown> = { request_id: requestId }
      if (options.modelId !== undefined) body.model_id = options.modelId
      if (options.rubric !== undefined) body.rubric = options.rubric.slice(0, 2000)

      return parse(judgement, await auth.request(`/api/control/pi/sessions/${sid}/response-families/${rid}/judge`, {
        method: 'POST',
        body,
      }))
    },

    async judgements(sessionId: string, rootId: string, signal?: AbortSignal): Promise<z.infer<typeof judgement>[]> {
      const sid = parse(z.string().regex(/^ses_[0-9a-f]{16}$/), sessionId, true)
      const rid = parse(messageId, rootId, true)

      return parse(judgementsResponse, await auth.request(`/api/control/pi/sessions/${sid}/response-families/${rid}/judgements`, { signal })).results
    },

    async vote(sessionId: string, rootId: string, messageId: string, vote: 'up' | 'down' | 'winner' | 'clear'): Promise<z.infer<typeof votesResponse>> {
      const sid = parse(z.string().regex(/^ses_[0-9a-f]{16}$/), sessionId, true)
      const rid = parse(z.string().regex(/^msg_[0-9a-f]{16}$/), rootId, true)
      const mid = parse(z.string().regex(/^msg_[0-9a-f]{16}$/), messageId, true)

      return parse(votesResponse, await auth.request(`/api/control/pi/sessions/${sid}/response-families/${rid}/vote`, {
        method: 'POST',
        body: { message_id: mid, vote },
      }))
    },

    async votes(sessionId: string, rootId: string, signal?: AbortSignal): Promise<z.infer<typeof votesResponse>> {
      const sid = parse(z.string().regex(/^ses_[0-9a-f]{16}$/), sessionId, true)
      const rid = parse(z.string().regex(/^msg_[0-9a-f]{16}$/), rootId, true)

      return parse(votesResponse, await auth.request(`/api/control/pi/sessions/${sid}/response-families/${rid}/votes`, { signal }))
    },

    async factCheck(sessionId: string, messageId: string, modelId?: string): Promise<z.infer<typeof factCheck>> {
      const sid = parse(z.string().regex(/^ses_[0-9a-f]{16}$/), sessionId, true)
      const mid = parse(z.string().regex(/^msg_[0-9a-f]{16}$/), messageId, true)
      const requestId = crypto.randomUUID()

      const body: Record<string, unknown> = { request_id: requestId }
      if (modelId !== undefined) body.model_id = modelId

      return parse(factCheck, await auth.request(`/api/control/pi/sessions/${sid}/messages/${mid}/fact-check`, {
        method: 'POST',
        body,
      }))
    },

    async factChecks(sessionId: string, messageId: string, signal?: AbortSignal): Promise<z.infer<typeof factCheck>[]> {
      const sid = parse(z.string().regex(/^ses_[0-9a-f]{16}$/), sessionId, true)
      const mid = parse(z.string().regex(/^msg_[0-9a-f]{16}$/), messageId, true)

      return parse(factChecksResponse, await auth.request(`/api/control/pi/sessions/${sid}/messages/${mid}/fact-checks`, { signal })).results
    },
  }
}

export type ChatReviewsClient = ReturnType<typeof createChatReviewsClient>
export type Judgement = z.infer<typeof judgement>
export type Votes = z.infer<typeof votes>
export type FactCheck = z.infer<typeof factCheck>
