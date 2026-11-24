import { z } from 'zod'
import { createGatewayEditorDrafts } from './editor-drafts'
import { createGatewayProjectsClient } from './projects'
import { createGatewayArtifactsClient } from './artifacts'
import { createGatewayExportsClient } from './exports'
import { createGatewayImportsClient } from './imports'
import { createGatewayJobsClient } from './jobs'
import { createChangeRequestsClient } from './change-requests'
import { createAsksClient } from './asks'
import { createRecallNoticesClient } from './recall-notices'
import { createMemoryBeliefsClient } from './memory-beliefs'
import { createMemoryUsesClient } from './memory-uses'
import { createOpenLoopsClient } from './open-loops'
import type { Tomorrow } from './tomorrow'
import { createMemoryCareClient } from './memory-care'
import { createPromptEnhanceClient } from './prompt-enhance'
import { createPromptTemplatesClient } from './prompt-templates'
import { createChatAnswersClient } from './chat-answers'
import { createChatReviewsClient } from './chat-reviews'
import { createChatNamesClient } from './chat-names'
import { createChatForgetClient } from './chat-forget'
import { createChatContextClient } from './chat-context'
import { createChatSummaryClient } from './chat-summary'
import { createOwnerSettingsClient } from './owner-settings'
import { createAccessClient } from './access'
import { createGatewayPlansClient } from './plans'
import { createGatewayCharactersClient } from './characters'
import type { GatewayHostInventoryClient } from './host-inventory'
import { createGatewayHostOpsClient } from './host-ops'
import { createUpdatesClient } from './updates'
import { createGatewayTeamsClient } from './teams'
import { createTeamRunsClient } from './team-runs'
import { createNativeSessionsClient } from './native-sessions'
import { createMemoryCorrectionsClient } from './memory-corrections'
import { createCodexSessionsClient } from './codex-sessions'
import { createGatewayTerminalClient } from './terminal'
import { createGatewayFilesystemClient } from './filesystem'
import { createGatewayCallsClient } from './calls'
import { createGatewaySearchClient } from './search'
import { createProviderControlClient } from './provider-control'
import { createBrowserSessionsClient } from './browser-sessions'
import { createNativeClaudeClient } from './native-claude'
import { createChatGPTClient } from './chatgpt'
import { createGatewaySkillsClient } from './skills'
import type { GatewayMcpClient } from './mcp'
import type { GatewayAuthClient } from './auth'
import { createPiClient, piData } from './pi-client'
import { GatewayError } from './transport'
import {
  identity, count, short, kind, configuration, sessionSettings, modelSettings, providers, systemHealth, gatewayHealth, diagnostics, toolInventory, setupStatus, setupReceiptStep, setupReceiptWritableStep, setupReceipt, setupReceiptInput, setupProtectionPolicy, setupProtectionInput, setupRehearsal, setupChoiceStep, setupChoice, setupChoiceInput, setupModelOptions, setupModelActivation, setupBoundaryPolicy, agentConfiguration, agentProfile, agentCollection, library, connections, content, parse, objectPath, match,
} from './control-schemas'
import type {
  AgentConfiguration, AgentProfile, GatewayDiagnostics, GatewayHealth, MemoryConnections, MemoryContent, MemoryLibrary, MemoryObjectKind, OwnerModelSettings, OwnerModelsConfiguration, OwnerSessionSettings, ProviderStatus, SetupBoundaryPolicy, SetupChoice, SetupChoiceInput, SetupChoiceStep, SetupModelOptions, SetupProtectionInput, SetupProtectionPolicy, SetupReceipt, SetupReceiptInput, SetupReceiptStep, SetupRehearsal, SetupStatus, SystemHealth, ToolInventory,
} from './control-schemas'

// The wire schemas live in control-schemas.ts; their types stay importable from here.
export type {
  AgentConfiguration, AgentProfile, GatewayDiagnostics, GatewayHealth, MemoryConnections, MemoryContent, MemoryLibrary, MemoryObjectCard, MemoryObjectKind, OwnerModelSettings, OwnerModelsConfiguration, OwnerSessionSettings, ProviderStatus, SetupBoundaryPolicy, SetupChoice, SetupChoiceInput, SetupChoiceStep, SetupModelOptions, SetupProtectionInput, SetupProtectionPolicy, SetupReceipt, SetupReceiptInput, SetupReceiptStep, SetupRehearsal, SetupStatus, SetupStep, SystemHealth, ToolInventory,
} from './control-schemas'

