import { createStore } from 'zustand/vanilla'
import { GatewayError, gatewayError, type GatewayVerifiedOperation } from './transport'
import { WORKFLOW_ACCESS_SCOPE } from './workflow-access'

export type GatewayOperationReview = { title: string; path: string; target: string; details: string[] }
/** Display only allowlisted operation metadata, never an arbitrary body, password or token. */
export function describeGatewayOperation(operation: GatewayVerifiedOperation): GatewayOperationReview {
  const { path, body } = operation
  const parts = path.split('/')
  let title = 'Confirm gateway operation', target = path
  const details: string[] = []
  const safeId = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : null
  const safeName = (value: unknown) => typeof value === 'string' && value.trim().length > 0 && value.length <= 160 && [...value].every(character => character.codePointAt(0)! >= 32 && character.codePointAt(0) !== 127) ? value.trim() : null
  if (path === '/auth/revoke-all' || /^\/auth\/sessions\/[A-Za-z0-9_-]{16,128}\/revoke$/.test(path)) {
    title = path === '/auth/revoke-all' ? 'Sign out all browser sessions' : 'Sign out browser session'
    target = path === '/auth/revoke-all' ? 'Every signed-in browser, including this one' : `Browser session ${parts[3]}`
    details.push('Revokes browser access only. Models, jobs and services keep running. Revoking this browser signs you out.')
    return { title, path, target, details }
  }
  if (path === '/api/control/pi/memory/corrections' || /^\/api\/control\/pi\/memory\/corrections\/[A-Za-z0-9_-]{16,128}\/retry$/.test(path)) {
    const retry = path.endsWith('/retry')
    title = retry ? 'Retry approved memory change' : 'Edit retained memory'
    target = retry ? `Correction ${parts[6]}` : typeof body.memory_id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$(?![\s\S])/.test(body.memory_id) ? `Memory ${body.memory_id}` : 'Reviewed memory'
    details.push(retry ? 'Retries only the exact previously approved text and revision saved on the server. It cannot substitute a new edit.' : `Replaces the reviewed memory text only if revision ${body.expected_revision} is still current.`)
    details.push('The source conversation is kept. Source, confidence and memory permissions are unchanged.')
    return { title, path, target, details }
  }
  if (path.startsWith('/api/owner/mcp/')) {
    let endpoint = 'Saved MCP server'
    try { if (typeof body.url === 'string') endpoint = new URL(body.url).hostname } catch { /* Only display a parsed hostname. */ }
    target = parts[4] === 'tools' ? parts[5] : endpoint
    const operation = parts.at(-1)
    title = operation === 'discover' ? 'Discover MCP tools' : operation === 'import' ? 'Import MCP tool' : operation === 'access' ? (body.enabled ? 'Make MCP tool available in chats' : 'Remove MCP tool from chats') : (body.enabled ? 'Enable MCP tool' : 'Disable MCP tool')
    details.push(operation === 'discover' ? 'Contacts this server to read its tool catalogue.' : operation === 'import' ? 'Saves the reviewed tool and input schema. Chat access is granted separately.' : operation === 'access' ? 'Changes access for this Conker chat runtime. Other callers keep their existing permissions.' : 'Changes availability for new tool calls.')
    if (operation !== 'discover') details.push('Each execution still requires approval in the Inbox.')
  }
  else if (path === '/api/control/pi/skills/import' || /^\/api\/control\/pi\/skills\/.+\/state$/.test(path)) {
    title = path.endsWith('/import') ? 'Import skill instructions' : body.enabled ? 'Enable skill' : 'Disable skill'
    target = path.endsWith('/import') ? 'Reviewed SKILL.md source' : parts[5]
    details.push('Skills apply only when selected for a message. They do not execute scripts or grant tool access. Earlier turns keep their saved instructions.')
  }
  else if (path === '/api/host/chatgpt') {
    target = 'ChatGPT subscription on this Conker server'
    title = body.operation === 'login' ? 'Sign in with ChatGPT' : body.operation === 'logout' ? 'Disconnect ChatGPT' : body.operation === 'cancel' ? 'Cancel ChatGPT sign-in' : 'Read ChatGPT models'
    details.push(body.operation === 'login' ? 'Starts OpenAI device-code sign-in. You authorize it on OpenAI, not by entering an API key. Credentials stay private on this server.' : body.operation === 'logout' ? 'Removes this server connection. Models using it stop answering until you reconnect; this does not revoke all OpenAI sessions.' : body.operation === 'cancel' ? 'Cancels this exact pending sign-in attempt.' : 'Reads the signed-in provider catalogue. It does not select a model or run inference.')
    details.push('Your Conker tool permissions and API-key spending policy are unchanged. ChatGPT plan limits still apply.')
  }
  else if (/^\/api\/host\/claude\/sessions\/[A-Za-z0-9][A-Za-z0-9_-]{0,99}\/stop$/.test(path)) {
    title = 'Stop native Claude session'; target = `Claude session ${parts[5]}`
    details.push('Requests stop for this exact Conker-owned background session. Completed changes are not undone. Native permissions and approvals are unchanged.')
    if (typeof body.expectedIdentity === 'string' && /^[a-f0-9]{64}$/.test(body.expectedIdentity)) details.push(`Session identity: ${body.expectedIdentity}.`)
    details.push('A successful request does not prove the process has stopped. Check status afterward; uncertain requests are never automatically repeated.')
  }
  else if (path === '/api/host/claude') {
    target = 'Official Claude Code on this Conker host'
    title = body.operation === 'login' ? 'Sign in with Claude Code' : body.operation === 'logout' ? 'Disconnect Claude Code' : 'Cancel Claude Code sign-in'
    details.push(body.operation === 'login' ? `Starts the unmodified Claude Code sign-in flow using ${body.billing === 'api' ? 'Claude Console billing' : 'your Claude subscription'}. Complete authorization on the provider’s page.` : body.operation === 'logout' ? 'Ends this Conker connection. Models using it need sign-in again.' : 'Stops the pending native sign-in process.')
    details.push('Credentials stay with Claude Code on this host. This operation does not grant tools or select a model.')
  }
  else if (path === '/api/host/providers') {
    if (body.operation === 'paid-policy' || body.operation === 'recover-paid-policy') {
      title = body.operation === 'recover-paid-policy' ? 'Recover provider spending policy' : body.enabled ? 'Allow paid model requests' : 'Block paid model requests'
      target = 'Hosted model spending policy'
      details.push('Restarts the AI runtime; active requests may be interrupted. Does not change tool access or the selected answer model.')
      details.push(body.operation === 'recover-paid-policy' ? 'Restores the policy from before the interrupted change.' : body.enabled ? 'Your provider can charge for model requests. This is not a budget; configure spending limits with your provider.' : 'Paid hosted-model requests are blocked. Local models and OpenRouter free models remain available.')
      return { title, path, target, details }
    }
    title = body.operation === 'stage' ? 'Save provider key' : body.operation === 'verify' ? 'Verify provider key' : body.operation === 'activate' ? 'Activate provider key' : body.operation === 'recover' ? 'Recover previous provider key' : body.operation === 'discard' ? 'Discard staged provider key' : 'Record provider revocation'
    target = ['openrouter', 'openai', 'anthropic'].includes(String(body.provider)) ? String(body.provider) : 'Hosted provider'
    details.push(body.operation === 'activate' || body.operation === 'recover' ? 'Restarts the AI runtime. Active requests may be interrupted. Does not grant tool access or authorize paid models.' : body.operation === 'verify' ? 'Sends one credential check to the provider. Does not generate an answer.' : body.operation === 'record-revoked' ? 'Records your confirmation only. Does not revoke the key at its issuer.' : body.operation === 'discard' ? 'Deletes this staged key only. The active provider credential is unchanged.' : 'Stores a write-only key on your Conker host. Does not activate it or authorize paid models.')
    return { title, path, target, details }
  }
  if (/^\/api\/control\/pi\/change-requests\/creq_[0-9a-f]{32}\/approve$/.test(path)) {
    return { title: 'Approve Conker’s request', path, target: `Request ${parts[5]}`, details: ['Creates exactly what the Inbox card shows: the cron job or the memory. Nothing else changes.'] }
  }
  if (path === '/api/control/pi/memory/remember') {
    const length = typeof body.text === 'string' ? body.text.length : 0
    return { title: 'Add a memory', path, target: 'Your memory', details: [`Saves the text you wrote, word for word (${length} characters). You can change or forget it later.`] }
  }
  if (path === '/api/control/pi/jobs/agent') {
    return { title: 'Create a cron job', path, target: safeName(body.name) ?? 'New cron job', details: ['Each run, Conker carries out your instructions with its tools. Anything that would change or send something still asks you.'] }
  }
  if (/^\/api\/owner\/editor-drafts\/[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(path)) { title = 'Save tool draft'; target = `Draft ${parts[4]}`; details.push('Saves the editor document only. Does not publish, execute or grant access.') }
  else if (/^\/api\/owner\/editor-drafts\/[A-Za-z][A-Za-z0-9_-]{0,63}\/publish$/.test(path)) { title = 'Publish workflow version'; target = `Draft ${parts[4]}`; details.push('Creates an immutable version with pinned dependencies. Does not run it or grant agent access.'); details.push(body.authorization === 'auto' ? 'Scoped callers may run this version without per-run approval.' : 'Each run requires owner confirmation.') }
  else if (/^\/api\/owner\/editor-drafts\/[A-Za-z][A-Za-z0-9_-]{0,63}\/access$/.test(path)) { title = body.enabled ? 'Allow workflow access' : 'Remove workflow access'; target = `Workflow ${parts[4]}`; details.push(body.enabled ? 'Grants access to this host\'s configured caller. ' + WORKFLOW_ACCESS_SCOPE : 'Removes this workflow’s root grant. Other independently granted workflows keep their access.'); details.push('Workflow grants apply to its published versions; publishing remains owner-controlled.') }
  else if (/^\/api\/owner\/editor-drafts\/[A-Za-z][A-Za-z0-9_-]{0,63}\/runs$/.test(path)) { title = body.approval_request_id ? 'Resume approved workflow' : 'Run published workflow'; target = `Workflow ${parts[4]}`; details.push(`Published version ${body.version}. May invoke its registered tools with the submitted arguments.`); details.push('Uses the recorded run identity; uncertain actions are not automatically repeated.') }
  else if (path === '/api/control/pi/models/configuration') { title = 'Save model configuration'; target = 'Models and decision roles'; details.push('Changes model eligibility, defaults and routing roles. Provider credentials stay on the server.') }
  else if (path === '/api/control/pi/agents/companion/update') {
    title = 'Update Companion'; target = 'Companion configuration'
    const configuration = body.configuration
    const memory = configuration && typeof configuration === 'object' && !Array.isArray(configuration) ? (configuration as Record<string, unknown>).memory : null
    const scope = memory && typeof memory === 'object' && !Array.isArray(memory) ? (memory as Record<string, unknown>).scope : null
    if (scope === 'owner') details.push('Allows Companion to retrieve admitted memory across your chats. Private messages remain excluded; other agents and team roles do not receive this access.')
    else if (scope === 'conversation') details.push('Limits Companion memory retrieval to the current conversation.')
    else if (scope === 'selected') details.push('Limits Companion memory retrieval to the explicitly selected records.')
    else if (scope === 'none') details.push('Disables Companion memory retrieval.')
    details.push('Applies to future turns. Existing turn snapshots and tool permissions are unchanged.')
  }
  else if (path === '/api/control/pi/projects') { title = 'Create project'; target = safeName(body.name) ?? 'New project'; details.push('Creates project organization only. Does not copy conversations, run work or grant access.') }
  else if (/^\/api\/control\/pi\/projects\/project_[0-9a-f]{32}\/(link|unlink)$/.test(path)) {
    title = path.endsWith('/unlink') ? 'Remove project reference' : 'Link record to project'; target = `Project ${parts[5]}`
    details.push('Changes a live reference only. The source record and its privacy settings remain unchanged; no access is granted.')
  }
  else if (path === '/api/control/pi/artifacts' || path === '/api/control/pi/artifacts/from-message') { title = 'Create artifact'; target = safeName(body.title) ?? 'New artifact'; details.push(path.endsWith('/from-message') ? 'Copies the selected retained response into a separate artifact with provenance. Does not execute its content.' : 'Creates one versioned artifact. Content remains inert; no tools are run.') }
  else if (/^\/api\/control\/pi\/artifacts\/artifact_[0-9a-f]{32}\/versions$/.test(path)) { title = 'Save artifact version'; target = safeName(body.title) ?? `Artifact ${parts[5]}`; details.push('Appends an immutable version. Existing versions remain available, and saving does not execute the content.') }
  else if (path === '/api/control/pi/setup/models') { title = 'Choose answer model'; target = safeId(body.candidateId) ?? 'Answer model'; details.push('Makes this server-discovered, currently ready model the default for Companion answers. Existing advanced role settings are preserved.') }
  else if (path === '/api/control/pi/setup/models/activate') { title = 'Use and test answer model'; target = safeId(body.candidateId) ?? 'Answer model'; details.push('Makes this server-discovered model the default, then sends one short setup prompt to verify that it can answer. The resulting receipt contains no prompt or response text.') }
  else if (path === '/api/control/pi/setup/protection') { title = 'Save backup policy'; target = typeof body.destination === 'string' ? body.destination : 'Off-machine destination'; details.push(`Keeps ${typeof body.retentionCopies === 'number' ? body.retentionCopies : 'the selected number of'} verified snapshots at the mounted destination.`); details.push('This saves policy only. The host verifier must still create and verify a backup before setup can complete.') }
  else if (path === '/api/control/pi/setup/rehearsal/memory-review') { title = 'Record memory review'; target = 'Current memory choice'; details.push('Records that you reviewed whether new conversations may use long-term memory. No memory content is stored in the receipt.') }
  else if (path === '/api/control/pi/setup/rehearsal/approval/start') { title = 'Start harmless approval check'; target = 'Local approval test'; details.push('Requests approval for a fixed local echo. It cannot access the network or filesystem and does not return your submitted value.') }
  else if (path === '/api/control/pi/setup/rehearsal/approval/resume') { title = 'Finish approved check'; target = 'Local approval test'; details.push('Consumes the exact approved request once and verifies its content-free local receipt.') }
  else if (path === '/api/control/pi/setup/rehearsal/finalize') { title = 'Finish first-run rehearsal'; target = 'Onboarding evidence'; details.push('Records a receipt only if a real conversation, memory review, and harmless approval flow are already proven.') }
  else if (/^\/api\/control\/pi\/setup\/choices\/(companion|memory|capabilities)$/.test(path)) { title = body.choice === 'accept' ? 'Keep Companion default' : body.choice === 'skip' ? 'Skip optional setup' : 'Include optional setup'; target = parts[6] === 'companion' ? 'Companion harness profile' : parts[6] === 'memory' ? 'Long-term memory' : 'Additional capabilities'; details.push(body.choice === 'accept' ? 'Accepts the current supplied Companion profile without changing its model, memory or tool authority.' : body.choice === 'skip' ? 'Records an owner choice to continue setup without this optional capability. It does not disable a configured service.' : 'Returns this optional capability to the guided setup path. It does not configure the service by itself.') }
  else if (/^\/api\/control\/pi\/sessions\/[A-Za-z0-9_-]+\/settings$/.test(path)) { title = 'Save conversation privacy'; target = `Conversation ${parts[5]}`; details.push('Changes settings for future turns. Existing messages are not erased.') }
  else if (path === '/api/terminal') { title = 'Start owner terminal'; target = 'Operator-configured owner workspace'; details.push('Opens one short-lived shell with the host account’s filesystem and command access. Native agents keep their own permission prompts.'); details.push('Commands and output are not added to Conker backups or history. Native apps may retain their own sessions.') }
  else if (path === '/api/pi/sessions') { title = 'Create a conversation'; target = 'New conversation'; details.push('Creates one persisted conversation.') }
  else if (/^\/api\/pi\/sessions\/.+\/turns$/.test(path)) { title = 'Send a conversation turn'; target = `Conversation ${parts[4]}`; if (typeof body.text === 'string') details.push(`${[...body.text].length.toLocaleString()} characters from your submitted draft.`); details.push('The runtime may call its configured model and tools.') }
  else if (/^\/api\/pi\/sessions\/.+\/fork$/.test(path)) { title = 'Fork a conversation'; target = `Conversation ${parts[4]}` }
  else if (/^\/api\/pi\/turns\/.+\/resume$/.test(path)) { title = 'Resume a recorded turn'; target = `Turn ${parts[4]}`; details.push('Resumes the existing runtime operation.') }
  else if (path === '/api/pi/tasks') { title = 'Create task tracking'; target = safeId(body.session_id) ? `Conversation ${body.session_id}` : 'New task'; details.push('Records task metadata; does not start execution.') }
  else if (/^\/api\/pi\/tasks\/.+\/(update|transition|archive)$/.test(path)) {
    title = path.endsWith('/update') ? 'Update task metadata' : path.endsWith('/transition') ? 'Record task status' : body.archived === false ? 'Restore task tracking' : 'Archive task tracking'
    target = `Task ${parts[4]}`; details.push('Changes tracking only; does not start or stop a turn.')
  } else if (/^\/api\/owner\/requests\/.+\/decision$/.test(path)) { title = 'Submit an owner decision'; target = `Owner request ${parts[4]}`; details.push('Records the decision for this exact owner request.') }
  if (typeof body.expected_revision === 'number' && Number.isSafeInteger(body.expected_revision)) details.push(`Expected ${path.startsWith('/api/owner/editor-drafts/') ? 'draft' : path.startsWith('/api/control/') ? 'configuration' : 'task'} revision ${body.expected_revision}.`)
  if (typeof body.status === 'string' && /^[a-z_]{1,40}$/.test(body.status)) details.push(`${path.startsWith('/api/owner/') ? 'Owner decision' : 'Owner-reported status'}: ${body.status.replaceAll('_', ' ')}.`)
  if (Array.isArray(body.criteria)) details.push(`${body.criteria.length} completion criteria.`)
  if (Array.isArray(body.run_ids)) details.push(`${body.run_ids.length} existing run links.`)
  if (safeId(body.parent_task_id)) details.push(`Parent task: ${body.parent_task_id}.`)
  if (safeId(body.request_id)) details.push(`Request: ${body.request_id}.`)
  if (safeId(body.task_id)) details.push(`Linked task: ${body.task_id}.`)
  if (typeof body.task_expected_revision === 'number' && Number.isSafeInteger(body.task_expected_revision)) details.push(`Expected linked task revision ${body.task_expected_revision}.`)
  return { title, path, target, details }
}

export type GatewayVerificationState = { challenge: (GatewayOperationReview & { id: number }) | null; pending: boolean; error: GatewayError | null; submit: (password: string) => Promise<boolean>; cancel: () => void }
type Challenge = { id: number; review: GatewayOperationReview; verify: (password: string, signal: AbortSignal) => Promise<string>; controller: AbortController; resolve: (token: string) => void; reject: (error: GatewayError) => void; detach: () => void }
export type GatewayVerificationPrompt = { request: (review: GatewayOperationReview, verify: Challenge['verify'], signal?: AbortSignal) => Promise<string>; cancelAll: () => void }

export function createGatewayVerificationStore() {
  let nextId = 0
  let current: Challenge | null = null
  const queue: Challenge[] = []
  const store = createStore<GatewayVerificationState>(() => ({ challenge: null, pending: false, error: null,
    submit: async password => {
      const challenge = current
      if (!challenge || store.getState().pending) return false
      if (typeof password !== 'string' || !password.length || [...password].length > 1024) { store.setState({ error: new GatewayError('validation') }); return false }
      store.setState({ pending: true, error: null })
      try {
        const token = await challenge.verify(password, challenge.controller.signal)
        if (current !== challenge || challenge.controller.signal.aborted) return false
        challenge.detach(); current = null; challenge.resolve(token); showNext()
        return true
      } catch (error) {
        if (current === challenge) store.setState({ pending: false, error: gatewayError(error) })
        return false
      }
    },
    cancel: () => { if (current) cancel(current) },
  }))
  function showNext() {
    current = queue.shift() ?? null
    store.setState({ challenge: current ? { ...current.review, details: [...current.review.details], id: current.id } : null, pending: false, error: null })
  }
  function cancel(challenge: Challenge) {
    challenge.controller.abort(); challenge.detach(); challenge.reject(new GatewayError('verification-cancelled'))
    if (current === challenge) { current = null; showNext() }
    else { const index = queue.indexOf(challenge); if (index >= 0) queue.splice(index, 1) }
  }
  const prompt: GatewayVerificationPrompt = {
    request(review, verify, signal) {
      if (signal?.aborted) return Promise.reject(new GatewayError('verification-cancelled'))
      return new Promise((resolve, reject) => {
        const challenge: Challenge = { id: ++nextId, review, verify, controller: new AbortController(), resolve, reject, detach: () => signal?.removeEventListener('abort', abort) }
        const abort = () => cancel(challenge)
        signal?.addEventListener('abort', abort, { once: true })
        queue.push(challenge); if (!current) showNext()
      })
    },
    cancelAll() {
      const pending = [...queue]; queue.length = 0
      if (current) pending.unshift(current)
      current = null
      for (const challenge of pending) { challenge.controller.abort(); challenge.detach(); challenge.reject(new GatewayError('verification-cancelled')) }
      store.setState({ challenge: null, pending: false, error: null })
    },
  }
  return Object.assign(store, prompt)
}
export type GatewayVerificationStore = ReturnType<typeof createGatewayVerificationStore>
