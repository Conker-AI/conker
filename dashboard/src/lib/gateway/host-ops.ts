import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError, gatewayError } from './transport'

/**
 * Server actions through the host helper (ADR-0014), as the gateway passes them on: two reads
 * (services.status, backup.list) with the signed-in session, three actions (backup.verify,
 * services.restart, backup.run) with the password bound to the exact request, and the receipts.
 * Shapes are exactly the helper's; the browser makes each action's id, so a retry with the same id
 * returns the same receipt and never runs it twice.
 */
export const HOST_OP_ID = /^[A-Za-z0-9_.:-]{16,128}$/
const SERVICE = /^[a-z][a-z0-9-]{0,62}$/
const SNAPSHOT = /^snapshot-\d{8}T\d{6}Z-[0-9a-f]{8}$/
const VALUE = /^[A-Za-z0-9_.:-]{1,128}$/
const time = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/)

const service = z.object({
  service: z.string().regex(SERVICE),
  state: z.enum(['created', 'running', 'restarting', 'paused', 'exited', 'removing', 'dead', 'unknown']),
  health: z.enum(['healthy', 'unhealthy', 'starting', 'none']),
  startedAt: time.nullable(), restarts: z.number().int().nonnegative(), oneShot: z.boolean(),
}).strict()
const holds = { backupLock: z.boolean(), recoveryHeld: z.boolean() }
const servicesStatus = z.object({ services: z.array(service).max(64), ...holds }).strict()
const backupList = z.object({
  destination: z.string().min(1).max(4096).nullable(), retentionCopies: z.number().int().positive().nullable(),
  ready: z.boolean(), separateDisk: z.boolean().nullable(), freeBytes: z.number().finite().nonnegative().nullable(),
  snapshots: z.array(z.object({ name: z.string().regex(SNAPSHOT), createdAt: time }).strict()).max(100),
  partialSnapshots: z.number().int().nonnegative(), ...holds,
}).strict()
const operationName = z.string().regex(/^[a-z]+(?:\.[a-z]+)+$/)
const argumentsRecord = z.record(z.string().max(64), z.string().regex(VALUE))
const receipt = z.object({
  id: z.string().regex(HOST_OP_ID), operation: operationName, arguments: argumentsRecord,
  argumentsDigest: z.string().regex(/^[0-9a-f]{64}$/), source: z.enum(['ui', 'cli']),
  startedAt: z.string().max(64), endedAt: z.string().max(64).nullable(),
  outcome: z.enum(['working', 'done', 'failed', 'unknown']), reason: z.string().max(600).nullable(),
  check: z.object({ operation: operationName, arguments: argumentsRecord }).strict().nullable(),
}).strict()
const receipts = z.object({ schemaVersion: z.literal(1), operations: z.array(receipt).max(200), damagedRecords: z.number().int().nonnegative() }).strict()

export type HostService = z.infer<typeof service>
export type HostServicesStatus = z.infer<typeof servicesStatus>
export type HostBackupList = z.infer<typeof backupList>
export type HostReceipt = z.infer<typeof receipt>
export type HostReceipts = z.infer<typeof receipts>
export type HostAction =
  | { operation: 'services.restart'; arguments: { service: string } }
  | { operation: 'backup.verify'; arguments: { snapshot: string } }
  | { operation: 'backup.run'; arguments: Record<string, never> }

function parse<T>(schema: z.ZodType<T>, value: unknown, input = false): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new GatewayError(input ? 'validation' : 'invalid-response')
  return result.data
}

const action = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('services.restart'), arguments: z.object({ service: z.string().regex(SERVICE) }).strict() }).strict(),
  z.object({ operation: z.literal('backup.verify'), arguments: z.object({ snapshot: z.string().regex(SNAPSHOT) }).strict() }).strict(),
  z.object({ operation: z.literal('backup.run'), arguments: z.object({}).strict() }).strict(),
])

export function createHostOpId() {
  return `ui_${globalThis.crypto.randomUUID().replaceAll('-', '')}`
}