const forgetRevision = z.number().int().min(1).max(2147483646)
const forgetPreview = z.object({ memoryId: identity, revision: forgetRevision, text: z.string().max(16000) })
const forgetRequest = z.object({ requestId: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/), memoryId: identity, revision: forgetRevision }).strict()
const forgetPending = z.object({ schemaVersion: z.literal(1), pending: forgetRequest.nullable() }).strict()
const forgetReceipt = z.object({ requestId: forgetRequest.shape.requestId, memoryId: identity, status: z.literal('forgotten'), indexRemoval: z.string().nullable(), cachedPackagesCleared: count, sourceConversationKept: z.literal(true) })
const forgetManyResult = z.object({
  requestId: forgetRequest.shape.requestId, results: z.array(forgetReceipt).max(50),
  stopped: z.object({ index: z.number().int().min(0).max(49), memoryId: identity, code: z.string().max(80), message: z.string().max(500) }).nullable(),
})
export type MemoryForgetManyResult = z.infer<typeof forgetManyResult>
export type MemoryForgetPreview = z.infer<typeof forgetPreview>
export type MemoryForgetReceipt = z.infer<typeof forgetReceipt>
export type MemoryForgetRequest = z.infer<typeof forgetRequest>
export function createMemoryForgetRequest(preview: Pick<MemoryForgetPreview, 'memoryId' | 'revision'>): MemoryForgetRequest {
  return parse(forgetRequest, { requestId: globalThis.crypto.randomUUID(), memoryId: preview.memoryId, revision: preview.revision }, true)
}

