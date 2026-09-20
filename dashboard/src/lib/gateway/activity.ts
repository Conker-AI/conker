import type { GatewayAuthClient } from './auth'
import { GatewayError, gatewayError } from './transport'

/** Recorded Pi activity only. These records never use preview fixtures or imply task execution. */
export type GatewayTaskStatus = 'planned' | 'in_progress' | 'blocked' | 'completed' | 'cancelled'
export type GatewayContentStatus = 'available' | 'forgotten'
export type GatewayActivityPage<T> = { results: T[]; nextCursor: string | null }
export type GatewayActivityEvent = {
  id: string; sequence: number; kind: string; sessionId: string
  taskId: string | null; runId: string | null; actionId: string | null
  fromStatus: string | null; toStatus: string | null; revision: number | null
  occurredAt: string; contentStatus: GatewayContentStatus
}
export type GatewayTask = {
  id: string; outcome: string; criteria: { id: string; text: string }[]
  sessionId: string; agentId: 'companion'; parentTaskId: string | null; runIds: string[]
  status: GatewayTaskStatus; statusSource: 'owner'; provenance: 'recorded'; revision: number
  createdAt: string; updatedAt: string; archivedAt: string | null
  statusNote: string; completedCriterionIds: string[]; contentStatus: GatewayContentStatus
  changes: GatewayActivityEvent[]; changesTruncated: boolean
}
export type GatewayActivityRun = {
  id: string; sessionId: string; status: string; acted: boolean
  provider: string | null; model: string | null; startedAt: string; endedAt: string | null
  taskIds: string[]; action: { id: string; state: string; jobId: string | null } | null
  source: { kind: 'conversation'; sessionId: string }; outputs: []
  provenance: 'recorded'; contentStatus: GatewayContentStatus
}
export type GatewayTaskCreate = {
  /** Create and retain this identity before dispatch; use getTaskByRequest after a lost acknowledgement. */
  requestId: string; outcome: string; criteria: string[]; sessionId: string
  parentTaskId?: string | null; runIds?: string[]
}
export type GatewayTaskUpdate = {
  expectedRevision: number; outcome: string; criteria: string[]
  /** Full desired links, not a patch: Pi clears omitted links. */
  parentTaskId: string | null; runIds: string[]
}
export type GatewayTaskTransition = {
  expectedRevision: number; status: GatewayTaskStatus; note: string; completedCriterionIds?: string[]
}
export type GatewayActivityOptions = { signal?: AbortSignal }
export type GatewayActivityListOptions = GatewayActivityOptions & { limit?: number; cursor?: string }
export type GatewayActivityFilterOptions = GatewayActivityListOptions & { sessionId?: string; taskId?: string }
export type GatewayTaskListOptions = GatewayActivityListOptions & { sessionId?: string }
export type GatewayEventListOptions = GatewayActivityFilterOptions & { runId?: string }
export const GATEWAY_TASK_TRANSITIONS: Readonly<Record<GatewayTaskStatus, readonly GatewayTaskStatus[]>> = {
  planned: ['in_progress', 'blocked', 'cancelled'],
  in_progress: ['blocked', 'completed', 'cancelled'],
  blocked: ['planned', 'in_progress', 'cancelled'],
  completed: ['planned'], cancelled: ['planned'],
}
/** Source/parent/child eligibility and the revision remain server-enforced at mutation time. */
export function allowedGatewayTaskTransitions(task: Pick<GatewayTask, 'status' | 'archivedAt' | 'contentStatus'>): readonly GatewayTaskStatus[] {
  return task.archivedAt !== null || task.contentStatus !== 'available' ? [] : GATEWAY_TASK_TRANSITIONS[task.status]
}

/** A conflict requires an explicit reread/review. An unknown write must never be blindly repeated. */
export class GatewayActivityMutationError extends Error {
  readonly outcome: 'conflict' | 'rejected' | 'unknown'
  readonly status?: number
  readonly taskId?: string
  readonly requestId?: string
  readonly gatewayKind: GatewayError['kind']
  constructor(failure: GatewayError, identity: { taskId?: string; requestId?: string }) {
    const conflict = failure.status === 409
    const rejected = ['configuration', 'validation', 'browser-expired', 'upstream-denied'].includes(failure.kind) ||
      (failure.status !== undefined && [400, 401, 403, 404, 413, 422, 429].includes(failure.status))
    super(conflict ? 'The server could not accept this change. Reload the current task and review its state, source and links before trying again.'
      : rejected ? failure.message : 'The change outcome is uncertain. Check its task or request identity before deciding what to do next.')
    this.name = 'GatewayActivityMutationError'
    this.outcome = conflict ? 'conflict' : rejected ? 'rejected' : 'unknown'
    this.status = failure.status
    this.gatewayKind = failure.kind
    this.taskId = identity.taskId
    this.requestId = identity.requestId
  }
}

