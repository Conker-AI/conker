import { GatewayError } from '@/lib/gateway/transport'
import { createFakeChangeRequests } from './fake-gateway-drafting'

type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST'; body?: Json; onDispatch?: () => void }

/** Preview-only provider credential status; scenarios come from sessionStorage, nothing leaves the browser. */
export function createFakeProviderCredentials() {
  const credentialStatus = { schemaVersion: 1, available: true, secretsIncluded: false, paidAllowed: false, policyRecoveryRequired: false, providers: ['openrouter', 'openai', 'anthropic'].map(id => ({ id, configured: false, activeRevision: null, activeAt: null, stagedRevision: null as string | null, stagedAt: null, verificationStatus: null as string | null, verificationBasis: null, verifiedAt: null, verificationStale: false, activationPending: false, revokedRevisions: [], secretIncluded: false })) }
  return async function handle(method: string, options: Request, fail: (status: number) => never): Promise<Json> {
    const scenario = globalThis.sessionStorage?.getItem('conker-fake-credentials')
    if (scenario) {
      if (method === 'GET' && scenario === 'read-failure') return fail(503)
      if (method === 'GET' && scenario === 'read-timeout') return new Promise<Json>(() => { /* Isolated read deadline, no external provider. */ })
      if (method === 'GET' && scenario === 'slow-read') await new Promise(resolve => setTimeout(resolve, 2000))
      if (method === 'POST') {
        options.onDispatch?.()
        if (scenario === 'operation-timeout') return new Promise<Json>(() => { /* Isolated dispatch deadline. */ })
        if (options.body?.operation === 'paid-policy') credentialStatus.paidAllowed = options.body.enabled === true
        if (options.body?.operation === 'stage') {
          const record = credentialStatus.providers.find(row => row.id === options.body?.provider)
          if (record) { record.stagedRevision = `credential_${'a'.repeat(32)}`; record.verificationStatus = 'unverified' }
        }
        if (scenario === 'lost-response') return fail(503)
      }
      return structuredClone(credentialStatus)
    }
    if (method !== 'GET') throw new GatewayError('dependency', 503)
    return { schemaVersion: 1, available: false, secretsIncluded: false, paidAllowed: null, policyRecoveryRequired: false, providers: [] }
  }
}

/** Preview-only plan readings; `conker-fake-plans` = none | unsupported | stale picks another state. */
export function fakePlanUsage(method: string, fail: (status: number) => never): Json {
  if (method !== 'GET') return fail(405)
  const scenario = globalThis.sessionStorage?.getItem('conker-fake-plans')
  if (scenario === 'unsupported') return fail(403)
  if (scenario === 'none') return { windows: [], alerts: [] }
  const now = Date.now(), checkedAt = (scenario === 'stale' ? now - 5 * 3600_000 : now - 4 * 60_000) / 1000
  const window = (provider: string, id: string, label: string, usedPercent: number, hours: number) => ({ provider, window: id, label, usedPercent, resetsAt: new Date(now + hours * 3600_000).toISOString(), checkedAt })
  return { windows: [window('chatgpt', 'primary', '5-hour', 84, 2), window('chatgpt', 'secondary', 'weekly', 31, 80), window('claude', 'five_hour', '5-hour', 42, 3), window('claude', 'seven_day', 'weekly', 18, 100)], alerts: [] }
}

