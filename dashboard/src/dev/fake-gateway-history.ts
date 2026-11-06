/** Development-only preview fixture for the chat list: search, sort, archive. Answers in Pi's exact shapes. */
import { GatewayError } from '@/lib/gateway/transport'
import type { FakeChatStore } from './fake-gateway'

type Json = Record<string, unknown>
type Request = { body?: Json; query?: Record<string, string | number | boolean> }
type Session = FakeChatStore['sessions'][number]

const SESSION = /^ses_[0-9a-f]{16}$/

export function createFakeHistory(now: () => number, fail: (status: number) => never, store: FakeChatStore, sessionRow: (item: Session) => Json) {
  const archived = new Map<string, number>()
  const order = { newest: (a: Session, b: Session) => b.created_at - a.created_at || b.id.localeCompare(a.id), oldest: (a: Session, b: Session) => a.created_at - b.created_at || a.id.localeCompare(b.id), name: (a: Session, b: Session) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()) || a.id.localeCompare(b.id) }

  return async function handle(path: string, method: string, options: Request): Promise<Json | undefined> {
    if (method === 'POST' && path === '/api/control/pi/sessions/archive') {
      const ids = options.body?.sessions, on = options.body?.archived
      if (!Array.isArray(ids) || !ids.length || ids.length > 100 || typeof on !== 'boolean' || ids.some(id => typeof id !== 'string' || !SESSION.test(id))) fail(422)
      const unique = [...new Set(ids as string[])]
      if (unique.some(id => !store.sessions.some(session => session.id === id))) throw new GatewayError('http', 404, undefined, 'not_found')
      unique.forEach(id => on ? archived.set(id, archived.get(id) ?? now()) : archived.delete(id))
      return { sessions: unique, archived: on }
    }
    if (method !== 'GET' || path !== '/api/pi/sessions/history') return undefined
    if (globalThis.sessionStorage?.getItem('conker-fake-fail') === 'history') fail(503)
    const q = String(options.query?.q ?? '').trim().toLowerCase(), limit = Number(options.query?.limit ?? 50)
    const view = String(options.query?.archived ?? 'exclude'), sort = String(options.query?.sort ?? 'newest') as keyof typeof order
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${q}|${view}|${sort}`)))].map(value => value.toString(16).padStart(2, '0')).join('')
    const sorted = store.sessions.filter(row => view === 'include' || (view === 'only') === archived.has(row.id)).sort(order[sort])
    const cursor = options.query?.cursor
    const at = cursor === undefined ? -1 : sorted.findIndex(row => `h1.${digest}.${row.id}` === cursor)
    if (cursor !== undefined && at < 0) throw new GatewayError('http', 422, undefined, 'invalid_history_cursor')
    const matches = sorted.slice(at + 1).filter(row => !q || row.title.toLowerCase().includes(q) || row.summary?.toLowerCase().includes(q))
    const page = matches.slice(0, limit)
    return { schemaVersion: 1, results: page.map(row => ({ ...sessionRow(row), title: [...row.title].slice(0, 300).join(''), summary_preview: row.summary ? [...row.summary].slice(0, 400).join('') : null, content_status: 'available', title_truncated: [...row.title].length > 300, summary_truncated: [...row.summary ?? ''].length > 400, archived_at: archived.get(row.id) ?? null })), next_cursor: matches.length > limit ? `h1.${digest}.${page.at(-1)!.id}` : null }
  }
}
