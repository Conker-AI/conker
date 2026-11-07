import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError, gatewayError } from './transport'

/**
 * Deleting Conker chats forever (Pi `pi/api/routes/forgetting.py`). The server asks for the password;
 * Pi answers at once and deletes in the background once no reply is in progress. The preview shows
 * counts, never text.
 */
const session = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const confirmation = z.string().regex(/^[0-9a-f]{64}$/)
const plan = z.object({
  sessionId: session, sessionIds: z.array(session).min(1).max(1000), messages: count, turns: count,
  approvalRequests: count, confirmation, alreadyForgotten: z.boolean(),
})
const result = z.object({
  sessionId: session, state: z.enum(['done', 'refused', 'retrying']), receiptId: z.string().max(200).nullable(),
  finishedAt: z.number().finite(), detail: z.string().max(300).nullable(),
})
const overview = z.object({ supervised: z.boolean(), pending: z.array(session).max(1000), results: z.array(result).max(50), chats: z.array(plan).max(50) })
const queued = z.object({ state: z.enum(['done', 'restarting']), sessions: z.array(session).min(1).max(50) })

export type ChatForgetPlan = z.infer<typeof plan>
export type ChatForgetResult = z.infer<typeof result>
export type ChatForgetOverview = z.infer<typeof overview>
export type ChatForgetOutcome = { done: string[]; refused: ChatForgetResult[]; waiting: string[] }

function parse<T>(schema: z.ZodType<T>, value: unknown, input = false): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new GatewayError(input ? 'validation' : 'invalid-response')
  return parsed.data
}

const path = '/api/control/pi/forgetting/chats'

/** Plain words for Pi's refusals; anything else falls back to the gateway's own message. */
export function chatForgetMessage(error: unknown): string {
  const failure = gatewayError(error)
  switch (failure.code) {
    case 'not_supervised': return 'This Conker cannot restart itself, so it cannot delete chats from here. The server guide shows the offline command.'
    case 'scope_changed': return 'A chat changed since you reviewed it, so nothing was deleted. Review it again.'
    case 'not_found': return 'One of these chats is no longer there.'
    case 'forgetting_unavailable': return 'Conker could not check what deleting would reach. Nothing was deleted; try again.'
    default: return failure.message
  }
}

export function createChatForgetClient(auth: Pick<GatewayAuthClient, 'request'>) {
  const status = async (sessions: readonly string[] = [], signal?: AbortSignal): Promise<ChatForgetOverview> => {
    const ids = [...new Set(sessions.map(id => parse(session, id, true)))]
    if (ids.length > 50) throw new GatewayError('validation')
    const value = parse(overview, await auth.request(path, { query: ids.length ? { session: ids } : undefined, signal }))
    if (value.chats.some(chat => !ids.includes(chat.sessionId)) || value.chats.length !== ids.length) throw new GatewayError('invalid-response')
    return value
  }
  return {
    /** What deleting each chat reaches (every branch and fork it has), with the confirmation to send. */
    preview: (sessions: readonly string[], signal?: AbortSignal) => status(sessions, signal).then(value => value.chats),
    status,
    /**
     * Delete the previewed chats forever. Asks for the password. Pi answers at once and deletes in
     * the background once no reply is in progress, so the caller never waits for the deletion.
     */
    async remove(plans: readonly ChatForgetPlan[], options: { signal?: AbortSignal } = {}): Promise<ChatForgetOutcome> {
      if (!plans.length || plans.length > 50) throw new GatewayError('validation')
      const body = { chats: plans.map(item => ({ session: parse(session, item.sessionId, true), confirmation: parse(confirmation, item.confirmation, true) })) }
      const answer = parse(queued, await auth.request(path, { method: 'POST', body, signal: options.signal }))
      const asked = plans.map(item => item.sessionId)
      if (answer.sessions.some(id => !asked.includes(id))) throw new GatewayError('invalid-response')
      if (answer.state === 'done') return { done: asked, refused: [], waiting: [] }
      return { done: asked.filter(id => !answer.sessions.includes(id)), refused: [], waiting: answer.sessions }
    },
  }
}
export type ChatForgetClient = ReturnType<typeof createChatForgetClient>
