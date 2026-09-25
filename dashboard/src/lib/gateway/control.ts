import { z } from 'zod'
import { createGatewayEditorDrafts } from './editor-drafts'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

const identity = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/)
const count = z.number().int().nonnegative()
const short = z.string().max(240)
const kind = z.enum(['memory', 'entity', 'evidence', 'analysis', 'episode', 'observation', 'pattern', 'transcript'])
const connectionCounts = z.record(z.string().max(120), count)
const memoryCard = z.object({
  type: kind, id: identity, title: z.string().max(160), preview: z.string().max(400),
  preview_truncated: z.boolean(), status: z.string().max(100).nullable(), confidence: z.union([z.number().finite(), z.string().max(40)]).nullable(),
  available_fields: z.array(z.string().max(60)).max(20),
  memory_type: z.string().max(100).optional(), do_not_generalize: z.boolean().optional(),
  valid_from: z.string().nullable().optional(), valid_until: z.string().nullable().optional(),
  hypothesis: z.string().max(400).optional(), hypothesis_confidence: z.number().nullable().optional(),
})
const library = z.object({
  scope: z.literal('all'), objects: z.array(memoryCard.extend({ connections: connectionCounts })).max(50),
  total: count, next_after: short.nullable(), search_mode: z.literal('text'),
})
const link = z.object({
  id: short, source_type: kind, source_id: identity, target_type: kind, target_id: identity,
  relationship: z.string().max(120), confidence: z.number().finite().nullable(),
})
const detail = z.object({ scope: z.literal('all'), object: memoryCard, connections: connectionCounts })
const connections = detail.extend({ links: z.array(link).max(50), nodes: z.array(memoryCard).max(100), next_after: short.nullable() })
const content = detail.extend({ field: z.string().max(60), content: z.string().max(16000), total_characters: count, next_offset: count.nullable() })
const assignment = z.object({
  enabled: z.boolean(), eligibleModelIds: z.array(z.string().max(200)).max(200), modelId: z.string().max(200).nullable(),
  timeoutMs: z.number().int().min(100).max(120000), failure: z.enum(['stop', 'fallback']), fallbackModelId: z.string().max(200).nullable(),
})
// Endpoint URLs and credentials deliberately do not belong to browser model configuration.
const configuration = z.object({
  providers: z.array(z.object({ id: z.string().min(1).max(100), name: z.string().min(1).max(160), enabled: z.boolean() })).max(100),
  models: z.array(z.object({ id: z.string().min(1).max(200), providerId: z.string().min(1).max(100), name: z.string().min(1).max(160),
    route: z.string().min(1).max(300), enabled: z.boolean(), routingDescription: short.default('') })).max(1000),
  defaultModelId: z.string().max(200).nullable(),
  roleSettings: z.object({ answerMode: z.enum(['manual', 'router']), roles: z.object({ answer: assignment, routing: assignment, 'context-selection': assignment, summarization: assignment, "memory-ranking": assignment.default({ enabled: false, eligibleModelIds: [], modelId: null, timeoutMs: 2000, failure: "stop", fallbackModelId: null }), proposals: assignment.default({ enabled: false, eligibleModelIds: [], modelId: null, timeoutMs: 120000, failure: "stop", fallbackModelId: null }) }) }),
})
const projectSource = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('conversation'), sessionId: identity }),
  z.object({ kind: z.literal('task'), taskId: identity }),
  z.object({ kind: z.literal('file'), sessionId: identity, fileId: identity }),
])
const sessionSettings = z.object({ revision: count, settings: z.object({
  agentId: identity, privacy: z.object({ memoryDisabled: z.boolean(), harnessDisabled: z.boolean() }),
  projectId: identity.nullable().optional(), projectSources: z.array(projectSource).max(20).optional(),
  presentationMode: z.enum(['focus', 'character']).nullable().optional(),
}).strict() })
export type OwnerSessionSettings = z.infer<typeof sessionSettings>
const modelSettings = z.object({ revision: count, configuration: configuration.nullable() })
const providerHealth = z.object({ status: z.string().max(60), model: z.string().max(240).optional(), busy: z.boolean().optional() })
const providers = z.object({
  local: z.object({ provider: z.string().max(100), model: z.string().max(240), health: providerHealth }),
  direct: z.record(z.string(), z.object({ provider: z.string().max(100), health: providerHealth, capabilities: z.array(z.string().max(60)).max(20), allow_paid: z.boolean() })),
  hosted: z.object({ status: z.string().max(60), provider: z.string().max(100).optional(), allow_paid: z.boolean().optional() }),
})
const serviceCheck = z.object({ status: z.string().min(1).max(60) })
const systemHealth = z.object({ service: z.literal('pi'), version: short, status: short,
  checked_at: z.string().datetime({ offset: true }), age_seconds: z.number().finite().nonnegative(),
  checks: z.object({ store: serviceCheck, memory: serviceCheck, local_provider: serviceCheck,
    hosted_provider: serviceCheck, action_boundary: serviceCheck }),
})
export type SystemHealth = z.infer<typeof systemHealth>
const toolInventory = z.object({ status: z.enum(['ok', 'unavailable', 'not_configured']),
  results: z.array(z.object({ id: z.string().min(1).max(200), name: z.string().max(240),
    description: z.string().max(8000), inputs: z.array(z.object({ name: z.string().max(200),
      type: z.string().max(100).default('string'), required: z.boolean().optional(),
      description: z.string().max(4000).optional() })).max(100),
  })).max(1000),
})
export type ToolInventory = z.infer<typeof toolInventory>
export type ProviderStatus = { id: string; status: string; model?: string; busy?: boolean; capabilities: string[] }
export type MemoryObjectKind = z.infer<typeof kind>
export type MemoryObjectCard = z.infer<typeof memoryCard>
export type MemoryLibrary = z.infer<typeof library>
export type MemoryConnections = z.infer<typeof connections>
export type MemoryContent = z.infer<typeof content>
export type OwnerModelsConfiguration = z.infer<typeof configuration>
export type OwnerModelSettings = z.infer<typeof modelSettings>