/** Preview-only AI jobs: one sample job and one finding; creating and dismissing stay in this tab. */
export function createFakeAgentJobs(jobs: () => Json[]) {
  const session = `ses_${'1'.repeat(16)}`, now = () => Date.now() / 1000
  let seeded = false
  const notes: Json[] = [{ id: `note_${'7'.repeat(32)}`, jobId: `job_${'8'.repeat(32)}`, sessionId: session, messageId: null, title: 'Physics exam on Thursday', detail: 'Your study chat mentions the worksheet due Friday too. I can make notes and practice questions for both.', createdAt: now() - 1800 }]
  const job = (id: string, name: string, timing: Json, timeZone: string): Json => ({
    schemaVersion: 1, id, revision: 1, createdAt: now() - 86400, nextAt: now() + 3600,
    definition: { name, instructionsConfigured: true, agentId: 'companion', timing, timeZone, enabled: true, state: 'enabled', target: { kind: 'agent', sessionId: session }, overlap: 'skip', requireBudget: false, budgetAllowanceConfigured: false },
    authority: 'none', contentIncluded: false, execution: 'not-triggered',
  })
  const seed = () => {
    if (seeded) return
    seeded = true
    jobs().push(job(`job_${'8'.repeat(32)}`, 'Weekly life review', { kind: 'weekly', time: '21:00', day: 0, hours: 24 }, 'Asia/Jerusalem'))
    const watched = job(`job_${'9'.repeat(32)}`, 'Study group messages', { kind: 'interval', time: '00:00', day: 0, hours: 24 }, 'Asia/Jerusalem')
    ;(watched.definition as Json).watch = { toolId: 'mcp.telegram.messages', everyMinutes: 5, inputsConfigured: true, lastCheckedAt: now() - 120, problem: null }
    jobs().push(watched)
  }
  const access = createFakeAccess(session, now), asks = createFakeAsks(session, now), ownerSettings = createFakeOwnerSettings()
  const requests = createFakeChangeRequests(session, now, (name, timing, timeZone) => { const created = job(`job_${crypto.randomUUID().replaceAll('-', '')}`, name, timing, timeZone); jobs().push(created); return created })
  return function handle(path: string, method: string, body: Json | undefined, fail: (status: number) => never): Json {
    seed()
    if (path.startsWith('/api/control/pi/change-requests') || path === '/api/control/pi/tool-drafts' || path.startsWith('/api/owner/editor-drafts') || path === '/api/pi/tools') return requests(path, method, body, fail)
    if (path === '/api/control/pi/memory/remember' && method === 'POST') return { memoryId: `mem_${crypto.randomUUID().slice(0, 8)}`, status: 'remembered' }
    if (path.startsWith('/api/control/pi/asks')) return asks(path, method, body, fail)
    if (path.startsWith('/api/control/pi/owner/')) return ownerSettings(path, method, body, fail)
    if (path.startsWith('/api/owner/access') || /^\/api\/owner\/tools\/[^/]+\/(?:sensitive|card|access)$/.test(path) || path === '/api/control/pi/access/handled' || path === '/api/owner/editor-capabilities') return access(path, method, body, fail)
    if (path === '/api/control/pi/jobs/agent/notes' && method === 'GET') return { schemaVersion: 1, results: structuredClone(notes) }
    const dismiss = path.match(/^\/api\/control\/pi\/jobs\/agent\/notes\/(note_[0-9a-f]{32})\/dismiss$/)
    if (dismiss && method === 'POST') {
      const index = notes.findIndex(note => note.id === dismiss[1])
      if (index < 0) return fail(404)
      notes.splice(index, 1)
      return { id: dismiss[1], dismissed: true, changed: true }
    }
    const hook = path.match(/^\/api\/control\/pi\/jobs\/(job_[0-9a-f]{32})\/hook(\/revoke)?$/)
    if (hook && method === 'POST') {
      const target = jobs().find(item => item.id === hook[1])
      if (!target) return fail(404)
      ;((target.definition as Json).target as Json).webhook = !hook[2]
      return hook[2] ? { jobId: hook[1], revoked: true } : { jobId: hook[1], token: `hook_${'P'.repeat(43)}`, header: 'X-Conker-Hook-Token', path: `/hooks/${hook[1]}` }
    }
    if (path === '/api/control/pi/jobs/agent' && method === 'POST') {
      const created = job(`job_${crypto.randomUUID().replaceAll('-', '')}`, String(body?.name ?? 'AI job'), (body?.timing ?? { kind: 'interval', time: '00:00', day: 0, hours: 2 }) as Json, String(body?.timeZone ?? 'UTC'))
      const watch = body?.watch as Json | undefined
      // Preview of a Pi that shows a job's own words on its page; the seeded jobs keep them to themselves.
      Object.assign(created.definition as Json, { instructions: String(body?.instructions ?? ''), agentId: String(body?.agentId ?? 'companion') })
      if (body?.clock === false) ((created.definition as Json).target as Json).clock = false
      if (watch) (created.definition as Json).watch = { toolId: watch.toolId, everyMinutes: watch.everyMinutes, inputsConfigured: Object.keys((watch.args ?? {}) as Json).length > 0, lastCheckedAt: null, problem: null }
      jobs().push(created)
      return created
    }
    return fail(404)
  }
}