/** Owner UI capability only. Conversation retrieval remains separately scoped by Pi. */
export function createGatewayControlClient(auth: Pick<GatewayAuthClient, 'request' | 'audio' | 'getSession' | 'download' | 'upload'>, onCurrentSessionRevoked: () => void) {
  const modelListeners = new Set<() => void>()
  const modelsChanged = () => { for (const listener of modelListeners) listener() }
  const pi = createPiClient(auth)
  return {
    subscribeModels(listener: () => void) { modelListeners.add(listener); return () => { modelListeners.delete(listener) } },
    editorDrafts: createGatewayEditorDrafts(auth),
    providerCredentials: createProviderControlClient(auth),
    chatgpt: createChatGPTClient(auth),
    skills: createGatewaySkillsClient(auth),
    mcp: {
      async list(...args: Parameters<GatewayMcpClient['list']>) { return (await import('./mcp')).createGatewayMcpClient(auth).list(...args) },
      async discover(...args: Parameters<GatewayMcpClient['discover']>) { return (await import('./mcp')).createGatewayMcpClient(auth).discover(...args) },
      async import(...args: Parameters<GatewayMcpClient['import']>) { return (await import('./mcp')).createGatewayMcpClient(auth).import(...args) },
      async setEnabled(...args: Parameters<GatewayMcpClient['setEnabled']>) { return (await import('./mcp')).createGatewayMcpClient(auth).setEnabled(...args) },
      async access(...args: Parameters<GatewayMcpClient['access']>) { return (await import('./mcp')).createGatewayMcpClient(auth).access(...args) },
      async setAccess(...args: Parameters<GatewayMcpClient['setAccess']>) { return (await import('./mcp')).createGatewayMcpClient(auth).setAccess(...args) },
    },
    claude: createNativeClaudeClient(auth),
    browserSessions: createBrowserSessionsClient(auth, onCurrentSessionRevoked),
    projects: createGatewayProjectsClient(auth),
    artifacts: createGatewayArtifactsClient(auth),
    /** Answers and artifacts as Word, PDF, PowerPoint, Excel, CSV or JSON files. */
    exports: createGatewayExportsClient(auth),
    /** ChatGPT and Claude exports, kept as read-only chats. */
    imports: createGatewayImportsClient(auth),
    jobs: createGatewayJobsClient(auth),
    changeRequests: createChangeRequestsClient(auth),
    asks: createAsksClient(auth),
    /** Memories he corrected or forgot that earlier answers had used (the Inbox card). */
    recallNotices: createRecallNoticesClient(auth),
    /** Memories worth tidying: duplicates, disagreements, expired, unused. Read only. */
    memoryCare: createMemoryCareClient(auth),
    memoryBeliefs: createMemoryBeliefsClient(auth),
    memoryUses: createMemoryUsesClient(auth),
    openLoops: createOpenLoopsClient(auth),
    /** What Conker will do on its own in the next 24 hours (R-U10). Read only; loaded with the Jobs screen, out of the first bundle. */
    tomorrow: { read: (signal?: AbortSignal): Promise<Tomorrow> => import('./tomorrow').then(module => module.createTomorrowClient(auth).read(signal)) },
    promptEnhance: createPromptEnhanceClient(auth),
    promptTemplates: createPromptTemplatesClient(auth),
    /** Chat features: answer versions and reviews, names and output settings, context editing. */
    chatAnswers: createChatAnswersClient(auth),
    chatReviews: createChatReviewsClient(auth),
    chatNames: createChatNamesClient(auth),
    chatContext: createChatContextClient(auth),
    chatSummary: createChatSummaryClient(auth),
    /** Deleting Conker chats forever (queued for Pi's restart). */
    chatForget: createChatForgetClient(auth),
    settings: createOwnerSettingsClient(auth),
    access: createAccessClient(auth),
    plans: createGatewayPlansClient(auth),
    characters: createGatewayCharactersClient(auth),
    hostInventory: {
      async request(...args: Parameters<GatewayHostInventoryClient['request']>) { return (await import('./host-inventory')).createGatewayHostInventoryClient(auth).request(...args) },
      async inspect(...args: Parameters<GatewayHostInventoryClient['inspect']>) { return (await import('./host-inventory')).createGatewayHostInventoryClient(auth).inspect(...args) },
      async resume(...args: Parameters<GatewayHostInventoryClient['resume']>) { return (await import('./host-inventory')).createGatewayHostInventoryClient(auth).resume(...args) },
      async configured(...args: Parameters<GatewayHostInventoryClient['configured']>) { return (await import('./host-inventory')).createGatewayHostInventoryClient(auth).configured(...args) },
    },
    hostOps: createGatewayHostOpsClient(auth),
    updates: createUpdatesClient(auth),
    teams: createGatewayTeamsClient(auth),
    /** A team run read by its id, and the owner's next steps on it: run the next role, check, end. */
    teamRuns: createTeamRunsClient(auth),
    filesystem: createGatewayFilesystemClient(auth),
    calls: createGatewayCallsClient(auth),
    search: createGatewaySearchClient(auth),
    terminal: createGatewayTerminalClient(auth),
    nativeSessions: createNativeSessionsClient(auth),
    memoryCorrections: createMemoryCorrectionsClient(auth),
    codexSessions: createCodexSessionsClient(auth),
    async diagnostics(signal?: AbortSignal): Promise<GatewayDiagnostics> {
      return parse(diagnostics, await auth.request('/api/diagnostics', { signal }))
    },
    async agents(signal?: AbortSignal): Promise<AgentProfile[]> {
      return (await piData(pi.GET('/agents', { signal }), agentCollection)).results
    },
    async agent(id: string, signal?: AbortSignal): Promise<AgentProfile> {
      const selected = parse(z.string().regex(/^(?:companion|agent_[0-9a-f]{32})$/), id, true)
      const result = await piData(pi.GET('/agents/{identity}', { params: { path: { identity: selected } }, signal }), agentProfile)
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
      return piData(pi.GET('/setup/status', { signal }), setupStatus)
    },
    async setupBoundaryPolicy(signal?: AbortSignal): Promise<SetupBoundaryPolicy> {
      return parse(setupBoundaryPolicy, await auth.request('/api/control/pi/setup/boundaries', { signal }))
    },
    async setupReceipt(step: SetupReceiptStep, signal?: AbortSignal): Promise<SetupReceipt> {
      const selected = parse(setupReceiptStep, step, true)
      const result = await piData(pi.GET('/setup/receipts/{step}', { params: { path: { step: selected } }, signal }), setupReceipt)
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
      return piData(pi.GET('/setup/protection', { signal }), setupProtectionPolicy)
    },
    async saveSetupProtection(value: SetupProtectionInput, signal?: AbortSignal): Promise<SetupProtectionPolicy> {
      const body = parse(setupProtectionInput, value, true)
      const result = parse(setupProtectionPolicy, await auth.request('/api/control/pi/setup/protection', { method: 'POST', body, signal }))
      if (result.revision !== body.expectedRevision + 1 || result.requestId !== body.requestId || result.destination !== body.destination || result.retentionCopies !== body.retentionCopies) throw new GatewayError('invalid-response')
      return result
    },
    async setupRehearsal(signal?: AbortSignal): Promise<SetupRehearsal> {
      return piData(pi.GET('/setup/rehearsal', { signal }), setupRehearsal)
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
      const result = await piData(pi.GET('/setup/choices/{step}', { params: { path: { step: selected } }, signal }), setupChoice)
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
      return piData(pi.GET('/setup/models', { signal }), setupModelOptions)
    },
    async saveSetupModel(candidateId: string, expectedRevision: number, signal?: AbortSignal): Promise<OwnerModelSettings> {
      const selected = parse(z.string().min(1).max(200).refine(value => value.trim() === value), candidateId, true)
      const result = parse(modelSettings, await auth.request('/api/control/pi/setup/models', {
        method: 'POST', body: { candidateId: selected, expectedRevision: parse(count, expectedRevision, true) }, signal,
      }))
      if (result.revision !== expectedRevision + 1 || result.configuration?.defaultModelId !== selected) throw new GatewayError('invalid-response')
      modelsChanged()
      return result
    },
    async activateSetupModel(candidateId: string, expectedRevision: number, requestId: string, signal?: AbortSignal) {
      const selected = parse(z.string().min(1).max(200).refine(value => value.trim() === value), candidateId, true)
      const request = parse(z.string().regex(/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/), requestId, true)
      const result = parse(setupModelActivation, await auth.request('/api/control/pi/setup/models/activate', {
        method: 'POST', body: { requestId: request, candidateId: selected, expectedRevision: parse(count, expectedRevision, true) }, signal,
      }))
      if (result.revision !== expectedRevision + 1 || result.candidateId !== selected || result.probe.requestId !== request || result.probe.configurationRevision !== result.revision || result.probe.candidateId !== selected) throw new GatewayError('invalid-response')
      modelsChanged()
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
      const result = parse(modelSettings, await auth.request('/api/control/pi/models/configuration', { method: 'POST', body, signal }))
      modelsChanged()
      return result
    },
    /** The exact current text and revision; forgetting succeeds only if it is still current. */
    async forgetPreview(id: string, signal?: AbortSignal): Promise<MemoryForgetPreview> {
      const result = parse(forgetPreview, await auth.request(`/api/control/pi/memory/forget/${parse(identity, id, true)}`, { signal }))
      if (result.memoryId !== id) throw new GatewayError('invalid-response')
      return result
    },
    /** Content-free durable recovery; does not retry or contact MemoryGate. */
    async pendingMemoryForget(signal?: AbortSignal): Promise<MemoryForgetRequest | null> {
      return parse(forgetPending, await auth.request('/api/control/pi/memory/forget-pending', { signal })).pending
    },
    /** Adds one memory in the owner's words. Retrying with the same request id never stores it twice. */
    async rememberMemory(requestId: string, text: string, signal?: AbortSignal): Promise<{ memoryId: string; status: 'remembered' | 'already_remembered' }> {
      const body = { request_id: parse(z.string().regex(/^[A-Za-z0-9_-]{16,128}$/), requestId, true), text: parse(z.string().min(1).max(2000).refine(value => value.trim().length > 0), text, true) }
      return parse(z.object({ memoryId: z.string().min(1).max(200), status: z.enum(['remembered', 'already_remembered']) }).strict(), await auth.request('/api/control/pi/memory/remember', { method: 'POST', body, signal }))
    },
    /** Repeat only the same reviewed identity after an uncertain result. Owner verification still applies. */
    async forgetMemory(request: MemoryForgetRequest, signal?: AbortSignal): Promise<MemoryForgetReceipt> {
      const frozen = parse(forgetRequest, request, true)
      const body = { request_id: frozen.requestId, memory_id: frozen.memoryId, expected_revision: frozen.revision }
      const result = parse(forgetReceipt, await auth.request('/api/control/pi/memory/forget', { method: 'POST', body, signal }))
      if (result.memoryId !== frozen.memoryId || result.requestId !== frozen.requestId) throw new GatewayError('invalid-response')
      return result
    },
    /**
     * Forgets up to 50 reviewed memories in order and stops at the first refusal (`stopped`).
     * Repeating the same request id replays the ones already forgotten and goes on.
     */
    async forgetMany(items: readonly Pick<MemoryForgetPreview, 'memoryId' | 'revision'>[], requestId: string = globalThis.crypto.randomUUID(), signal?: AbortSignal): Promise<MemoryForgetManyResult> {
      if (!items.length || items.length > 50 || new Set(items.map(item => item.memoryId)).size !== items.length) throw new GatewayError('validation')
      const body = { request_id: parse(forgetRequest.shape.requestId, requestId, true), items: items.map(item => ({ memory_id: parse(identity, item.memoryId, true), expected_revision: parse(forgetRevision, item.revision, true) })) }
      const result = parse(forgetManyResult, await auth.request('/api/control/pi/memory/forget-many', { method: 'POST', body, signal }))
      if (result.requestId !== requestId || result.results.some((item, index) => item.memoryId !== items[index]?.memoryId)) throw new GatewayError('invalid-response')
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
