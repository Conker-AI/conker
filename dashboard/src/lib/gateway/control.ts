import { z } from 'zod'
import { createGatewayEditorDrafts } from './editor-drafts'
import { createGatewayProjectsClient } from './projects'
import { createGatewayArtifactsClient } from './artifacts'
import { createGatewayJobsClient } from './jobs'
import { createGatewayCharactersClient } from './characters'
import { createGatewayHostInventoryClient } from './host-inventory'
import { createGatewayTeamsClient } from './teams'
import { createGatewayTerminalClient } from './terminal'
import { createGatewayFilesystemClient } from './filesystem'
import { createGatewayCallsClient } from './calls'
import { createGatewaySearchClient } from './search'
import { createProviderControlClient } from './provider-control'
import { createBrowserSessionsClient } from './browser-sessions'
import { createChatGPTClient } from './chatgpt'
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
  roleSettings: z.object({ answerMode: z.enum(['manual', 'router']), roles: z.object({ answer: assignment, routing: assignment, 'context-selection': assignment, summarization: assignment, "memory-ranking": assignment.default({ enabled: false, eligibleModelIds: [], modelId: null, timeoutMs: 2000, failure: "stop", fallbackModelId: null }), proposals: assignment.default({ enabled: false, eligibleModelIds: [], modelId: null, timeoutMs: 120000, failure: "stop", fallbackModelId: null }), 'search-ranking': assignment.default({ enabled: false, eligibleModelIds: [], modelId: null, timeoutMs: 2000, failure: 'stop', fallbackModelId: null }) }) }),
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
const gatewayHealth = z.object({
  service: z.literal('gateway'), version: short, status: short,
  checked_at: z.string().datetime({ offset: true }), age_seconds: z.number().finite().nonnegative(),
  checks: z.object({ owner_login: serviceCheck, runtime: serviceCheck, owner_channel: serviceCheck }),
})
export type GatewayHealth = z.infer<typeof gatewayHealth>
const diagnosticRecovery = z.object({
  label: z.string().min(1).max(120), uiRoute: z.enum(['/system', '/settings', '/memory', '/tools']).nullable(),
  command: z.string().min(1).max(160).nullable(),
})
const diagnostics = z.object({
  schemaVersion: z.literal(1), status: z.enum(['ok', 'attention']), generatedAt: z.string().datetime({ offset: true }),
  summary: z.object({ attention: count, ok: count, optional: count }),
  findings: z.array(z.object({
    id: z.enum(['owner-login', 'runtime', 'owner-channel', 'store', 'memory', 'local-model', 'hosted-model', 'actions']),
    area: z.enum(['access', 'services', 'models']), label: z.string().min(1).max(120),
    status: z.enum(['ok', 'attention', 'optional']), observedStatus: z.string().min(1).max(60),
    detail: z.string().min(1).max(240), recovery: diagnosticRecovery.nullable(),
  })).length(8),
})
export type GatewayDiagnostics = z.infer<typeof diagnostics>
const toolInventory = z.object({ status: z.enum(['ok', 'unavailable', 'not_configured']),
  results: z.array(z.object({ id: z.string().min(1).max(200), name: z.string().max(240),
    description: z.string().max(8000), inputs: z.array(z.object({ name: z.string().max(200),
      type: z.string().max(100).default('string'), required: z.boolean().optional(),
      description: z.string().max(4000).optional() })).max(100),
  })).max(1000),
})
export type ToolInventory = z.infer<typeof toolInventory>
const setupStepId = z.enum(['security', 'companion', 'model', 'memory', 'capabilities', 'boundaries', 'protection', 'rehearsal'])
const setupStepState = z.enum(['not_started', 'in_progress', 'blocked', 'skipped', 'complete', 'degraded'])
const setupBlockingReason = z.enum([
  'owner_channel_not_configured', 'durable_store_unavailable', 'companion_configuration_unavailable', 'companion_configuration_unreviewed',
  'model_configuration_missing', 'model_response_unverified', 'model_provider_unavailable', 'memory_choice_unreviewed', 'memory_not_configured', 'memory_unavailable',
  'capability_choice_unreviewed', 'toolgate_not_configured', 'toolgate_unavailable', 'capability_catalog_empty', 'boundary_receipt_unavailable',
  'protection_receipt_unavailable', 'rehearsal_receipt_unavailable', 'boundary_receipt_stale',
  'protection_receipt_stale', 'rehearsal_receipt_stale',
])
const setupOperation = z.enum([
  'configure_owner_channel', 'repair_durable_store', 'repair_companion_configuration', 'configure_companion', 'configure_model', 'test_model',
  'repair_model_provider', 'configure_memory', 'repair_memory', 'configure_capabilities', 'repair_toolgate',
  'review_boundaries', 'verify_protection', 'run_rehearsal',
])
const setupStatus = z.object({
  schemaVersion: z.literal(1), workflow: z.literal('first-run'), state: z.enum(['in_progress', 'blocked', 'complete', 'degraded']),
  currentStep: setupStepId.nullable(), recommendedNextOperation: setupOperation.nullable(), generatedAt: z.string().datetime({ offset: true }),
  steps: z.array(z.object({
    id: setupStepId, state: setupStepState, required: z.boolean(), prerequisites: z.array(setupStepId).max(8),
    blockingReasonCode: setupBlockingReason.nullable(), evidence: z.array(z.object({
      source: z.string().min(1).max(80), status: z.enum(['ok', 'missing', 'degraded', 'unknown']),
      revision: z.number().int().nonnegative().nullable(), detail: z.string().min(1).max(160),
    })).max(16),
  })).length(8),
})
export type SetupStatus = z.infer<typeof setupStatus>
export type SetupStep = SetupStatus['steps'][number]
const setupReceiptStep = z.enum(['boundaries', 'protection', 'rehearsal'])
const setupReceiptWritableStep = z.literal('boundaries')
const setupReceipt = z.object({
  step: setupReceiptStep, revision: z.number().int().positive(), receiptId: z.string().min(1).max(128),
  source: z.string().min(1).max(128), subject: z.string().min(1).max(96), evidenceDigest: z.string().regex(/^[0-9a-f]{64}$/),
  completedAt: z.string().datetime({ offset: true }), expiresAt: z.string().datetime({ offset: true }),
  recordedAt: z.string().datetime({ offset: true }), state: z.enum(['valid', 'stale']),
})
const setupReceiptInput = setupReceipt.pick({ receiptId: true, source: true, subject: true, evidenceDigest: true, completedAt: true, expiresAt: true })
  .extend({ expectedRevision: z.number().int().nonnegative() })
