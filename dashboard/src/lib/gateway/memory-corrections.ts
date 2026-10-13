import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

const memoryId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$(?![\s\S])/)
const requestId = z.string().regex(/^[A-Za-z0-9_-]{16,128}$(?![\s\S])/)
const revision = z.number().int().min(1).max(2147483646)
const hash = z.string().length(64).regex(/^[a-f0-9]{64}$/)
const bounded = (max: number) => z.string().refine(value => [...value].length <= max && !value.includes('\0') && !/[\uD800-\uDFFF]/u.test(value))
const text = bounded(16000).refine(value => value.trim().length > 0)
const snapshot = z.object({ schemaVersion: z.literal(1), memoryId, revision, text, sourceType: bounded(100), confidence: bounded(100) }).strict()
const pendingRecord = z.object({ requestId, memoryId, expectedRevision: revision, payloadHash: hash, status: z.enum(['applying', 'unknown']) }).strict()
const pending = z.object({ schemaVersion: z.literal(1), pending: pendingRecord.nullable() }).strict()
const receipt = z.object({ schemaVersion: z.literal(1), requestId, memoryId, previousRevision: revision, payloadHash: hash,
  status: z.enum(['applying', 'unknown', 'applied', 'rejected']), revision: z.number().int().min(1).max(2147483647).nullable(), indexing: z.enum(['pending', 'indexed', 'degraded']).nullable(),
  errorCode: z.enum(['revision_conflict', 'not_found', 'unavailable', 'memory_forgotten']).nullable(), cachedPackagesCleared: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), sourceConversationKept: z.literal(true),
}).strict().refine(value => value.status === 'applied' ? value.revision === value.previousRevision + 1 && value.indexing !== null && value.errorCode === null : value.status === 'rejected' ? value.revision === null && value.indexing === null && value.errorCode !== null : value.revision === null && value.indexing === null && value.errorCode === null)
const applyBody = z.object({ request_id: requestId, memory_id: memoryId, expected_revision: revision, text }).strict()
export type MemoryCorrectionSnapshot = z.infer<typeof snapshot>
export type MemoryCorrectionPending = z.infer<typeof pendingRecord>
export type MemoryCorrectionReceipt = z.infer<typeof receipt>
export type MemoryCorrectionApply = z.infer<typeof applyBody>
export type MemoryCorrectionIdentity = Pick<MemoryCorrectionPending, 'requestId' | 'memoryId' | 'expectedRevision'> & { payloadHash: string | null }
function parse<T>(schema: z.ZodType<T>, value: unknown, input = false): T { const result = schema.safeParse(value); if (!result.success) throw new GatewayError(input ? 'validation' : 'invalid-response'); return result.data }
export function correctionTextValid(value: string) { return text.safeParse(value).success }
export function createMemoryCorrectionsClient(auth: Pick<GatewayAuthClient, 'request'>) {
  const base = '/api/control/pi/memory/corrections'
  const checkedReceipt = (value: unknown, expected: MemoryCorrectionIdentity) => {
    const result = parse(receipt, value)
    if (result.requestId !== expected.requestId || result.memoryId !== expected.memoryId || result.previousRevision !== expected.expectedRevision || expected.payloadHash !== null && result.payloadHash !== expected.payloadHash) throw new GatewayError('invalid-response')
    return result
  }
  return {
    async snapshot(id: string, signal?: AbortSignal) { const expected = parse(memoryId, id, true), value = parse(snapshot, await auth.request(`${base}/memories/${expected}`, { signal })); if (value.memoryId !== expected) throw new GatewayError('invalid-response'); return value },
    async pending(signal?: AbortSignal) { return parse(pending, await auth.request(`${base}/pending`, { signal })).pending },
    async status(expected: MemoryCorrectionIdentity, signal?: AbortSignal) { const frozen = { ...expected }; parse(requestId, frozen.requestId, true); return checkedReceipt(await auth.request(`${base}/${frozen.requestId}`, { signal }), frozen) },
    async apply(input: MemoryCorrectionApply, signal?: AbortSignal, onDispatch?: () => void) {
      const body = parse(applyBody, input, true)
      if (!correctionTextValid(body.text)) throw new GatewayError('too-large')
      return checkedReceipt(await auth.request(base, { method: 'POST', body, signal, onDispatch }), { requestId: body.request_id, memoryId: body.memory_id, expectedRevision: body.expected_revision, payloadHash: null })
    },
    async retry(expected: MemoryCorrectionIdentity, signal?: AbortSignal, onDispatch?: () => void) {
      const frozen = { ...expected }; parse(requestId, frozen.requestId, true); const payloadHash = parse(hash, frozen.payloadHash, true)
      return checkedReceipt(await auth.request(`${base}/${frozen.requestId}/retry`, { method: 'POST', body: { expected_payload_hash: payloadHash }, signal, onDispatch }), frozen)
    },
  }
}
export type MemoryCorrectionsClient = ReturnType<typeof createMemoryCorrectionsClient>
