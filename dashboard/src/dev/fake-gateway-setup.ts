/**
 * Development-only first-run setup for the preview: the answer-model choice, optional memory and
 * capability choices, the boundary receipt and protection policy, the owner rehearsal evidence,
 * and the computed setup status, all in the real routes' wire shapes.
 */
import { followAnswerRoles } from '../lib/api/model-roles'
import type { ModelRolesConfiguration } from '../lib/api/model-roles'
type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST' | 'PUT'; body?: Json }

export function createFakeSetup(preview: { setupStep?: 'model' | 'memory' | 'capabilities' | 'protection' | 'rehearsal' }, approvals: Json[], now: () => number, iso: (seconds: number) => string, fail: (status: number) => never) {
  let boundaryReceipt: Json | null = preview.setupStep === 'protection' || preview.setupStep === 'rehearsal' ? { step: 'boundaries', revision: 1, receiptId: 'preview-boundaries', source: 'conker.dashboard', subject: 'toolgate.policy', evidenceDigest: 'b'.repeat(64), completedAt: iso(now()), expiresAt: iso(now() + 86400), recordedAt: iso(now()), state: 'valid' } : null
  let protectionPolicy: Json = { schemaVersion: 1, revision: 0, requestId: null, destinationKind: 'mounted_off_machine', destination: null, retentionCopies: null, policyDigest: null, recordedAt: null }
  let rehearsalMemoryReviewed = false
  let rehearsalApproval: 'missing' | 'awaiting_owner' | 'complete' = 'missing'
  let rehearsalRequestId: string | null = null
  let rehearsalComplete = false
  let setupModelChosen = preview.setupStep !== 'model'
  const setupChoices = new Map<string, Json>([
    ['companion', { step: 'companion', revision: 0, requestId: null, choice: 'undecided', recordedAt: null }],
    ['memory', { step: 'memory', revision: preview.setupStep === 'memory' ? 0 : 1, requestId: preview.setupStep === 'memory' ? null : 'preview-memory-include', choice: preview.setupStep === 'memory' ? 'undecided' : 'include', recordedAt: preview.setupStep === 'memory' ? null : iso(now()) }],
    ['capabilities', { step: 'capabilities', revision: preview.setupStep === 'capabilities' ? 0 : 1, requestId: preview.setupStep === 'capabilities' ? null : 'preview-capabilities-include', choice: preview.setupStep === 'capabilities' ? 'undecided' : 'include', recordedAt: preview.setupStep === 'capabilities' ? null : iso(now()) }],
  ])
  const boundaryPolicy = {
    lockdown: false, scopePatterns: ['calendar.read', 'email.send', 'research.search'], digest: 'b'.repeat(64),
    tools: [
      { id: 'calendar.read', name: 'Read calendar', authorization: 'auto', executionType: 'http', usageLimits: { max_per_minute: 12, max_per_hour: 120, max_runtime_seconds: 30 }, definitionDigest: '1'.repeat(64) },
      { id: 'email.send', name: 'Send email', authorization: 'owner_confirmation', executionType: 'http', usageLimits: { max_per_minute: 4, max_per_hour: 40, max_runtime_seconds: 30 }, definitionDigest: '2'.repeat(64) },
      { id: 'research.search', name: 'Web search', authorization: 'auto', executionType: 'http', usageLimits: { max_per_minute: 10, max_per_hour: 80, max_runtime_seconds: 30 }, definitionDigest: '3'.repeat(64) },
    ],
  }
  const role = (modelId: string | null, eligible: string[]) => ({ enabled: modelId !== null, eligibleModelIds: eligible, modelId, timeoutMs: 30000, failure: 'stop', fallbackModelIds: [], followAnswer: false })
  const models: { revision: number; configuration: Json } = { revision: 1, configuration: {
    providers: [{ id: 'ollama', name: 'Local (Ollama)', enabled: true }],
    models: [
      { id: 'qwen-small', providerId: 'ollama', name: 'Qwen 2.5 3B', route: 'qwen2.5:3b', enabled: true, routingDescription: 'Fast, everyday chat' },
      { id: 'qwen-4b', providerId: 'ollama', name: 'Qwen 3 4B', route: 'qwen3:4b', enabled: true, routingDescription: 'Slower, a little smarter' },
    ],
    defaultModelId: 'qwen-small',
    roleSettings: { answerMode: 'manual', roles: { answer: role('qwen-small', ['qwen-small']), routing: role(null, []), 'context-selection': role(null, []), summarization: role(null, []), 'memory-ranking': role(null, []), proposals: role(null, []) } },
  } }
  const rehearsalStatus = (): Json => ({
    schemaVersion: 1, state: rehearsalComplete ? 'complete' : rehearsalMemoryReviewed && rehearsalApproval === 'complete' ? 'ready' : 'in_progress',
    conversation: { state: 'complete', detail: 'A completed companion conversation is available.' },
    memoryReview: { state: rehearsalMemoryReviewed ? 'complete' : 'missing', detail: rehearsalMemoryReviewed ? 'The current memory choice was reviewed.' : 'Long-term memory is on for new conversations. Review this choice before continuing.' },
    approval: { state: rehearsalApproval, detail: rehearsalApproval === 'complete' ? 'The owner-approved local echo completed once.' : rehearsalApproval === 'awaiting_owner' ? 'Review the harmless local echo in Inbox, then finish the check here.' : 'Start the harmless local approval check.' },
    approvalRequestId: rehearsalRequestId, canFinalize: rehearsalMemoryReviewed && rehearsalApproval === 'complete' && !rehearsalComplete,
  })
  return function handle(path: string, method: 'GET' | 'POST' | 'PUT', options: Request): Json | undefined {
    let match: RegExpMatchArray | null
    if (path === '/api/control/pi/models/configuration') {
      if (method === 'POST') { models.revision += 1; models.configuration = followAnswerRoles(options.body?.configuration as Json & { roleSettings: ModelRolesConfiguration }) }
      return models
    }
    if (path === '/api/control/pi/setup/models') {
      if (method === 'POST') {
        const candidateId = String(options.body?.candidateId || '')
        models.revision += 1
        const configuration = models.configuration as unknown as Record<string, unknown>
        configuration.defaultModelId = candidateId
        const roleSettings = configuration.roleSettings as Record<string, unknown>
        const roles = roleSettings.roles as Record<string, unknown>
        const answer = roles.answer as Record<string, unknown>
        answer.modelId = candidateId
        answer.enabled = true
        roleSettings.answerMode = 'manual'
        return models
      }
      const configuration = models.configuration as unknown as Record<string, unknown>
      const entries = configuration.models as Array<Record<string, unknown>>
      const modelProviders = configuration.providers as Array<Record<string, unknown>>
      return { revision: models.revision, candidates: entries.map(model => ({
        id: model.id, providerId: model.providerId, providerName: modelProviders.find(provider => provider.id === model.providerId)?.name,
        name: model.name, route: model.route, status: 'ready', selected: configuration.defaultModelId === model.id,
        execution: 'local', dataNotice: 'The setup test stays on this server.', costNotice: 'No provider charge.',
      })) }
    }
    if (path === '/api/control/pi/setup/models/activate' && method === 'POST') {
      const candidateId = String(options.body?.candidateId || '')
      models.revision += 1
      const configuration = models.configuration as unknown as Record<string, unknown>
      configuration.defaultModelId = candidateId
      const roleSettings = configuration.roleSettings as Record<string, unknown>
      const roles = roleSettings.roles as Record<string, unknown>
      const answer = roles.answer as Record<string, unknown>
      answer.modelId = candidateId; answer.enabled = true; roleSettings.answerMode = 'manual'; setupModelChosen = true
      return { revision: models.revision, candidateId, probe: {
        schemaVersion: 1, requestId: options.body?.requestId, configurationRevision: models.revision, candidateId,
        providerId: 'ollama', requestedModel: 'qwen2.5:3b', actualModel: 'qwen2.5:3b', execution: 'local',
        responseDigest: 'a'.repeat(64), completedAt: iso(now()), recordedAt: iso(now()),
      } }
    }
    if (path === '/api/control/pi/setup/boundaries') return boundaryPolicy
    if (path === '/api/control/pi/setup/protection') {
      if (method === 'GET') return protectionPolicy
      if (Number(options.body?.expectedRevision) !== Number(protectionPolicy.revision)) return fail(409)
      protectionPolicy = {
        schemaVersion: 1, revision: Number(protectionPolicy.revision) + 1,
        requestId: options.body?.requestId, destinationKind: 'mounted_off_machine',
        destination: options.body?.destination, retentionCopies: options.body?.retentionCopies,
        policyDigest: 'd'.repeat(64), recordedAt: iso(now()),
      }
      return protectionPolicy
    }
    if ((match = path.match(/^\/api\/control\/pi\/setup\/choices\/(companion|memory|capabilities)$/))) {
      const current = setupChoices.get(match[1])!
      if (method === 'GET') return current
      const choice = options.body?.choice
      const valid = match[1] === 'companion' ? choice === 'accept' : choice === 'include' || choice === 'skip'
      if (!valid) return fail(422)
      if (Number(options.body?.expectedRevision) !== current.revision) return fail(409)
      const saved = { step: match[1], revision: Number(current.revision) + 1, requestId: options.body?.requestId, choice: options.body?.choice, recordedAt: iso(now()) }
      setupChoices.set(match[1], saved)
      return saved
    }
    if (path === '/api/control/pi/setup/receipts/boundaries') {
      if (method === 'GET') return boundaryReceipt ?? fail(404)
      boundaryReceipt = { step: 'boundaries', revision: 1, ...options.body, recordedAt: iso(now()), state: 'valid' }
      return boundaryReceipt
    }
    if (path === '/api/control/pi/setup/rehearsal') return rehearsalStatus()
    if (path === '/api/control/pi/setup/rehearsal/memory-review') {
      rehearsalMemoryReviewed = true
      return rehearsalStatus()
    }
    if (path === '/api/control/pi/setup/rehearsal/approval/start') {
      rehearsalApproval = 'awaiting_owner'; rehearsalRequestId = String(options.body?.requestId)
      if (!approvals.some(item => item.id === 'req_setup_rehearsal')) approvals.unshift({
        id: 'req_setup_rehearsal', kind: 'verification', title: 'Verify the approval flow', details: 'A fixed local echo proves that Conker asks before acting. It cannot access the network or filesystem.',
        actor: 'Conker setup', severity: 'normal', status: 'pending', created_at: iso(now()), updated_at: iso(now()), decision: null,
        action: { subject_type: 'tool', subject_id: 'approval.test-echo', version: 1, args: { value: 'Conker first-run approval rehearsal' } },
        approval: { expires_at: iso(now() + 600), consumed_at: null, origin_valid: true }, reviewable: true, unavailable_reason: null,
      })
      return rehearsalStatus()
    }
    if (path === '/api/control/pi/setup/rehearsal/approval/resume') {
      if (options.body?.requestId !== rehearsalRequestId) return fail(409)
      if (approvals.find(item => item.id === 'req_setup_rehearsal')?.status !== 'approved') return fail(409)
      rehearsalApproval = 'complete'
      return rehearsalStatus()
    }
    if (path === '/api/control/pi/setup/rehearsal/finalize') {
      if (!rehearsalMemoryReviewed || rehearsalApproval !== 'complete') return fail(409)
      rehearsalComplete = true
      return { step: 'rehearsal', revision: 1, receiptId: 'rehearsal-' + 'c'.repeat(64), source: 'conker.first-run-rehearsal', subject: 'owner.daily-workflow', evidenceDigest: 'c'.repeat(64), completedAt: iso(now()), expiresAt: iso(now() + 86400), recordedAt: iso(now()), state: 'valid' }
    }
    if (path === '/api/control/pi/setup/status') {
      const setupScenario = globalThis.sessionStorage?.getItem('conker-fake-fail')
      if (setupScenario === 'setup-status') return fail(503)
      const memoryChoice = setupChoices.get('memory')?.choice
      const capabilitiesChoice = setupChoices.get('capabilities')?.choice
      const memoryPending = memoryChoice === 'undecided'
      const capabilitiesPending = capabilitiesChoice === 'undecided'
      const memoryState = memoryPending ? 'in_progress' : memoryChoice === 'skip' ? 'skipped' : 'complete'
      const capabilitiesState = capabilitiesPending ? 'in_progress' : capabilitiesChoice === 'skip' ? 'skipped' : 'complete'
      const rehearsalPreview = preview.setupStep === 'rehearsal'
      const currentStep = rehearsalComplete ? null : !setupModelChosen ? 'model' : memoryPending ? 'memory' : capabilitiesPending ? 'capabilities' : rehearsalPreview ? 'rehearsal' : boundaryReceipt ? 'protection' : 'boundaries'
      const recommendedNextOperation = rehearsalComplete ? null : !setupModelChosen ? 'test_model' : memoryPending ? 'configure_memory' : capabilitiesPending ? 'configure_capabilities' : rehearsalPreview ? 'run_rehearsal' : boundaryReceipt ? 'verify_protection' : 'review_boundaries'
      const status = {
        schemaVersion: 1, workflow: 'first-run', state: rehearsalComplete ? 'complete' : 'in_progress', currentStep, recommendedNextOperation, generatedAt: iso(now()),
        steps: [
          ['security', 'complete', true, [], null, 'Owner access and durable storage are verified.'],
          ['companion', 'complete', true, ['security'], null, 'Durable Companion configuration is available.'],
          ['model', !setupModelChosen ? 'in_progress' : 'complete', true, ['security', 'companion'], !setupModelChosen ? 'model_response_unverified' : null, !setupModelChosen ? 'The selected answer model has not produced a verified setup response.' : 'The selected answer model produced a valid setup response.'],
          ['memory', memoryState, false, ['security', 'companion', 'model'], memoryPending ? 'memory_choice_unreviewed' : null, memoryPending ? 'Choose whether new conversations may use long-term memory.' : memoryChoice === 'skip' ? 'Long-term memory is off for new conversations.' : 'MemoryGate is configured and available.'],
          ['capabilities', capabilitiesState, false, ['security', 'companion', 'model'], capabilitiesPending ? 'capability_choice_unreviewed' : null, capabilitiesPending ? 'Choose whether model turns may use available capabilities.' : capabilitiesChoice === 'skip' ? 'Available capabilities are hidden from model turns.' : 'ToolGate exposes 3 scoped capabilities.'],
          ['boundaries', boundaryReceipt ? 'complete' : 'degraded', true, ['security', 'companion', 'model'], boundaryReceipt ? null : 'boundary_receipt_unavailable', boundaryReceipt ? 'Owner-attested boundary evidence matches the current ToolGate policy.' : 'Approval and execution policy still needs a verified receipt.'],
          ['protection', rehearsalPreview ? 'complete' : 'not_started', true, ['security'], rehearsalPreview ? null : 'protection_receipt_unavailable', rehearsalPreview ? 'A recoverable backup has current verified evidence.' : Number(protectionPolicy.revision) === 0 ? 'Choose a mounted off-machine backup destination and retention before the first backup.' : `Policy saved for ${protectionPolicy.destination}. Run the host verifier to create the first backup.`],
          ['rehearsal', rehearsalComplete ? 'complete' : 'not_started', true, ['security', 'companion', 'model', 'boundaries', 'protection'], rehearsalComplete ? null : 'rehearsal_receipt_unavailable', rehearsalComplete ? 'Conversation, memory review, and harmless approval evidence are current.' : 'Complete one conversation, one memory review, and one harmless approval flow.'],
        ].map(([id, state, required, prerequisites, blockingReasonCode, detail]) => ({ id, state, required, prerequisites, blockingReasonCode, evidence: [
          { source: `preview.${id}`, status: state === 'complete' || state === 'skipped' ? 'ok' : state === 'not_started' ? 'missing' : 'unknown', revision: state === 'complete' || state === 'skipped' ? 1 : null, detail },
          ...(id === 'capabilities' ? [{ source: 'speech', status: 'missing', revision: null, detail: 'Voice is optional and not configured. Use conker speech configure on the host to enable it.' }] : []),
        ] })),
      }
      return setupScenario === 'setup-complete' ? { ...status, state: 'complete', currentStep: null, recommendedNextOperation: null,
        steps: status.steps.map(step => ({ ...step, state: step.state === 'skipped' ? 'skipped' : 'complete', blockingReasonCode: null,
          evidence: [{ source: 'preview.complete', status: 'ok', revision: 1, detail: 'Synthetic completed setup evidence.' }] })) } : status
    }
    return undefined
  }
}
