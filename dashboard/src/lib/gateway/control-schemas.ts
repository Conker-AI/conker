import { z } from 'zod'
import { GatewayError } from './transport'

// Wire schemas and parse helpers for the owner control client (control.ts). Every schema is strict to Pi's shapes.

export const identity = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/)
export const count = z.number().int().nonnegative()
export const short = z.string().max(240)
export const kind = z.enum(['memory', 'entity', 'evidence', 'analysis', 'episode', 'observation', 'pattern', 'transcript'])
const connectionCounts = z.record(z.string().max(120), count)
const memoryCard = z.object({
  type: kind, id: identity, title: z.string().max(160), preview: z.string().max(400),
  preview_truncated: z.boolean(), status: z.string().max(100).nullable(), confidence: z.union([z.number().finite(), z.string().max(40)]).nullable(),
  available_fields: z.array(z.string().max(60)).max(20),
  memory_type: z.string().max(100).optional(), do_not_generalize: z.boolean().optional(),
  valid_from: z.string().nullable().optional(), valid_until: z.string().nullable().optional(),
  hypothesis: z.string().max(400).optional(), hypothesis_confidence: z.number().nullable().optional(),
})
export const library = z.object({
  scope: z.literal('all'), objects: z.array(memoryCard.extend({ connections: connectionCounts })).max(50),
  total: count, next_after: short.nullable(), search_mode: z.literal('text'),
})
const link = z.object({
  id: short, source_type: kind, source_id: identity, target_type: kind, target_id: identity,
  relationship: z.string().max(120), confidence: z.number().finite().nullable(),
})
const detail = z.object({ scope: z.literal('all'), object: memoryCard, connections: connectionCounts })
export const connections = detail.extend({ links: z.array(link).max(50), nodes: z.array(memoryCard).max(100), next_after: short.nullable() })
export const content = detail.extend({ field: z.string().max(60), content: z.string().max(16000), total_characters: count, next_offset: count.nullable() })
const assignment = z.object({
  enabled: z.boolean(), eligibleModelIds: z.array(z.string().max(200)).max(200), modelId: z.string().max(200).nullable(),
  timeoutMs: z.number().int().min(100).max(600000), failure: z.enum(['stop', 'fallback']), fallbackModelIds: z.array(z.string().max(200)).max(8),
  followAnswer: z.boolean().default(false),
})
// Endpoint URLs and credentials deliberately do not belong to browser model configuration.
// Roles this page does not list (such as drafting) pass through untouched, so saving here never
// switches off a role the owner set elsewhere.
export const configuration = z.object({
  providers: z.array(z.object({ id: z.string().min(1).max(100), name: z.string().min(1).max(160), enabled: z.boolean() })).max(100),
  models: z.array(z.object({ id: z.string().min(1).max(200), providerId: z.string().min(1).max(100), name: z.string().min(1).max(160),
    route: z.string().min(1).max(300), enabled: z.boolean(), routingDescription: short.default('') })).max(1000),
  defaultModelId: z.string().max(200).nullable(),
  roleSettings: z.object({ answerMode: z.enum(['manual', 'router']), roles: z.object({ reviewer: assignment.default({ enabled: false, eligibleModelIds: [], modelId: null, timeoutMs: 120000, failure: "stop", fallbackModelIds: [], followAnswer: false }), thinking: assignment.default({ enabled: false, eligibleModelIds: [], modelId: null, timeoutMs: 120000, failure: "stop", fallbackModelIds: [], followAnswer: false }), answer: assignment, routing: assignment, 'context-selection': assignment, summarization: assignment, "memory-ranking": assignment.default({ enabled: false, eligibleModelIds: [], modelId: null, timeoutMs: 2000, failure: "stop", fallbackModelIds: [], followAnswer: false }), proposals: assignment.default({ enabled: false, eligibleModelIds: [], modelId: null, timeoutMs: 120000, failure: "stop", fallbackModelIds: [], followAnswer: false }), 'search-ranking': assignment.default({ enabled: false, eligibleModelIds: [], modelId: null, timeoutMs: 2000, failure: 'stop', fallbackModelIds: [], followAnswer: false }), 'memory-sorting': assignment.default({ enabled: false, eligibleModelIds: [], modelId: null, timeoutMs: 120000, failure: 'stop', fallbackModelIds: [], followAnswer: false }), 'tool-text': assignment.default({ enabled: false, eligibleModelIds: [], modelId: null, timeoutMs: 120000, failure: 'stop', fallbackModelIds: [], followAnswer: false }) }).loose() }),
})
const projectSource = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('conversation'), sessionId: identity }),
  z.object({ kind: z.literal('task'), taskId: identity }),
  z.object({ kind: z.literal('file'), sessionId: identity, fileId: identity }),
])
export const sessionSettings = z.object({ revision: count, settings: z.object({
  agentId: identity, privacy: z.object({ memoryDisabled: z.boolean(), harnessDisabled: z.boolean() }),
  projectId: identity.nullable().optional(), projectSources: z.array(projectSource).max(20).optional(),
  presentationMode: z.enum(['focus', 'character']).nullable().optional(),
  access: z.enum(['default', 'ask', 'ai', 'full']).optional(),
}).strict() })
export type OwnerSessionSettings = z.infer<typeof sessionSettings>
export const modelSettings = z.object({ revision: count, configuration: configuration.nullable() })
const providerHealth = z.object({ status: z.string().max(60), model: z.string().max(240).optional(), busy: z.boolean().optional() })
export const providers = z.object({
  local: z.object({ provider: z.string().max(100), model: z.string().max(240), health: providerHealth }),
  direct: z.record(z.string(), z.object({ provider: z.string().max(100), health: providerHealth, capabilities: z.array(z.string().max(60)).max(20), allow_paid: z.boolean() })),
  hosted: z.object({ status: z.string().max(60), provider: z.string().max(100).optional(), allow_paid: z.boolean().optional() }),
})
const serviceCheck = z.object({ status: z.string().min(1).max(60) })
export const systemHealth = z.object({ service: z.literal('pi'), version: short, status: short,
  checked_at: z.string().datetime({ offset: true }), age_seconds: z.number().finite().nonnegative(),
  checks: z.object({ store: serviceCheck, memory: serviceCheck, local_provider: serviceCheck,
    hosted_provider: serviceCheck, action_boundary: serviceCheck }),
})
export type SystemHealth = z.infer<typeof systemHealth>
export const gatewayHealth = z.object({
  service: z.literal('gateway'), version: short, status: short,
  checked_at: z.string().datetime({ offset: true }), age_seconds: z.number().finite().nonnegative(),
  checks: z.object({ owner_login: serviceCheck, runtime: serviceCheck, owner_channel: serviceCheck }),
})
export type GatewayHealth = z.infer<typeof gatewayHealth>
const diagnosticRecovery = z.object({
  label: z.string().min(1).max(120), uiRoute: z.enum(['/system', '/settings', '/memory', '/tools']).nullable(),
  command: z.string().min(1).max(160).nullable(),
})
export const diagnostics = z.object({
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
export const toolInventory = z.object({ status: z.enum(['ok', 'unavailable', 'not_configured']),
  results: z.array(z.object({ id: z.string().min(1).max(200), name: z.string().max(240),
    description: z.string().max(8000), inputs: z.array(z.object({ name: z.string().max(200),
      type: z.string().max(100).default('string'), required: z.boolean().optional(),
      description: z.string().max(4000).optional() })).max(100),
    authorization: z.enum(['auto', 'ai_review', 'owner_confirmation', 'blocked']).optional(), sensitive: z.boolean().optional(),
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
export const setupStatus = z.object({
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
export const setupReceiptStep = z.enum(['boundaries', 'protection', 'rehearsal'])
export const setupReceiptWritableStep = z.literal('boundaries')
export const setupReceipt = z.object({
  step: setupReceiptStep, revision: z.number().int().positive(), receiptId: z.string().min(1).max(128),
  source: z.string().min(1).max(128), subject: z.string().min(1).max(96), evidenceDigest: z.string().regex(/^[0-9a-f]{64}$/),
  completedAt: z.string().datetime({ offset: true }), expiresAt: z.string().datetime({ offset: true }).nullable(),
  recordedAt: z.string().datetime({ offset: true }), state: z.enum(['valid', 'stale']),
})
export const setupReceiptInput = setupReceipt.pick({ receiptId: true, source: true, subject: true, evidenceDigest: true, completedAt: true, expiresAt: true })
  .extend({ expectedRevision: z.number().int().nonnegative() })
export type SetupReceiptStep = z.infer<typeof setupReceiptStep>
export type SetupReceipt = z.infer<typeof setupReceipt>
export type SetupReceiptInput = z.infer<typeof setupReceiptInput>
const setupHostPath = z.string().min(2).max(1024)
  .regex(/^\/(?!$)(?!.*(?:^|\/)\.\.(?:\/|$)).*$/)
  .refine(value => !value.endsWith('/') && !value.includes('//') && [...value].every(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127))
export const setupProtectionPolicy = z.object({
  schemaVersion: z.literal(1), revision: count, requestId: z.string().min(1).max(128).nullable(),
  destinationKind: z.literal('mounted_off_machine'),
  destination: setupHostPath.nullable(),
  retentionCopies: z.number().int().min(2).max(64).nullable(), policyDigest: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  recordedAt: z.string().datetime({ offset: true }).nullable(),
})
export const setupProtectionInput = z.object({
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
export const setupRehearsal = z.object({
  schemaVersion: z.literal(1), state: z.enum(['in_progress', 'ready', 'complete']),
  conversation: setupRehearsalPhase, memoryReview: setupRehearsalPhase,
  approval: setupRehearsalPhase, approvalRequestId: z.string().min(1).max(128).nullable(), canFinalize: z.boolean(),
})
export type SetupRehearsal = z.infer<typeof setupRehearsal>
export const setupChoiceStep = z.enum(['companion', 'memory', 'capabilities'])
export const setupChoice = z.object({
  step: setupChoiceStep, revision: count, requestId: z.string().min(1).max(128).nullable(),
  choice: z.enum(['undecided', 'accept', 'include', 'skip']), recordedAt: z.string().datetime({ offset: true }).nullable(),
})
export const setupChoiceInput = z.object({
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
export const setupModelOptions = z.object({ revision: count, candidates: z.array(setupModelCandidate).max(1000) })
export type SetupModelOptions = z.infer<typeof setupModelOptions>
const setupModelProbe = z.object({
  schemaVersion: z.literal(1), requestId: z.string().min(1).max(128), configurationRevision: z.number().int().positive(),
  candidateId: z.string().min(1).max(200), providerId: z.string().min(1).max(100), requestedModel: z.string().min(1).max(300),
  actualModel: z.string().min(1).max(300), execution: z.enum(['local', 'hosted']), responseDigest: z.string().regex(/^[0-9a-f]{64}$/),
  completedAt: z.string().datetime({ offset: true }), recordedAt: z.string().datetime({ offset: true }),
})
export const setupModelActivation = z.object({ revision: z.number().int().positive(), candidateId: z.string().min(1).max(200), probe: setupModelProbe })
export const setupBoundaryPolicy = z.object({
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
export const agentConfiguration = z.object({
  name: z.string().trim().min(1).max(80), role: z.string().trim().min(1).max(160),
  instructions: z.string().trim().min(1).max(8000), modelId: agentReference.nullable(),
  toolIds: z.array(agentReference).max(1000).refine(values => new Set(values).size === values.length),
  toolAccess: z.record(agentReference, z.enum(['allow', 'ai', 'ask'])).refine(value => Object.keys(value).length <= 1000).optional(),
  // Up to three skills an agent always carries; Pi leaves the key out when there are none.
  skillIds: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64)).max(3).refine(values => new Set(values).size === values.length).optional(),
  memory: z.object({
    scope: z.enum(['none', 'conversation', 'selected', 'owner']), memoryIds: z.array(agentReference).max(1000),
  }).superRefine((value, context) => {
    if ((value.scope === 'selected') !== (value.memoryIds.length > 0)) context.addIssue({ code: 'custom', message: 'Selected memory requires record IDs.' })
    if (new Set(value.memoryIds).size !== value.memoryIds.length) context.addIssue({ code: 'custom', message: 'Memory IDs must be unique.' })
  }),
}).strict()
export const agentProfile = z.object({
  schemaVersion: z.literal(1), id: z.string().regex(/^(?:companion|agent_[0-9a-f]{32})$/), kind: z.enum(['companion', 'agent']),
  revision: z.number().int().positive(), configuration: agentConfiguration,
  created_at: z.number().finite().nonnegative(), updated_at: z.number().finite().nonnegative(), archived_at: z.number().finite().nonnegative().nullable(),
  change_kind: z.enum(['created', 'updated', 'archived', 'restored']), authority: z.literal('none'),
  execution: z.literal('not-integrated'), reference_validation: z.literal('not-performed'),
}).strict().superRefine((value, context) => {
  if (value.configuration.memory.scope === 'owner' && (value.id !== 'companion' || value.kind !== 'companion')) context.addIssue({ code: 'custom', message: 'Across-chat owner memory is restricted to Companion.' })
})
export const agentCollection = z.object({ schemaVersion: z.literal(1), results: z.array(agentProfile).max(1000) }).strict()
export type AgentConfiguration = z.infer<typeof agentConfiguration>
export type AgentProfile = z.infer<typeof agentProfile>

export function parse<T>(schema: z.ZodType<T>, value: unknown, input = false): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new GatewayError(input ? 'validation' : 'invalid-response')
  return result.data
}
export function objectPath(type: MemoryObjectKind, id: string) {
  return `/api/control/pi/memory/objects/${parse(kind, type, true)}/${parse(identity, id, true)}`
}
export function match<T extends MemoryConnections | MemoryContent>(value: T, type: MemoryObjectKind, id: string): T {
  if (value.object.type !== type || value.object.id !== id) throw new GatewayError('invalid-response')
  return value
}
