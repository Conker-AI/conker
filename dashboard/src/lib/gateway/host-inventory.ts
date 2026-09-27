import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

const requestId = z.string().regex(/^[A-Za-z0-9_-]{16,100}$/)
const errorCode = z.enum([
  'process_identity_unavailable', 'process_changed_during_collection', 'process_unavailable',
  'collection_failed', 'process_link_unavailable', 'listener_collection_failed',
  'container_identity_unavailable', 'invalid_container_binding', 'container_unavailable',
  'container_bindings_unavailable', 'client_close_failed',
])
const section = z.object({ status: z.enum(['ok', 'partial', 'unavailable']), truncated: z.boolean(), errors: z.array(errorCode).max(16) }).strict()
const capabilities = z.object({
  inspection: z.literal(true), processActions: z.literal(false), containerActions: z.literal(false),
  portMutation: z.literal(false), terminal: z.literal(false), files: z.literal(false),
}).strict()
const observation = z.object({
  mode: z.literal('observed'), status: z.enum(['ok', 'partial']), sampledAt: z.string().datetime({ offset: true }),
  ageSeconds: z.number().finite().nonnegative(), collectionSeconds: z.number().finite().nonnegative(),
  sourceScopes: z.object({
    process: z.enum(['configured-procfs', 'collector-namespace']), network: z.literal('collector-namespace'),
    containers: z.literal('configured-docker-daemon'),
  }).strict(),
  processes: section.extend({ results: z.array(z.object({
    id: z.string().regex(/^process_[a-f0-9]{64}$/), name: z.string().max(160), status: z.string().max(40),
    createdAt: z.number().finite().nonnegative(), memoryBytes: z.number().finite().nonnegative().nullable(),
  }).strict()).max(200) }).strict(),
  containers: section.extend({ results: z.array(z.object({
    id: z.string().regex(/^container_[a-f0-9]{64}$/), name: z.string().max(160), status: z.string().max(40), imageConfigured: z.boolean(),
  }).strict()).max(200) }).strict(),
  ports: section.extend({ results: z.array(z.object({
    id: z.string().regex(/^port_[a-f0-9]{64}$/), kind: z.enum(['listener', 'container-binding']),
    addressScope: z.enum(['loopback', 'all-interfaces', 'specific']), hostPort: z.number().int().min(1).max(65535),
    targetPort: z.number().int().min(1).max(65535).nullable(), protocol: z.enum(['tcp', 'udp']),
    processId: z.string().regex(/^process_[a-f0-9]{64}$/).nullable(), containerId: z.string().regex(/^container_[a-f0-9]{64}$/).nullable(),
    state: z.enum(['listening', 'bound', 'declared-binding']),
  }).strict()).max(200) }).strict(),
  unavailableFieldCount: z.number().int().min(0).max(32), capabilities,
}).strict()
const inventory = z.object({
  schemaVersion: z.literal(1), requestId, state: z.enum(['dispatching', 'awaiting_approval', 'unknown', 'failed', 'complete']),
  limit: z.number().int().min(1).max(200), approvalRequired: z.boolean(), errorCode: z.enum(['invalid_inventory', 'read_failed']).nullable(),
  observation: observation.nullable(), receiptStatus: z.literal('unavailable').nullable(), currentAgeSeconds: z.number().finite().nonnegative().nullable(),
  createdAt: z.number().finite().nonnegative(), updatedAt: z.number().finite().nonnegative(), source: z.literal('toolgate/system.inventory'),
  refreshRequiresNewRequest: z.literal(true), authority: z.literal('none'), contentIncluded: z.boolean(), execution: z.literal('read-only-observation'),
}).strict()
const configuredTarget = z.object({
  id: z.string().regex(/^(?:service|container)_[a-f0-9]{64}$/), kind: z.enum(['service', 'container']), name: z.string().max(260).nullable(),
}).strict()
const configuredTargets = z.object({
  schemaVersion: z.literal(1), kind: z.enum(['services', 'containers']),
  status: z.enum(['configured', 'disabled', 'locked_down', 'not_configured', 'invalid_configuration']),
  results: z.array(configuredTarget).max(2000), requiresApproval: z.literal(true), observed: z.literal(false),
  authority: z.literal('none'), contentIncluded: z.boolean(), execution: z.literal('not-triggered'),
}).strict()

export type GatewayHostInventory = z.infer<typeof inventory>
export type GatewayHostObservation = z.infer<typeof observation>
export type GatewayConfiguredTargets = z.infer<typeof configuredTargets>

function parse<T>(schema: z.ZodType<T>, value: unknown, input = false): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new GatewayError(input ? 'validation' : 'invalid-response')
  return result.data
}

export function createHostInventoryRequestId() {
  return `browser_${globalThis.crypto.randomUUID().replaceAll('-', '')}`
}

export function createGatewayHostInventoryClient(auth: Pick<GatewayAuthClient, 'request'>) {
  const base = '/api/control/pi/system/inventory'
  return {
    async request(id: string, limit = 100, signal?: AbortSignal): Promise<GatewayHostInventory> {
      const selected = parse(requestId, id, true)
      const value = parse(inventory, await auth.request(base, { method: 'POST', body: { request_id: selected, limit: parse(z.number().int().min(1).max(200), limit, true) }, signal }))
      if (value.requestId !== selected) throw new GatewayError('invalid-response')
      return value
    },
    async inspect(id: string, signal?: AbortSignal): Promise<GatewayHostInventory> {
      const selected = parse(requestId, id, true)
      const value = parse(inventory, await auth.request(`${base}/${selected}`, { signal }))
      if (value.requestId !== selected) throw new GatewayError('invalid-response')
      return value
    },
    async resume(id: string, signal?: AbortSignal): Promise<GatewayHostInventory> {
      const selected = parse(requestId, id, true)
      const value = parse(inventory, await auth.request(`${base}/${selected}/resume`, { method: 'POST', body: {}, signal }))
      if (value.requestId !== selected) throw new GatewayError('invalid-response')
      return value
    },
    async configured(kind: 'services' | 'containers', signal?: AbortSignal): Promise<GatewayConfiguredTargets> {
      const value = parse(configuredTargets, await auth.request(`${base}/configured/${kind}`, { signal }))
      if (value.kind !== kind) throw new GatewayError('invalid-response')
      return value
    },
  }
}

export type GatewayHostInventoryClient = ReturnType<typeof createGatewayHostInventoryClient>
