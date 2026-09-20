import type { GatewayAuthClient } from './auth'
import { GatewayError, gatewayError } from './transport'

/** Pi records, independent of the dashboard's preview Snapshot and simulated streams. */
export type RuntimeSession = {
  id: string; parentId: string | null; title: string
  status: 'open' | 'forked' | 'closed' | 'forgotten'
  createdAt: string; closedAt: string | null; summary: string | null
}
export type RuntimeMessage = {
  id: string; sessionId: string; sequence: number
  role: 'user' | 'assistant' | 'system' | 'tool'; createdAt: string
  content: { kind: 'text'; text: string } | { kind: 'unavailable'; reason: 'forgotten' | 'unsupported' }
}
export type RuntimeMemory = {
  configured: boolean; pendingIngestion: number; blockedDelivery: number
  pendingDeletion: number; notices: string[]
}
export type RuntimeTurn = {
  id: string; sessionId: string
  /** Persisted Pi status, including parked/action-uncertain states. Never inferred from HTTP success. */
  status: string; acted: boolean; startedAt: string; endedAt: string | null
  provider: string | null; model: string | null
  inputTokens: number | null; outputTokens: number | null; costUsd: number | null
  detail: string | null; action: { id: string; state: string; jobId: string | null } | null
  memory: RuntimeMemory
}
export type RuntimeSessionDetail = RuntimeSession & {
  messages: RuntimeMessage[]; turns: RuntimeTurn[]; memory: RuntimeMemory
}
export type RuntimeTurnReceipt = {
  requestedSessionId: string; sessionId?: string; forkedFrom?: string
  turnId: string; status?: string; acted?: boolean
  /** The caller must explicitly reload persisted detail; a receipt is not a transcript or completion claim. */
  requiresReconciliation: true
}
export class RuntimeMutationError extends Error {
  readonly outcome: 'rejected' | 'unknown'
  readonly status?: number
  readonly turnId?: string
  readonly sessionId?: string
  readonly gatewayKind: GatewayError['kind']
  constructor(error: GatewayError, sessionId?: string) {
    const rejected = ['configuration', 'validation', 'browser-expired', 'upstream-denied'].includes(error.kind) ||
      (error.status !== undefined && [400, 401, 403, 404, 413, 422, 429].includes(error.status))
    super(rejected ? error.message : 'The operation outcome is uncertain. Refresh the conversation before deciding whether to try again.')
    this.name = 'RuntimeMutationError'
    this.outcome = rejected ? 'rejected' : 'unknown'
    this.status = error.status
    this.gatewayKind = error.kind
    this.sessionId = sessionId
    this.turnId = error.turnId
  }
}

const ID = /^[A-Za-z0-9_-]{1,128}$/
const bad = (): never => { throw new GatewayError('invalid-response') }
function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return bad()
  return value as Record<string, unknown>
}
function text(value: unknown, max = 16_000): string {
  if (typeof value !== 'string' || value.length > max) return bad()
  return value
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !ID.test(value)) return bad()
  return value
}
function inputId(value: string): string {
  if (typeof value !== 'string' || !ID.test(value)) throw new GatewayError('validation')
  return value
}
function nullable<T>(value: unknown, parse: (item: unknown) => T): T | null { return value === null ? null : parse(value) }
function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return bad()
  return value
}
function count(value: unknown): number {
  const parsed = number(value)
  if (!Number.isSafeInteger(parsed)) return bad()
  return parsed
}
function date(value: unknown): string {
  const parsed = number(value)
  if (parsed > 8_640_000_000_000) return bad()
  return new Date(parsed * 1000).toISOString()
}
function bool(value: unknown): boolean { if (typeof value !== 'boolean') return bad(); return value }
function array(value: unknown, max = 4000): unknown[] {
  if (!Array.isArray(value) || value.length > max) return bad()
  return value
}
function state(value: unknown): string {
  const parsed = text(value, 64)
  if (!/^[a-z][a-z0-9_]*$/.test(parsed)) return bad()
  return parsed
}
function session(value: unknown): RuntimeSession {
  const row = record(value)
  const status = row.status
  if (status !== 'open' && status !== 'forked' && status !== 'closed' && status !== 'forgotten') return bad()
  return { id: id(row.id), parentId: nullable(row.parent_id, id), title: status === 'forgotten' ? '' : text(row.title), status,
    createdAt: date(row.created_at), closedAt: nullable(row.closed_at, date), summary: status === 'forgotten' ? null : nullable(row.summary, text) }
}
function memory(value: unknown): RuntimeMemory {
  const row = record(value)
  return { configured: bool(row.configured), pendingIngestion: count(row.pending_ingestion),
    blockedDelivery: count(row.blocked_delivery), pendingDeletion: count(row.pending_deletion),
    notices: array(row.notices, 32).map(item => text(item, 4096)) }
}
function message(value: unknown, sessionId: string, forgotten = false): RuntimeMessage {
  const row = record(value)
  if (id(row.session_id) !== sessionId) return bad()
  const role = row.role
  if (role !== 'user' && role !== 'assistant' && role !== 'system' && role !== 'tool') return bad()
  // Even a malformed server tombstone containing old text must never return that text.
  const content: RuntimeMessage['content'] = forgotten || row.content_status === 'forgotten'
    ? { kind: 'unavailable', reason: 'forgotten' }
    : row.content_status === undefined && typeof row.content === 'string' && row.content.length <= 65_536
      ? { kind: 'text', text: row.content }
      : { kind: 'unavailable', reason: 'unsupported' }
  const sequence = count(row.seq)
  if (sequence < 1) return bad()
  return { id: id(row.id), sessionId, sequence, role, createdAt: date(row.created_at), content }
}
function turn(value: unknown, sessionId: string, forgotten = false): RuntimeTurn {
  const row = record(value)
  if (id(row.session_id) !== sessionId || (row.acted !== 0 && row.acted !== 1)) return bad()
  const action = row.action === null ? null : record(row.action)
  return { id: id(row.id), sessionId, status: state(row.status), acted: row.acted === 1,
    startedAt: date(row.started_at), endedAt: nullable(row.ended_at, date),
    provider: nullable(row.provider, item => text(item, 256)), model: nullable(row.model, item => text(item, 512)),
    inputTokens: nullable(row.input_tokens, count), outputTokens: nullable(row.output_tokens, count),
    costUsd: nullable(row.cost_usd, number), detail: forgotten ? null : nullable(row.detail, text),
    action: action && { id: id(action.id), state: state(action.state), jobId: nullable(action.job_id, id) }, memory: memory(row.memory) }
}
function unique<T extends { id: string }>(rows: T[]): T[] {
  if (new Set(rows.map(row => row.id)).size !== rows.length) return bad()
  return rows
}