const invalid = (): never => { throw new GatewayError('invalid-response') }
const inputInvalid = (): never => { throw new GatewayError('validation') }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  return value as Record<string, unknown>
}
function identifier(value: unknown, input = false, minimum = 1): string {
  if (typeof value !== 'string' || value.length < minimum || value.length > 128 || /[^A-Za-z0-9_-]/.test(value)) return input ? inputInvalid() : invalid()
  return value
}
function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || [...value].length > maximum) return invalid()
  return value
}
function integer(value: unknown, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) return invalid()
  return value
}
function timestamp(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 8_640_000_000_000) return invalid()
  return new Date(value * 1000).toISOString()
}
function nullable<T>(value: unknown, parse: (item: unknown) => T): T | null { return value === null ? null : parse(value) }
function boolean(value: unknown): boolean { if (typeof value !== 'boolean') return invalid(); return value }
function list(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) return invalid()
  return value
}
function state(value: unknown): string {
  const parsed = text(value, 64)
  if (!parsed || /[^a-z0-9_]/.test(parsed) || !/^[a-z]/.test(parsed)) return invalid()
  return parsed
}
function contentStatus(value: unknown): GatewayContentStatus {
  if (value !== 'available' && value !== 'forgotten') return invalid()
  return value
}
function taskStatus(value: unknown): GatewayTaskStatus {
  if (value !== 'planned' && value !== 'in_progress' && value !== 'blocked' && value !== 'completed' && value !== 'cancelled') return invalid()
  return value
}
function unique<T>(rows: T[], key: (row: T) => string): T[] {
  if (new Set(rows.map(key)).size !== rows.length) return invalid()
  return rows
}
function ids(value: unknown, maximum: number): string[] { return unique(list(value, maximum).map(item => identifier(item)), item => item) }
function event(value: unknown, forgotten = false): GatewayActivityEvent {
  const row = record(value)
  return { id: identifier(row.id), sequence: integer(row.sequence, 1), kind: state(row.kind), sessionId: identifier(row.session_id),
    taskId: nullable(row.task_id, identifier), runId: nullable(row.run_id, identifier), actionId: nullable(row.action_id, identifier),
    fromStatus: nullable(row.from_status, state), toStatus: nullable(row.to_status, state), revision: nullable(row.revision, item => integer(item, 1)),
    occurredAt: timestamp(row.occurred_at), contentStatus: forgotten ? 'forgotten' : contentStatus(row.content_status) }
}
function orderedEvents(value: unknown, maximum: number, forgotten = false): GatewayActivityEvent[] {
  const rows = unique(list(value, maximum).map(item => event(item, forgotten)), item => item.id)
  if (rows.some((row, index) => index > 0 && row.sequence <= rows[index - 1].sequence)) return invalid()
  return rows
}