/** Preview-only settings document and preferences, revision-checked like Pi's; changes stay in this tab. */
function createFakeOwnerSettings() {
  const settings = { schemaVersion: 1, revision: 1, values: { 'appearance.accent': 'neutral', 'chats.names.auto': true } as Json }
  const preferences = { revision: 1, preferences: { quietHours: { enabled: true, start: '22:00', end: '07:00', timeZone: 'Asia/Jerusalem', urgentExceptions: false }, urgency: 'meaningful',
    dailyBudget: { suggestions: 4, researchMinutes: 30, costCents: 0 }, idleTimeoutMinutes: 15, planAlerts: { enabled: true, percent: 80 } } as Json }
  return function handle(path: string, method: string, body: Json | undefined, fail: (status: number) => never): Json {
    const document = path === '/api/control/pi/owner/settings' ? settings : path === '/api/control/pi/owner/preferences' ? preferences : null
    if (!document) return fail(404)
    if (method === 'GET') return structuredClone(document)
    if (body?.expected_revision !== document.revision) return fail(409)
    document.revision += 1
    if (document === settings) settings.values = structuredClone(body?.values as Json)
    else preferences.preferences = structuredClone(body?.preferences as Json)
    return structuredClone(document)
  }
}

/** Preview-only questions from Conker; an answer stays in this tab. */
function createFakeAsks(session: string, now: () => number) {
  const open: Json[] = [{ id: `ask_${'5'.repeat(32)}`, sessionId: session, chatTitle: 'Plan my week', question: 'Your server app’s login page bothers you. Fix it today?', options: ['Yes, fix it', 'This weekend', 'Not now'], state: 'open', answer: null, chosen: null, createdAt: now() - 2400, answeredAt: null }]
  return function handle(path: string, method: string, body: Json | undefined, fail: (status: number) => never): Json {
    if (path === '/api/control/pi/asks' && method === 'GET') return { schemaVersion: 1, results: structuredClone(open) }
    const act = path.match(/^\/api\/control\/pi\/asks\/(ask_[0-9a-f]{32})\/(answer|dismiss)$/)
    const index = act && method === 'POST' ? open.findIndex(item => item.id === act[1]) : -1
    if (!act || index < 0) return fail(act ? 409 : 404)
    const [ask] = open.splice(index, 1)
    return act[2] === 'dismiss' ? { ...ask, state: 'dismissed', answeredAt: now() } : { ...ask, state: 'answered', answer: String(body?.text), chosen: body?.chosen === true, answeredAt: now() }
  }
}

