import { GatewayError } from '@/lib/gateway/transport'

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
  const access = createFakeAccess(session, now)
  const requests = createFakeChangeRequests(session, now, (name, timing, timeZone) => { const created = job(`job_${crypto.randomUUID().replaceAll('-', '')}`, name, timing, timeZone); jobs().push(created); return created })
  return function handle(path: string, method: string, body: Json | undefined, fail: (status: number) => never): Json {
    seed()
    if (path.startsWith('/api/control/pi/change-requests') || path.startsWith('/api/owner/editor-drafts/')) return requests(path, method, body, fail)
    if (path === '/api/control/pi/memory/remember' && method === 'POST') return { memoryId: `mem_${crypto.randomUUID().slice(0, 8)}`, status: 'remembered' }
    if (path.startsWith('/api/owner/access') || /^\/api\/owner\/tools\/[^/]+\/sensitive$/.test(path) || path === '/api/control/pi/access/handled') return access(path, method, body, fail)
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
      if (body?.clock === false) ((created.definition as Json).target as Json).clock = false
      if (watch) (created.definition as Json).watch = { toolId: watch.toolId, everyMinutes: watch.everyMinutes, inputsConfigured: Object.keys((watch.args ?? {}) as Json).length > 0, lastCheckedAt: null, problem: null }
      jobs().push(created)
      return created
    }
    return fail(404)
  }
}

/** Preview-only requests from Conker (a cron job, a tool draft, a memory); deciding them stays in this tab. */
function createFakeChangeRequests(session: string, now: () => number, createJob: (name: string, timing: Json, timeZone: string) => Json) {
  const base = (id: string, kind: string, title: string, summary: string, payload: Json, age: number): Json => ({ id: `creq_${id.repeat(32)}`, kind, title, summary, payload, sessionId: session, state: 'open', result: null, createdAt: now() - age, decidedAt: null })
  const node = (id: string, type: string, label: string, y: number, config: Json) => ({ id, type, label, position: { x: 0, y }, config })
  const document = {
    id: 'study-group-digest', name: 'Study group digest', description: 'Reads the last day of the study group chat and lists deadlines and open questions.', kind: 'workflow',
    nodes: [node('start', 'input', 'Start', 0, {}), node('read', 'tool_call', 'Read the chat', 120, { tool: 'mcp.telegram.messages', args: { chat: '$input.chat', since: '1d' } }), node('done', 'return', 'Done', 240, { value: '$steps.read' })],
    edges: [{ id: 'e1', source: 'start', target: 'read' }, { id: 'e2', source: 'read', target: 'done' }],
    inputs: [{ name: 'chat', type: 'string', required: true, description: 'Which chat to read' }], outputs: [], credentialRefs: [], effect: 'read', agentVisible: false, budgets: { maxSteps: 20, maxLoopItems: 10, timeoutMs: 10000 },
  }
  const open: Json[] = [
    base('a', 'ai_job', 'Cron job: Morning study check', 'Every day at 08:00, check the study chats and calendar for deadlines this week and tell me only if something needs me.', { name: 'Morning study check', instructions: 'Check the study group chats and my calendar for deadlines in the next 7 days. If something is new or close, tell me what it is and what I could do about it. If nothing needs me, reply NOTHING.', agentId: 'companion', timing: { kind: 'daily', time: '08:00', day: 0, hours: 24 }, timeZone: 'Asia/Jerusalem', enabled: true }, 600),
    base('b', 'tool_draft', 'Tool: Study group digest', document.description, { document, issues: [], description: 'A tool that sums up my study group chat' }, 3600),
    base('c', 'memory', 'Remember: physics exam', 'The physics exam is on Thursday 30 October.', { text: 'The physics exam is on Thursday 30 October, room 204.' }, 7200),
  ]
  return function handle(path: string, method: string, body: Json | undefined, fail: (status: number) => never): Json {
    const saving = path.match(/^\/api\/owner\/editor-drafts\/([a-zA-Z][a-zA-Z0-9_-]{0,63})$/)
    if (saving && method === 'POST') return { id: saving[1], revision: 1, updated_at: new Date().toISOString(), document: body?.document }
    if (path === '/api/control/pi/change-requests' && method === 'GET') return { schemaVersion: 1, results: structuredClone(open) }
    const decide = path.match(/^\/api\/control\/pi\/change-requests\/(creq_[0-9a-f]{32})\/(approve|decline|saved)$/)
    const index = decide && method === 'POST' ? open.findIndex(item => item.id === decide[1]) : -1
    if (!decide || index < 0) return fail(decide ? 409 : 404)
    const [request] = open.splice(index, 1), payload = request.payload as Json
    const result = decide[2] === 'decline' ? null : decide[2] === 'saved' ? { draftId: body?.draftId }
      : request.kind === 'ai_job' ? { jobId: createJob(String(payload.name), payload.timing as Json, String(payload.timeZone)).id } : { memoryId: 'mem_preview' }
    return { ...request, state: decide[2] === 'decline' ? 'declined' : 'approved', result, decidedAt: now() }
  }
}

/** Preview-only access state: Conker's decisions off until switched on, two handled actions. */
function createFakeAccess(session: string, now: () => number) {
  const state = { delegate: false, sensitive: ['bank.payments'] as string[], floorExecutions: ['container_control', 'port_control', 'process_control'] }
  const handled = [
    { id: `hnd_${'1'.repeat(32)}`, sessionId: session, turnId: null, toolId: 'conker.remember', decidedBy: 'tool_default', reason: 'Allowed by the tool’s own setting.', createdAt: now() - 900 },
    { id: `hnd_${'2'.repeat(32)}`, sessionId: session, turnId: null, toolId: 'mail.send', decidedBy: 'owner_request', reason: 'You asked to send Dani the notes.', createdAt: now() - 5400 },
  ]
  return function handle(path: string, method: string, body: Json | undefined, fail: (status: number) => never): Json {
    if (path === '/api/owner/access' && method === 'GET') return structuredClone(state)
    if (path === '/api/owner/access/delegate' && method === 'POST') { state.delegate = body?.enabled === true; return { delegate: state.delegate } }
    const tool = path.match(/^\/api\/owner\/tools\/([^/]+)\/sensitive$/)
    if (tool && method === 'POST') {
      state.sensitive = body?.sensitive === true ? [...new Set([...state.sensitive, tool[1]])] : state.sensitive.filter(id => id !== tool[1])
      return { id: tool[1], sensitive: body?.sensitive === true }
    }
    if (path === '/api/control/pi/access/handled' && method === 'GET') return { schemaVersion: 1, results: structuredClone(handled) }
    return fail(404)
  }
}

/** Seeds the sample AI job before the first job list read. */
export function withFakeAgentJobs(handle: ReturnType<typeof createFakeAgentJobs>) {
  return (path: string) => { if (path === '/api/control/pi/jobs') handle('/api/control/pi/jobs/agent/notes', 'GET', undefined, () => { throw new Error('unreachable') }) }
}
