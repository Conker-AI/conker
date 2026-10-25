import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError, gatewayError } from './transport'

const jobId = z.string().regex(/^job_[0-9a-f]{32}$/)
const runId = z.string().regex(/^scheduled_[0-9a-f]{32}$/)
const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const timestamp = z.number().finite().nonnegative()
const timing = z.object({
  kind: z.enum(['daily', 'weekly', 'interval']),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  day: z.number().int().min(0).max(6),
  hours: z.number().int().min(1).max(168),
}).strict()
const sessionId = z.string().regex(/^ses_[0-9a-f]{16}$/)
const toolTarget = z.object({
  kind: z.enum(['tool', 'automation']), id: z.string().min(1).max(200).regex(/^[A-Za-z0-9_.-]+$/),
  publishedVersion: z.number().int().positive(), digest: z.string().regex(/^[0-9a-f]{64}$/), inputsConfigured: z.boolean(),
}).strict()
/** An AI job: its agent carries out the owner's instructions in its own chat; tools ask exactly as they do in chat. */
// webhook and clock arrived with Pi's webhooks; older Pi omits them (no webhook, runs on its timing).
const agentTarget = z.object({ kind: z.literal('agent'), sessionId: sessionId.nullable(), webhook: z.boolean().optional(), clock: z.boolean().optional() }).strict()
const target = z.discriminatedUnion('kind', [toolTarget, agentTarget])
const toolId = z.string().min(1).max(200).regex(/^[A-Za-z0-9_.:-]+$/)
/** Starts an AI job when a get tool has something new; Pi keeps only a fingerprint of the answer. */
const watchSummary = z.object({
  toolId, everyMinutes: z.number().int().min(5).max(1440), inputsConfigured: z.boolean(),
  lastCheckedAt: z.number().finite().nonnegative().nullable(), problem: z.enum(['needs_approval', 'no_credential', 'failed']).nullable(),
}).strict()
const watchCreate = z.object({ toolId, args: z.record(z.string().max(200), z.string().max(4000)), everyMinutes: z.number().int().min(5).max(1440) }).strict()
const definition = z.object({
  name: z.string().min(1).max(80), instructionsConfigured: z.boolean(), agentId: z.string().min(1).max(200),
  timing, timeZone: z.string().min(1).max(100), enabled: z.boolean(), state: z.enum(['enabled', 'paused']), target, watch: watchSummary.nullable().optional(),
  overlap: z.literal('skip'), requireBudget: z.boolean(), budgetAllowanceConfigured: z.boolean(),
}).strict().refine(value => value.enabled === (value.state === 'enabled'), 'Job state is inconsistent.')
const job = z.object({
  schemaVersion: z.literal(1), id: jobId, revision, definition, createdAt: timestamp, nextAt: timestamp,
  authority: z.literal('none'), contentIncluded: z.literal(false), execution: z.literal('not-triggered'),
}).strict()
const jobCollection = z.object({ schemaVersion: z.literal(1), results: z.array(job).max(100), nextCursor: jobId.nullable() }).strict()
const runStatus = z.enum(['ready', 'awaiting_budget', 'dispatching', 'completed', 'failed', 'awaiting_approval', 'outcome_unknown', 'cancelled'])
const run = z.object({
  schemaVersion: z.literal(1), id: runId, jobId, jobRevision: revision, scheduledAt: timestamp, startedAt: timestamp,
  status: runStatus, manual: z.boolean(), budgetBound: z.boolean(), receiptRecorded: z.boolean(),
  outcomeCode: z.string().regex(/^[A-Z0-9_]{1,64}$/).nullable(), authority: z.literal('none'), contentIncluded: z.literal(false),
  execution: z.enum(['admitted-only', 'waiting', 'dispatched', 'resolved', 'uncertain']),
}).strict()
const runCollection = z.object({ schemaVersion: z.literal(1), results: z.array(run).max(100), nextCursor: runId.nullable() }).strict()
const runAction = run.extend({ replayed: z.boolean() }).strict()
const requestId = z.string().min(16).max(128).regex(/^[A-Za-z0-9_.:-]+$/)

const noteId = z.string().regex(/^note_[0-9a-f]{32}$/)
const agentNote = z.object({
  id: noteId, jobId, sessionId, messageId: z.string().regex(/^msg_[0-9a-f]{16}$/).nullable(),
  title: z.string().min(1).max(160), detail: z.string().max(400), createdAt: timestamp,
}).strict()
const agentNotes = z.object({ schemaVersion: z.literal(1), results: z.array(agentNote).max(50) }).strict()
const dismissed = z.object({ id: noteId, dismissed: z.literal(true), changed: z.boolean() }).strict()
const agentJobCreate = z.object({
  name: z.string().trim().min(1).max(80), instructions: z.string().trim().min(1).max(4000),
  timing, timeZone: z.string().min(1).max(100), agentId: z.string().min(1).max(200).optional(), watch: watchCreate.optional(), clock: z.boolean().optional(),
}).strict()
const hookIssued = z.object({
  jobId, token: z.string().regex(/^hook_[A-Za-z0-9_-]{43}$/), header: z.literal('X-Conker-Hook-Token'), path: z.string().regex(/^\/hooks\/job_[0-9a-f]{32}$/),
}).strict()
const hookRevoked = z.object({ jobId, revoked: z.literal(true) }).strict()

