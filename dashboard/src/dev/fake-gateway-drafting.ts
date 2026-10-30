import { validateToolDefinition } from '@/lib/tool-workspace'

type Json = Record<string, unknown>
type Fail = (status: number) => never

/**
 * Preview-only requests from Conker (a cron job, a tool draft, a memory) and the Tools editor they
 * lead to; everything stays in this tab. A tool request drafts in the background as Pi's does: it
 * starts as drafting and fills in a few seconds later as ready, or as failed when its words ask
 * for something no tool here can do (try "telegram"). The seeded requests show every state at once.
 */
export function createFakeChangeRequests(session: string, now: () => number, createJob: (name: string, timing: Json, timeZone: string) => Json) {
  const base = (id: string, kind: string, title: string, summary: string, payload: Json, age: number, sessionId: string | null = session): Json => ({ id: `creq_${id.length === 1 ? id.repeat(32) : id}`, kind, title, summary, payload, sessionId, state: 'open', result: null, createdAt: now() - age, decidedAt: null })
  const node = (id: string, type: string, label: string, y: number, config: Json) => ({ id, type, label, position: { x: 0, y }, config })
  const digest = (id: string, name: string, description: string) => ({
    id, name, description, kind: 'workflow',
    nodes: [node('start', 'input', 'Start', 0, {}), node('read', 'tool_call', 'Read the chat', 120, { tool: 'research.fetch', args: { url: '$input.chat' } }), node('done', 'return', 'Done', 240, { value: '$steps.read' })],
    edges: [{ id: 'e1', source: 'start', target: 'read' }, { id: 'e2', source: 'read', target: 'done' }],
    inputs: [{ name: 'chat', type: 'string', required: true, description: 'Which chat to read' }], outputs: [], credentialRefs: [], effect: 'read', agentVisible: false, budgets: { maxSteps: 20, maxLoopItems: 10, timeoutMs: 10000 },
  })
  const steps = ['Ask which chat to read.', 'Read the last day of that chat.', 'List the deadlines and open questions it mentions.']
  const ready = (description: string, name: string) => ({ description, status: 'ready', document: digest(slug(name), name, description), issues: [], steps })
  const open: Json[] = [
    base('a', 'ai_job', 'Cron job: Morning study check', 'Every day at 08:00, check the study chats and calendar for deadlines this week and tell me only if something needs me.', { name: 'Morning study check', instructions: 'Check the study group chats and my calendar for deadlines in the next 7 days. If something is new or close, tell me what it is and what I could do about it. If nothing needs me, reply NOTHING.', agentId: 'companion', timing: { kind: 'daily', time: '08:00', day: 0, hours: 24 }, timeZone: 'Asia/Jerusalem', enabled: true }, 600),
    base('d', 'tool_draft', 'Tool: Weekly reading list', 'Every Sunday, find three long reads about the topics I study and send me the links.', { description: 'Every Sunday, find three long reads about the topics I study and send me the links.', status: 'drafting' }, 40),
    base('b', 'tool_draft', 'Tool: Study group digest', 'Reads the last day of the study group chat and lists deadlines and open questions.', ready('A tool that sums up my study group chat', 'Study group digest'), 3600),
    base('e', 'tool_draft', 'Tool: Post my notes to Telegram', 'Send my lecture notes to the study group on Telegram.', { description: 'Send my lecture notes to the study group on Telegram.', status: 'failed', error: 'None of your tools can send Telegram messages. Connect Telegram in Tools, then try again.' }, 5400, null),
    base('c', 'memory', 'Remember: physics exam', 'The physics exam is on Thursday 30 October, room 204.', { text: 'The physics exam is on Thursday 30 October, room 204.' }, 7200),
  ]
  const closed: Json[] = []
  // When each drafting request "finishes"; the seeded one keeps drafting long enough to look at.
  const finishing = new Map<string, number>([[`creq_${'d'.repeat(32)}`, Date.now() + 90_000]])
  const submissions = new Map<string, string>()
  const draftSoon = (request: Json, description: string) => {
    request.payload = { description, status: 'drafting' }
    request.summary = description.slice(0, 600)
    finishing.set(String(request.id), Date.now() + 8000)
  }
  const settle = () => {
    for (const request of open) {
      const at = finishing.get(String(request.id))
      if (request.kind !== 'tool_draft' || at === undefined || at > Date.now()) continue
      finishing.delete(String(request.id))
      const description = String((request.payload as Json).description)
      const name = toolName(description)
      request.payload = /telegram/i.test(description)
        ? { description, status: 'failed', error: 'None of your tools can send Telegram messages. Connect Telegram in Tools, then try again.' }
        : ready(description, name)
    }
  }
  const editor = createFakeEditorDrafts()
  return function handle(path: string, method: string, body: Json | undefined, fail: Fail): Json {
    if (path.startsWith('/api/owner/editor-drafts') || path === '/api/pi/tools') return editor(path, method, body, fail)
    settle()
    if (path === '/api/control/pi/change-requests' && method === 'GET') return { schemaVersion: 1, results: structuredClone(open) }
    if (path === '/api/control/pi/tool-drafts' && method === 'POST') {
      const description = String(body?.description ?? '').trim(), submission = String(body?.request_id ?? '')
      if (!description || !/^[A-Za-z0-9_.:-]{16,128}$/.test(submission)) return fail(422)
      const known = submissions.get(submission)
      if (known) return structuredClone(open.find(item => item.id === known) ?? closed.find(item => item.id === known) ?? fail(404))
      const created = base(crypto.randomUUID().replaceAll('-', ''), 'tool_draft', `Tool: ${toolName(description)}`, '', {}, 0, null)
      draftSoon(created, description)
      submissions.set(submission, String(created.id))
      open.unshift(created)
      return structuredClone(created)
    }
    const act = path.match(/^\/api\/control\/pi\/change-requests\/(creq_[0-9a-f]{32})\/(approve|decline|saved|retry|published)$/)
    if (!act || method !== 'POST') return fail(404)
    if (act[2] === 'published') {
      const request = closed.find(item => item.id === act[1]) ?? open.find(item => item.id === act[1])
      if (!request) return fail(404)
      request.result = { ...(request.result as Json | null), published: { toolId: body?.toolId, name: body?.name } }
      return structuredClone(request)
    }
    const index = open.findIndex(item => item.id === act[1])
    if (index < 0) return fail(409)
    if (act[2] === 'retry') {
      const request = open[index], payload = request.payload as Json
      if (request.kind !== 'tool_draft' || payload.status === 'drafting') return fail(409)
      draftSoon(request, typeof body?.description === 'string' ? body.description : String(payload.description))
      return structuredClone(request)
    }
    const [request] = open.splice(index, 1), payload = request.payload as Json
    const result = act[2] === 'decline' ? null : act[2] === 'saved' ? { draftId: body?.draftId }
      : request.kind === 'ai_job' ? { jobId: createJob(String(payload.name), payload.timing as Json, String(payload.timeZone)).id } : { memoryId: 'mem_preview' }
    const decided = { ...request, state: act[2] === 'decline' ? 'declined' : 'approved', result, decidedAt: now() }
    closed.push(decided)
    return structuredClone(decided)
  }
}

