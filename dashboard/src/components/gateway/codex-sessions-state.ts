import { createStore } from 'zustand/vanilla'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { CodexThread, CodexSessionsClient } from '@/lib/gateway/codex-sessions'
import { readRuntimeWithDeadline, type ReadTiming } from './runtime-read-deadline'

export type CodexSessionsState = {
  rows: CodexThread[]; loaded: boolean; nextCursor: string | null; query: string
  pending: 'list' | 'more' | 'detail' | null; error: 'read' | 'more' | 'cursor' | null
  selected: CodexThread | null; detailCurrent: boolean; detailError: boolean; active: boolean; scope: number
}
export function createCodexSessionsState(options: ReadTiming & { client: CodexSessionsClient; authStore: GatewayAuthStore; archived: boolean }) {
  const empty = (): Omit<CodexSessionsState, 'scope'> => ({ rows: [], loaded: false, nextCursor: null, query: '', pending: null, error: null, selected: null, detailCurrent: false, detailError: false, active: false })
  const store = createStore<CodexSessionsState>(() => ({ ...empty(), scope: 0 }))
  let mounted = false, owner: string | null = null, generation = 0, request: AbortController | null = null
  const visited = new Set<string>()
  const identity = () => { const auth = options.authStore.getState(); return auth.phase === 'authenticated' && auth.session?.authenticated && !auth.pending && !auth.logoutUnconfirmed ? auth.session.sessionId : null }
  const valid = (ticket: number, source: string | null) => mounted && ticket === generation && source === identity()
  function cancel() { generation++; request?.abort(); request = null }
  async function list(more = false) {
    const state = store.getState()
    if (!mounted || !identity() || request || more && !state.nextCursor) return false
    const cursor = more ? state.nextCursor! : undefined, controller = new AbortController(), ticket = ++generation, source = owner
    request = controller; store.setState({ pending: more ? 'more' : 'list', error: null })
    try {
      const page = await readRuntimeWithDeadline(signal => options.client.list({ archived: options.archived, limit: 25, ...(cursor ? { cursor } : {}) }, signal), controller, { ...options, timeout: options.timeout ?? 35000 })
      if (!valid(ticket, source) || controller.signal.aborted) return false
      if (page.nextCursor && (page.nextCursor === cursor || more && visited.has(page.nextCursor))) { store.setState({ error: 'cursor', nextCursor: null }); return false }
      const rows = new Map((more ? store.getState().rows : []).map(row => [row.id, row])); page.results.forEach(row => rows.set(row.id, row))
      if (!more) visited.clear()
      if (cursor) visited.add(cursor)
      // A metadata page does not refresh an already inspected record or imply activity.
      store.setState({ rows: [...rows.values()], loaded: true, nextCursor: page.nextCursor, error: null })
      return true
    } catch (error) { if (valid(ticket, source)) { const invalidCursor = more && error && typeof error === 'object' && 'status' in error && error.status === 422; store.setState({ error: invalidCursor ? 'cursor' : more ? 'more' : 'read', ...(invalidCursor ? { nextCursor: null } : {}) }) } return false }
    finally { if (request === controller) { request = null; store.setState({ pending: null }) } }
  }
  async function detail(expected: CodexThread) {
    if (!mounted || !identity() || request || store.getState().selected !== expected) return false
    const controller = new AbortController(), ticket = ++generation, source = owner
    request = controller; store.setState({ pending: 'detail', detailCurrent: false, detailError: false })
    try {
      const selected = await readRuntimeWithDeadline(signal => options.client.get(expected.id, signal), controller, { ...options, timeout: options.timeout ?? 35000 })
      if (!valid(ticket, source) || controller.signal.aborted || store.getState().selected !== expected) return false
      store.setState({ selected, detailCurrent: true }); return true
    } catch { if (valid(ticket, source)) store.setState({ detailError: true }); return false }
    finally { if (request === controller) { request = null; store.setState({ pending: null }) } }
  }
  function syncOwner() {
    const next = identity(); if (next === owner) return
    cancel(); visited.clear(); owner = next; store.setState({ ...empty(), active: !!next, scope: store.getState().scope + 1 }); if (next) void list()
  }
  return { store, refresh: () => list(), more: () => list(true), get: detail,
    // Search is a view of loaded metadata, never a native history query.
    query(query: string) { if (mounted && identity()) store.setState({ query }) },
    select(row: CodexThread) {
      if (!mounted || !identity() || !store.getState().rows.includes(row)) return false
      cancel(); const selected = { ...row }; store.setState({ selected, detailCurrent: false, detailError: false, pending: null }); void detail(selected); return true
    },
    close(expected: CodexThread | null) { if (!mounted || store.getState().selected !== expected) return false; cancel(); store.setState({ selected: null, detailCurrent: false, detailError: false, pending: null }); return true },
    start() { mounted = true; owner = identity(); const unsubscribe = options.authStore.subscribe(syncOwner); store.setState({ active: !!owner }); if (owner) void list(); return () => { mounted = false; unsubscribe(); cancel(); owner = null; visited.clear(); store.setState({ ...empty(), scope: store.getState().scope + 1 }) } },
  }
}