/** Preview-only access state: Conker's decisions off until switched on, two handled actions. */
function createFakeAccess(session: string, now: () => number) {
  const state = { delegate: false, sensitive: ['bank.payments'] as string[], floorExecutions: ['container_control', 'port_control', 'process_control'], cards: { 'sandbox.run': 'run', 'mail.send': 'send' } as Record<string, string> }
  const handled = [
    { id: `hnd_${'1'.repeat(32)}`, sessionId: session, turnId: null, toolId: 'conker.remember', decidedBy: 'tool_default', reason: 'Allowed by the tool’s own setting.', createdAt: now() - 900 },
    { id: `hnd_${'2'.repeat(32)}`, sessionId: session, turnId: null, toolId: 'mail.send', decidedBy: 'owner_request', reason: 'You asked to send Dani the notes.', createdAt: now() - 5400 },
  ]
  const digest = 'f'.repeat(64), version = 1
  const catalogue = [['research.search', 'Web search', 'Searches the public web.'], ['research.fetch', 'Read a web page', 'Fetches one public page as text.'],
    ['sandbox.run', 'Terminal', 'Runs a command in the agent’s locked-down workspace.'], ['sandbox.install', 'Install packages', 'Installs PyPI or npm packages into the workspace.'],
    ['mail.send', 'Send email', 'Sends an email from your account.'], ['bank.payments', 'Bank payments', 'Pays from your bank account.']]
  const usable = new Set(['research.search', 'research.fetch', 'sandbox.run', 'sandbox.install'])
  const access = (id: string) => ({ schemaVersion: 1, toolId: id, actorId: 'preview-key', actorName: 'Conker', enabled: usable.has(id), requiredScope: `tool:${id}`, digest })
  return function handle(path: string, method: string, body: Json | undefined, fail: (status: number) => never): Json {
    if (path === '/api/owner/editor-capabilities' && method === 'GET') return { items: catalogue.map(([id, name, description]) => ({ id, name, description, version, authorization: 'ai_review', inputs: [] })), next_after: null }
    const grant = path.match(/^\/api\/owner\/tools\/([^/]+)\/access$/)
    if (grant && catalogue.some(([id]) => id === grant[1])) {
      if (method === 'POST') { if (body?.expected_digest !== digest) return fail(409); if (body?.enabled === true) usable.add(grant[1]); else usable.delete(grant[1]) }
      return access(grant[1])
    }
    if (path === '/api/owner/access' && method === 'GET') return structuredClone(state)
    if (path === '/api/owner/access/delegate' && method === 'POST') { state.delegate = body?.enabled === true; return { delegate: state.delegate } }
    const card = path.match(/^\/api\/owner\/tools\/([^/]+)\/card$/)
    if (card && method === 'POST') {
      const template = String(body?.template)
      if (template === 'do') delete state.cards[card[1]]
      else state.cards[card[1]] = template
      return { id: card[1], template }
    }
    const tool = path.match(/^\/api\/owner\/tools\/([^/]+)\/sensitive$/)
    if (tool && method === 'POST') {
      state.sensitive = body?.sensitive === true ? [...new Set([...state.sensitive, tool[1]])] : state.sensitive.filter(id => id !== tool[1])
      return { id: tool[1], sensitive: body?.sensitive === true }
    }
    if (path === '/api/control/pi/access/handled' && method === 'GET') return { schemaVersion: 1, results: structuredClone(handled) }
    return fail(404)
  }
}

type FakeSession = { id: string; messages: Json[]; turns: Json[] }

/** As Pi does after his Inbox decision: Do it runs and replies; a no closes; Change sends his words. */
export function continueAfterDecision(sessions: FakeSession[], requestId: string, status: string, note: string, messageId: () => string, now: () => number) {
  const owner = sessions.find(row => row.turns.some(turn => turn.approval_request_id === requestId && turn.status === 'awaiting_approval'))
  const turn = owner?.turns.find(row => row.approval_request_id === requestId)
  if (!owner || !turn) return
  const words = note.trim()
  const say = (role: 'user' | 'assistant', content: string) => owner.messages.push({ id: messageId(), session_id: owner.id, seq: owner.messages.length + 1, role, content, created_at: now() })
  if (status === 'approved') { say('assistant', 'Done. I sent the email to coach and will tell you when they reply.'); Object.assign(turn, { status: 'complete', acted: 1, ended_at: now() }); return }
  Object.assign(turn, { status: 'cancelled', ended_at: now(), detail: words ? 'You said what to do instead in the Inbox. This action was not done.' : 'You said no in the Inbox. Nothing was done.' })
  if (words) { say('user', words); say('assistant', 'Got it, I changed it the way you said.') }
}

/** Seeds the sample AI job before the first job list read. */
export function withFakeAgentJobs(handle: ReturnType<typeof createFakeAgentJobs>) {
  return (path: string) => { if (path === '/api/control/pi/jobs') handle('/api/control/pi/jobs/agent/notes', 'GET', undefined, () => { throw new Error('unreachable') }) }
}
