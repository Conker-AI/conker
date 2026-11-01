/** Development-only preview fixture for answer versions (retry, compare, switch, branch). */
import { GatewayError } from '@/lib/gateway/transport'
import type { FakeChatStore } from './fake-gateway'

type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST' | 'PUT'; body?: Json }
type Session = FakeChatStore['sessions'][number]
type Message = Session['messages'][number]
type Family = { root_message_id: string; retry_of: string | null; selected_message_id: string; revision: number }

const refuse = (status: number, code: string) => new GatewayError('http', status, undefined, code as never)
const familyOf = (message: Message) => message.response_family as Family | undefined
const piTurn = (message: Message) => /^trn_[0-9a-f]{16}$/.test(message.turn_id ?? '') ? message.turn_id! : `trn_${message.seq.toString(16).padStart(16, '0')}`

export function createFakeChatAnswers(now: () => number, fail: (status: number) => never, store: FakeChatStore) {
  let turns = 0
  /** Keeps what a request id did, so the same id with the same body replays and another body is refused. */
  const receipts = new Map<string, { key: string; value: Json }>()
  const once = (requestId: unknown, key: string, make: () => Json): Json => {
    const id = String(requestId)
    const kept = receipts.get(id)
    if (kept && kept.key !== key) throw refuse(409, 'request_conflict')
    if (kept) return { ...structuredClone(kept.value), replayed: true }
    const value = make()
    receipts.set(id, { key, value })
    return structuredClone(value)
  }
  const familyMessages = (session: Session, rootId: string) =>
    session.messages.filter(message => familyOf(message)?.root_message_id === rootId).sort((a, b) => a.seq - b.seq)
  const familyView = (session: Session, rootId: string): Json => {
    const members = familyMessages(session, rootId)
    if (!members.length) throw refuse(404, 'not_found')
    const { selected_message_id, revision } = familyOf(members[0])!
    return {
      root_message_id: rootId, session_id: session.id, selected_message_id, revision,
      versions: members.map(message => ({ message_id: message.id, retry_of: familyOf(message)!.retry_of, turn_id: piTurn(message) })),
    }
  }

  return function handle(path: string, method: 'GET' | 'POST' | 'PUT', options: Request): Json | undefined {
    const match = path.match(/^\/api\/control\/pi\/sessions\/(ses_[0-9a-f]{16})\/(response-families\/msg_[0-9a-f]{16}(?:\/select)?|messages\/msg_[0-9a-f]{16}\/(?:retry|fork)|response-retries\/[A-Za-z0-9_-]+)$/)
    if (!match) return undefined
    const session = store.sessions.find(item => item.id === match[1]) ?? fail(404)
    const parts = match[2].split('/')
    const body = options.body ?? {}

    if (parts[0] === 'response-families' && !parts[2] && method === 'GET') return familyView(session, parts[1])

    if (parts[0] === 'response-families' && parts[2] === 'select' && method === 'POST') {
      const members = familyMessages(session, parts[1])
      if (!members.length) throw refuse(404, 'not_found')
      const current = familyOf(members[0])!
      if (body.expected_revision !== current.revision) throw refuse(409, 'revision_conflict')
      if (!members.some(message => message.id === body.message_id)) throw refuse(409, 'foreign_version')
      if (body.message_id !== current.selected_message_id) for (const message of members) Object.assign(familyOf(message)!, { selected_message_id: body.message_id, revision: current.revision + 1 })
      return familyView(session, parts[1])
    }

    if (parts[0] === 'messages' && parts[2] === 'retry' && method === 'POST') {
      const source = session.messages.find(message => message.id === parts[1])
      if (!source || source.role !== 'assistant') throw refuse(404, 'retry_unavailable')
      return once(body.request_id, JSON.stringify([session.id, source.id, body.model_id]), () => {
        const id = store.nextId('msg')
        const last = session.messages.reduce((top, message) => Math.max(top, message.seq), 0)
        const existing = familyOf(source)
        const rootId = existing?.root_message_id ?? source.id
        const revision = existing ? existing.revision + 1 : 1
        const turnId = `trn_${(++turns + 4096).toString(16).padStart(16, '0')}`
        const added: Message = {
          id, session_id: session.id, seq: last + 1, role: 'assistant', content: `Another take from ${String(body.model_id)}: ${source.content}`,
          created_at: now() / 1000, turn_id: turnId,
        }
        session.messages.push(added)
        // Every version, the first answer included, now points at the new one.
        for (const message of session.messages) {
          if (message.id !== rootId && familyOf(message)?.root_message_id !== rootId && message.id !== id) continue
          const retryOf = message.id === id ? source.id : message.id === rootId ? null : familyOf(message)!.retry_of
          message.response_family = { root_message_id: rootId, retry_of: retryOf, selected_message_id: id, revision } satisfies Family
        }
        const asked = session.messages.filter(message => message.role === 'user' && message.seq < source.seq).at(-1)
        return {
          request_id: body.request_id, session_id: session.id, source_message_id: source.id, source_turn_id: piTurn(source), turn_id: turnId,
          model_id: body.model_id, status: 'complete', input_message_id: asked?.id ?? null, replayed: false, message: added,
        }
      })
    }

    if (parts[0] === 'response-retries' && method === 'GET') {
      const kept = receipts.get(parts[1])
      if (!kept || kept.value.session_id !== session.id) throw refuse(404, 'not_found')
      return { ...structuredClone(kept.value), replayed: false }
    }

    if (parts[0] === 'messages' && parts[2] === 'fork' && method === 'POST') {
      const source = session.messages.find(message => message.id === parts[1])
      if (!source) throw refuse(404, 'foreign_message')
      return once(body.request_id, JSON.stringify([session.id, source.id, body.expected_settings_revision, body.expected_context_revision, body.reviewed_summary]), () => {
        // A branch keeps one version per answer: the one forked from, else the selected one, in the order the answers were first given.
        const slot = (message: Message) => session.messages.find(item => item.id === familyOf(message)?.root_message_id)?.seq ?? message.seq
        const forkedFamily = familyOf(source)?.root_message_id
        const kept = session.messages
          .filter(message => slot(message) <= slot(source))
          .filter(message => {
            const family = familyOf(message)
            if (!family) return true
            return forkedFamily === family.root_message_id ? message.id === source.id : message.id === family.selected_message_id
          })
          .sort((a, b) => slot(a) - slot(b) || a.seq - b.seq)
        const id = store.nextId('ses')
        const messages: Message[] = kept.map((message, index) => {
          const copy: Message = { ...message, id: store.nextId('msg'), session_id: id, seq: index + 1 }
          delete copy.response_family
          return copy
        })
        store.sessions.push({ id, title: `${session.title} (branch)`, created_at: now() / 1000, messages, turns: [] })
        return { session_id: id, parent_id: session.id, message_id: source.id, replayed: false, privacy: { memoryDisabled: false, harnessDisabled: false } }
      })
    }

    return undefined
  }
}
