/**
 * Development-only in-memory gateway for looking at the live UI without a server or a sign-in.
 * It answers the same routes, in the same wire shapes, that the real gateway clients parse, so
 * the real screens and validators run unchanged. Never imported by the production entry.
 */
import { GatewayError } from '@/lib/gateway/transport'

type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST'; body?: Json; query?: Record<string, string | number | boolean>; signal?: AbortSignal }

const now = () => Date.now() / 1000
const iso = (seconds: number) => new Date(seconds * 1000).toISOString()
let counter = 0
const nextId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}`

type Message = { id: string; session_id: string; seq: number; role: 'user' | 'assistant'; content: string; created_at: number }
type Session = { id: string; title: string; created_at: number; messages: Message[]; turns: Json[] }

const replies = [
  "Here's a simple plan for the week:\n\n1. **Monday:** revision block before school, 45 minutes.\n2. **Tuesday and Thursday:** judo, so keep homework light.\n3. **Friday:** hand in the physics worksheet.\n\nWant me to put these in your calendar?",
  'Sure. Short version: sunlight scatters off air molecules, and blue light scatters the most because its wavelength is shorter. That scattered blue reaches your eyes from every direction.',
  "I can do that. I'll draft it first so you can check it before anything is sent.",
]

function seed(): Session[] {
  const start = now() - 86400
  const session = (id: string, title: string, turns: [string, string][], offset: number): Session => ({
    id, title, created_at: start + offset, turns: [],
    messages: turns.flatMap(([ask, answer], index) => [
      { id: `${id}_u${index}`, session_id: id, seq: index * 2 + 1, role: 'user' as const, content: ask, created_at: start + offset + index * 120 },
      { id: `${id}_a${index}`, session_id: id, seq: index * 2 + 2, role: 'assistant' as const, content: answer, created_at: start + offset + index * 120 + 8 },
    ]),
  })
  return [
    session('ses_week', 'Plan my week', [['Help me plan this week around school and judo.', replies[0]]], 60000),
    session('ses_sky', 'Why is the sky blue?', [['Why is the sky blue? Two sentences.', replies[1]]], 30000),
    session('ses_coach', 'Email to coach', [['Ask coach if Friday open mat is still on.', replies[2]]], 1000),
  ]
}

export type FakeGateway = ReturnType<typeof createFakeGateway>

export function createFakeGateway() {
  const sessions = seed()
  const submissions = new Map<string, Json>()
  const streams = new Map<string, { text: string; stopped: boolean }>()
  const approvals: Json[] = [{
    id: 'req_email_coach', kind: 'verification', title: 'Send an email to coach', details: 'Conker drafted this email and needs your OK before sending it.',
    actor: 'Conker', severity: 'normal', status: 'pending', created_at: iso(now() - 120), updated_at: iso(now() - 120), decision: null,
    action: { subject_type: 'tool', subject_id: 'email.send', version: 3, args: { to: 'coach@judo-club.example', subject: 'Friday open mat', body: 'Hi coach, is the open mat on Friday still happening? Thanks, Alexey' } },
    approval: { expires_at: iso(now() + 600), consumed_at: null, origin_valid: true }, reviewable: true, unavailable_reason: null,
  }]
  const proposals: Json[] = [
    { id: 'prp_homework', title: 'Homework reminders', noticed: 'You asked what homework is due on Friday three times this week.', suggestion: 'Remind you every Thursday evening of what is due Friday.', ifApproved: 'A short reminder appears in your chat each Thursday at 19:00. Nothing else changes.', state: 'open', createdAt: now() - 3600, decidedAt: null, grantsExecutionAuthority: false,
      evidence: [{ messageId: 'ses_week_u0', available: true, sessionId: 'ses_week', excerpt: "What's due this Friday? I keep forgetting", createdAt: now() - 7200 }] },
    { id: 'prp_summary', title: 'Weekly study summary', noticed: 'You ask for a summary of what you studied most weekends.', suggestion: 'Prepare a short summary every Sunday.', ifApproved: 'A draft summary waits in your Inbox on Sundays for you to read.', state: 'open', createdAt: now() - 7000, decidedAt: null, grantsExecutionAuthority: false,
      evidence: [{ messageId: 'ses_sky_u0', available: true, sessionId: 'ses_sky', excerpt: 'Summarize what I studied this week', createdAt: now() - 9000 }] },
  ]
  const sessionRow = (item: Session) => ({ id: item.id, parent_id: null, title: item.title, status: 'open', created_at: item.created_at, closed_at: null, summary: null })
  const card = (type: string, id: string, title: string, preview: string, memoryType?: string) => ({ type, id, title, preview, preview_truncated: false, status: 'active',
    confidence: 0.9, available_fields: ['content'], ...(memoryType ? { memory_type: memoryType } : {}), connections: { supports: 1, mentions: 1 } })
  const memories = [
    card('memory', 'mem_judo', 'Trains judo on Tuesdays and Thursdays', 'Alexey trains judo on Tuesday and Thursday evenings, so homework should be light on those days.', 'fact'),
    card('memory', 'mem_physics', 'Physics worksheet due Fridays', 'The weekly physics worksheet is handed in every Friday.', 'fact'),
    card('memory', 'mem_revision', 'Prefers short morning revision', 'Revision works best as a 45-minute block before school.', 'context'),
    card('entity', 'ent_coach', 'Coach', 'Judo coach at the club; contacted by email about open mat.'),
    card('evidence', 'evi_week', 'Chat: Plan my week', 'Help me plan this week around school and judo.'),
  ]
  const tools = [
    { id: 'calendar.read', name: 'Read calendar', description: 'Reads events from your calendar for a date range.', inputs: [{ name: 'from', type: 'date', required: true }, { name: 'to', type: 'date', required: true }] },
    { id: 'email.send', name: 'Send email', description: 'Sends an email. Always asks you first.', inputs: [{ name: 'to', type: 'string', required: true }, { name: 'subject', type: 'string' }, { name: 'body', type: 'string' }] },
    { id: 'research.search', name: 'Web search', description: 'Searches the web and returns short, sourced results.', inputs: [{ name: 'query', type: 'string', required: true }] },
  ]
  const role = (modelId: string | null, eligible: string[]) => ({ enabled: modelId !== null, eligibleModelIds: eligible, modelId, timeoutMs: 30000, failure: 'stop', fallbackModelId: null })
  const models: { revision: number; configuration: Json } = { revision: 1, configuration: {
    providers: [{ id: 'ollama', name: 'Local (Ollama)', enabled: true }],
    models: [
      { id: 'qwen-small', providerId: 'ollama', name: 'Qwen 2.5 3B', route: 'qwen2.5:3b', enabled: true, routingDescription: 'Fast, everyday chat' },
      { id: 'qwen-4b', providerId: 'ollama', name: 'Qwen 3 4B', route: 'qwen3:4b', enabled: true, routingDescription: 'Slower, a little smarter' },
    ],
    defaultModelId: 'qwen-small',
    roleSettings: { answerMode: 'manual', roles: { answer: role('qwen-small', ['qwen-small']), routing: role(null, []), 'context-selection': role(null, []), summarization: role(null, []), 'memory-ranking': role(null, []), proposals: role(null, []) } },
  } }
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
    const final: Message = { id: nextId('msg'), session_id: session.id, seq: session.messages.length + 1, role: 'assistant', content: answer, created_at: now() }
    session.messages.push(final)
    record('complete')
    const receipt = submission(requestId, session, turnId, input, final, 'complete')
    submissions.set(requestId, receipt)
    return { turn_id: turnId, session_id: session.id, status: 'complete', acted: false, message: final, submission: receipt }
  }

  async function request(path: string, options: Request = {}): Promise<Json> {
    const method = options.method ?? 'GET'
    await new Promise(resolve => setTimeout(resolve, 120))
    let match: RegExpMatchArray | null
    if (method === 'GET' && path === '/api/pi/sessions') return { results: [...sessions].sort((a, b) => b.created_at - a.created_at).map(sessionRow) }
    if (method === 'POST' && path === '/api/pi/sessions') {
      // Failure-path switch: a first message containing [fail] makes creation fail with a server error.
      if (String(options.body?.title ?? '').includes('[fail]')) fail(503)
      const created: Session = { id: nextId('ses'), title: String(options.body?.title ?? ''), created_at: now(), messages: [], turns: [] }
      sessions.push(created)
      return { session_id: created.id }
    }
    if ((match = path.match(/^\/api\/pi\/sessions\/([^/]+)$/)) && method === 'GET') {
      const item = find(match[1])
      return { ...sessionRow(item), messages: item.messages, turns: item.turns, memory, pending_submissions: [], pending_submissions_truncated: false }
    }
    if ((match = path.match(/^\/api\/pi\/sessions\/([^/]+)\/submissions$/))) return { results: [], next_cursor: null }
    if ((match = path.match(/^\/api\/pi\/sessions\/([^/]+)\/turns$/)) && method === 'POST') return sendTurn(find(match[1]), options.body ?? {})
    if ((match = path.match(/^\/api\/pi\/turn-submissions\/([^/]+)\/cancel$/))) {
      const stream = streams.get(match[1]); if (stream) stream.stopped = true
      return { request_id: match[1], state: 'bound' }
    }
    if ((match = path.match(/^\/api\/pi\/turn-submissions\/([^/]+)$/))) return submissions.get(match[1]) ?? fail(404)
    if ((match = path.match(/^\/api\/pi\/turns\/([^/]+)\/resume$/))) {
      const owner = sessions.find(item => item.turns.some(turn => turn.id === match![1])) ?? fail(404)
      const turn = owner.turns.find(item => item.id === match![1])!
      const decided = approvals.find(item => item.id === turn.approval_request_id)
      if (turn.status === 'awaiting_approval' && decided?.status === 'approved') {
        owner.messages.push({ id: nextId('msg'), session_id: owner.id, seq: owner.messages.length + 1, role: 'assistant', content: 'Done. I sent the email to coach and will tell you when they reply.', created_at: now() })
        Object.assign(turn, { status: 'complete', acted: 1, ended_at: now() })
      } else if (turn.status === 'awaiting_approval' && decided && decided.status !== 'pending') {
        owner.messages.push({ id: nextId('msg'), session_id: owner.id, seq: owner.messages.length + 1, role: 'assistant', content: "OK, I won't send it.", created_at: now() })
        Object.assign(turn, { status: 'complete', ended_at: now() })
      }
      return { turn_id: turn.id, session_id: owner.id, status: turn.status }
    }
    if (path === '/api/pi/tasks' || path === '/api/pi/runs') return { results: [], next_cursor: null }
    if (path === '/api/pi/events') return { results: [], next_cursor: null }
    if (path === '/api/owner/requests') return { results: approvals, next_cursor: null }
    if ((match = path.match(/^\/api\/owner\/requests\/([^/]+)$/))) return approvals.find(item => item.id === match![1]) ?? fail(404)
    if ((match = path.match(/^\/api\/owner\/requests\/([^/]+)\/decision$/))) {
      const item = approvals.find(row => row.id === match![1]) ?? fail(404)
      const status = String(options.body?.status)
      Object.assign(item, { status, updated_at: iso(now()), reviewable: false, unavailable_reason: 'already_decided', decision: { status, actor: 'owner', note: String(options.body?.note ?? ''), at: iso(now()) } })
      return item
    }
    if (path === '/api/pi/proposals') return { proposals: proposals.filter(item => item.state === 'open') }
    if ((match = path.match(/^\/api\/pi\/proposals\/([^/]+)\/decision$/))) {
      const item = proposals.find(row => row.id === match![1]) ?? fail(404)
      Object.assign(item, { state: { accept: 'accepted', decline: 'declined', never: 'never' }[String(options.body?.decision)], decidedAt: now() })
      return item
    }
    if ((match = path.match(/^\/api\/control\/pi\/sessions\/([^/]+)\/settings$/))) return { revision: 0, settings: { agentId: 'companion', privacy: { memoryDisabled: false, harnessDisabled: false } } }
    if (path === '/api/control/pi/models/configuration') {
      if (method === 'POST') { models.revision += 1; models.configuration = options.body?.configuration as Json }
      return models
    }
    if (path === '/api/pi/models') return { local: { provider: 'ollama', model: 'qwen2.5:3b', health: { status: 'ok' } }, direct: {}, hosted: { status: 'not_configured' } }
    if (path === '/api/pi/health') return { service: 'pi', version: '0.4.0', status: 'ok', checked_at: iso(now()), age_seconds: 1,
      checks: { store: { status: 'ok' }, memory: { status: 'ok' }, local_provider: { status: 'ok' }, hosted_provider: { status: 'not_configured' }, action_boundary: { status: 'ok' } } }
    if (path === '/api/pi/tools') return { status: 'ok', results: tools }
    if (path === '/api/control/pi/memory/objects') {
      const search = String(options.query?.search ?? '').toLocaleLowerCase(), type = options.query?.object_type
      const objects = memories.filter(item => (!type || item.type === type) && `${item.title} ${item.preview}`.toLocaleLowerCase().includes(search))
      return { scope: 'all', objects, total: objects.length, next_after: null, search_mode: 'text' }
    }
    if ((match = path.match(/^\/api\/control\/pi\/memory\/objects\/([a-z]+)\/([^/]+)$/))) {
      const item = memories.find(row => row.type === match![1] && row.id === match![2]) ?? fail(404)
      const { connections, ...object } = item
      if (options.query?.operation === 'content') {
        const field = String(options.query.field), text = field === 'content' ? item.preview : ''
        return { scope: 'all', object, connections, field, content: text, total_characters: text.length, next_offset: null }
      }
      const others = memories.filter(row => row.id !== item.id).slice(0, 2)
      return { scope: 'all', object, connections, next_after: null, nodes: others.map(node => ({ ...node, connections: undefined })),
        links: others.map((node, index) => ({ id: `lnk_${item.id}_${index}`, source_type: item.type, source_id: item.id, target_type: node.type, target_id: node.id, relationship: index ? 'mentions' : 'supports', confidence: 0.8 })) }
    }
    return fail(404)
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

  return { request, streamResponse }
}
