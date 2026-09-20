import type { GatewayAuthClient } from './auth'
import { GatewayError, gatewayError } from './transport'

export type OwnerDecision = 'approved' | 'rejected' | 'dismissed'
export type OwnerRequestStatus = 'pending' | OwnerDecision | 'cancelled'
export type OwnerUnavailableReason = 'invalid_origin' | 'invalid_action' | 'arguments_unavailable' | 'unsupported_subject' | 'expired' | 'consumed' | 'already_decided'
export type OwnerRequest = {
  id: string; kind: 'verification'; title: string; details: string; actor: string; severity: string
  status: OwnerRequestStatus; createdAt: string; updatedAt: string
  decision: { status: OwnerRequestStatus; actor: string; note: string; at: string } | null
  action: { subjectType: string | null; subjectId: string | null; version: number | null; args: Record<string, unknown> | null }
  approval: { expiresAt: string | null; consumedAt: string | null; originValid: boolean }
  reviewable: boolean; unavailableReason: OwnerUnavailableReason | null
}
export type OwnerRequestPage = { results: OwnerRequest[]; nextCursor: string | null }
const statuses = new Set(['pending', 'approved', 'rejected', 'dismissed', 'cancelled'])
const reasons = new Set(['invalid_origin', 'invalid_action', 'arguments_unavailable', 'unsupported_subject', 'expired', 'consumed', 'already_decided'])
const fail = (): never => { throw new GatewayError('invalid-response') }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail()
  return value as Record<string, unknown>
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || [...value].length > max) return fail()
  return value
}
function identity(value: unknown, input = false): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    if (input) throw new GatewayError('validation')
    return fail()
  }
  return value
}
function date(value: unknown): string {
  const raw = text(value, 64)
  if (!Number.isFinite(Date.parse(raw))) return fail()
  return raw
}
const optionalDate = (value: unknown) => value === null ? null : date(value)
function jsonArgs(value: unknown): Record<string, unknown> | null {
  if (value === null) return null
  const root = record(value)
  let entries = 0
  function check(item: unknown, depth: number): void {
    if (++entries > 4096 || depth > 16) fail()
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return
    if (typeof item === 'number' && Number.isFinite(item) && (!Number.isInteger(item) || Number.isSafeInteger(item))) return
    if (typeof item !== 'object') fail()
    for (const child of Object.values(item as object)) check(child, depth + 1)
  }
  check(root, 0)
  const encoded = JSON.stringify(root)
  if (new TextEncoder().encode(encoded).length > 32768) fail()
  return JSON.parse(encoded) as Record<string, unknown>
}
export function parseOwnerRequest(value: unknown, expectedId?: string): OwnerRequest {
  const row = record(value), action = record(row.action), approval = record(row.approval)
  const id = identity(row.id)
  if (expectedId && expectedId !== id || row.kind !== 'verification' || !statuses.has(String(row.status)) ||
    typeof row.reviewable !== 'boolean' || typeof approval.origin_valid !== 'boolean' ||
    row.unavailable_reason !== null && !reasons.has(String(row.unavailable_reason))) return fail()
  const version = action.version
  if (version !== null && (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1)) return fail()
  const result: OwnerRequest = {
    id, kind: 'verification', title: text(row.title, 1024), details: text(row.details, 8192), actor: text(row.actor, 256), severity: text(row.severity, 32),
    status: row.status as OwnerRequestStatus, createdAt: date(row.created_at), updatedAt: date(row.updated_at), decision: null,
    action: { subjectType: action.subject_type === null ? null : text(action.subject_type, 64), subjectId: action.subject_id === null ? null : text(action.subject_id, 256), version, args: jsonArgs(action.args) },
    approval: { expiresAt: optionalDate(approval.expires_at), consumedAt: optionalDate(approval.consumed_at), originValid: approval.origin_valid },
    reviewable: row.reviewable, unavailableReason: row.unavailable_reason as OwnerUnavailableReason | null,
  }
  if (row.decision !== null) {
    const decision = record(row.decision)
    if (!statuses.has(String(decision.status)) || decision.status !== result.status) return fail()
    result.decision = { status: decision.status as OwnerRequestStatus, actor: text(decision.actor, 256), note: text(decision.note, 2000), at: date(decision.at) }
  }
  if (result.reviewable && (result.status !== 'pending' || !result.approval.originValid || result.approval.consumedAt !== null || !result.approval.expiresAt ||
    result.unavailableReason !== null || result.action.subjectType !== 'tool' || !result.action.subjectId || result.action.args === null || result.action.version === null)) fail()
  return result
}

export class OwnerDecisionError extends Error {
  readonly outcome: 'rejected' | 'conflict' | 'unknown'
  readonly requestId: string
  constructor(error: unknown, requestId: string) {
    const failure = gatewayError(error)
    const rejected = ['configuration', 'validation', 'browser-expired', 'upstream-denied', 'verification-cancelled', 'verification-required'].includes(failure.kind) ||
      failure.status !== undefined && [400, 401, 403, 404, 413, 422, 428, 429].includes(failure.status)
    const outcome = failure.status === 409 ? 'conflict' : rejected ? 'rejected' : 'unknown'
    super(outcome === 'conflict' ? 'This request changed or is no longer eligible. Check its current record before deciding.' : outcome === 'rejected' ? failure.message : 'The decision outcome is uncertain. Check the saved request before taking another action.')
    this.name = 'OwnerDecisionError'; this.outcome = outcome; this.requestId = requestId
  }
}

export function createGatewayOwnerClient(auth: Pick<GatewayAuthClient, 'request'>) {
  return {
    async listRequests(options: { limit?: number; cursor?: string; signal?: AbortSignal } = {}): Promise<OwnerRequestPage> {
      const limit = options.limit ?? 50
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new GatewayError('validation')
      const response = record(await auth.request('/api/owner/requests', { query: { limit, ...(options.cursor ? { cursor: identity(options.cursor, true) } : {}) }, signal: options.signal }))
      if (!Array.isArray(response.results) || response.results.length > limit) return fail()
      const results = response.results.map(value => parseOwnerRequest(value))
      if (new Set(results.map(row => row.id)).size !== results.length) return fail()
      return { results, nextCursor: response.next_cursor === null ? null : identity(response.next_cursor) }
    },
    async getRequest(id: string, options: { signal?: AbortSignal } = {}): Promise<OwnerRequest> {
      identity(id, true)
      return parseOwnerRequest(await auth.request(`/api/owner/requests/${id}`, options), id)
    },
    async decide(id: string, status: OwnerDecision, note: string, options: { signal?: AbortSignal } = {}): Promise<OwnerRequest> {
      identity(id, true)
      if (!['approved', 'rejected', 'dismissed'].includes(status) || typeof note !== 'string' || [...note].length > 2000) throw new GatewayError('validation')
      try {
        const result = parseOwnerRequest(await auth.request(`/api/owner/requests/${id}/decision`, { method: 'POST', body: { status, note }, signal: options.signal }), id)
        if (result.status !== status || !result.decision) return fail()
        return result
      } catch (error) { throw new OwnerDecisionError(error, id) }
    },
  }
}
export type GatewayOwnerClient = ReturnType<typeof createGatewayOwnerClient>
