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

async function checkSharedSetup(temporary) {
  const output = path.join(temporary, 'setup-store.cjs')
  await build({ entryPoints: [path.join(root, 'src/components/gateway/setup-status-store.ts')], outfile: output, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' })
  const { createSetupStatusStore, setupStatusStore, setupRefreshCooldown } = require(output)
  const originalWindow = global.window, originalDocument = global.document
  global.window = new EventTarget(); global.document = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
  const calls = []
  const client = { setupStatus(signal) { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); calls.push({ signal, resolve, reject }); return promise } }
  let clock = 0
  const store = createSetupStatusStore(client, () => clock), first = [], second = []
  const complete = { ...valid, state: 'complete', currentStep: null, recommendedNextOperation: null }
  try {
    assert.equal(setupStatusStore(client), setupStatusStore(client), 'A client has one shared setup read')
    assert.notEqual(setupStatusStore(client), setupStatusStore({ ...client }), 'Other authenticated clients do not share evidence')
    const leaveSidebar = store.subscribe(() => first.push(store.getSnapshot()))
    const leavePage = store.subscribe(() => second.push(store.getSnapshot()))
    store.enter(); await flush()
    assert.equal(calls.length, 1, 'Sidebar and Setup entry share one in-flight read')
    calls[0].resolve(valid); await flush()
    assert.equal(first.at(-1), second.at(-1), 'Both surfaces observe the exact same result')
    window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('online')); await flush()
    assert.equal(calls.length, 1, 'Automatic events are bounded by the freshness cooldown')
    store.enter(); await flush(); assert.equal(calls.length, 2, 'Entering Setup always checks completed prior evidence')
    store.refresh(); await flush(); assert.equal(calls.length, 3); assert.equal(calls[1].signal.aborted, true)
    calls[2].resolve(complete); calls[1].resolve(valid); await flush()
    assert.equal(store.getSnapshot().status, complete, 'A superseded late reply cannot overwrite newer evidence')
    clock += setupRefreshCooldown
    window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange')); await flush()
    assert.equal(calls.length, 4, 'A burst of return events starts only one read')
    calls[3].reject(new Error('offline')); await flush()
    assert.equal(store.getSnapshot().error, true); assert.equal(store.getSnapshot().status, complete, 'Prior completion is retained as stale evidence, never silently treated as current')
    document.visibilityState = 'hidden'; clock += setupRefreshCooldown
    window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange')); await flush()
    assert.equal(calls.length, 4, 'A hidden workspace starts no automatic read')
    document.visibilityState = 'visible'; document.dispatchEvent(new Event('visibilitychange')); await flush()
    assert.equal(calls.length, 5)
    leavePage(); assert.equal(calls[4].signal.aborted, false, 'Closing Setup keeps the shared sidebar read alive')
    leaveSidebar(); assert.equal(calls[4].signal.aborted, true); assert.equal(store.getSnapshot().status, null)
    const leaveNewSession = store.subscribe(() => {}); await flush()
    calls[5].resolve(complete); calls[4].resolve(valid); await flush()
    assert.equal(store.getSnapshot().status, complete, 'An old authenticated lifetime cannot populate a new one')
    leaveNewSession()
    window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('conker:setup-status-refresh')); await flush()
    assert.equal(calls.length, 6, 'Unsubscribed clients do not perform background reads')
    const transient = store.subscribe(() => {}); transient()
    const strictMode = store.subscribe(() => {}); await flush()
    assert.equal(calls.length, 7, 'StrictMode remount deduplicates deferred first reads')
    strictMode(); calls[6].resolve(valid); await flush(); assert.equal(store.getSnapshot().status, null)
  } finally { global.window = originalWindow; global.document = originalDocument }
}