/** A short name from his words, the way a drafter would title it: the first few words. */
function toolName(description: string) {
  const words = description.replace(/^(?:a tool (?:that|to)|make me a tool (?:that|to))\s*/i, '').split(/[.,;]/)[0].trim().split(/\s+/).slice(0, 6).join(' ')
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'New tool'
}

function slug(name: string) {
  return (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'tool').replace(/^[^a-z]/, 't').slice(0, 64)
}

/**
 * Preview-only Tools editor drafts, revision-checked like ToolGate's. Its check is the editor's
 * own live rules (the real one is ToolGate's graph check); publishing honours "Let Conker use it".
 * Two tools come published so Tools can run them by hand: a run takes a moment, an input with
 * "fail" in it fails at a step, "unknown" loses its answer, and the email one asks first.
 */
function createFakeEditorDrafts() {
  type Draft = { id: string; revision: number; updated_at: string; document: Json }
  type Version = { draft_id: string; revision: number; automation_id: string; version: number; digest: string; published_at: string; authorization: string; available: boolean; conkerMayUse: boolean }
  const drafts = new Map<string, Draft>(), versions = new Map<string, Version[]>(), runs = new Map<string, Json[]>()
  const hex = (length: number) => Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  const automation = (id: string) => `editor-${[...id].map(char => char.charCodeAt(0).toString(16)).join('').padEnd(32, '0').slice(0, 32)}`
  const seed = (id: string, name: string, description: string, inputs: Json[], authorization: string, age: number) => {
    const node = (key: string, type: string, label: string, y: number, config: Json) => ({ id: key, type, label, position: { x: 0, y }, config })
    const document = { id, name, description, kind: 'workflow', inputs, outputs: [], credentialRefs: [], effect: authorization === 'auto' ? 'read' : 'write', agentVisible: true, budgets: { maxSteps: 20, maxLoopItems: 10, timeoutMs: 10000 },
      nodes: [node('start', 'input', 'Start', 0, {}), node('read', 'tool_call', 'Read the chat', 120, { tool: 'research.fetch', args: { url: '$input.chat' } }), node('done', 'return', 'Done', 240, { value: '$steps.read' })],
      edges: [{ id: 'e1', source: 'start', target: 'read' }, { id: 'e2', source: 'read', target: 'done' }] }
    const time = new Date(Date.now() - age).toISOString()
    drafts.set(id, { id, revision: 1, updated_at: time, document })
    versions.set(id, [{ draft_id: id, revision: 1, automation_id: automation(id), version: 1, digest: hex(64), published_at: time, authorization, available: true, conkerMayUse: true }])
  }
  const deadlines = { deadlines: [{ what: 'Physics worksheet', due: 'Fri 31 Oct', from: 'Dana' }, { what: 'Lab report draft', due: 'Mon 3 Nov', from: 'Noa' }, { what: 'Read chapter 4', due: 'Wed 5 Nov', from: 'Group' }] }
  seed('study-group-digest', 'Study group digest', 'Reads the study group chat and lists the deadlines in it.', [
    { name: 'chat', type: 'string', required: true, description: 'Which chat to read, by its name.' },
    { name: 'days', type: 'number', required: false, description: 'How many days back to read. Leave empty for the last day.' },
    { name: 'only_new', type: 'boolean', required: true, description: 'Skip deadlines it already told you about.' },
    { name: 'include_questions', type: 'boolean', required: false },
    { name: 'skip_people', type: 'array', required: false, description: 'Messages from these people are left out.' },
    { name: 'filters', type: 'object', required: false, description: 'Advanced: extra filters for the reader.' },
  ], 'auto', 86_400_000)
  seed('email-weekly-summary', 'Email the weekly summary', 'Emails your weekly summary to one address.', [{ name: 'to', type: 'string', required: true, description: 'The email address to send it to.' }], 'owner_confirmation', 172_800_000)
  const past = `editor_${'5'.repeat(32)}`
  runs.set('study-group-digest', [{ action_id: past, version: 1, digest: versions.get('study-group-digest')![0].digest, created_at: new Date(Date.now() - 20 * 3600_000).toISOString(), args: { chat: 'Physics 101', only_new: false }, response: { code: 'OK', action_id: past, message: 'Automation completed', result: { code: 'OK', result: deadlines }, steps: [] } }])
  const answer = (id: string, version: Version, body: Json): Json => {
    const args = body.args as Json | undefined, action = String(body.action_id), words = JSON.stringify(args ?? {})
    if (version.authorization !== 'auto' && !body.approval_request_id) return { code: 'CONFIRMATION_REQUIRED', action_id: action, message: 'Automation queued for owner review', request_id: `req_${action.slice(7, 23)}` }
    if (/unknown/i.test(words)) return { code: 'OUTCOME_UNKNOWN', action_id: action, message: 'Dispatch is recorded but its outcome is not confirmed. Do not repeat it.' }
    if (/fail/i.test(words)) return { code: 'WORKFLOW_FAILED', action_id: action, message: 'Workflow failed', result: { code: 'WORKFLOW_FAILED', message: 'The chat wasn’t found.', node_id: 'read' },
      steps: [{ nodeId: 'start', label: 'Start', type: 'input', status: 'completed', output: args }, { nodeId: 'read', label: 'Read the chat', type: 'tool_call', status: 'failed', error: `No chat is called “${String(args?.chat ?? '')}”.` }, { nodeId: 'done', label: 'Done', type: 'return', status: 'skipped' }] }
    const result = id === 'email-weekly-summary' ? `Sent the weekly summary to ${String(args?.to ?? '')}.` : deadlines
    return { code: 'OK', action_id: action, message: 'Automation completed', result: { code: 'OK', result }, steps: [{ nodeId: 'start', label: 'Start', type: 'input', status: 'completed' }, { nodeId: 'read', label: 'Read the chat', type: 'tool_call', status: 'completed' }, { nodeId: 'done', label: 'Done', type: 'return', status: 'completed' }] }
  }
  return function handle(path: string, method: string, body: Json | undefined, fail: Fail): Json {
    // What Pi lists next to its own tools: each published tool Conker may use, as ToolGate names it.
    if (path === '/api/pi/tools') return { results: [...versions.values()].flatMap(history => {
      const version = history.at(-1)!, document = drafts.get(version.draft_id)!.document
      return version.conkerMayUse && version.available ? [{ id: `workflow:${version.automation_id}:${version.version}:${version.digest}`, name: document.name, description: document.description, inputs: (document.inputs as Json[]).map(({ name, type, required, description }) => ({ name, type, required, ...(description ? { description } : {}) })) }] : []
    }) }
    if (path === '/api/owner/editor-drafts' && method === 'GET') return { items: [...drafts.values()].map(item => ({ id: item.id, revision: item.revision, updated_at: item.updated_at, name: item.document.name, kind: item.document.kind })), next_after: null }
    const match = path.match(/^\/api\/owner\/editor-drafts\/([a-zA-Z][a-zA-Z0-9_-]{0,63})(?:\/(validation|publications|publish|access|runs))?$/)
    if (!match) return fail(404)
    const [, id, operation] = match, saved = drafts.get(id)
    if (!operation && method === 'POST') {
      if ((saved?.revision ?? 0) !== body?.expected_revision) return fail(409)
      const record = { id, revision: (saved?.revision ?? 0) + 1, updated_at: new Date().toISOString(), document: structuredClone(body?.document as Json) }
      drafts.set(id, record)
      return structuredClone(record)
    }
    if (!saved) return fail(404)
    if (!operation) return structuredClone(saved)
    const history = versions.get(id) ?? []
    if (operation === 'validation') return { id, revision: saved.revision, graph_valid: false, execution_ready: false, issues: validateToolDefinition(saved.document, true).map(issue => ({ message: issue.message, node_id: issue.nodeId ?? null })) }
    if (operation === 'publications') return { items: structuredClone(history).reverse() }
    if (operation === 'publish' && method === 'POST') {
      if (body?.expected_revision !== saved.revision || body?.expected_publication_version !== (history.at(-1)?.version ?? 0)) return fail(409)
      const version: Version = { draft_id: id, revision: saved.revision, automation_id: automation(id), version: history.length + 1, digest: hex(64), published_at: new Date().toISOString(), authorization: String(body?.authorization), available: true, conkerMayUse: body?.conkerMayUse === true }
      versions.set(id, [...history, version])
      return { draft_id: id, revision: version.revision, automation_id: version.automation_id, version: version.version, digest: version.digest, published_at: version.published_at, toolId: `workflow:${version.automation_id}:${version.version}:${version.digest}`, conkerMayUse: version.conkerMayUse }
    }
    const latest = history.find(item => item.version === Number(body?.version)) ?? history.at(-1)
    if (operation === 'access') {
      if (!latest) return fail(404)
      if (method === 'POST') latest.conkerMayUse = body?.enabled === true
      return { actor_id: 'preview-key', actor_name: 'Conker', automation_id: latest.automation_id, enabled: latest.conkerMayUse, required_scopes: [`automation:${latest.automation_id}`] }
    }
    if (operation === 'runs' && method === 'GET') return { items: structuredClone(runs.get(id) ?? []) }
    if (operation === 'runs' && method === 'POST') {
      const version = history.find(item => item.version === body?.version)
      if (!version || version.digest !== body?.digest) return fail(409)
      const response = answer(id, version, body!), rows = runs.get(id) ?? [], known = rows.find(row => row.action_id === body?.action_id)
      if (known) known.response = response
      else runs.set(id, [{ action_id: body?.action_id, version: version.version, digest: version.digest, created_at: new Date().toISOString(), args: body?.args, response }, ...rows].slice(0, 30))
      return structuredClone(response)
    }
    return fail(404)
  }
}
