import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

const requestId = z.string().regex(/^creq_[0-9a-f]{32}$/)
const timing = z.object({ kind: z.enum(['daily', 'weekly', 'interval']), time: z.string(), day: z.number().int(), hours: z.number().int() }).strict()
const aiJob = z.object({
  name: z.string().min(1).max(80), instructions: z.string().min(1).max(4000), agentId: z.string().min(1).max(200), timing,
  timeZone: z.string().min(1).max(100), enabled: z.boolean(), clock: z.boolean().optional(),
}).passthrough()
const toolDraft = z.object({ document: z.record(z.string(), z.unknown()), issues: z.array(z.string()).max(20), description: z.string().max(4000) }).passthrough()
const memory = z.object({ text: z.string().min(1).max(2000) }).strict()
const base = {
  id: requestId, title: z.string().min(1).max(160), summary: z.string().max(600), sessionId: z.string().nullable(),
  state: z.enum(['open', 'approved', 'declined', 'failed']), result: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.number().nonnegative(), decidedAt: z.number().nonnegative().nullable(),
}
/** What Conker asked to create, exactly as filed; only the owner's approval makes it real. */
const request = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('ai_job'), payload: aiJob }).strict(),
  z.object({ ...base, kind: z.literal('tool_draft'), payload: toolDraft }).strict(),
  z.object({ ...base, kind: z.literal('memory'), payload: memory }).strict(),
])
const collection = z.object({ schemaVersion: z.literal(1), results: z.array(request).max(50) }).strict()
const draftId = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/)

export type ChangeRequest = z.infer<typeof request>

function parse<T>(schema: z.ZodType<T>, value: unknown, input = false): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new GatewayError(input ? 'validation' : 'invalid-response')
  return result.data
}

export function createChangeRequestsClient(auth: Pick<GatewayAuthClient, 'request'>) {
  const path = (id: string) => `/api/control/pi/change-requests/${parse(requestId, id, true)}`
  return {
    async list(signal?: AbortSignal): Promise<ChangeRequest[]> {
      return parse(collection, await auth.request('/api/control/pi/change-requests', { signal })).results
    },
    /** Asks for the password: it creates the cron job or the memory exactly as filed. */
    async approve(id: string): Promise<ChangeRequest> {
      return parse(request, await auth.request(`${path(id)}/approve`, { method: 'POST', body: {} }))
    },
    /** A tool request the owner already saved in Tools (that save asked for the password); this records which draft. */
    async saved(id: string, savedDraftId: string): Promise<ChangeRequest> {
      return parse(request, await auth.request(`${path(id)}/saved`, { method: 'POST', body: { draftId: parse(draftId, savedDraftId, true) } }))
    },
    async decline(id: string): Promise<ChangeRequest> {
      return parse(request, await auth.request(`${path(id)}/decline`, { method: 'POST', body: {} }))
    },
  }
}

export type ChangeRequestsClient = ReturnType<typeof createChangeRequestsClient>
