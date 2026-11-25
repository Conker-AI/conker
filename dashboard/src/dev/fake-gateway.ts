/**
 * Development-only in-memory gateway for looking at the live UI without a server or a sign-in.
 * It answers the same routes, in the same wire shapes, that the real gateway clients parse, so
 * the real screens and validators run unchanged. Never imported by the production entry.
 */
import { GatewayError } from '@/lib/gateway/transport'
import { createFakeRecallNotices } from './fake-gateway-recall'
import { fakeQuietWeeks } from './fake-gateway-quiet'
import { continueAfterDecision, createFakeAgentJobs, createFakeHostOps, createFakeProviderCredentials, fakePlanUsage, withFakeAgentJobs } from './fake-gateway-providers'
import { createFakeMemory } from './fake-gateway-memory'
import { createFakeCalls } from './fake-gateway-calls'
import { createFakeChatAnswers } from './fake-gateway-chat-answers'
import { createFakeChatReviews } from './fake-gateway-chat-reviews'
import { createFakeChatNames } from './fake-gateway-chat-names'
import { createFakeHistory } from './fake-gateway-history'
import { createFakeChatContext } from './fake-gateway-chat-context'
import { createFakeChatSummary } from './fake-gateway-chat-summary'
import { createFakeSetup } from './fake-gateway-setup'
import { createFakeSystem } from './fake-gateway-system'
import { createFakeCharacters } from './fake-gateway-characters'
import { createFakeTerminal } from './fake-gateway-terminal'
import { createFakeRuntimes } from './fake-gateway-runtimes'
import { createFakeStatus } from './fake-gateway-status'
import { createFakeTeams } from './fake-gateway-teams'
import { createFakeTasks } from './fake-gateway-tasks'
import { createFakeLibrary } from './fake-gateway-library'
import { createFakeJobs } from './fake-gateway-jobs'
import { createFakeProjects } from './fake-gateway-projects'
import { createFakeAgents } from './fake-gateway-agents'
import { createFakeSearch } from './fake-gateway-search'
import { fakeTurnUsage } from './fake-gateway-usage'
import { withAgentTools } from './fake-gateway-agent-steps'
import { fakeApprovalLevels, fakePasswordAlerts } from './fake-approval-levels'
import { previewComposerDrafts } from './fake-gateway-resume'

type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST' | 'PUT'; body?: Json; query?: Record<string, string | number | boolean | readonly string[]>; signal?: AbortSignal; onDispatch?: () => void }

const now = () => Date.now() / 1000
const iso = (seconds: number) => new Date(seconds * 1000).toISOString()
let counter = 0
const nextId = (prefix: string) => prefix === 'msg' || prefix === 'ses'
  ? `${prefix}_${(++counter).toString(16).padStart(16, '0')}`
  : `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}`
const previewSessions = {
  week: `ses_${'1'.repeat(16)}`,
  sky: `ses_${'2'.repeat(16)}`,
  coach: `ses_${'3'.repeat(16)}`,
}

type Message = { id: string; session_id: string; seq: number; role: 'user' | 'assistant' | 'tool'; content: string; created_at: number; agent_id?: string; memory_delivery?: Json; turn_id?: string; response_family?: Json }
type Session = { id: string; title: string; summary?: string; created_at: number; messages: Message[]; turns: Json[]; thinking?: Json[] }
/** What the chat feature fixtures may read and change: the preview's chats, its id maker and each chat's context settings (owned by the context fixture; the summary fixture reads and bumps the revision). */
export type FakeChatStore = { sessions: Session[]; nextId: (prefix: string) => string; contexts: Map<string, { revision: number; policy: Json | null }> }

const replies = [
  "Here's a simple plan for the week:\n\n| Day | Plan |\n| --- | --- |\n| Monday | Revision block before school, 45 minutes |\n| Tuesday and Thursday | Judo, so keep homework light |\n| Friday | Hand in the physics worksheet |\n\nWant me to put these in your calendar?",
  'Sure. Short version: sunlight scatters off air molecules, and blue light scatters the most because its wavelength is shorter. That scattered blue reaches your eyes from every direction.',
  "I can do that. I'll draft it first so you can check it before anything is sent.",
]

