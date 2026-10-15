import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const amount = z.number().finite().nonnegative()
export const usageFields = ['input_tokens', 'output_tokens', 'cached_tokens', 'cost_usd', 'summed_call_ms'] as const
export type UsageField = typeof usageFields[number]
const totals = z.object({ input_tokens: count.nullable(), output_tokens: count.nullable(), cached_tokens: count.nullable(), cost_usd: amount.nullable(), summed_call_ms: count.nullable() })
const completeness = z.object({ input_tokens: z.boolean(), output_tokens: z.boolean(), cached_tokens: z.boolean(), cost_usd: z.boolean(), summed_call_ms: z.boolean() })
const unknown = z.object({ input_tokens: count, output_tokens: count, cached_tokens: count, cost_usd: count, summed_call_ms: count })
const lane = z.object({ attempt_count: count, pending_count: count, reported_count: count, failed_count: count, totals, known_subtotal: totals, complete: completeness, unknown_counts: unknown })
const label = (max: number) => z.string().min(1).max(max * 2).refine(value => [...value].length <= max)
const attempt = z.object({
  id, lane: z.enum(['foreground', 'thinking']), role: z.enum(['answer', 'thinking', 'routing', 'context-selection', 'summarization', 'memory-ranking', 'search-ranking', 'proposals']),
  provider_id: label(100).nullable(), model_id: label(200).nullable(), provider: label(100), model: label(300), actual_provider: label(100).nullable(), actual_model: label(300).nullable(),
  status: z.enum(['pending', 'reported', 'failed']), failure_kind: z.enum(['provider_error', 'cancelled', 'timeout', 'preempted', 'interrupted']).nullable(),
  started_at: amount, ended_at: amount.nullable(), elapsed_ms: count.nullable(),
  input_tokens: count.nullable(), output_tokens: count.nullable(), cached_tokens: count.nullable(), cost_usd: amount.nullable(),
})
const receipt = z.object({ schemaVersion: z.literal(1), turn_id: id, session_id: id, content_status: z.literal('available'), scope: z.literal('turn_provider_attempts'), coverage: z.enum(['complete', 'legacy_partial']), foreground: lane, thinking: lane, attempts: z.array(attempt).max(100), attempts_truncated: z.boolean() })
export type TurnUsage = z.infer<typeof receipt>
export type UsageLane = z.infer<typeof lane>
export type UsageAttempt = z.infer<typeof attempt>

/** Validate identity and completeness before any numeric value is presented as a total. */
export function parseTurnUsage(value: unknown, turnId: string, sessionId: string): TurnUsage {
  const parsed = receipt.safeParse(value)
  if (!parsed.success) throw new GatewayError('invalid-response')
  const data = parsed.data
  const invalid = () => { throw new GatewayError('invalid-response') }
  if (data.turn_id !== turnId || data.session_id !== sessionId) invalid()
  for (const summary of [data.foreground, data.thinking]) {
    if (summary.pending_count + summary.reported_count + summary.failed_count !== summary.attempt_count) invalid()
    for (const field of usageFields) {
      const missing = summary.unknown_counts[field], complete = summary.complete[field]
      if (missing > summary.attempt_count || (data.coverage === 'legacy_partial' && complete)) invalid()
      if (complete ? missing !== 0 || summary.known_subtotal[field] === null || summary.totals[field] !== summary.known_subtotal[field] : summary.totals[field] !== null) invalid()
      if (missing === summary.attempt_count && summary.known_subtotal[field] !== 0) invalid()
    }
  }
  if (new Set(data.attempts.map(row => row.id)).size !== data.attempts.length) invalid()
  for (const [index, row] of data.attempts.entries()) {
    const previous = data.attempts[index - 1]
    if (previous && (row.started_at < previous.started_at || row.started_at === previous.started_at && row.id < previous.id)) invalid()
  }
  for (const name of ['foreground', 'thinking'] as const) {
    const shown = data.attempts.filter(row => row.lane === name).length
    if (shown > data[name].attempt_count || !data.attempts_truncated && shown !== data[name].attempt_count) invalid()
  }
  return data
}

export function createGatewayTurnUsageClient(auth: Pick<GatewayAuthClient, 'request'>) {
  return {
    async get(turnId: string, sessionId: string, options: { signal?: AbortSignal } = {}): Promise<TurnUsage> {
      if (!id.safeParse(turnId).success || !id.safeParse(sessionId).success) throw new GatewayError('validation')
      if (options.signal?.aborted) throw new GatewayError('aborted')
      const response = await auth.request(`/api/pi/turns/${turnId}/usage`, options)
      if (options.signal?.aborted) throw new GatewayError('aborted')
      return parseTurnUsage(response, turnId, sessionId)
    },
  }
}
export type GatewayTurnUsageClient = ReturnType<typeof createGatewayTurnUsageClient>
