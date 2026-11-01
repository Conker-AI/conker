/** Development-only preview fixture for chat summaries, compaction and summary forks. It answers in Pi's exact shapes (snake_case on the summary and fork routes). */
import { GatewayError } from '@/lib/gateway/transport'
import type { FakeChatStore } from './fake-gateway'

type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST' | 'PUT'; body?: Json }

type Version = { revision: number; summary: string | null; source_session_id: string | null; created_at: number; restored_from: number | null }
type SummaryState = { versions: Version[]; compaction: { summaryRevision: number; covered: string[]; folded: string[] } }

const refuse = (status: number, code: string): never => { throw new GatewayError('http', status, undefined, code as never) }

export function createFakeChatSummary(now: () => number, fail: (status: number) => never, store: FakeChatStore) {
  void fail
  /** Newest version first, like Pi. */
  const states = new Map<string, SummaryState>()
  const stateOf = (sessionId: string) => {
    let state = states.get(sessionId)
    if (!state) states.set(sessionId, state = { versions: [], compaction: { summaryRevision: 0, covered: [], folded: [] } })
    return state
  }
  const seconds = () => now()
  const push = (state: SummaryState, summary: string | null, sourceSessionId: string | null, restoredFrom: number | null) => {
    const revision = (state.versions[0]?.revision ?? 0) + 1
    state.versions.unshift({ revision, summary, source_session_id: sourceSessionId, created_at: seconds(), restored_from: restoredFrom })
    state.versions.length = Math.min(state.versions.length, 100)
  }
  const view = (state: SummaryState) => {
    const latest = state.versions[0]
    return { revision: latest?.revision ?? 0, summary: latest?.summary ?? null, source_session_id: latest?.source_session_id ?? null, versions: state.versions.map(version => ({ ...version })) }
  }
  const invalid = (): never => { throw new GatewayError('http', 422) }

  return function handle(path: string, method: 'GET' | 'POST' | 'PUT', options: Request): Json | undefined {
    const match = path.match(/^\/api\/control\/pi\/context\/(ses_[0-9a-f]{16})(\/.*)?$/)
    if (!match) return undefined
    const sessionId = match[1], subPath = match[2] ?? '', body = (options.body ?? {}) as Json
    const owns = (subPath === '' && method === 'GET') || ['/summary', '/summary/restore', '/summary/draft', '/compaction', '/compact', '/fork'].includes(subPath)
    if (!owns) return undefined
    const session = store.sessions.find(item => item.id === sessionId)
    if (!session) return refuse(404, 'unavailable')
    const state = stateOf(sessionId)
    const current = state.versions[0]?.revision ?? 0

    // The context settings fixture answers this route first; this is the fallback that gives `revision` 0 until a policy exists.
    if (subPath === '' && method === 'GET') {
      const context = store.contexts.get(sessionId)
      return { revision: context?.revision ?? 0, policy: context?.policy ?? null }
    }

    if (subPath === '/summary' && method === 'GET') return view(state)

    if (subPath === '/summary' && method === 'POST') {
      if (typeof body.expected_revision !== 'number' || body.expected_revision < 0 || typeof body.summary !== 'string' || body.summary.length > 16000) return invalid()
      if (body.expected_revision !== current) return refuse(409, 'revision_conflict')
      push(state, body.summary, null, null)
      return view(state)
    }

    if (subPath === '/summary/restore' && method === 'POST') {
      if (typeof body.expected_revision !== 'number' || body.expected_revision < 0 || typeof body.revision !== 'number' || body.revision < 0) return invalid()
      if (body.expected_revision !== current) return refuse(409, 'revision_conflict')
      const version = state.versions.find(item => item.revision === body.revision)
      if (!version) return refuse(409, 'missing_revision')
      push(state, version.summary, version.source_session_id, version.revision)
      return view(state)
    }

    if (subPath === '/summary/draft' && method === 'POST') {
      if (body.focus !== undefined && (typeof body.focus !== 'string' || body.focus.length > 500)) return invalid()
      if (session.messages.length < 3) return refuse(409, 'empty')
      const read = session.messages.slice(0, -2)
      const words = read.map(message => String(message.content).split(/\s+/).slice(0, 6).join(' ')).join(' / ')
      return { summary: `Preview summary: ${words}`, messageIds: read.map(message => message.id), truncated: false, earlierSummaryIncluded: current > 0, summaryRevision: current, modelId: 'preview-summary', configurationRevision: 1 }
    }

    if (subPath === '/compaction' && method === 'GET') return { ...state.compaction, covered: [...state.compaction.covered], folded: [...state.compaction.folded] }

    if (subPath === '/compact' && method === 'POST') {
      const covers = body.covers
      if (typeof body.expected_policy_revision !== 'number' || body.expected_policy_revision < 1 || typeof body.expected_summary_revision !== 'number' || body.expected_summary_revision < 0) return invalid()
      if (typeof body.summary !== 'string' || body.summary.length < 1 || body.summary.length > 16000) return invalid()
      if (!Array.isArray(covers) || covers.length < 1 || covers.length > 10000 || covers.some(id => typeof id !== 'string') || new Set(covers).size !== covers.length) return invalid()
      const context = store.contexts.get(sessionId)
      if (!context) return refuse(409, 'no_settings')
      if (body.expected_policy_revision !== context.revision || body.expected_summary_revision !== current) return refuse(409, 'revision_conflict')
      const ids = new Set(session.messages.map(message => message.id))
      if ((covers as string[]).some(id => !ids.has(id))) return refuse(422, 'outside_boundary')
      const policy = (context.policy ?? {}) as Json
      const rules = { ...((policy.messagePolicies ?? {}) as Record<string, unknown>) }
      for (const id of covers as string[]) if (!rules[id]) rules[id] = 'allow-summary'
      const policyRevision = context.revision + 1
      store.contexts.set(sessionId, { revision: policyRevision, policy: { ...policy, messagePolicies: rules } })
      push(state, body.summary, null, null)
      const covered = [...(covers as string[])].sort()
      const folded = covered.filter(id => rules[id] === 'allow-summary')
      state.compaction = { summaryRevision: state.versions[0].revision, covered, folded }
      return { policyRevision, summaryRevision: state.versions[0].revision, covered: [...covered], folded: [...folded] }
    }

    if (subPath === '/fork' && method === 'POST') {
      const last = body.expected_last_message_id
      if (typeof body.expected_revision !== 'number' || body.expected_revision < 1 || typeof body.summary !== 'string' || body.summary.length > 16000) return invalid()
      if (last !== null && typeof last !== 'string') return invalid()
      if (typeof body.request_id !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(body.request_id)) return invalid()
      const context = store.contexts.get(sessionId)
      if (!context || body.expected_revision !== context.revision) return refuse(409, 'revision_conflict')
      if (last !== (session.messages[session.messages.length - 1]?.id ?? null)) return refuse(409, 'boundary_changed')
      const child = { id: store.nextId('ses'), title: `${session.title} (continued)`, created_at: seconds(), messages: [], turns: [] }
      store.sessions.push(child)
      push(stateOf(child.id), body.summary, sessionId, null)
      return { session_id: child.id, parent_id: sessionId, replayed: false }
    }

    return undefined
  }
}