function task(value: unknown): GatewayTask {
  const row = record(value), visibility = contentStatus(row.content_status), forgotten = visibility === 'forgotten'
  const taskId = identifier(row.id), sessionId = identifier(row.session_id)
  if (row.agent_id !== 'companion' || row.status_source !== 'owner' || row.provenance !== 'recorded') return invalid()
  const criteria = forgotten ? [] : unique(list(row.criteria, 20).map(item => {
    const criterion = record(item)
    return { id: identifier(criterion.id), text: text(criterion.text, 500) }
  }), item => item.id)
  const outcome = forgotten ? '' : text(row.outcome, 1000)
  if (!forgotten && (!outcome.trim() || !criteria.length || criteria.some(item => !item.text.trim()))) return invalid()
  const completedCriterionIds = forgotten ? [] : ids(row.completed_criterion_ids, 20)
  if (completedCriterionIds.some(item => !criteria.some(criterion => criterion.id === item))) return invalid()
  const changes = orderedEvents(row.changes, 100, forgotten)
  if (changes.some(item => item.taskId !== taskId || item.sessionId !== sessionId)) return invalid()
  return { id: taskId, outcome, criteria, sessionId, agentId: 'companion',
    parentTaskId: nullable(row.parent_task_id, identifier), runIds: ids(row.run_ids, 100),
    status: taskStatus(row.status), statusSource: 'owner', provenance: 'recorded', revision: integer(row.revision, 1),
    createdAt: timestamp(row.created_at), updatedAt: timestamp(row.updated_at), archivedAt: nullable(row.archived_at, timestamp),
    statusNote: forgotten ? '' : text(row.status_note, 2000), completedCriterionIds, contentStatus: visibility,
    changes, changesTruncated: boolean(row.changes_truncated) }
}
function run(value: unknown): GatewayActivityRun {
  const row = record(value), source = record(row.source), sessionId = identifier(row.session_id), visibility = contentStatus(row.content_status)
  if (source.kind !== 'conversation' || identifier(source.session_id) !== sessionId || row.provenance !== 'recorded') return invalid()
  if (visibility === 'available' && list(row.outputs, 0).length) return invalid()
  const action = row.action === null ? null : record(row.action)
  return { id: identifier(row.id), sessionId, status: state(row.status), acted: boolean(row.acted),
    provider: nullable(row.provider, item => text(item, 256)), model: nullable(row.model, item => text(item, 512)),
    startedAt: timestamp(row.started_at), endedAt: nullable(row.ended_at, timestamp),
    taskIds: ids(row.task_ids, 200), action: action && { id: identifier(action.id), state: state(action.state), jobId: nullable(action.job_id, identifier) },
    source: { kind: 'conversation', sessionId }, outputs: [], provenance: 'recorded', contentStatus: visibility }
}
function inputRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) return inputInvalid()
  return value
}
function inputText(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || [...value].length > maximum) return inputInvalid()
  return value.trim()
}
function inputIds(value: unknown, maximum: number): string[] {
  if (!Array.isArray(value) || value.length > maximum) return inputInvalid()
  const result = value.map(item => identifier(item, true))
  if (new Set(result).size !== result.length) return inputInvalid()
  return result
}
function fields(input: { outcome: string; criteria: string[]; parentTaskId?: string | null; runIds?: string[] }): Record<string, unknown> {
  if (!Array.isArray(input.criteria) || input.criteria.length < 1 || input.criteria.length > 20) return inputInvalid()
  const criteria = input.criteria.map(item => inputText(item, 500))
  if (new Set(criteria.map(item => item.toLowerCase())).size !== criteria.length) return inputInvalid()
  return { outcome: inputText(input.outcome, 1000), criteria,
    ...(input.parentTaskId !== undefined ? { parent_task_id: input.parentTaskId === null ? null : identifier(input.parentTaskId, true) } : {}),
    ...(input.runIds !== undefined ? { run_ids: inputIds(input.runIds, 100) } : {}) }
}
function query(options: GatewayEventListOptions, events = false): Record<string, string | number> {
  const limit = options.limit ?? 50
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) return inputInvalid()
  const result: Record<string, string | number> = { limit }
  if (options.cursor !== undefined) {
    if (events) {
      if (typeof options.cursor !== 'string' || !options.cursor || options.cursor.length > 18 || /[^0-9]/.test(options.cursor)) return inputInvalid()
      result.cursor = options.cursor
    } else result.cursor = identifier(options.cursor, true)
  }
  if (options.sessionId !== undefined) result.session_id = identifier(options.sessionId, true)
  if (options.taskId !== undefined) result.task_id = identifier(options.taskId, true)
  if (events && options.runId !== undefined) result.run_id = identifier(options.runId, true)
  return result
}
function signal(options: GatewayActivityOptions) { return options.signal ? { signal: options.signal } : {} }
function page<T>(value: unknown, parse: (item: unknown) => T, requestedLimit: number, events = false): GatewayActivityPage<T> {
  const row = record(value)
  const cursor = row.next_cursor === null ? null : events ? text(row.next_cursor, 18) : identifier(row.next_cursor)
  if (events && cursor !== null && (!cursor || /[^0-9]/.test(cursor))) return invalid()
  return { results: list(row.results, requestedLimit).map(parse), nextCursor: cursor }
}

export function createTaskRequestId(): string { return crypto.randomUUID() }