function seed(): Session[] {
  const start = now() - 86400
  const session = (id: string, title: string, turns: [string, string][], offset: number): Session => ({
    id, title, created_at: start + offset, turns: turns.map((_, index) => ({
      id: `trn_${offset}_${index}`, session_id: id, status: 'completed', acted: 0, started_at: start + offset + index * 120, ended_at: start + offset + index * 120 + 8,
      provider: 'ollama', model: 'qwen2.5:3b', input_tokens: null, output_tokens: null, cost_usd: null, detail: null, action: null,
      memory: { configured: false, pending_ingestion: 0, blocked_delivery: 0, pending_deletion: 0, notices: [] },
    })),
    messages: turns.flatMap(([ask, answer], index) => [
      { id: `msg_${(offset + index * 2 + 1).toString(16).padStart(16, '0')}`, session_id: id, seq: index * 2 + 1, role: 'user' as const, content: ask, created_at: start + offset + index * 120,
        memory_delivery: { state: id === previewSessions.week ? 'saved' : id === previewSessions.sky ? 'filtered' : 'excluded', reason_code: id === previewSessions.coach ? 'privacy_disabled' : null, admission_method: id === previewSessions.week ? 'signal' : id === previewSessions.sky ? 'filtered' : null, memory_id: id === previewSessions.week ? 'mem_judo' : null } },
      { id: `msg_${(offset + index * 2 + 2).toString(16).padStart(16, '0')}`, session_id: id, seq: index * 2 + 2, role: 'assistant' as const, content: answer, created_at: start + offset + index * 120 + 8, turn_id: `trn_${offset}_${index}` },
    ]),
  })
  const week = session(previewSessions.week, 'Plan my week', [['Help me plan this week around school and judo.', replies[0]]], 60000)
  // A tool step as Pi records it: the model's request, the tool record, then the answer.
  const step = (seq: number, role: Message['role'], content: string): Message => ({ id: `msg_${(60100 + seq).toString(16).padStart(16, '0')}`, session_id: week.id, seq, role, content, created_at: start + 60300 + seq, ...(role === 'user' ? {} : { turn_id: 'trn_60000_1' }) })
  week.turns.push({ ...week.turns[0], id: 'trn_60000_1', started_at: start + 60303, ended_at: start + 60306 })
  week.messages.push(step(3, 'user', 'How much space is my projects folder using?'), step(4, 'assistant', '{"tool":"sandbox.run","args":{"command":"du -sh projects"}}'),
    step(5, 'tool', JSON.stringify({ tool: 'sandbox.run', ok: true, result: { exitCode: 0, stdout: '4.2G\tprojects\n', stderr: '', durationMs: 840, timedOut: false } })), step(6, 'assistant', 'Your projects folder uses 4.2 GB.'))
  return [withAgentTools(week, start),
    session(previewSessions.sky, 'Why is the sky blue?', [['Why is the sky blue? Two sentences.', replies[1]]], 30000),
    session(previewSessions.coach, 'Email to coach', [['Ask coach if Friday open mat is still on.', replies[2]]], 1000),
  ]
}


