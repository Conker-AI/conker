import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

const sessionId = z.string().regex(/^ses_[0-9a-f]{16}$/)
const messageId = z.string().regex(/^msg_[0-9a-f]{16}$/)
const requestId = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/)
const modelId = z.string().min(1).max(200)
const voteValue = z.enum(['up', 'down', 'winner'])
const voteChoice = z.enum(['up', 'down', 'winner', 'clear'])
/** Pi counts characters, not UTF-16 units. */
const rubric = z.string().refine(value => [...value].length <= 2000)

// Pi's judge and fact-check replies mix snake_case (ids, times) with camelCase (judgeModelId, modelId, sourcesTruncated); both are mapped to the camelCase types below.
const judgement = z.object({
  request_id: requestId,
  judgeModelId: z.string().min(1),
  rubric: z.string(),
  scores: z.array(z.object({
    message_id: messageId,
    score: z.number().int().min(1).max(10),
    reason: z.string().min(1).max(300),
  }).strict()),
  winner: messageId,
  excluded: z.array(messageId),
  created_at: z.number(),
  replayed: z.boolean().optional(),
}).strict().transform(value => ({
  requestId: value.request_id,
  judgeModelId: value.judgeModelId,
  rubric: value.rubric,
  scores: value.scores.map(item => ({ messageId: item.message_id, score: item.score, reason: item.reason })),
  winner: value.winner,
  excluded: value.excluded,
  createdAt: value.created_at,
}))
const judgements = z.object({ results: z.array(judgement) }).strict()

const votes = z.record(messageId, voteValue)
const votesReply = z.object({ root_message_id: messageId, votes }).strict().transform(value => value.votes)

const mark = z.enum(['supported', 'contradicted', 'no-source'])
const factCheck = z.object({
  request_id: requestId,
  message_id: messageId,
  modelId: z.string().min(1),
  claims: z.array(z.object({
    claim: z.string().min(1).max(300),
    mark,
    sources: z.array(z.string()).max(5),
    note: z.string().max(300),
  }).strict()).max(12),
  counts: z.object({
    supported: z.number().int().nonnegative(),
    contradicted: z.number().int().nonnegative(),
    'no-source': z.number().int().nonnegative(),
  }).strict(),
  sources: z.array(z.object({ id: z.string(), title: z.string(), url: z.string() }).strict()),
  sourcesTruncated: z.boolean(),
  created_at: z.number(),
  replayed: z.boolean().optional(),
}).strict().transform(value => ({
  requestId: value.request_id,
  messageId: value.message_id,
  modelId: value.modelId,
  claims: value.claims,
  counts: { supported: value.counts.supported, contradicted: value.counts.contradicted, noSource: value.counts['no-source'] },
  sources: value.sources,
  sourcesTruncated: value.sourcesTruncated,
  createdAt: value.created_at,
}))
const factChecks = z.object({ results: z.array(factCheck) }).strict()

export type Judgement = z.output<typeof judgement>
export type Votes = z.infer<typeof votes>
export type Vote = z.infer<typeof voteChoice>
export type FactCheck = z.output<typeof factCheck>

function parse<S extends z.ZodType>(schema: S, value: unknown, input = false): z.output<S> {
  const result = schema.safeParse(value)
  if (!result.success) throw new GatewayError(input ? 'validation' : 'invalid-response')
  return result.data
}

/** Reviews of one answer: blind judge, owner votes and fact checks. */
export function createChatReviewsClient(auth: Pick<GatewayAuthClient, 'request'>) {
  const chat = (session: string) => `/api/control/pi/sessions/${parse(sessionId, session, true)}`
  const family = (session: string, root: string) => `${chat(session)}/response-families/${parse(messageId, root, true)}`
  const answer = (session: string, message: string) => `${chat(session)}/messages/${parse(messageId, message, true)}`
  return {
    /** Scores every version of an answer without telling the judge who wrote which. Needs two or more. */
    async judge(session: string, rootId: string, options: { modelId?: string | null; rubric?: string } = {}): Promise<Judgement> {
      const path = `${family(session, rootId)}/judge`
      const body: Record<string, unknown> = { request_id: crypto.randomUUID() }
      if (options.modelId !== undefined && options.modelId !== null) body.model_id = parse(modelId, options.modelId, true)
      if (options.rubric !== undefined) body.rubric = parse(rubric, options.rubric, true)
      return parse(judgement, await auth.request(path, { method: 'POST', body }))
    },
    /** Earlier judgements, newest first. */
    async judgements(session: string, rootId: string, signal?: AbortSignal): Promise<Judgement[]> {
      return parse(judgements, await auth.request(`${family(session, rootId)}/judgements`, { signal })).results
    },
    /** Votes on one version; `clear` takes the vote back. Returns every vote of the family by message id. */
    async vote(session: string, rootId: string, message: string, vote: Vote): Promise<Votes> {
      const path = `${family(session, rootId)}/vote`
      const body = { message_id: parse(messageId, message, true), vote: parse(voteChoice, vote, true) }
      return parse(votesReply, await auth.request(path, { method: 'POST', body }))
    },
    async votes(session: string, rootId: string, signal?: AbortSignal): Promise<Votes> {
      return parse(votesReply, await auth.request(`${family(session, rootId)}/votes`, { signal }))
    },
    /** Checks the claims of an answer against its sources. */
    async factCheck(session: string, message: string, model?: string | null): Promise<FactCheck> {
      const path = `${answer(session, message)}/fact-check`
      const body: Record<string, unknown> = { request_id: crypto.randomUUID() }
      if (model !== undefined && model !== null) body.model_id = parse(modelId, model, true)
      return parse(factCheck, await auth.request(path, { method: 'POST', body }))
    },
    /** Earlier fact checks of one answer, newest first. */
    async factChecks(session: string, message: string, signal?: AbortSignal): Promise<FactCheck[]> {
      return parse(factChecks, await auth.request(`${answer(session, message)}/fact-checks`, { signal })).results
    },
  }
}

export type ChatReviewsClient = ReturnType<typeof createChatReviewsClient>