export type SetupReceiptStep = z.infer<typeof setupReceiptStep>
export type SetupReceipt = z.infer<typeof setupReceipt>
export type SetupReceiptInput = z.infer<typeof setupReceiptInput>
const setupHostPath = z.string().min(2).max(1024)
  .regex(/^\/(?!$)(?!.*(?:^|\/)\.\.(?:\/|$)).*$/)
  .refine(value => !value.endsWith('/') && !value.includes('//') && [...value].every(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127))
const setupProtectionPolicy = z.object({
  schemaVersion: z.literal(1), revision: count, requestId: z.string().min(1).max(128).nullable(),
  destinationKind: z.literal('mounted_off_machine'),
  destination: setupHostPath.nullable(),
  retentionCopies: z.number().int().min(2).max(64).nullable(), policyDigest: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  recordedAt: z.string().datetime({ offset: true }).nullable(),
})
const setupProtectionInput = z.object({
  requestId: z.string().regex(/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/),
  destination: setupHostPath,
  retentionCopies: z.number().int().min(2).max(64), expectedRevision: count,
})
export type SetupProtectionPolicy = z.infer<typeof setupProtectionPolicy>
export type SetupProtectionInput = z.infer<typeof setupProtectionInput>
const setupRehearsalPhase = z.object({
  state: z.enum(['missing', 'complete', 'awaiting_owner', 'outcome_unknown', 'refused', 'invalid_policy']),
  detail: z.string().min(1).max(240),
})
const setupRehearsal = z.object({
  schemaVersion: z.literal(1), state: z.enum(['in_progress', 'ready', 'complete']),
  conversation: setupRehearsalPhase, memoryReview: setupRehearsalPhase,
  approval: setupRehearsalPhase, approvalRequestId: z.string().min(1).max(128).nullable(), canFinalize: z.boolean(),
})
export type SetupRehearsal = z.infer<typeof setupRehearsal>
const setupChoiceStep = z.enum(['companion', 'memory', 'capabilities'])
const setupChoice = z.object({
  step: setupChoiceStep, revision: count, requestId: z.string().min(1).max(128).nullable(),
  choice: z.enum(['undecided', 'accept', 'include', 'skip']), recordedAt: z.string().datetime({ offset: true }).nullable(),
})
const setupChoiceInput = z.object({
  requestId: z.string().min(1).max(128), choice: z.enum(['accept', 'include', 'skip']), expectedRevision: count,
})
export type SetupChoiceStep = z.infer<typeof setupChoiceStep>
export type SetupChoice = z.infer<typeof setupChoice>
export type SetupChoiceInput = z.infer<typeof setupChoiceInput>
const setupModelCandidate = z.object({
  id: z.string().min(1).max(200), providerId: z.string().min(1).max(100), providerName: z.string().min(1).max(160),
  name: z.string().min(1).max(160), route: z.string().min(1).max(300), status: z.enum(['ready', 'unverified', 'unavailable']), selected: z.boolean(),
  execution: z.enum(['local', 'hosted']), dataNotice: z.string().min(1).max(240), costNotice: z.string().min(1).max(240),
})
const setupModelOptions = z.object({ revision: count, candidates: z.array(setupModelCandidate).max(1000) })
export type SetupModelOptions = z.infer<typeof setupModelOptions>
const setupModelProbe = z.object({
  schemaVersion: z.literal(1), requestId: z.string().min(1).max(128), configurationRevision: z.number().int().positive(),
  candidateId: z.string().min(1).max(200), providerId: z.string().min(1).max(100), requestedModel: z.string().min(1).max(300),
  actualModel: z.string().min(1).max(300), execution: z.enum(['local', 'hosted']), responseDigest: z.string().regex(/^[0-9a-f]{64}$/),
  completedAt: z.string().datetime({ offset: true }), recordedAt: z.string().datetime({ offset: true }),
})
const setupModelActivation = z.object({ revision: z.number().int().positive(), candidateId: z.string().min(1).max(200), probe: setupModelProbe })
const setupBoundaryPolicy = z.object({
  lockdown: z.boolean(), scopePatterns: z.array(z.string().min(1).max(200)).max(1000),
  tools: z.array(z.object({
    id: z.string().min(1).max(200), name: z.string().min(1).max(240), authorization: z.string().min(1).max(80),
    executionType: z.string().min(1).max(80), usageLimits: z.record(z.string().max(80), z.number().finite().nullable()),
    definitionDigest: z.string().regex(/^[0-9a-f]{64}$/),
  })).max(1000), digest: z.string().regex(/^[0-9a-f]{64}$/),
})
export type SetupBoundaryPolicy = z.infer<typeof setupBoundaryPolicy>
export type ProviderStatus = { id: string; status: string; model?: string; busy?: boolean; capabilities: string[] }
export type MemoryObjectKind = z.infer<typeof kind>
export type MemoryObjectCard = z.infer<typeof memoryCard>
export type MemoryLibrary = z.infer<typeof library>
export type MemoryConnections = z.infer<typeof connections>
export type MemoryContent = z.infer<typeof content>
export type OwnerModelsConfiguration = z.infer<typeof configuration>
export type OwnerModelSettings = z.infer<typeof modelSettings>
const agentReference = z.string().min(1).max(200).refine(value => value.trim() === value)
const agentConfiguration = z.object({
  name: z.string().trim().min(1).max(80), role: z.string().trim().min(1).max(160),
  instructions: z.string().trim().min(1).max(8000), modelId: agentReference.nullable(),
  toolIds: z.array(agentReference).max(1000).refine(values => new Set(values).size === values.length),
  memory: z.object({
    scope: z.enum(['none', 'conversation', 'selected', 'owner']), memoryIds: z.array(agentReference).max(1000),
  }).superRefine((value, context) => {
    if ((value.scope === 'selected') !== (value.memoryIds.length > 0)) context.addIssue({ code: 'custom', message: 'Selected memory requires record IDs.' })
    if (new Set(value.memoryIds).size !== value.memoryIds.length) context.addIssue({ code: 'custom', message: 'Memory IDs must be unique.' })
  }),
}).strict()
const agentProfile = z.object({
  schemaVersion: z.literal(1), id: z.string().regex(/^(?:companion|agent_[0-9a-f]{32})$/), kind: z.enum(['companion', 'agent']),
  revision: z.number().int().positive(), configuration: agentConfiguration,
  created_at: z.number().finite().nonnegative(), updated_at: z.number().finite().nonnegative(), archived_at: z.number().finite().nonnegative().nullable(),
  change_kind: z.enum(['created', 'updated', 'archived', 'restored']), authority: z.literal('none'),
  execution: z.literal('not-integrated'), reference_validation: z.literal('not-performed'),
}).strict().superRefine((value, context) => {
  if (value.configuration.memory.scope === 'owner' && (value.id !== 'companion' || value.kind !== 'companion')) context.addIssue({ code: 'custom', message: 'Across-chat owner memory is restricted to Companion.' })
})
const agentCollection = z.object({ schemaVersion: z.literal(1), results: z.array(agentProfile).max(1000) }).strict()
export type AgentConfiguration = z.infer<typeof agentConfiguration>
export type AgentProfile = z.infer<typeof agentProfile>

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