function parse<T>(schema: z.ZodType<T>, value: unknown, input = false): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new GatewayError(input ? 'validation' : 'invalid-response')
  return result.data
}
function objectPath(type: MemoryObjectKind, id: string) {
  return `/api/control/pi/memory/objects/${parse(kind, type, true)}/${parse(identity, id, true)}`
}
function match<T extends MemoryConnections | MemoryContent>(value: T, type: MemoryObjectKind, id: string): T {
  if (value.object.type !== type || value.object.id !== id) throw new GatewayError('invalid-response')
  return value
}

/** Owner UI capability only. Conversation retrieval remains separately scoped by Pi. */
export function createGatewayControlClient(auth: Pick<GatewayAuthClient, 'request'>) {
  return {
    editorDrafts: createGatewayEditorDrafts(auth),
    async tools(signal?: AbortSignal): Promise<ToolInventory> {
      return parse(toolInventory, await auth.request('/api/pi/tools', { signal }))
    },
    async health(signal?: AbortSignal): Promise<SystemHealth> {
      return parse(systemHealth, await auth.request('/api/pi/health', { signal }))
    },
    async sessionSettings(id: string, signal?: AbortSignal): Promise<OwnerSessionSettings> {
      return parse(sessionSettings, await auth.request(`/api/control/pi/sessions/${parse(identity, id, true)}/settings`, { signal }))
    },
    async saveSessionSettings(id: string, value: OwnerSessionSettings, signal?: AbortSignal): Promise<OwnerSessionSettings> {
      const parsed = parse(sessionSettings, value, true)
      return parse(sessionSettings, await auth.request(`/api/control/pi/sessions/${parse(identity, id, true)}/settings`, {
        method: 'POST', body: { expected_revision: parsed.revision, settings: parsed.settings }, signal,
      }))
    },
    async providers(signal?: AbortSignal): Promise<ProviderStatus[]> {
      const value = parse(providers, await auth.request('/api/pi/models', { signal }))
      return [{ id: value.local.provider, ...value.local.health, model: value.local.model, capabilities: ['text'] },
        ...Object.values(value.direct).map(item => ({ id: item.provider, ...item.health, capabilities: item.capabilities })),
        ...(value.hosted.provider ? [{ id: value.hosted.provider, status: value.hosted.status, capabilities: ['text'] }] : [])]
    },
    async models(signal?: AbortSignal): Promise<OwnerModelSettings> {
      return parse(modelSettings, await auth.request('/api/control/pi/models/configuration', { signal }))
    },
    async saveModels(value: OwnerModelsConfiguration, expectedRevision: number, signal?: AbortSignal): Promise<OwnerModelSettings> {
      // Snapshot only public fields. Neither draft secrets nor unknown metadata can cross this boundary.
      const body = { expected_revision: parse(count, expectedRevision, true), configuration: parse(configuration, value, true) }
      return parse(modelSettings, await auth.request('/api/control/pi/models/configuration', { method: 'POST', body, signal }))
    },
    async library(options: { search?: string; type?: MemoryObjectKind; after?: string; limit?: number; signal?: AbortSignal } = {}): Promise<MemoryLibrary> {
      const query: Record<string, string | number> = { search: parse(z.string().max(200), options.search ?? '', true), limit: parse(z.number().int().min(1).max(50), options.limit ?? 25, true) }
      if (options.type) query.object_type = parse(kind, options.type, true)
      if (options.after) query.after = parse(short, options.after, true)
      return parse(library, await auth.request('/api/control/pi/memory/objects', { query, signal: options.signal }))
    },
    async connections(type: MemoryObjectKind, id: string, options: { after?: string; relationship?: string; signal?: AbortSignal } = {}): Promise<MemoryConnections> {
      const query: Record<string, string> = { operation: 'connections' }
      if (options.after) query.after = parse(short, options.after, true)
      if (options.relationship) query.relationship = parse(z.string().max(120), options.relationship, true)
      return match(parse(connections, await auth.request(objectPath(type, id), { query, signal: options.signal })), type, id)
    },
    async content(type: MemoryObjectKind, id: string, field: string, offset = 0, signal?: AbortSignal): Promise<MemoryContent> {
      const query = { operation: 'content', field: parse(z.string().min(1).max(60), field, true), offset: parse(count.max(100000000), offset, true), characters: 4000 }
      const result = match(parse(content, await auth.request(objectPath(type, id), { query, signal })), type, id)
      if (result.field !== field) throw new GatewayError('invalid-response')
      return result
    },
  }
}
export type GatewayControlClient = ReturnType<typeof createGatewayControlClient>
