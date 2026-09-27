const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { createRequire } = require('node:module')

const root = path.resolve(__dirname, '..')
const { build } = createRequire(require.resolve('vite', { paths: [root] }))('esbuild')
const valid = {
  schemaVersion: 1, workflow: 'first-run', state: 'blocked', currentStep: 'model', recommendedNextOperation: 'configure_model',
  generatedAt: '2026-09-26T12:00:00Z', steps: [
    ['security', 'complete', true, [], null], ['companion', 'complete', true, ['security'], null],
    ['model', 'not_started', true, ['security', 'companion'], 'model_configuration_missing'],
    ['memory', 'not_started', false, ['security', 'companion', 'model'], 'memory_not_configured'],
    ['capabilities', 'not_started', false, ['security', 'companion', 'model'], 'toolgate_not_configured'],
    ['boundaries', 'degraded', true, ['security', 'companion', 'model'], 'boundary_receipt_unavailable'],
    ['protection', 'degraded', true, ['security'], 'protection_receipt_unavailable'],
    ['rehearsal', 'not_started', true, ['security', 'companion', 'model', 'boundaries', 'protection'], 'rehearsal_receipt_unavailable'],
  ].map(([id, state, required, prerequisites, blockingReasonCode]) => ({ id, state, required, prerequisites, blockingReasonCode,
    evidence: [{ source: `test.${id}`, status: state === 'complete' ? 'ok' : 'missing', revision: null, detail: `Evidence for ${id}.` }] })),
}