async function main() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'conker-setup-check-'))
  try {
    await checkSharedSetup(temporary)
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

    const presentationOutput = path.join(temporary, 'setup-presentation.cjs')
    await build({ entryPoints: [path.join(root, 'src/components/gateway/setup-presentation.ts')], outfile: presentationOutput, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' })
    const { summarizeSetup } = require(presentationOutput)
    assert.deepEqual(summarizeSetup(valid), {
      current: valid.steps[2], operation: { label: 'Choose an answer model', to: '/settings' }, resolved: 2, remainingRequired: 4, attention: 2,
    })
    assert.equal(summarizeSetup({ ...valid, state: 'complete', currentStep: null, recommendedNextOperation: null, steps: valid.steps.map(step => ({ ...step, state: step.required ? 'complete' : 'skipped' })) }).remainingRequired, 0)

    const transport = await fs.readFile(path.join(root, 'src/lib/gateway/transport.ts'), 'utf8')
    const workspace = await fs.readFile(path.join(root, 'src/components/gateway/workspace.tsx'), 'utf8')
    const gatewayNavigation = await fs.readFile(path.join(root, 'src/components/gateway/navigation.ts'), 'utf8')
    // Unfinished setup is shown at the top of Home (the sidebar holds places only).
    const sidebar = await fs.readFile(path.join(root, 'src/components/gateway/today-workspace.tsx'), 'utf8')
    const progress = await fs.readFile(path.join(root, 'src/components/gateway/setup-progress.tsx'), 'utf8')
    const presentation = await fs.readFile(path.join(root, 'src/components/gateway/setup-presentation.ts'), 'utf8')
    const today = await fs.readFile(path.join(root, 'src/components/gateway/today-workspace.tsx'), 'utf8')
    const preview = await fs.readFile(path.join(root, 'src/dev/fake-gateway.ts'), 'utf8')
    const statusHook = await fs.readFile(path.join(root, 'src/components/gateway/setup-status-hook.ts'), 'utf8')
    const statusStore = await fs.readFile(path.join(root, 'src/components/gateway/setup-status-store.ts'), 'utf8')
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
    assert.match(sidebar, /setupStatus\.state !== 'complete'/,
      'Completed setup must remove the Home setup prompt')
    assert.match(sidebar, /to="\/setup"[\s\S]*setupSummary\.resolved/,
      'Incomplete setup must expose truthful progress and a continuation on Home')
    assert.doesNotMatch(today, /SetupReadinessPrompt/,
      'Home shows one setup line, not the full readiness panel')
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
    assert.doesNotMatch(progress, /Your companion is available now/,
      'Incomplete setup must not compete with a duplicate companion promotion')
    assert.match(progress, /First conversation[\s\S]*Working boundaries[\s\S]*Recovery and proof/,
      'Setup must group the verification ledger into an understandable path')
    assert.match(progress, /This is the last verified result/,
      'A failed refresh must distinguish retained evidence from a current result')
    assert.match(progress, /Keep off for now/,
      'Optional setup steps must expose a durable skip instead of trapping the state machine')
    assert.match(presentation, /skipped: 'Off for now'/,
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
    assert.match(statusStore, /conker:setup-status-refresh/,
      'Every setup-status consumer must refresh after a receipt changes progress')
    assert.match(statusHook, /useSyncExternalStore/, 'Setup consumers subscribe to shared evidence')
    assert.match(sidebar, /setupSummary \|\| setupError/, 'A failed refresh after completion still exposes status recovery')
    assert.match(sidebar, /setupError \? 'Status unavailable'/, 'Stale setup progress is not presented as a current count')
    assert.match(progress, /useGatewaySetupStatus\(client, true, true\)/, 'Entering Setup revalidates shared evidence')
    assert.match(progress, /Setup was complete at the last check/, 'A retained completion never claims its evidence is still current after a failed read')
    console.log('Gateway setup passed: strict server contract, exact route, connected surface and completion-aware sidebar.')
  } finally {
    await fs.rm(temporary, { recursive: true, force: true })
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
