/** Development-only preview fixture for a chat's context settings and its decisions and open questions, in Pi's wire shapes. */
import { GatewayError } from '@/lib/gateway/transport'
import type { FakeChatStore } from './fake-gateway'

type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST' | 'PUT'; body?: Json }
type Item = { id: string; kind: 'decision' | 'thread'; text: string; author: 'owner' | 'ai'; cites: string[]; state: string; replaces: string | null; created_at: number; updated_at: number }
type Items = { revision: number; items: Item[] }

const rules = ['keep-exact', 'allow-summary', 'retrieve', 'exclude']
const hasControlCharacter = (text: string) => [...text].some(char => { const code = char.charCodeAt(0); return (code < 32 && code !== 10) || code === 127 })
const refuse = (status: number, code?: string) => new GatewayError('http', status, undefined, code as never)
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)
const isInt = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number => Number.isInteger(value) && (value as number) >= min && (value as number) <= max

/** Answers `/api/control/pi/context/{sid}` (policy, in `store.contexts`) and `/items` (own map per chat). */
export function createFakeChatContext(now: () => number, _fail: (status: number) => never, store: FakeChatStore) {
  const itemsByChat = new Map<string, Items>()
  let counter = 0
  const itemId = (prefix: 'dec' | 'thr') => `${prefix}_${(++counter).toString(16).padStart(16, '0')}`
  const seconds = () => now() / 1000

  const itemsFor = (sessionId: string): Items => {
    let entry = itemsByChat.get(sessionId)
    if (!entry) {
      const at = seconds()
      entry = { revision: 0, items: [
        { id: itemId('dec'), kind: 'decision', text: 'Keep answers short unless asked for detail.', author: 'ai', cites: [], state: 'active', replaces: null, created_at: at, updated_at: at },
        { id: itemId('thr'), kind: 'thread', text: 'Which city should the weather use?', author: 'ai', cites: [], state: 'open', replaces: null, created_at: at, updated_at: at },
      ] }
      itemsByChat.set(sessionId, entry)
    }
    return entry
  }

  const savePolicy = (sessionId: string, body: Json, messageIds: string[]): Json => {
    const current = store.contexts.get(sessionId) ?? { revision: 0, policy: null }
    if (!isInt(body.expected_revision, 0)) throw refuse(422)
    if (current.revision !== body.expected_revision) throw refuse(409, 'revision_conflict')
    const policy = body.policy
    if (!isObject(policy) || typeof policy.sessionInstructions !== 'string' || policy.sessionInstructions.length > 16000) throw refuse(422)
    const budget = policy.budget
    if (!isObject(budget) || !isInt(budget.contextWindowTokens, 2, 10_000_000) || !isInt(budget.outputReserveTokens, 1) ||
      budget.outputReserveTokens >= budget.contextWindowTokens || !isInt(budget.otherInputTokens, 0)) throw refuse(422)
    const messagePolicies = policy.messagePolicies
    if (!isObject(messagePolicies) || Object.keys(messagePolicies).length > 10_000) throw refuse(422)
    for (const [messageId, rule] of Object.entries(messagePolicies)) {
      if (typeof rule !== 'string' || !rules.includes(rule)) throw refuse(422)
      if (!messageIds.includes(messageId)) throw refuse(422, 'outside_boundary')
    }
    const next = { revision: current.revision + 1, policy: structuredClone(policy) }
    store.contexts.set(sessionId, next)
    return structuredClone(next)
  }

  const addItem = (sessionId: string, body: Json): Json => {
    const entry = itemsFor(sessionId)
    if (!isInt(body.expected_revision, 0) || (body.kind !== 'decision' && body.kind !== 'thread') || typeof body.text !== 'string') throw refuse(422)
    if (entry.revision !== body.expected_revision) throw refuse(409, 'revision_conflict')
    const text = body.text.trim()
    if (!text || [...text].length > 500 || hasControlCharacter(text)) throw refuse(422, 'invalid_text')
    if (entry.items.length >= 200) throw refuse(409, 'too_many')
    let replaced: Item | undefined
    if (body.replaces !== undefined && body.replaces !== null) {
      if (body.kind !== 'decision') throw refuse(422, 'invalid_replace')
      replaced = entry.items.find(item => item.id === body.replaces)
      if (!replaced) throw refuse(422, 'invalid_replace')
      if (replaced.kind !== 'decision' || replaced.state !== 'active') throw refuse(409, 'not_replaceable')
    }
    const at = seconds()
    const item: Item = { id: itemId(body.kind === 'decision' ? 'dec' : 'thr'), kind: body.kind, text, author: 'owner', cites: [], state: body.kind === 'decision' ? 'active' : 'open', replaces: replaced?.id ?? null, created_at: at, updated_at: at }
    if (replaced) { replaced.state = 'superseded'; replaced.updated_at = at }
    entry.items.push(item)
    entry.revision += 1
    return { revision: entry.revision, item: structuredClone(item) }
  }

  const setState = (sessionId: string, id: string, body: Json): Json => {
    const entry = itemsFor(sessionId)
    if (!isInt(body.expected_revision, 0) || typeof body.state !== 'string' || !['active', 'open', 'resolved', 'withdrawn'].includes(body.state)) throw refuse(422)
    if (entry.revision !== body.expected_revision) throw refuse(409, 'revision_conflict')
    const item = entry.items.find(candidate => candidate.id === id)
    if (!item) throw refuse(404, 'not_found')
    if (item.state === 'superseded') throw refuse(409, 'superseded')
    const allowed = item.kind === 'decision' ? ['active', 'withdrawn'] : ['open', 'resolved', 'withdrawn']
    if (!allowed.includes(body.state)) throw refuse(409, 'invalid_state')
    item.state = body.state
    item.updated_at = seconds()
    entry.revision += 1
    return { revision: entry.revision }
  }

  return function handle(path: string, method: 'GET' | 'POST' | 'PUT', options: Request): Json | undefined {
    const match = path.match(/^\/api\/control\/pi\/context\/([^/]+)(\/items(?:\/((?:dec|thr)_[0-9a-f]{16})\/state)?)?$/)
    if (!match) return undefined
    const [, sessionId, tail, stateId] = match
    const session = store.sessions.find(candidate => candidate.id === sessionId)
    if (!session) throw refuse(404, 'unavailable')
    const body = options.body ?? {}
    if (!tail) {
      if (method === 'GET') return structuredClone(store.contexts.get(sessionId) ?? { revision: 0, policy: null })
      if (method === 'POST') return savePolicy(sessionId, body, session.messages.map(message => message.id))
    } else if (!stateId) {
      if (method === 'GET') return structuredClone(itemsFor(sessionId))
      if (method === 'POST') return addItem(sessionId, body)
    } else if (method === 'POST') return setState(sessionId, stateId, body)
    return undefined
  }
}