export function createGatewayRuntimeClient(auth: Pick<GatewayAuthClient, 'request'>) {
  return {
    async listSessions(options: { signal?: AbortSignal } = {}): Promise<RuntimeSession[]> {
      const response = await auth.request('/api/pi/sessions', { query: { limit: 200 }, ...(options.signal ? { signal: options.signal } : {}) })
      return unique(array(response.results, 200).map(session))
    },
    async getSession(sessionId: string, options: { signal?: AbortSignal } = {}): Promise<RuntimeSessionDetail> {
      inputId(sessionId)
      const response = await auth.request(`/api/pi/sessions/${sessionId}`, { ...(options.signal ? { signal: options.signal } : {}) })
      const parsed = session(response)
      if (parsed.id !== sessionId) return bad()
      const forgotten = parsed.status === 'forgotten'
      const messages = unique(array(response.messages).map(item => message(item, sessionId, forgotten)))
      if (messages.some((item, index) => index > 0 && item.sequence <= messages[index - 1].sequence)) return bad()
      return { ...parsed, messages, turns: unique(array(response.turns).map(item => turn(item, sessionId, forgotten))), memory: memory(response.memory) }
    },
    async createSession(title = '', options: { signal?: AbortSignal } = {}): Promise<{ sessionId: string }> {
      if (typeof title !== 'string' || title.length > 1024) throw new GatewayError('validation')
      try {
        const response = await auth.request('/api/pi/sessions', { method: 'POST', body: { title }, ...(options.signal ? { signal: options.signal } : {}) })
        return { sessionId: id(response.session_id) }
      } catch (error) { throw new RuntimeMutationError(gatewayError(error)) }
    },
    async submitTurn(sessionId: string, userText: string, options: { signal?: AbortSignal } = {}): Promise<RuntimeTurnReceipt> {
      inputId(sessionId)
      if (typeof userText !== 'string' || !userText.trim() || [...userText].length > 16_000) throw new GatewayError('validation')
      try {
        const response = await auth.request(`/api/pi/sessions/${sessionId}/turns`, { method: 'POST', body: { text: userText }, ...(options.signal ? { signal: options.signal } : {}) })
        return { requestedSessionId: sessionId, turnId: id(response.turn_id), requiresReconciliation: true,
          ...(response.session_id !== undefined ? { sessionId: id(response.session_id) } : {}),
          ...(response.forked_from != null ? { forkedFrom: id(response.forked_from) } : {}),
          ...(response.status !== undefined ? { status: state(response.status) } : {}),
          ...(response.acted !== undefined ? { acted: bool(response.acted) } : {}) }
      } catch (error) { throw new RuntimeMutationError(gatewayError(error), sessionId) }
    },
  }
}
export type GatewayRuntimeClient = ReturnType<typeof createGatewayRuntimeClient>