export function createFakeGateway(preview: { setupStep?: 'model' | 'memory' | 'capabilities' | 'protection' | 'rehearsal' } = {}) {
  const runtimesHandle = createFakeRuntimes(fail)
  const { handle: memoryHandle, memories, deliveryFor } = createFakeMemory(fail)
  const hostOps = createFakeHostOps(new URLSearchParams(globalThis.location?.search).get('preview-host')), recallNotices = createFakeRecallNotices(new URLSearchParams(globalThis.location?.search).get('preview-recall'), [[previewSessions.week, 'Plan my week'], [previewSessions.sky, 'Why is the sky blue?']], now, fail), providerCredentials = createFakeProviderCredentials(), agentJobs = createFakeAgentJobs(() => jobs), seedAgentJobs = withFakeAgentJobs(agentJobs)
  const sessions = seed()
  const thinkingScenario = globalThis.sessionStorage?.getItem('conker-fake-fail') === 'thinking-cancel-timeout'
  if (thinkingScenario) sessions[0].thinking = [{ session_id: sessions[0].id, turn_id: String(sessions[0].turns[0].id), input_message_id: sessions[0].messages[0].id, created_at: now(), status: 'running', provider: 'ollama', model: 'qwen2.5:7b', result: null, detail: null }]
  if (globalThis.sessionStorage?.getItem('conker-fake-history') === 'paged') {
    for (let index = 0; index < 115; index++) sessions.push({ id: `ses_history_${String(index).padStart(3, '0')}`, title: index === 70 ? `${'A long planning note '.repeat(20)}archived-keyword` : `Earlier conversation ${String(index + 1).padStart(3, '0')}`, ...(index === 70 ? { summary: `${'x'.repeat(400)} summary-keyword` } : {}), created_at: now() - 172800 - index * 60, messages: [], turns: [] })
  }
  const observations = new Map<string, { signature: string; revision: number }>()
  // Reloadable, development-only saved outcomes. They never invoke a provider or tool.
  const outcomeScenario = globalThis.sessionStorage?.getItem('conker-fake-fail')?.match(/^turn-(failed|failed-cap|failed-plain|interrupted|interrupted-acted|unreplied|unknown|approval)$/)?.[1]
  if (outcomeScenario) {
    const session = sessions[0], turn = session.turns[0]
    session.messages = session.messages.filter(message => message.role === 'user').slice(0, 1); session.turns = [turn] // a later turn would hide this one
    Object.assign(turn, { status: ({ unreplied: 'acted_no_reply', unknown: 'outcome_unknown', approval: 'awaiting_approval', 'interrupted-acted': 'interrupted', 'failed-cap': 'failed', 'failed-plain': 'failed' } as Record<string, string>)[outcomeScenario] ?? outcomeScenario,
      acted: ['unreplied', 'interrupted-acted'].includes(outcomeScenario) ? 1 : 0,
      detail: outcomeScenario === 'failed' ? 'The model requested an unavailable tool. This request was not executed.' : outcomeScenario === 'failed-cap' ? "Today's spending cap is reached, so paid models are paused until tomorrow. Raise it with `conker spending cap`." : outcomeScenario === 'failed-plain' ? 'provider returned no choices' : null,
      action: ['unreplied', 'unknown', 'approval', 'interrupted-acted'].includes(outcomeScenario) ? { id: 'act_preview_outcome', state: outcomeScenario === 'unknown' ? 'outcome_unknown' : outcomeScenario === 'approval' ? 'awaiting_approval' : 'completed', job_id: null } : null,
      approval_request_id: outcomeScenario === 'approval' ? 'req_email_coach' : null })
  }
  const composerDrafts = new Map<string, Json>(previewComposerDrafts(now, previewSessions))
  const draftStarts = new Map<string, Json>()
  const emptyComposerDraft = (key: string): Json => ({ schemaVersion: 1, session_id: key === 'new' ? null : key.split('/')[0], task_id: key.split('/')[1] ?? null, content_status: 'available', revision: 0, text: '', updated_at: null, model_id: null, skill_ids: [], think: false, research_mode: 'off', ...(key === 'new' ? { title: '', agent_id: null, privacy: {} } : {}) })
  const submissions = new Map<string, Json>(), pendingTurns = new Map<string, Promise<Json>>()
  const streams = new Map<string, { text: string; stopped: boolean }>()
  // The last row (the email to coach) is the template a new chat approval copies.
  const approvals: Json[] = fakeApprovalLevels()
  const proposals: Json[] = [
    { id: 'prp_homework', title: 'Homework reminders', noticed: 'You asked what homework is due on Friday three times this week.', suggestion: 'Remind you every Thursday evening of what is due Friday.', ifApproved: 'A short reminder appears in your chat each Thursday at 19:00. Nothing else changes.', state: 'open', createdAt: now() - 3600, decidedAt: null, grantsExecutionAuthority: false,
      evidence: [{ messageId: `msg_${(60001).toString(16).padStart(16, '0')}`, available: true, sessionId: previewSessions.week, excerpt: "What's due this Friday? I keep forgetting", createdAt: now() - 7200 }] },
    { id: 'prp_summary', title: 'Weekly study summary', noticed: 'You ask for a summary of what you studied most weekends.', suggestion: 'Prepare a short summary every Sunday.', ifApproved: 'A draft summary waits in your Inbox on Sundays for you to read.', state: 'open', createdAt: now() - 7000, decidedAt: null, grantsExecutionAuthority: false,
      evidence: [{ messageId: `msg_${(30001).toString(16).padStart(16, '0')}`, available: true, sessionId: previewSessions.sky, excerpt: 'Summarize what I studied this week', createdAt: now() - 9000 }] },
  ]
  const setupHandle = createFakeSetup(preview, approvals, now, iso, fail)
  const systemHandle = createFakeSystem(now, iso, fail)
  const callsHandle = createFakeCalls(now, fail)
  const chatStore: FakeChatStore = { sessions, nextId, contexts: new Map() }
  const chatHandles = [createFakeChatAnswers(now, fail, chatStore), createFakeChatReviews(now, fail, chatStore), createFakeChatNames(now, fail, chatStore), createFakeChatContext(now, fail, chatStore), createFakeChatSummary(now, fail, chatStore)]
  const sessionRow = (item: Session) => ({ id: item.id, parent_id: null, title: item.title, status: 'open', created_at: item.created_at, closed_at: null, summary: null })
  const history = createFakeHistory(now, fail, chatStore, sessionRow)
  const tools = [
    { id: 'calendar.read', name: 'Read calendar', description: 'Reads events from your calendar for a date range.', inputs: [{ name: 'from', type: 'date', required: true }, { name: 'to', type: 'date', required: true }] },
    { id: 'email.send', name: 'Send email', description: 'Sends an email. Always asks you first.', inputs: [{ name: 'to', type: 'string', required: true }, { name: 'subject', type: 'string' }, { name: 'body', type: 'string' }] },
    { id: 'research.search', name: 'Web search', description: 'Searches the web and returns short, sourced results.', inputs: [{ name: 'query', type: 'string', required: true }] },
  ]
  const { handle: agentsHandle, agents } = createFakeAgents(now, fail, () => ++counter)
  const charactersHandle = createFakeCharacters(now, fail)
  const terminalHandle = createFakeTerminal(fail)
  const { handle: projectsHandle, projects, artifacts } = createFakeProjects(now, iso, fail, () => ++counter, sessions, previewSessions.week)
  const { handle: jobsHandle, jobs } = createFakeJobs(now, fail, () => ++counter)
  const teamsHandle = createFakeTeams(now, fail, () => ++counter)
  const tasksHandle = createFakeTasks(now, fail)
  const libraryHandle = createFakeLibrary(now, fail)
  const statusHandle = createFakeStatus(now, iso, fail)
  const sessionSettings = new Map<string, Json>()
  const searchHandle = createFakeSearch(fail, { sessions, sessionSettings, memories, projects, artifacts, agents, tools, jobs })
  const memory = { configured: true, pending_ingestion: 0, blocked_delivery: 0, pending_deletion: 0, notices: [] }
  const find = (id: string) => sessions.find(item => item.id === id) ?? fail(404)

  function fail(status: number): never { throw new GatewayError(status === 404 ? 'http' : 'http', status) }

  function submission(requestId: string, session: Session, turnId: string | null, input: Message | null, final: Message | null, status: string): Json {
    const refs = [input && { message_id: input.id, purpose: 'input', action_id: null, seq: input.seq }, final && { message_id: final.id, purpose: 'final', action_id: null, seq: final.seq }].filter(Boolean)
    return { request_id: requestId, requested_session_id: session.id, effective_session_id: turnId ? session.id : null, turn_id: turnId, task_id: null,
      input_message_id: input?.id ?? null, final_message_id: final?.id ?? null, pending_text: null, failure_code: null, message_refs: refs,
      state: turnId ? 'bound' : 'preparing', status, acted: false, content_status: 'available', created_at: now(), updated_at: now() }
  }

  async function sendTurn(session: Session, body: Json): Promise<Json> {
    const requestId = String(body.request_id), text = String(body.text)
    const input: Message = { id: nextId('msg'), session_id: session.id, seq: session.messages.length + 1, role: 'user', content: text, created_at: now() }
    const inputSettings = sessionSettings.get(session.id)?.settings as Json | undefined
    const inputPrivacy = inputSettings?.privacy as Json | undefined
    input.memory_delivery = inputPrivacy?.memoryDisabled ? { state: 'excluded', reason_code: 'privacy_disabled', admission_method: null, memory_id: null }
      : inputSettings?.agentId && inputSettings.agentId !== 'companion' ? { state: 'excluded', reason_code: 'agent_excluded', admission_method: null, memory_id: null }
      : /^remember\b/i.test(text) ? { state: 'pending', reason_code: 'queued', admission_method: null, memory_id: null }
      : { state: 'filtered', reason_code: null, admission_method: 'filtered', memory_id: null }
    session.messages.push(input)
    if (session.messages.length === 1) session.title = text.slice(0, 48)
    // A message about email parks the turn on the owner, like a real email.send tool call.
    if (/e-?mail/i.test(text)) {
      const turnId = nextId('trn'), approvalId = nextId('req')
      approvals.unshift({ ...approvals[approvals.length - 1], id: approvalId, title: 'Send an email', status: 'pending', reviewable: true, unavailable_reason: null, decision: null,
        details: `Conker wants to send an email for: "${text.slice(0, 120)}"`, created_at: iso(now()), updated_at: iso(now()), approval: { expires_at: iso(now() + 600), consumed_at: null, origin_valid: true } })
      session.turns.push({ id: turnId, session_id: session.id, status: 'awaiting_approval', acted: 0, started_at: now(), ended_at: null, provider: 'ollama', model: 'qwen2.5:3b',
        input_tokens: 40, output_tokens: 0, cost_usd: 0, detail: null, action: null, approval_request_id: approvalId, memory })
      const receipt = submission(requestId, session, turnId, input, null, 'awaiting_approval')
      submissions.set(requestId, receipt)
      return { turn_id: turnId, session_id: session.id, status: 'awaiting_approval', acted: false, message: null, submission: receipt }
    }
    const answer = replies[Math.floor(Math.random() * replies.length)]
    const stream = { text: '', stopped: false }
    streams.set(requestId, stream)
    for (const word of answer.split(/(?<= )/)) {
      if (stream.stopped) break
      stream.text += word
      await new Promise(resolve => setTimeout(resolve, 45))
    }
    const turnId = nextId('trn'), started = now()
    const record = (status: string) => session.turns.push({ id: turnId, session_id: session.id, status, acted: 0, started_at: started, ended_at: now(), provider: 'ollama', model: 'qwen2.5:3b',
      input_tokens: 40, output_tokens: 80, cost_usd: 0, detail: null, action: null, approval_request_id: null, memory })
    if (stream.stopped) {
      record('cancelled')
      const receipt = submission(requestId, session, turnId, input, null, 'cancelled')
      submissions.set(requestId, receipt)
      return { turn_id: turnId, session_id: session.id, status: 'cancelled', acted: false, message: null, submission: receipt }
    }
    const agentId = String((sessionSettings.get(session.id)?.settings as Json | undefined)?.agentId ?? 'companion')
    const final: Message = { id: nextId('msg'), session_id: session.id, seq: session.messages.length + 1, role: 'assistant', content: answer, created_at: now(), agent_id: agentId, turn_id: turnId }
    session.messages.push(final)
    record('complete')
    const receipt = submission(requestId, session, turnId, input, final, 'complete')
    submissions.set(requestId, receipt)
    return { turn_id: turnId, session_id: session.id, status: 'complete', acted: false, message: final, submission: receipt }
  }

  async function request(path: string, options: Request = {}): Promise<Json> {
    if (path === '/auth/sessions') return { results: [] }
    if (path === '/auth/alerts' || path === '/auth/alerts/seen') return fakePasswordAlerts(path, options)
    if (path === '/auth/revoke-all' || /^\/auth\/sessions\/.+\/revoke$/.test(path)) throw new GatewayError('dependency', 503)
    const method = options.method ?? 'GET'
    await new Promise(resolve => setTimeout(resolve, method === 'POST' && /^\/api\/owner\/editor-drafts\/[^/]+\/runs$/.test(path) ? 2500 : 120)) // A tool run by hand takes a moment.
    let match: RegExpMatchArray | null; if (path === '/api/host/read' || path.startsWith('/api/host/ops') || path.startsWith('/api/control/pi/updates')) return hostOps(path, options)
    if ((match = path.match(/^\/api\/control\/pi\/drafts\/new\/start\/([A-Za-z0-9_-]+)$/)) && method === 'GET') return structuredClone(draftStarts.get(match[1]) ?? fail(404))
    if (path === '/api/control/pi/drafts/new/start' && method === 'POST') {
      const body = options.body ?? {}, requestId = String(body.request_id)
      const prior = draftStarts.get(requestId)
      if (prior) { if (prior.source_revision !== body.expected_revision) fail(409); return structuredClone(prior) }
      const saved = composerDrafts.get('new') ?? emptyComposerDraft('new')
      if (saved.revision !== body.expected_revision) fail(409)
      if (!String(saved.text).trim()) fail(422)
      const id = nextId('ses')
      sessions.push({ id, title: String(saved.title || 'New chat'), created_at: now(), messages: [], turns: [] })
      sessionSettings.set(id, { revision: 1, settings: { agentId: saved.agent_id || 'companion', privacy: { memoryDisabled: false, harnessDisabled: false, ...(saved.privacy as Json) } } })
      composerDrafts.set(id, { ...saved, session_id: id, revision: 1 })
      const receipt = { schemaVersion: 1, request_id: requestId, session_id: id, content_status: 'available', source_revision: saved.revision, draft_revision: 1 }
      draftStarts.set(requestId, receipt)
      composerDrafts.set('new', { ...emptyComposerDraft('new'), revision: Number(saved.revision) + 1, updated_at: now() })
      if (globalThis.sessionStorage?.getItem('conker-fake-fail') === 'draft-start') { globalThis.sessionStorage.removeItem('conker-fake-fail'); fail(503) }
      return structuredClone(receipt)
    }
    if ((match = path.match(/^\/api\/control\/pi\/drafts\/([A-Za-z0-9_-]+)(?:\/tasks\/([A-Za-z0-9_-]+))?$/))) {
      const key = match[1] + (match[2] ? '/' + match[2] : '')
      if (key !== 'new') find(match[1])
      const mode = globalThis.sessionStorage?.getItem('conker-fake-fail')
      if (mode === 'drafts') fail(503)
      let saved = composerDrafts.get(key) ?? emptyComposerDraft(key)
      if (method === 'POST') {
        if (mode === 'draft-conflict') { saved = { ...saved, text: 'Draft changed in another tab. Keep the revised meeting agenda.', revision: Number(saved.revision) + 1 }; composerDrafts.set(key, saved); globalThis.sessionStorage.removeItem('conker-fake-fail') }
        const body = options.body ?? {}
        if (body.expected_revision !== saved.revision) fail(409)
        saved = { ...saved, ...body, revision: Number(saved.revision) + 1, updated_at: now() }
        delete saved.expected_revision
        composerDrafts.set(key, saved)
      }
      return structuredClone(saved)
    }
    const searchHandled = searchHandle(path, method, options)
    if (searchHandled !== undefined) return searchHandled
    // Failure-path switch: sessionStorage 'conker-fake-fail' = 'sessions' makes the chat list fail.
    if (method === 'GET' && path === '/api/pi/sessions' && globalThis.sessionStorage?.getItem('conker-fake-fail') === 'sessions') fail(503)
    const terminalHandled = terminalHandle(path, method, options)
    if (terminalHandled !== undefined) return terminalHandled
    const historyHandled = await history(path, method, options)
    if (historyHandled !== undefined) return historyHandled
    if (method === 'GET' && path === '/api/pi/sessions') return { results: [...sessions].sort((a, b) => b.created_at - a.created_at).slice(0, 200).map(session => {
      const row = sessionRow(session)
      // Search deliberately keeps its earlier data so the real UI's stale-result mask is exercised.
      return session.id === previewSessions.week && globalThis.sessionStorage?.getItem('conker-fake-search-forgotten') === 'week' ? { ...row, status: 'forgotten', title: '', summary: null } : row
    }) }
    if (method === 'POST' && path === '/api/pi/sessions') {
      // Failure-path switch: a first message containing [fail] makes creation fail with a server error.
      if (String(options.body?.title ?? '').includes('[fail]')) fail(503)
      const agentId = String(options.body?.agent_id ?? 'companion')
      const selectedAgent = agents.find(agent => agent.id === agentId && agent.archived_at === null)
      if (!selectedAgent) fail(422)
      const privacy = options.body?.privacy as Json | undefined
      const created: Session = { id: `ses_${(++counter).toString(16).padStart(16, '0')}`, title: String(options.body?.title ?? ''), created_at: now(), messages: [], turns: [] }
      sessions.push(created)
      sessionSettings.set(created.id, { revision: 1, settings: { agentId, privacy: { memoryDisabled: Boolean(privacy?.memoryDisabled), harnessDisabled: Boolean(privacy?.harnessDisabled) } } })
      return { session_id: created.id }
    }
    if ((match = path.match(/^\/api\/pi\/sessions\/([^/]+)\/observation$/)) && method === 'GET') {
      const item = find(match[1]), signature = JSON.stringify(item), before = observations.get(item.id)
      const next = { signature, revision: (before?.revision ?? 0) + (before?.signature === signature ? 0 : 1) }
      observations.set(item.id, next)
      return { schemaVersion: 1, session_id: item.id, revision: next.revision, active: item.turns.some(turn => turn.status === 'running'), content_status: 'available' }
    }
    if ((match = path.match(/^\/api\/pi\/sessions\/([^/]+)$/)) && method === 'GET') {
      const item = find(match[1])
      return { ...sessionRow(item), thinking: item.thinking ?? [], messages: item.messages.map(message => message.role === 'user' ? { ...message, memory_delivery: deliveryFor(message) } : message), turns: item.turns, memory, pending_submissions: [], pending_submissions_truncated: false }
    }
    if ((match = path.match(/^\/api\/pi\/sessions\/([^/]+)\/thinking\/([^/]+)\/cancel$/)) && method === 'POST') {
      const item = find(match[1]), row = item.thinking?.find(row => row.turn_id === match![2])
      if (!row) return fail(404)
      if (thinkingScenario) return new Promise<Json>(() => { /* Simulate a lost cancellation response; no real work. */ })
      row.status = 'canceled'
      return { schemaVersion: 1 }
    }
    if ((match = path.match(/^\/api\/pi\/sessions\/([^/]+)\/thinking$/)) && method === 'GET') {
      const item = find(match[1])
      if (thinkingScenario && item.thinking?.[0]) item.thinking[0].status = 'canceled'
      return { schemaVersion: 1, session_id: item.id, content_status: 'available', results: item.thinking ?? [] }
    }
    if ((match = path.match(/^\/api\/pi\/sessions\/([^/]+)(?:\/messages\/([^/]+))?\/memory-delivery$/)) && method === 'GET') {
      const rows = find(match[1]).messages.filter(message => message.role === 'user' && (!match![2] || message.id === match![2]))
      if (match[2] && !rows.length) fail(404)
      return { schemaVersion: 1, session_id: match[1], content_status: 'available', results: rows.slice(-100).map(message => ({ message_id: message.id, ...deliveryFor(message, true) })), truncated: rows.length > 100 }
    }
    if ((match = path.match(/^\/api\/pi\/sessions\/([^/]+)\/submissions$/))) return { results: [], next_cursor: null }
    if ((match = path.match(/^\/api\/pi\/sessions\/([^/]+)\/turns$/)) && method === 'POST') {
      const body = options.body ?? {}, key = match[1], requestId = String(body.request_id), prior = submissions.get(requestId)
      if (prior) return { submission: prior }
      if (pendingTurns.has(requestId)) return pendingTurns.get(requestId)!
      const saved = composerDrafts.get(key)
      if (body.draft_revision !== undefined && (!saved || saved.revision !== body.draft_revision || saved.text !== body.text)) throw new GatewayError('http', 409, undefined, 'draft_changed')
      const pending = sendTurn(find(key), body).finally(() => pendingTurns.delete(requestId))
      pendingTurns.set(requestId, pending)
      const result = await pending, receipt = result.submission as Json
      Object.assign(receipt, { draft_revision: body.draft_revision ?? null, model_id: body.model_id ?? null, skill_ids: body.skill_ids ?? [], think: body.think ?? false, research_mode: body.research_mode ?? 'off' })
      if (saved && composerDrafts.get(key)?.revision === body.draft_revision) composerDrafts.set(key, { ...emptyComposerDraft(key), revision: Number(saved.revision) + 1, updated_at: now() })
      return result
    }
    if ((match = path.match(/^\/api\/pi\/turn-submissions\/([^/]+)\/cancel$/))) {
      const stream = streams.get(match[1]); if (stream) stream.stopped = true
      return { request_id: match[1], state: 'bound' }
    }
    if ((match = path.match(/^\/api\/pi\/turn-submissions\/([^/]+)$/))) return submissions.get(match[1]) ?? fail(404)
    if ((match = path.match(/^\/api\/pi\/turns\/([^/]+)\/usage$/)) && method === 'GET') {
      const owner = sessions.find(item => item.turns.some(turn => turn.id === match![1])) ?? fail(404)
      const turn = owner.turns.find(item => item.id === match![1])!
      return fakeTurnUsage(turn, owner.id, owner.id === previewSessions.sky)
    }
    if ((match = path.match(/^\/api\/pi\/turns\/([^/]+)\/resume$/))) {
      const owner = sessions.find(item => item.turns.some(turn => turn.id === match![1])) ?? fail(404)
      const turn = owner.turns.find(item => item.id === match![1])!
      const decided = approvals.find(item => item.id === turn.approval_request_id)
      if (turn.status === 'acted_no_reply' && turn.acted === 1) {
        owner.messages.push({ id: nextId('msg'), session_id: owner.id, seq: owner.messages.length + 1, role: 'assistant', content: 'The recorded action is complete. This is the missing reply; the action was not repeated.', created_at: now() })
        Object.assign(turn, { status: 'complete', ended_at: now() })
      } else if (turn.status === 'awaiting_approval' && decided?.status === 'approved') {
        owner.messages.push({ id: nextId('msg'), session_id: owner.id, seq: owner.messages.length + 1, role: 'assistant', content: 'Done. I sent the email to coach and will tell you when they reply.', created_at: now() })
        Object.assign(turn, { status: 'complete', acted: 1, ended_at: now() })
      } else if (turn.status === 'awaiting_approval' && decided && decided.status !== 'pending') {
        owner.messages.push({ id: nextId('msg'), session_id: owner.id, seq: owner.messages.length + 1, role: 'assistant', content: "OK, I won't send it.", created_at: now() })
        Object.assign(turn, { status: 'complete', ended_at: now() })
      } else if (turn.status === 'outcome_unknown') { await new Promise(resolve => setTimeout(resolve, 1500)); if (globalThis.sessionStorage?.getItem('conker-fake-check') === 'done') { owner.messages.push({ id: nextId('msg'), session_id: owner.id, seq: owner.messages.length + 1, role: 'assistant', content: 'I checked with your tools: the action finished once. It was not sent again.', created_at: now() }); Object.assign(turn, { status: 'complete', acted: 1, ended_at: now(), action: { id: 'act_preview_outcome', state: 'completed', job_id: null } }) } } // Preview: a check stays unknown unless conker-fake-check is "done".
      return { turn_id: turn.id, session_id: owner.id, status: turn.status }
    }
    if ((match = path.match(/^\/api\/pi\/runs\/([^/]+)$/)) && method === 'GET') {
      const session = sessions.find(item => item.turns.some(turn => turn.id === match![1])) ?? fail(404)
      const turn = session.turns.find(turn => turn.id === match![1])!
      return { ...turn, acted: turn.acted === 1, task_ids: [], outputs: [], source: { kind: 'conversation', session_id: session.id }, provenance: 'recorded', content_status: 'available' }
    }
    if (path === '/api/pi/runs') return { results: [], next_cursor: null }
    if (path === '/api/pi/events') return { results: [], next_cursor: null }
    if (path === '/api/owner/requests') return { results: approvals, next_cursor: null }
    if ((match = path.match(/^\/api\/owner\/requests\/([^/]+)$/))) return approvals.find(item => item.id === match![1]) ?? fail(404)
    if ((match = path.match(/^\/api\/owner\/requests\/([^/]+)\/decision$/))) {
      const item = approvals.find(row => row.id === match![1]) ?? fail(404)
      const status = String(options.body?.status)
      Object.assign(item, { status, updated_at: iso(now()), reviewable: false, unavailable_reason: 'already_decided', decision: { status, actor: 'owner', note: String(options.body?.note ?? ''), at: iso(now()) } }); continueAfterDecision(sessions, item, status, String(options.body?.note ?? ''), () => nextId('msg'), now)
      return item
    }
    if (path === '/api/pi/proposals') return { proposals: proposals.filter(item => item.state === 'open') }
    if ((match = path.match(/^\/api\/pi\/proposals\/([^/]+)\/decision$/))) {
      const item = proposals.find(row => row.id === match![1]) ?? fail(404)
      Object.assign(item, { state: { accept: 'accepted', decline: 'declined', never: 'never' }[String(options.body?.decision)], decidedAt: now() })
      return item
    }
    if ((match = path.match(/^\/api\/control\/pi\/sessions\/([^/]+)\/settings$/))) {
      const current = sessionSettings.get(match[1]) ?? { revision: 0, settings: { agentId: 'companion', privacy: { memoryDisabled: false, harnessDisabled: false } } }
      if (method === 'POST') {
        if (options.body?.expected_revision !== current.revision) fail(409)
        const saved = { revision: Number(current.revision) + 1, settings: options.body?.settings }
        sessionSettings.set(match[1], saved)
        return saved
      }
      return current
    }
    const agentsHandled = agentsHandle(path, method, options)
    if (agentsHandled !== undefined) return agentsHandled
    const projectsHandled = projectsHandle(path, method, options)
    if (projectsHandled !== undefined) return projectsHandled
    if (path.startsWith('/api/control/pi/jobs/agent') || path === '/api/owner/tool-settings' || path === '/api/owner/lockdown' || path.startsWith('/api/control/pi/change-requests') || path === '/api/control/pi/tool-drafts' || path.startsWith('/api/owner/editor-drafts') || path === '/api/control/pi/memory/remember' || path.startsWith('/api/control/pi/inbox/shared') || path.startsWith('/api/control/pi/asks') || path.startsWith('/api/control/pi/owner/') || path.startsWith('/api/owner/access') || /^\/api\/owner\/tools\/[^/]+\/(?:sensitive|card|access)$/.test(path) || path === '/api/control/pi/access/handled' || path === '/api/owner/editor-capabilities' || /^\/api\/control\/pi\/jobs\/job_[0-9a-f]{32}\/(?:hook(\/revoke)?|adopt)$/.test(path)) return agentJobs(path, method, options.body, fail); seedAgentJobs(path); if (path === '/api/control/pi/jobs' && method === 'GET') return { schemaVersion: 1, results: jobs, nextCursor: null }
    const jobsHandled = jobsHandle(path, method, options)
    if (jobsHandled !== undefined) return jobsHandled
    const charactersHandled = charactersHandle(path, method, options)
    if (charactersHandled !== undefined) return charactersHandled
    const systemHandled = systemHandle(path, method, options)
    if (systemHandled !== undefined) return systemHandled
    const callsHandled = callsHandle(path, method, options)
    if (callsHandled !== undefined) return callsHandled
    for (const handle of chatHandles) { const handled = handle(path, method, options); if (handled !== undefined) return handled }
    const tasksHandled = tasksHandle(path, method, options); if (tasksHandled !== undefined) return tasksHandled
    const teamsHandled = teamsHandle(path, method, options)
    if (teamsHandled !== undefined) return teamsHandled
    const libraryHandled = libraryHandle(path, method, options)
    if (libraryHandled !== undefined) return libraryHandled
    const setupHandledModels = setupHandle(path, method, options)
    if (setupHandledModels !== undefined) return setupHandledModels
    const runtimesHandled = runtimesHandle(path, method, options)
    if (runtimesHandled !== undefined) return runtimesHandled
    if (path === '/api/host/providers' || path === '/api/control/pi/plans/usage') return path === '/api/control/pi/plans/usage' ? fakePlanUsage(method, fail) : providerCredentials(method, options, fail)
    const statusHandled = statusHandle(path, method, options)
    if (statusHandled !== undefined) return statusHandled
    if (path === '/api/pi/tools') return { status: 'ok', results: [...tools, ...agentJobs(path, method, undefined, fail).results as Json[]] }
    const setupHandled = setupHandle(path, method, options)
    if (setupHandled !== undefined) return setupHandled
    return memoryHandle(path, method, options) ?? recallNotices(path, method) ?? fakeQuietWeeks(path, method, options.query, fail) ?? fail(404)
  }

  /** Server-sent preview stream, answered for the live chat's fetch. */
  function streamResponse(requestId: string): Response {
    const encoder = new TextEncoder()
    let sent = 0, seq = 0
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        await new Promise(resolve => setTimeout(resolve, 60))
        let stream = streams.get(requestId)
        for (let wait = 0; !stream && wait < 50; wait++) { await new Promise(resolve => setTimeout(resolve, 60)); stream = streams.get(requestId) }
        if (!stream) { controller.enqueue(encoder.encode('event: unavailable\ndata: {}\n\n')); controller.close(); return }
        if (stream.text.length > sent) {
          const piece = stream.text.slice(sent); sent = stream.text.length
          controller.enqueue(encoder.encode(`id: ${++seq}\nevent: delta\ndata: ${JSON.stringify({ text: piece, seq })}\n\n`))
        }
        if (submissions.has(requestId)) { controller.enqueue(encoder.encode(`id: ${++seq}\nevent: done\ndata: {}\n\n`)); controller.close() }
      },
    })
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }

  // Preview switches for the password prompt, only where the real gateway asks: entering a key or the
  // paid-model policy, and signing Claude in with API billing (it spends per call).
  const credentialVerificationEnabled = (path: string, body?: unknown) => path === '/api/host/providers' && !!globalThis.sessionStorage?.getItem('conker-fake-credentials')
    && ['stage', 'paid-policy', 'recover-paid-policy'].includes(String((body as { operation?: unknown } | undefined)?.operation))
  const subscriptionVerificationEnabled = (path: string, body?: unknown) => path === '/api/host/claude' && !!globalThis.sessionStorage?.getItem('conker-fake-subscription')
    && (body as { billing?: unknown } | undefined)?.billing === 'api'
  return { request, streamResponse, subscriptionVerificationEnabled, credentialVerificationEnabled }
}
