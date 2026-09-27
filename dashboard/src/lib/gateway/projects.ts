import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError, gatewayError } from './transport'

const projectId = z.string().regex(/^project_[0-9a-f]{32}$/)
const sessionId = z.string().regex(/^ses_[0-9a-f]{16}$/)
const taskId = z.string().regex(/^tsk_[0-9a-f]{32}$/)
const fileId = z.string().regex(/^attachment_[0-9a-f]{32}$/)
const revision = z.number().int().positive()
const fields = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000),
  instructions: z.string().max(16000),
}).strict()
const reference = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('conversation'), sessionId }).strict(),
  z.object({ kind: z.literal('task'), taskId }).strict(),
  z.object({ kind: z.literal('file'), sessionId, fileId }).strict(),
])
const privacy = z.object({ memoryDisabled: z.boolean(), harnessDisabled: z.boolean(), incognito: z.boolean() }).strict()
const link = z.object({
  reference,
  mode: z.literal('live-reference'),
  snapshot: z.object({ originSessionId: sessionId, linkedAt: z.number().finite().nonnegative() }).strict(),
  availability: z.enum(['available', 'archived', 'unavailable', 'origin-changed']),
  label: z.string().min(1).max(500),
  labelSource: z.enum(['live-source', 'unavailable']),
  privacy: privacy.nullable(),
}).strict()
const project = z.object({
  schemaVersion: z.literal(1), id: projectId, revision,
  name: z.string().min(1).max(120), description: z.string().max(2000), instructions: z.string().max(16000),
  createdAt: z.number().finite().nonnegative(), updatedAt: z.number().finite().nonnegative(), archivedAt: z.number().finite().nonnegative().nullable(),
  links: z.array(link).max(1000), authority: z.literal('none'), contentIncluded: z.literal(false), grantsInherited: z.literal(false),
}).strict()
const collection = z.object({ schemaVersion: z.literal(1), results: z.array(project).max(200), nextCursor: projectId.nullable() }).strict()

export type ProjectFields = z.infer<typeof fields>
export type ProjectReference = z.infer<typeof reference>
export type GatewayProjectLink = z.infer<typeof link>
export type GatewayProject = z.infer<typeof project>
export type GatewayProjectPage = z.infer<typeof collection>

function parse<T>(schema: z.ZodType<T>, value: unknown, input = false): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new GatewayError(input ? 'validation' : 'invalid-response')
  return result.data
}

export function projectReferenceKey(value: ProjectReference) {
  return value.kind === 'conversation' ? `conversation:${value.sessionId}`
    : value.kind === 'task' ? `task:${value.taskId}` : `file:${value.sessionId}:${value.fileId}`
}

/** Project writes are never retried: a missing acknowledgement must be reconciled by reading. */
export class GatewayProjectMutationError extends Error {
  readonly outcome: 'conflict' | 'rejected' | 'unknown'
  readonly status?: number
  constructor(error: unknown) {
    const failure = gatewayError(error)
    const rejected = ['configuration', 'validation', 'browser-expired', 'upstream-denied', 'verification-cancelled', 'verification-required'].includes(failure.kind) ||
      failure.status !== undefined && [400, 401, 403, 404, 413, 422, 428, 429].includes(failure.status)
    const conflict = failure.status === 409
    super(conflict ? 'This project changed elsewhere. Reload its current revision before making another change.'
      : rejected ? failure.message : 'The change outcome is uncertain. Reload the project before deciding whether to try again.')
    this.name = 'GatewayProjectMutationError'
    this.outcome = conflict ? 'conflict' : rejected ? 'rejected' : 'unknown'
    this.status = failure.status
  }
}

export function createGatewayProjectsClient(auth: Pick<GatewayAuthClient, 'request'>) {
  const path = (id: string) => `/api/control/pi/projects/${parse(projectId, id, true)}`
  async function write(target: string, body: Record<string, unknown>, expectedId?: string) {
    try {
      const saved = parse(project, await auth.request(target, { method: 'POST', body }))
      if (expectedId && saved.id !== expectedId) throw new GatewayError('invalid-response')
      return saved
    } catch (error) { throw error instanceof GatewayError && error.kind === 'invalid-response' ? error : new GatewayProjectMutationError(error) }
  }
  return {
    async list(options: { limit?: number; cursor?: string; signal?: AbortSignal } = {}): Promise<GatewayProjectPage> {
      const limit = options.limit ?? 100
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new GatewayError('validation')
      const cursor = options.cursor === undefined ? undefined : parse(projectId, options.cursor, true)
      const page = parse(collection, await auth.request('/api/control/pi/projects', { query: { limit, ...(cursor ? { cursor } : {}) }, signal: options.signal }))
      if (page.results.length > limit || new Set(page.results.map(item => item.id)).size !== page.results.length) throw new GatewayError('invalid-response')
      return page
    },
    async get(id: string, signal?: AbortSignal): Promise<GatewayProject> {
      const selected = parse(projectId, id, true)
      const saved = parse(project, await auth.request(path(selected), { signal }))
      if (saved.id !== selected) throw new GatewayError('invalid-response')
      return saved
    },
    create(value: ProjectFields): Promise<GatewayProject> {
      return write('/api/control/pi/projects', parse(fields, value, true))
    },
    update(id: string, value: ProjectFields, expectedRevision: number): Promise<GatewayProject> {
      const selected = parse(projectId, id, true)
      return write(`${path(selected)}/update`, { expected_revision: parse(revision, expectedRevision, true), fields: parse(fields, value, true) }, selected)
    },
    archive(id: string, archived: boolean, expectedRevision: number): Promise<GatewayProject> {
      const selected = parse(projectId, id, true)
      if (typeof archived !== 'boolean') throw new GatewayError('validation')
      return write(`${path(selected)}/archive`, { expected_revision: parse(revision, expectedRevision, true), archived }, selected)
    },
    link(id: string, value: ProjectReference, expectedRevision: number): Promise<GatewayProject> {
      const selected = parse(projectId, id, true)
      return write(`${path(selected)}/link`, { expected_revision: parse(revision, expectedRevision, true), reference: parse(reference, value, true) }, selected)
    },
    unlink(id: string, value: ProjectReference, expectedRevision: number): Promise<GatewayProject> {
      const selected = parse(projectId, id, true)
      return write(`${path(selected)}/unlink`, { expected_revision: parse(revision, expectedRevision, true), reference: parse(reference, value, true) }, selected)
    },
  }
}

export type GatewayProjectsClient = ReturnType<typeof createGatewayProjectsClient>