export type GatewayJob = z.infer<typeof job>
export type GatewayAgentNote = z.infer<typeof agentNote>
export type GatewayAgentJobCreate = z.infer<typeof agentJobCreate>
export type GatewayJobTiming = z.infer<typeof timing>
export type GatewayHookIssued = z.infer<typeof hookIssued>
export const isAiJob = (value: GatewayJob) => value.definition.target.kind === 'agent'
export type GatewayScheduledRun = z.infer<typeof run>
export type GatewayScheduledRunStatus = z.infer<typeof runStatus>

function parse<T>(schema: z.ZodType<T>, value: unknown, input = false): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new GatewayError(input ? 'validation' : 'invalid-response')
  return result.data
}

export function createJobRunRequestId(): string {
  return `browser:${crypto.randomUUID()}`
}

export class GatewayJobMutationError extends Error {
  readonly outcome: 'conflict' | 'rejected' | 'unknown'
  readonly status?: number
  constructor(error: unknown) {
    const failure = gatewayError(error), conflict = failure.status === 409
    const rejected = ['configuration', 'validation', 'browser-expired', 'upstream-denied', 'verification-cancelled', 'verification-required'].includes(failure.kind) ||
      failure.status !== undefined && [400, 401, 403, 404, 413, 422, 428, 429].includes(failure.status)
    super(conflict ? 'This schedule or run changed. Reload its saved state before making another change.' : rejected ? failure.message : 'The operation outcome is uncertain. Reload run history before deciding whether to try again.')
    this.name = 'GatewayJobMutationError'; this.outcome = conflict ? 'conflict' : rejected ? 'rejected' : 'unknown'; this.status = failure.status
  }
}

export function createGatewayJobsClient(auth: Pick<GatewayAuthClient, 'request'>) {
  const jobPath = (id: string) => `/api/control/pi/jobs/${parse(jobId, id, true)}`
  const runPath = (id: string) => `/api/control/pi/jobs/runs/${parse(runId, id, true)}`
  async function write<T>(schema: z.ZodType<T>, path: string, body?: Record<string, unknown>): Promise<T> {
    try { return parse(schema, await auth.request(path, { method: 'POST', body: body ?? {} })) }
    catch (error) { throw error instanceof GatewayError && error.kind === 'invalid-response' ? error : new GatewayJobMutationError(error) }
  }
  return {
    async list(options: { limit?: number; cursor?: string; signal?: AbortSignal } = {}) {
      const limit = options.limit ?? 100
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new GatewayError('validation')
      const cursor = options.cursor === undefined ? undefined : parse(jobId, options.cursor, true)
      const result = parse(jobCollection, await auth.request('/api/control/pi/jobs', { query: { limit, ...(cursor ? { cursor } : {}) }, signal: options.signal }))
      if (result.results.length > limit || new Set(result.results.map(item => item.id)).size !== result.results.length) throw new GatewayError('invalid-response')
      return result
    },
    async get(id: string, signal?: AbortSignal): Promise<GatewayJob> {
      const selected = parse(jobId, id, true), result = parse(job, await auth.request(jobPath(selected), { signal }))
      if (result.id !== selected) throw new GatewayError('invalid-response')
      return result
    },
    async runs(id: string, options: { limit?: number; cursor?: string; signal?: AbortSignal } = {}) {
      const selected = parse(jobId, id, true), limit = options.limit ?? 100
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new GatewayError('validation')
      const cursor = options.cursor === undefined ? undefined : parse(runId, options.cursor, true)
      const result = parse(runCollection, await auth.request(`${jobPath(selected)}/runs`, { query: { limit, ...(cursor ? { cursor } : {}) }, signal: options.signal }))
      if (result.results.length > limit || result.results.some(item => item.jobId !== selected) || new Set(result.results.map(item => item.id)).size !== result.results.length) throw new GatewayError('invalid-response')
      return result
    },
    setEnabled(id: string, enabled: boolean, expectedRevision: number): Promise<GatewayJob> {
      const selected = parse(jobId, id, true)
      return write(job, `${jobPath(selected)}/state`, { expected_revision: parse(revision, expectedRevision, true), enabled: parse(z.boolean(), enabled, true) })
    },
    runNow(id: string, stableRequestId: string) {
      const selected = parse(jobId, id, true)
      return write(runAction, `${jobPath(selected)}/run`, { request_id: parse(requestId, stableRequestId, true) })
    },
    /** A new AI job (never a raw tool job); the gateway asks for the password first. */
    async createAgentJob(body: GatewayAgentJobCreate) {
      return write(job, '/api/control/pi/jobs/agent', parse(agentJobCreate, body, true))
    },
    async agentNotes(signal?: AbortSignal): Promise<GatewayAgentNote[]> {
      return parse(agentNotes, await auth.request('/api/control/pi/jobs/agent/notes', { signal })).results
    },
    /** A new webhook secret for an AI job, shown once; any earlier one stops working. Asks for the password. */
    async issueHook(id: string) {
      return write(hookIssued, `${jobPath(parse(jobId, id, true))}/hook`)
    },
    async revokeHook(id: string) {
      return write(hookRevoked, `${jobPath(parse(jobId, id, true))}/hook/revoke`)
    },
    async dismissNote(id: string) {
      return parse(dismissed, await auth.request(`/api/control/pi/jobs/agent/notes/${parse(noteId, id, true)}/dismiss`, { method: 'POST', body: {} }))
    },
    provisionBudget(id: string) { return write(run, `${runPath(id)}/provision-budget`) },
    cancel(id: string) { return write(runAction, `${runPath(id)}/cancel`) },
    resume(id: string) { return write(run, `${runPath(id)}/resume`) },
    reconcile(id: string) { return write(run, `${runPath(id)}/reconcile`) },
  }
}

export type GatewayJobsClient = ReturnType<typeof createGatewayJobsClient>