const forgetPreview = z.object({ memoryId: identity, revision: z.number().int().min(1), text: z.string().max(16000) })
const forgetReceipt = z.object({ requestId: z.string(), memoryId: identity, status: z.literal('forgotten'), indexRemoval: z.string().nullable(), cachedPackagesCleared: count, sourceConversationKept: z.literal(true) })
export type MemoryForgetPreview = z.infer<typeof forgetPreview>
export type MemoryForgetReceipt = z.infer<typeof forgetReceipt>

/** Owner UI capability only. Conversation retrieval remains separately scoped by Pi. */
export function createGatewayControlClient(auth: Pick<GatewayAuthClient, 'request' | 'audio' | 'getSession'>, onCurrentSessionRevoked: () => void) {
  return {
    editorDrafts: createGatewayEditorDrafts(auth),
    providerCredentials: createProviderControlClient(auth),
    chatgpt: createChatGPTClient(auth),
    browserSessions: createBrowserSessionsClient(auth, onCurrentSessionRevoked),
    projects: createGatewayProjectsClient(auth),
    artifacts: createGatewayArtifactsClient(auth),
    jobs: createGatewayJobsClient(auth),
    characters: createGatewayCharactersClient(auth),
    hostInventory: createGatewayHostInventoryClient(auth),
    teams: createGatewayTeamsClient(auth),
    filesystem: createGatewayFilesystemClient(auth),
    calls: createGatewayCallsClient(auth),
    search: createGatewaySearchClient(auth),
    terminal: createGatewayTerminalClient(auth),
    async diagnostics(signal?: AbortSignal): Promise<GatewayDiagnostics> {
      return parse(diagnostics, await auth.request('/api/diagnostics', { signal }))
    },
    async agents(signal?: AbortSignal): Promise<AgentProfile[]> {
      return parse(agentCollection, await auth.request('/api/control/pi/agents', { signal })).results
    },
    async agent(id: string, signal?: AbortSignal): Promise<AgentProfile> {
      const selected = parse(z.string().regex(/^(?:companion|agent_[0-9a-f]{32})$/), id, true)
      const result = parse(agentProfile, await auth.request(`/api/control/pi/agents/${selected}`, { signal }))
      if (result.id !== selected) throw new GatewayError('invalid-response')
      return result
    },
    async createAgent(value: AgentConfiguration, signal?: AbortSignal): Promise<AgentProfile> {
      if (value.memory.scope === 'owner') throw new GatewayError('validation')
      return parse(agentProfile, await auth.request('/api/control/pi/agents', { method: 'POST', body: parse(agentConfiguration, value, true), signal }))
    },
    async saveAgent(id: string, value: AgentConfiguration, expectedRevision: number, signal?: AbortSignal): Promise<AgentProfile> {
      const selected = parse(z.string().regex(/^(?:companion|agent_[0-9a-f]{32})$/), id, true)
      if (value.memory.scope === 'owner' && selected !== 'companion') throw new GatewayError('validation')
      const result = parse(agentProfile, await auth.request(`/api/control/pi/agents/${selected}/update`, {
        method: 'POST', body: { expected_revision: parse(z.number().int().positive(), expectedRevision, true), configuration: parse(agentConfiguration, value, true) }, signal,
      }))
      if (result.id !== selected) throw new GatewayError('invalid-response')
      return result
    },
    async setAgentArchived(id: string, archived: boolean, expectedRevision: number, signal?: AbortSignal): Promise<AgentProfile> {
      const selected = parse(z.string().regex(/^agent_[0-9a-f]{32}$/), id, true)
      const result = parse(agentProfile, await auth.request(`/api/control/pi/agents/${selected}/archive`, {
        method: 'POST', body: { expected_revision: parse(z.number().int().positive(), expectedRevision, true), archived }, signal,
      }))
      if (result.id !== selected) throw new GatewayError('invalid-response')
      return result
    },
    async tools(signal?: AbortSignal): Promise<ToolInventory> {
      return parse(toolInventory, await auth.request('/api/pi/tools', { signal }))
    },
    async health(signal?: AbortSignal): Promise<SystemHealth> {
      return parse(systemHealth, await auth.request('/api/pi/health', { signal }))
    },
    async gatewayHealth(signal?: AbortSignal): Promise<GatewayHealth> {
      return parse(gatewayHealth, await auth.request('/health', { signal }))
    },
    async setupStatus(signal?: AbortSignal): Promise<SetupStatus> {
      return parse(setupStatus, await auth.request('/api/control/pi/setup/status', { signal }))
    },
    async setupBoundaryPolicy(signal?: AbortSignal): Promise<SetupBoundaryPolicy> {
      return parse(setupBoundaryPolicy, await auth.request('/api/control/pi/setup/boundaries', { signal }))
    },
    async setupReceipt(step: SetupReceiptStep, signal?: AbortSignal): Promise<SetupReceipt> {
      const selected = parse(setupReceiptStep, step, true)
      const result = parse(setupReceipt, await auth.request(`/api/control/pi/setup/receipts/${selected}`, { signal }))
      if (result.step !== selected) throw new GatewayError('invalid-response')
      return result
    },
    async recordSetupReceipt(step: 'boundaries', value: SetupReceiptInput, signal?: AbortSignal): Promise<SetupReceipt> {
      const selected = parse(setupReceiptWritableStep, step, true)
      const body = parse(setupReceiptInput, value, true)
      const result = parse(setupReceipt, await auth.request(`/api/control/pi/setup/receipts/${selected}`, { method: 'POST', body, signal }))
      if (result.step !== selected) throw new GatewayError('invalid-response')
      return result
    },
    async setupProtection(signal?: AbortSignal): Promise<SetupProtectionPolicy> {
      return parse(setupProtectionPolicy, await auth.request('/api/control/pi/setup/protection', { signal }))
    },
    async saveSetupProtection(value: SetupProtectionInput, signal?: AbortSignal): Promise<SetupProtectionPolicy> {
      const body = parse(setupProtectionInput, value, true)
      const result = parse(setupProtectionPolicy, await auth.request('/api/control/pi/setup/protection', { method: 'POST', body, signal }))
      if (result.revision !== body.expectedRevision + 1 || result.requestId !== body.requestId || result.destination !== body.destination || result.retentionCopies !== body.retentionCopies) throw new GatewayError('invalid-response')
      return result
    },
    async setupRehearsal(signal?: AbortSignal): Promise<SetupRehearsal> {
      return parse(setupRehearsal, await auth.request('/api/control/pi/setup/rehearsal', { signal }))
    },
    async reviewSetupMemory(expectedChoiceRevision: number, requestId: string, signal?: AbortSignal): Promise<SetupRehearsal> {
      const body = {
        requestId: parse(z.string().regex(/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/), requestId, true),
        expectedChoiceRevision: parse(z.number().int().positive(), expectedChoiceRevision, true),
      }
      return parse(setupRehearsal, await auth.request('/api/control/pi/setup/rehearsal/memory-review', { method: 'POST', body, signal }))
    },
    async startSetupApproval(requestId: string, signal?: AbortSignal): Promise<SetupRehearsal> {
      const body = { requestId: parse(z.string().regex(/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/), requestId, true) }
      return parse(setupRehearsal, await auth.request('/api/control/pi/setup/rehearsal/approval/start', { method: 'POST', body, signal }))
    },
    async resumeSetupApproval(requestId: string, signal?: AbortSignal): Promise<SetupRehearsal> {
      const body = { requestId: parse(z.string().regex(/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/), requestId, true) }
      return parse(setupRehearsal, await auth.request('/api/control/pi/setup/rehearsal/approval/resume', { method: 'POST', body, signal }))
    },
    async finalizeSetupRehearsal(signal?: AbortSignal): Promise<SetupReceipt> {
      const result = parse(setupReceipt, await auth.request('/api/control/pi/setup/rehearsal/finalize', { method: 'POST', body: {}, signal }))
      if (result.step !== 'rehearsal' || result.source !== 'conker.first-run-rehearsal') throw new GatewayError('invalid-response')
      return result
    },
    async setupChoice(step: SetupChoiceStep, signal?: AbortSignal): Promise<SetupChoice> {
      const selected = parse(setupChoiceStep, step, true)
      const result = parse(setupChoice, await auth.request(`/api/control/pi/setup/choices/${selected}`, { signal }))
      if (result.step !== selected) throw new GatewayError('invalid-response')
      return result
    },
    async saveSetupChoice(step: SetupChoiceStep, value: SetupChoiceInput, signal?: AbortSignal): Promise<SetupChoice> {
      const selected = parse(setupChoiceStep, step, true)
      const body = parse(setupChoiceInput, value, true)
      const result = parse(setupChoice, await auth.request(`/api/control/pi/setup/choices/${selected}`, { method: 'POST', body, signal }))
      if (result.step !== selected || result.choice !== body.choice || result.requestId !== body.requestId || result.revision !== body.expectedRevision + 1) throw new GatewayError('invalid-response')
      return result
    },
    async setupModels(signal?: AbortSignal): Promise<SetupModelOptions> {
      return parse(setupModelOptions, await auth.request('/api/control/pi/setup/models', { signal }))
    },
    async saveSetupModel(candidateId: string, expectedRevision: number, signal?: AbortSignal): Promise<OwnerModelSettings> {
      const selected = parse(z.string().min(1).max(200).refine(value => value.trim() === value), candidateId, true)
      const result = parse(modelSettings, await auth.request('/api/control/pi/setup/models', {
        method: 'POST', body: { candidateId: selected, expectedRevision: parse(count, expectedRevision, true) }, signal,
      }))
      if (result.revision !== expectedRevision + 1 || result.configuration?.defaultModelId !== selected) throw new GatewayError('invalid-response')
      return result
    },
    async activateSetupModel(candidateId: string, expectedRevision: number, requestId: string, signal?: AbortSignal) {
      const selected = parse(z.string().min(1).max(200).refine(value => value.trim() === value), candidateId, true)
      const request = parse(z.string().regex(/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/), requestId, true)
      const result = parse(setupModelActivation, await auth.request('/api/control/pi/setup/models/activate', {
        method: 'POST', body: { requestId: request, candidateId: selected, expectedRevision: parse(count, expectedRevision, true) }, signal,
      }))
      if (result.revision !== expectedRevision + 1 || result.candidateId !== selected || result.probe.requestId !== request || result.probe.configurationRevision !== result.revision || result.probe.candidateId !== selected) throw new GatewayError('invalid-response')
      return result
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
    /** The exact current text and revision; forgetting succeeds only if it is still current. */
    async forgetPreview(id: string, signal?: AbortSignal): Promise<MemoryForgetPreview> {
      const result = parse(forgetPreview, await auth.request(`/api/control/pi/memory/forget/${parse(identity, id, true)}`, { signal }))
      if (result.memoryId !== id) throw new GatewayError('invalid-response')
      return result
    },
    /** Removes the memory everywhere it is stored. Asks for the owner password. */
    async forgetMemory(preview: MemoryForgetPreview): Promise<MemoryForgetReceipt> {
      const body = { request_id: globalThis.crypto.randomUUID(), memory_id: parse(identity, preview.memoryId, true), expected_revision: parse(z.number().int().min(1), preview.revision, true) }
      const result = parse(forgetReceipt, await auth.request('/api/control/pi/memory/forget', { method: 'POST', body }))
      if (result.memoryId !== preview.memoryId) throw new GatewayError('invalid-response')
      return result
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
