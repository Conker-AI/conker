import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

const reasons = ['queued', 'retry_scheduled', 'blocked', 'legacy_unknown', 'invalid_receipt', 'privacy_disabled', 'agent_excluded', 'forget_pending', 'forgotten', 'destination_unknown'] as const
export type MemoryDelivery = {
  state: 'pending' | 'saved' | 'filtered' | 'unavailable' | 'excluded' | 'removed'
  reasonCode: typeof reasons[number] | null
  admissionMethod: 'owner_requested' | 'signal' | 'filtered' | null
  memoryId: string | null
}
export type MemoryDeliveryRead = { sessionId: string; forgotten: boolean; results: { messageId: string; delivery: MemoryDelivery }[]; truncated: boolean }
const id = /^[A-Za-z0-9_-]{1,128}$/
const invalid = (): never => { throw new GatewayError('invalid-response') }
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : invalid()
}

/** Only validated acknowledgement metadata can become a positive UI receipt. */
export function parseMemoryDelivery(value: unknown): MemoryDelivery {
  const row = object(value)
  if (!['pending', 'saved', 'filtered', 'unavailable', 'excluded', 'removed'].includes(String(row.state)) ||
    row.reason_code !== null && !reasons.includes(row.reason_code as typeof reasons[number]) ||
    row.admission_method !== null && !['owner_requested', 'signal', 'filtered'].includes(String(row.admission_method))) return invalid()
  if (row.state === 'saved') {
    if (typeof row.memory_id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(row.memory_id) || row.admission_method === 'filtered') return invalid()
  } else if (row.memory_id !== null) return invalid()
  if ((row.state === 'saved' || row.state === 'filtered') && row.reason_code !== null) return invalid()
  if (row.state === 'filtered' ? row.admission_method !== null && row.admission_method !== 'filtered' : row.state !== 'saved' && row.admission_method !== null) return invalid()
  return { state: row.state as MemoryDelivery['state'], reasonCode: row.reason_code as MemoryDelivery['reasonCode'], admissionMethod: row.admission_method as MemoryDelivery['admissionMethod'], memoryId: row.memory_id as string | null }
}

export function parseMemoryDeliveryRead(value: unknown, sessionId: string, messageId?: string): MemoryDeliveryRead {
  const row = object(value)
  if (row.schemaVersion !== 1 || row.session_id !== sessionId || !['available', 'forgotten'].includes(String(row.content_status)) || typeof row.truncated !== 'boolean') return invalid()
  // Even malformed tombstones must not restore old receipt identities.
  if (row.content_status === 'forgotten') return { sessionId, forgotten: true, results: [], truncated: false }
  if (!Array.isArray(row.results) || row.results.length > (messageId ? 1 : 100) || messageId && row.truncated) return invalid()
  const seen = new Set<string>()
  const results = row.results.map(value => {
    const item = object(value)
    if (typeof item.message_id !== 'string' || !id.test(item.message_id) || seen.has(item.message_id) || messageId && item.message_id !== messageId) return invalid()
    seen.add(item.message_id)
    return { messageId: item.message_id, delivery: parseMemoryDelivery(item) }
  })
  return { sessionId, forgotten: false, results, truncated: row.truncated }
}

export function createMemoryDeliveryClient(auth: Pick<GatewayAuthClient, 'request'>) {
  return async (sessionId: string, options: { messageId?: string; signal?: AbortSignal } = {}) => {
    if (!id.test(sessionId) || options.messageId !== undefined && !id.test(options.messageId)) throw new GatewayError('validation')
    const path = `/api/pi/sessions/${sessionId}${options.messageId ? `/messages/${options.messageId}` : ''}/memory-delivery`
    return parseMemoryDeliveryRead(await auth.request(path, { signal: options.signal }), sessionId, options.messageId)
  }
}