export function createGatewayActivityClient(auth: Pick<GatewayAuthClient, 'request'>) {
  async function write(path: string, body: Record<string, unknown>, identity: { taskId?: string; requestId?: string; sessionId?: string }, options: GatewayActivityOptions): Promise<GatewayTask> {
    try {
      const result = task(await auth.request(path, { method: 'POST', body, ...signal(options) }))
      if (identity.taskId && result.id !== identity.taskId) return invalid()
      if (identity.sessionId && result.sessionId !== identity.sessionId) return invalid()
      return result
    } catch (error) { throw new GatewayActivityMutationError(gatewayError(error), identity) }
  }
  return {
    async listTasks(options: GatewayTaskListOptions = {}): Promise<GatewayActivityPage<GatewayTask>> {
      const parameters = query(options)
      const result = page(await auth.request('/api/pi/tasks', { query: parameters, ...signal(options) }), task, Number(parameters.limit))
      unique(result.results, item => item.id)
      if (result.results.some(item => options.sessionId !== undefined && item.sessionId !== options.sessionId) ||
        (result.nextCursor !== null && result.nextCursor !== result.results.at(-1)?.id)) return invalid()
      return result
    },
    async getTask(taskId: string, options: GatewayActivityOptions = {}): Promise<GatewayTask> {
      identifier(taskId, true)
      const result = task(await auth.request(`/api/pi/tasks/${taskId}`, signal(options)))
      if (result.id !== taskId) return invalid()
      return result
    },
    async getTaskByRequest(requestId: string, options: GatewayActivityOptions = {}): Promise<GatewayTask> {
      identifier(requestId, true, 16)
      return task(await auth.request(`/api/pi/tasks/requests/${requestId}`, signal(options)))
    },
    async createTask(input: GatewayTaskCreate, options: GatewayActivityOptions = {}): Promise<GatewayTask> {
      const requestId = identifier(input.requestId, true, 16), sessionId = identifier(input.sessionId, true)
      return write('/api/pi/tasks', { ...fields(input), request_id: requestId, session_id: sessionId }, { requestId, sessionId }, options)
    },
    async updateTask(taskId: string, input: GatewayTaskUpdate, options: GatewayActivityOptions = {}): Promise<GatewayTask> {
      identifier(taskId, true)
      if (input.parentTaskId === undefined || input.runIds === undefined) return inputInvalid()
      return write(`/api/pi/tasks/${taskId}/update`, { ...fields(input), expected_revision: inputRevision(input.expectedRevision) }, { taskId }, options)
    },
    async transitionTask(taskId: string, input: GatewayTaskTransition, options: GatewayActivityOptions = {}): Promise<GatewayTask> {
      identifier(taskId, true)
      if (!['planned', 'in_progress', 'blocked', 'completed', 'cancelled'].includes(input.status)) return inputInvalid()
      return write(`/api/pi/tasks/${taskId}/transition`, { expected_revision: inputRevision(input.expectedRevision), status: input.status,
        note: inputText(input.note, 2000), ...(input.completedCriterionIds !== undefined ? { completed_criterion_ids: inputIds(input.completedCriterionIds, 20) } : {}) }, { taskId }, options)
    },
    async archiveTask(taskId: string, input: { expectedRevision: number; archived: boolean }, options: GatewayActivityOptions = {}): Promise<GatewayTask> {
      identifier(taskId, true)
      if (typeof input.archived !== 'boolean') return inputInvalid()
      return write(`/api/pi/tasks/${taskId}/archive`, { expected_revision: inputRevision(input.expectedRevision), archived: input.archived }, { taskId }, options)
    },
    async listRuns(options: GatewayActivityFilterOptions = {}): Promise<GatewayActivityPage<GatewayActivityRun>> {
      const parameters = query(options)
      const result = page(await auth.request('/api/pi/runs', { query: parameters, ...signal(options) }), run, Number(parameters.limit))
      unique(result.results, item => item.id)
      if (result.results.some(item => (options.sessionId !== undefined && item.sessionId !== options.sessionId) || (options.taskId !== undefined && !item.taskIds.includes(options.taskId))) ||
        (result.nextCursor !== null && result.nextCursor !== result.results.at(-1)?.id)) return invalid()
      return result
    },
    async getRun(runId: string, options: GatewayActivityOptions = {}): Promise<GatewayActivityRun> {
      identifier(runId, true)
      const result = run(await auth.request(`/api/pi/runs/${runId}`, signal(options)))
      if (result.id !== runId) return invalid()
      return result
    },
    async listEvents(options: GatewayEventListOptions = {}): Promise<GatewayActivityPage<GatewayActivityEvent>> {
      const parameters = query(options, true)
      const result = page(await auth.request('/api/pi/events', { query: parameters, ...signal(options) }), item => event(item), Number(parameters.limit), true)
      unique(result.results, item => item.id)
      // Event pages are newest first; each task's embedded last-100 changes are oldest first.
      if (result.results.some((item, index) => (index > 0 && item.sequence >= result.results[index - 1].sequence) ||
        (options.sessionId !== undefined && item.sessionId !== options.sessionId) || (options.taskId !== undefined && item.taskId !== null && item.taskId !== options.taskId) || (options.runId !== undefined && item.runId !== options.runId)) ||
        (result.nextCursor !== null && result.nextCursor !== String(result.results.at(-1)?.sequence))) return invalid()
      return result
    },
  }
}
export type GatewayActivityClient = ReturnType<typeof createGatewayActivityClient>
