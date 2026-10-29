import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

const requestId = z.string().regex(/^creq_[0-9a-f]{32}$/)
const timing = z.object({ kind: z.enum(['daily', 'weekly', 'interval']), time: z.string(), day: z.number().int(), hours: z.number().int() }).strict()
const aiJob = z.object({
  name: z.string().min(1).max(80), instructions: z.string().min(1).max(4000), agentId: z.string().min(1).max(200), timing,
  timeZone: z.string().min(1).max(100), enabled: z.boolean(), clock: z.boolean().optional(),
}).passthrough()
// Pi's own check notes are plain strings; ToolGate's check answers objects with a message.
const issue = z.union([z.string().max(2000), z.object({ message: z.string().max(2000) }).passthrough()]).transform(value => typeof value === 'string' ? value : value.message)
const described = { description: z.string().max(4000) }
/**
 * A tool request fills in while Conker drafts it in the background: drafting, then ready (the
 * document and its steps in plain words) or failed (why). Requests filed before drafting moved to
 * the background have no status and are ready.
 */
const toolDraft = z.union([
  z.object({ ...described, status: z.literal('drafting') }).passthrough(),
  z.object({ ...described, status: z.literal('failed'), error: z.string().max(2000).optional() }).passthrough(),
  z.object({ ...described, status: z.literal('ready').optional(), document: z.record(z.string(), z.unknown()), issues: z.array(issue).max(20), steps: z.array(z.string().max(500)).max(60).default([]) }).passthrough(),
])
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
const submission = z.string().regex(/^[A-Za-z0-9_.:-]{16,128}$/)
const toolId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/), toolName = z.string().trim().min(1).max(160)

export type ChangeRequest = z.infer<typeof request>
export type ToolDraftRequest = Extract<ChangeRequest, { kind: 'tool_draft' }>
export type ToolDraftStatus = 'drafting' | 'ready' | 'failed'

/** Where a tool request is: Conker drafting it, a draft ready to review, or a failed attempt. */
export function toolDraftStatus(request: ToolDraftRequest): ToolDraftStatus {
  return request.payload.status === 'drafting' || request.payload.status === 'failed' ? request.payload.status : 'ready'
}

/** Conker is still working on it: nothing to decide yet. */
export const isDrafting = (request: ChangeRequest) => request.kind === 'tool_draft' && toolDraftStatus(request) === 'drafting'

function parse<T>(schema: z.ZodType<T>, value: unknown, input = false): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new GatewayError(input ? 'validation' : 'invalid-response')
  return result.data
}

function words(value: string) {
  const text = value.trim()
  if (!text || [...text].length > 4000) throw new GatewayError('validation')
  return text
}

export function createChangeRequestsClient(auth: Pick<GatewayAuthClient, 'request'>) {
  const path = (id: string) => `/api/control/pi/change-requests/${parse(requestId, id, true)}`
  const toolRequest = (value: unknown) => {
    const parsed = parse(request, value)
    if (parsed.kind !== 'tool_draft') throw new GatewayError('invalid-response')
    return parsed
  }
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
    /** Creates nothing. Words he writes (Change) go to that chat as his next message. */
    async decline(id: string, reply = ''): Promise<ChangeRequest> {
      const words = reply.trim()
      if ([...words].length > 4000) throw new GatewayError('validation')
      return parse(request, await auth.request(`${path(id)}/decline`, { method: 'POST', body: words ? { reply: words } : {} }))
    },
    /** Drafts a failed tool request again, with new words when he changed them. Creates nothing real. */
    async retry(id: string, description?: string): Promise<ToolDraftRequest> {
      return toolRequest(await auth.request(`${path(id)}/retry`, { method: 'POST', body: description === undefined ? {} : { description: words(description) } }))
    },
    /**
     * A new tool request from his own words (Tools, "Describe a new tool"); drafting starts in the
     * background. The same `submission` id on a retry never files a second request.
     */
    async draft(description: string, submissionId: string): Promise<ToolDraftRequest> {
      return toolRequest(await auth.request('/api/control/pi/tool-drafts', { method: 'POST', body: { description: words(description), request_id: parse(submission, submissionId, true) } }))
    },
    /**
     * Records that the draft this request became is published; a request from a chat gets Conker's
     * "it is live" message there. The answer is the request when Pi sends it, else null: the record
     * is made either way.
     */
    async published(id: string, publishedToolId: string, name: string): Promise<ChangeRequest | null> {
      const answer = await auth.request(`${path(id)}/published`, { method: 'POST', body: { toolId: parse(toolId, publishedToolId, true), name: parse(toolName, name, true) } })
      const parsed = request.safeParse(answer)
      return parsed.success ? parsed.data : null
    },
  }
}

export type ChangeRequestsClient = ReturnType<typeof createChangeRequestsClient>