export function createGatewayHostOpsClient(auth: Pick<GatewayAuthClient, 'request'>) {
  // A function declaration, not a generic arrow, so checks that read this file as TSX parse it.
  async function read<T>(operation: 'services.status' | 'backup.list', schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
    const value = await auth.request('/api/host/read', { method: 'POST', body: { operation, arguments: {} }, signal })
    if (value.operation !== operation) throw new GatewayError('invalid-response')
    return parse(schema, value.result)
  }
  return {
    status: (signal?: AbortSignal) => read('services.status', servicesStatus, signal),
    backups: (signal?: AbortSignal) => read('backup.list', backupList, signal),
    async receipts(signal?: AbortSignal): Promise<HostReceipts> {
      return parse(receipts, await auth.request('/api/host/ops', { signal }))
    },
    async receipt(id: string, signal?: AbortSignal): Promise<HostReceipt> {
      const selected = parse(z.string().regex(HOST_OP_ID), id, true)
      const value = parse(receipt, await auth.request(`/api/host/ops/${selected}`, { signal }))
      if (value.id !== selected) throw new GatewayError('invalid-response')
      return value
    },
    /** Asks for the password (bound to this exact id, operation and arguments), then starts it. */
    async start(id: string, value: HostAction, options: { signal?: AbortSignal; onDispatch?: () => void } = {}): Promise<HostReceipt> {
      const selected = parse(z.string().regex(HOST_OP_ID), id, true), requested = parse(action, value, true)
      const answer = parse(receipt, await auth.request('/api/host/ops', { method: 'POST', body: { id: selected, operation: requested.operation, arguments: requested.arguments }, ...options }))
      if (answer.id !== selected || answer.operation !== requested.operation) throw new GatewayError('invalid-response')
      return answer
    },
  }
}
export type GatewayHostOpsClient = ReturnType<typeof createGatewayHostOpsClient>

export type HostProblem =
  /** The helper (or Docker behind it) did not answer: nothing ran; the CLI still works. */
  | { kind: 'unavailable'; message: string | null }
  /** Another action, a backup lock or a held recovery: nothing ran; wait. */
  | { kind: 'busy'; message: string | null }
  /** The helper turned this one down for a reason it names: nothing ran. */
  | { kind: 'refused'; message: string | null }
  /** Never left the browser (the password step stopped it, or it was not allowed here). */
  | { kind: 'not-sent'; message: string }
  /** The receipt is not in the journal. */
  | { kind: 'not-found'; message: null }
  /** Sent, but the answer was lost: it may or may not have started. */
  | { kind: 'lost'; message: null }
  /** Any other refusal by the gateway: nothing ran. */
  | { kind: 'denied'; message: string }

const NOT_SENT = new Set(['verification-cancelled', 'verification-password', 'verification-required', 'verification-failed', 'validation', 'too-large', 'configuration', 'browser-expired'])
/** Plain words for a failed host request; `write` marks a start, where a lost answer is unknown. */
export function hostProblem(error: unknown, write = false): HostProblem {
  const failure = gatewayError(error)
  const message = failure.detail ?? null
  if (failure.code === 'host_unavailable') return { kind: 'unavailable', message }
  if (failure.code === 'host_busy') return { kind: 'busy', message }
  if (failure.code === 'host_operation_refused') return { kind: 'refused', message }
  if (failure.code === 'unknown_operation_id' || (!write && failure.status === 404)) return { kind: 'not-found', message: null }
  if (NOT_SENT.has(failure.kind)) return { kind: 'not-sent', message: failure.message }
  // A read that failed changed nothing; a start whose answer never came back may have begun.
  if (write && ['network', 'aborted', 'session-changed', 'invalid-response', 'response-too-large', 'dependency'].includes(failure.kind)) return { kind: 'lost', message: null }
  // Without the helper's own code, a 503 on a read is the gateway saying it could not reach the helper.
  if (failure.status === 503) return { kind: 'unavailable', message: null }
  return { kind: 'denied', message: failure.message }
}