async function main() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'conker-setup-check-'))
  try {
    const output = path.join(temporary, 'control.cjs')
    await build({ entryPoints: [path.join(root, 'src/lib/gateway/control.ts')], outfile: output, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' })
    const { createGatewayControlClient } = require(output)
    const calls = []
    const client = createGatewayControlClient({ request: async (requestPath, options) => { calls.push({ requestPath, options }); return valid } })
    const status = await client.setupStatus()
    assert.equal(status.currentStep, 'model')
    assert.equal(status.steps.length, 8)
    assert.equal(calls[0].requestPath, '/api/control/pi/setup/status')
    assert.equal(calls[0].options.signal, undefined)

    const boundary = { lockdown: false, scopePatterns: ['calendar.read'], tools: [{ id: 'calendar.read', name: 'Calendar', authorization: 'auto', executionType: 'http', usageLimits: { max_per_hour: 10 }, definitionDigest: 'c'.repeat(64) }], digest: 'b'.repeat(64) }
    const boundaryClient = createGatewayControlClient({ request: async (requestPath, options) => { calls.push({ requestPath, options }); return boundary } })
    assert.deepEqual(await boundaryClient.setupBoundaryPolicy(), boundary)
    assert.equal(calls.at(-1).requestPath, '/api/control/pi/setup/boundaries')

    const receipt = { step: 'boundaries', revision: 2, receiptId: 'receipt:boundary:2', source: 'conker-cli', subject: 'toolgate-policy', evidenceDigest: 'a'.repeat(64), completedAt: '2026-09-26T12:00:00Z', expiresAt: '2026-10-01T12:00:00Z', recordedAt: '2026-09-26T12:00:01Z', state: 'valid' }
    const receiptClient = createGatewayControlClient({ request: async (requestPath, options) => { calls.push({ requestPath, options }); return receipt } })
    assert.deepEqual(await receiptClient.setupReceipt('boundaries'), receipt)
    assert.deepEqual(await receiptClient.recordSetupReceipt('boundaries', { receiptId: receipt.receiptId, source: receipt.source, subject: receipt.subject, evidenceDigest: receipt.evidenceDigest, completedAt: receipt.completedAt, expiresAt: receipt.expiresAt, expectedRevision: 1 }), receipt)
    assert.equal(calls.at(-2).requestPath, '/api/control/pi/setup/receipts/boundaries')
    assert.equal(calls.at(-1).options.method, 'POST')
    await assert.rejects(receiptClient.recordSetupReceipt('protection', {}, undefined), error => error.kind === 'validation')
    await assert.rejects(receiptClient.setupReceipt('../unsafe'), error => error.kind === 'validation')

    const protection = { schemaVersion: 1, revision: 0, requestId: null, destinationKind: 'mounted_off_machine', destination: null, retentionCopies: null, policyDigest: null, recordedAt: null }
    const protectionClient = createGatewayControlClient({ request: async (requestPath, options) => {
      calls.push({ requestPath, options })
      if (options?.method === 'POST') return { ...protection, revision: 1, requestId: options.body.requestId, destination: options.body.destination, retentionCopies: options.body.retentionCopies, policyDigest: 'd'.repeat(64), recordedAt: '2026-09-27T12:00:00Z' }
      return protection
    } })
    assert.equal((await protectionClient.setupProtection()).revision, 0)
    assert.equal((await protectionClient.saveSetupProtection({ requestId: 'setup-protection-test', destination: '/mnt/conker', retentionCopies: 7, expectedRevision: 0 })).destination, '/mnt/conker')
    assert.equal(calls.at(-2).requestPath, '/api/control/pi/setup/protection')
    assert.equal(calls.at(-1).options.method, 'POST')
    await assert.rejects(protectionClient.saveSetupProtection({ requestId: 'setup-protection-test-2', destination: 'relative', retentionCopies: 7, expectedRevision: 1 }), error => error.kind === 'validation')

    const choice = { step: 'memory', revision: 0, requestId: null, choice: 'undecided', recordedAt: null }
    const choiceClient = createGatewayControlClient({ request: async (requestPath, options) => {
      calls.push({ requestPath, options })
      if (options?.method === 'POST') return { ...choice, revision: 1, requestId: options.body.requestId, choice: options.body.choice, recordedAt: '2026-09-26T12:00:00Z' }
      return choice
    } })
    assert.deepEqual(await choiceClient.setupChoice('memory'), choice)
    const savedChoice = await choiceClient.saveSetupChoice('memory', { requestId: 'setup-choice-memory-test', choice: 'skip', expectedRevision: 0 })
    assert.equal(savedChoice.choice, 'skip')
    assert.equal(calls.at(-2).requestPath, '/api/control/pi/setup/choices/memory')
    assert.equal(calls.at(-1).options.method, 'POST')
    await assert.rejects(choiceClient.setupChoice('unknown'), error => error.kind === 'validation')
    const companionClient = createGatewayControlClient({ request: async (requestPath, options) => options?.method === 'POST'
      ? { step: 'companion', revision: 1, requestId: options.body.requestId, choice: 'accept', recordedAt: '2026-09-26T12:00:00Z' }
      : { step: 'companion', revision: 0, requestId: null, choice: 'undecided', recordedAt: null } })
    assert.equal((await companionClient.saveSetupChoice('companion', { requestId: 'setup-choice-companion-test', choice: 'accept', expectedRevision: 0 })).choice, 'accept')

    const rehearsal = { schemaVersion: 1, state: 'in_progress', conversation: { state: 'complete', detail: 'A completed companion conversation is available.' }, memoryReview: { state: 'missing', detail: 'Review memory.' }, approval: { state: 'missing', detail: 'Start approval.' }, approvalRequestId: null, canFinalize: false }
    const rehearsalReceipt = { ...receipt, step: 'rehearsal', source: 'conker.first-run-rehearsal', subject: 'owner.daily-workflow' }
    const rehearsalClient = createGatewayControlClient({ request: async (requestPath, options) => {
      calls.push({ requestPath, options })
      return requestPath.endsWith('/finalize') ? rehearsalReceipt : { ...rehearsal, approvalRequestId: options?.body?.requestId ?? null }
    } })
    assert.equal((await rehearsalClient.setupRehearsal()).conversation.state, 'complete')
    assert.equal((await rehearsalClient.reviewSetupMemory(1, 'memory-review-test')).memoryReview.state, 'missing')
    assert.equal((await rehearsalClient.startSetupApproval('approval-flow-test')).approvalRequestId, 'approval-flow-test')
    assert.equal((await rehearsalClient.resumeSetupApproval('approval-flow-test')).approvalRequestId, 'approval-flow-test')
    assert.equal((await rehearsalClient.finalizeSetupRehearsal()).source, 'conker.first-run-rehearsal')
    assert.deepEqual(calls.slice(-5).map(item => item.requestPath), [
      '/api/control/pi/setup/rehearsal',
      '/api/control/pi/setup/rehearsal/memory-review',
      '/api/control/pi/setup/rehearsal/approval/start',
      '/api/control/pi/setup/rehearsal/approval/resume',
      '/api/control/pi/setup/rehearsal/finalize',
    ])

    const modelOptions = { revision: 2, candidates: [{ id: 'local-answer', providerId: 'ollama', providerName: 'Local model', name: 'Qwen 3 4B', route: 'qwen3:4b', status: 'ready', selected: false, execution: 'local', dataNotice: 'The setup test stays on this server.', costNotice: 'No provider charge.' }] }
    const modelClient = createGatewayControlClient({ request: async (requestPath, options) => {
      calls.push({ requestPath, options })
      if (options?.method === 'POST') return { revision: 3, configuration: { providers: [{ id: 'ollama', name: 'Local model', enabled: true }], models: [{ id: 'local-answer', providerId: 'ollama', name: 'Qwen 3 4B', route: 'qwen3:4b', enabled: true, routingDescription: '' }], defaultModelId: 'local-answer', roleSettings: { answerMode: 'manual', roles: Object.fromEntries(['answer', 'routing', 'context-selection', 'summarization', 'memory-ranking', 'proposals'].map(role => [role, { enabled: role === 'answer', eligibleModelIds: role === 'answer' ? ['local-answer'] : [], modelId: role === 'answer' ? 'local-answer' : null, timeoutMs: 30000, failure: 'stop', fallbackModelId: null }])) } } }
      return modelOptions
    } })
    assert.equal((await modelClient.setupModels()).candidates[0].status, 'ready')
    assert.equal((await modelClient.saveSetupModel('local-answer', 2)).revision, 3)
    assert.equal(calls.at(-2).requestPath, '/api/control/pi/setup/models')
    assert.equal(calls.at(-1).options.method, 'POST')
    const activationClient = createGatewayControlClient({ request: async (requestPath, options) => {
      calls.push({ requestPath, options })
      return { revision: 3, candidateId: 'local-answer', probe: { schemaVersion: 1, requestId: options.body.requestId, configurationRevision: 3, candidateId: 'local-answer', providerId: 'ollama', requestedModel: 'qwen3:4b', actualModel: 'qwen3:4b', execution: 'local', responseDigest: 'd'.repeat(64), completedAt: '2026-09-26T12:00:00Z', recordedAt: '2026-09-26T12:00:00Z' } }
    } })
    assert.equal((await activationClient.activateSetupModel('local-answer', 2, 'setup-model-probe-test')).probe.execution, 'local')
    assert.equal(calls.at(-1).requestPath, '/api/control/pi/setup/models/activate')
    assert.equal(calls.at(-1).options.method, 'POST')

    const invalid = createGatewayControlClient({ request: async () => ({ ...valid, recommendedNextOperation: 'run_anything' }) })
    await assert.rejects(invalid.setupStatus(), error => error.kind === 'invalid-response')

    const transport = await fs.readFile(path.join(root, 'src/lib/gateway/transport.ts'), 'utf8')
    const workspace = await fs.readFile(path.join(root, 'src/components/gateway/workspace.tsx'), 'utf8')
    const gatewayNavigation = await fs.readFile(path.join(root, 'src/components/gateway/navigation.ts'), 'utf8')
    const sidebar = await fs.readFile(path.join(root, 'src/components/gateway/chat-sidebar.tsx'), 'utf8')
    const progress = await fs.readFile(path.join(root, 'src/components/gateway/setup-progress.tsx'), 'utf8')
    const preview = await fs.readFile(path.join(root, 'src/dev/fake-gateway.ts'), 'utf8')
    const statusHook = await fs.readFile(path.join(root, 'src/components/gateway/setup-status-hook.ts'), 'utf8')
    assert.ok(transport.includes('/^\\/api\\/control\\/pi\\/setup\\/status$/'),
      'Setup status must be an exact GET allowlist route')
    assert.match(transport, /setup\\\/receipts/, 'Receipt reads and writes must use bounded exact routes')
    const setupPostRoutes = transport.match(/POST: \[([^\n]+)/)?.[1] ?? ''
    assert.doesNotMatch(setupPostRoutes, /setup\\\/receipts[^\n]*protection/,
      'Browser writes must not be able to manufacture host protection evidence')
    assert.ok(transport.includes('/^\\/api\\/control\\/pi\\/setup\\/boundaries$/'), 'Boundary policy must be an exact GET route')
    assert.match(transport, /setup\\\/models\\\/activate/, 'Verified model setup must use a bounded exact write route')
    assert.match(transport, /setup\\\/choices/, 'Optional choices must use bounded exact routes')
    assert.match(gatewayNavigation, /'\/setup': 'setup'/,
      'Setup must be owned by the connected route registry')
    assert.match(workspace, /setupActive = route === 'setup'/,
      'The connected shell must render setup through the shared route resolver')
    assert.match(workspace, /params\.get\('tab'\) === 'harness'[\s\S]*GatewayAgentsWorkspace/,
      'Companion harness configuration must be reachable from the connected shell')
    assert.match(sidebar, /setup\.status\.state !== 'complete'/,
      'Completed setup must leave the persistent sidebar')
    assert.match(progress, /Mounted destination[\s\S]*Copies to keep[\s\S]*Save backup policy/,
      'Protection must collect one typed off-machine destination and retention policy')
    assert.match(progress, /conker setup run protection/,
      'Protection must point to the evidence-producing host command')
    assert.match(progress, /Have one real conversation[\s\S]*Review memory behavior[\s\S]*Approve one harmless local check/,
      'Owner rehearsal must prove the three ordinary daily workflows')
    assert.match(progress, /Start approval check[\s\S]*Review in Inbox[\s\S]*Finish approved check/,
      'The harmless approval rehearsal must use the real owner decision flow')
    assert.doesNotMatch(progress, /release_acceptance|release-acceptance/,
      'First-run onboarding must not be coupled to assembled Linux release promotion')
    assert.match(progress, /Your companion is available now/,
      'Setup must hand off to first value as soon as the secure conversation prerequisites are verified')
    assert.match(progress, /First conversation[\s\S]*Working boundaries[\s\S]*Recovery and proof/,
      'Setup must group the verification ledger into an understandable path')
    assert.match(progress, /This is the last verified result/,
      'A failed refresh must distinguish retained evidence from a current result')
    assert.match(progress, /Keep off for now/,
      'Optional setup steps must expose a durable skip instead of trapping the state machine')
    assert.match(progress, /skipped: 'Off for now'/,
      'An explicit opt-out must not be presented as a verified enabled capability')
    assert.match(preview, /memoryChoice === 'skip' \? 'skipped'/,
      'The preview must preserve memory opt-out semantics')
    assert.match(preview, /capabilitiesChoice === 'skip' \? 'skipped'/,
      'The preview must preserve capability opt-out semantics')
    assert.match(progress, /Use memory[\s\S]*Keep off for now/,
      'Memory setup must require an explicit owner choice instead of completing from service presence')
    assert.match(progress, /Connect available tools/,
      'Capability setup must require an explicit owner choice instead of completing from catalogue presence')
    assert.match(progress, /Voice conversations/,
      'Capability setup must identify optional voice setup')
    assert.match(progress, /conker speech configure/,
      'Capability setup must expose the host-owned speech wizard without collecting a browser secret')
    assert.match(progress, /Keep supplied default/,
      'The supplied Companion must require an explicit owner review or acceptance')
    assert.match(progress, /Use and test model/,
      'The setup surface must select and prove a server-discovered answer model without leaving onboarding')
    assert.match(progress, /dataNotice[\s\S]*costNotice/,
      'Model onboarding must disclose where the setup prompt goes and whether provider billing may apply')
    assert.match(statusHook, /conker:setup-status-refresh/,
      'Every setup-status consumer must refresh after a receipt changes progress')
    console.log('Gateway setup passed: strict server contract, exact route, connected surface and completion-aware sidebar.')
  } finally {
    await fs.rm(temporary, { recursive: true, force: true })
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
