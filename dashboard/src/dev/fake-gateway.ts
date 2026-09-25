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
    if (path === '/api/control/pi/models/configuration') return { revision: 0, configuration: null }
    if (path === '/api/pi/models') return { local: { provider: 'ollama', model: 'qwen2.5:3b', health: { status: 'ok' } }, direct: {}, hosted: { status: 'not_configured' } }
    if (path === '/api/pi/health') return { service: 'pi', version: '0.4.0', status: 'ok', checked_at: iso(now()), age_seconds: 1,
      checks: { store: { status: 'ok' }, memory: { status: 'ok' }, local_provider: { status: 'ok' }, hosted_provider: { status: 'not_configured' }, action_boundary: { status: 'ok' } } }
    if (path === '/api/pi/tools') return { status: 'ok', results: [] }
    if (path === '/api/control/pi/memory/objects') return { objects: [], next_after: null }
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
