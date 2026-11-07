import { createStore } from 'zustand/vanilla'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { HistoryArchived, HistoryChat, HistoryPage, HistorySort } from '@/lib/gateway/session-history'
import type { GatewayRuntimeWorkspaceState } from './runtime-state'
import type { GatewaySourcePrivacyState } from './source-privacy'
import { readRuntimeWithDeadline, type ReadTimer, type ReadTiming } from './runtime-read-deadline'

type Pending = 'initial' | 'refresh' | 'older'
export type DirectoryView = { archived: HistoryArchived; sort: HistorySort }
export type DirectoryState = DirectoryView & {
  query: string; rows: HistoryChat[]; nextCursor: string | null; loaded: boolean
  pending: Pending | null; error: 'query' | 'read' | 'refresh' | 'older' | 'cursor' | 'offline' | null; changed: 'new' | 'unverified' | null
}
const empty = (view: DirectoryView = { archived: 'exclude', sort: 'newest' }): DirectoryState => ({ ...view, query: '', rows: [], nextCursor: null, loaded: false, pending: null, error: null, changed: null })
export const validDirectoryQuery = (query: string) => [...query].length <= 200 && !query.includes('\0') && !/[\uD800-\uDFFF]/u.test(query)

/** An explicit, query-bound directory snapshot. Recent discovery cannot rewrite its pages. */
export function createChatDirectory(options: ReadTiming & {
  read: (q: string, cursor: string | undefined, signal: AbortSignal, view: DirectoryView) => Promise<HistoryPage>
  auth: GatewayAuthStore; workspace: GatewayRuntimeWorkspaceState; privacy: GatewaySourcePrivacyState
  available: () => boolean
}) {
  const store = createStore<DirectoryState>(() => empty())
  const schedule = options.schedule ?? ((run, delay) => setTimeout(run, delay))
  const unschedule = options.unschedule ?? (timer => clearTimeout(timer))
  let started = false, generation = 0, identity: string | null = null, publishing = false
  let timer: ReadTimer | undefined, controller: AbortController | null = null
  let unsubscribe: (() => void)[] = [], recent: Set<string> | null = null, baseline: Set<string> | null = null
  const scope = () => {
    const auth = options.auth.getState()
    return auth.phase === 'authenticated' && auth.session?.authenticated && !auth.pending && !auth.logoutUnconfirmed ? JSON.stringify([auth.session.sessionId, options.workspace.getState().epoch]) : null
  }
  const available = () => started && identity !== null && identity === scope() && options.available()
  function changed(): DirectoryState['changed'] {
    const state = store.getState()
    // Archived-only and Trash lists never hold new chats, so a new chat elsewhere is not news here.
    const unseen = state.loaded && state.archived !== 'only' && state.archived !== 'trash' && recent && [...recent].some(id => !options.privacy.getState().sessionIds.includes(id) && !baseline?.has(id) && !state.rows.some(row => row.id === id))
    return unseen ? baseline ? 'new' : 'unverified' : null
  }
  function mask(rows: HistoryChat[]) {
    return rows.map(row => options.privacy.getState().sessionIds.includes(row.id) ? { ...row, title: '', summaryPreview: null, status: 'forgotten' as const, forgotten: true, titleTruncated: false, summaryTruncated: false } : row)
  }
  function cancel() {
    generation++; if (timer !== undefined) unschedule(timer); timer = undefined
    controller?.abort(); controller = null; store.setState({ pending: null })
  }
  async function load(mode: Pending): Promise<boolean> {
    const state = store.getState()
    if (!available()) { if (started && identity) store.setState({ error: 'offline' }); return false }
    if (controller || !validDirectoryQuery(state.query) || mode === 'older' && !state.nextCursor) return false
    if (timer !== undefined) unschedule(timer); timer = undefined
    const request = new AbortController(), ticket = generation, owner = identity, query = state.query, view = { archived: state.archived, sort: state.sort }
    const cursor = mode === 'older' ? state.nextCursor! : undefined, evidence = recent ? new Set(recent) : null
    controller = request; store.setState({ pending: mode, error: null })
    const current = () => available() && generation === ticket && identity === owner && store.getState().query === query && store.getState().archived === view.archived && store.getState().sort === view.sort
    try {
      const page = await readRuntimeWithDeadline(signal => options.read(query.trim(), cursor, signal, view), request, options)
      if (!current() || request.signal.aborted) return false
      if (cursor && page.nextCursor === cursor) throw new Error('Repeated directory cursor')
      publishing = true
      try { options.privacy.getState().markForgotten(page.rows.filter(row => row.forgotten).map(row => row.id)) }
      finally { publishing = false }
      if (!current()) return false
      const prior = mode === 'older' ? store.getState().rows : []
      const merged = new Map(prior.map(row => [row.id, row]))
      page.rows.forEach(row => merged.set(row.id, row))
      // Only evidence captured BEFORE this read may acknowledge later discovery updates.
      if (mode !== 'older') baseline = evidence
      store.setState({ rows: mask([...merged.values()]), nextCursor: page.nextCursor, loaded: true, error: null })
      store.setState({ changed: changed() })
      return true
    } catch (error) {
      if (current()) {
        const invalidCursor = error && typeof error === 'object' && 'code' in error && error.code === 'invalid_history_cursor'
        store.setState({ error: invalidCursor ? 'cursor' : mode === 'initial' ? 'read' : mode, ...(invalidCursor ? { nextCursor: null } : {}) })
      }
      return false
    } finally { if (controller === request) { controller = null; store.setState({ pending: null }) } }
  }
  function recheck() {
    const next = scope()
    if (identity !== next) { cancel(); identity = next; recent = null; baseline = null; store.setState(empty(viewOf())) }
    if (!available()) {
      const interrupted = !store.getState().loaded || controller !== null || timer !== undefined
      cancel()
      if (identity && interrupted && store.getState().error !== 'query') store.setState({ error: 'offline' })
      return
    }
    const state = store.getState()
    if (!state.loaded && !controller && timer === undefined && (!state.error || state.error === 'offline')) timer = schedule(() => { timer = undefined; void load('initial') }, 0)
  }
  const viewOf = (): DirectoryView => ({ archived: store.getState().archived, sort: store.getState().sort })
  return {
    store,
    query(value: string) {
      cancel(); baseline = null
      store.setState({ ...empty(viewOf()), query: value, error: validDirectoryQuery(value) ? null : 'query' })
      if (validDirectoryQuery(value) && available()) timer = schedule(() => { timer = undefined; void load('initial') }, 250)
      else if (validDirectoryQuery(value) && identity) store.setState({ error: 'offline' })
    },
    /** Which chats (active, archived, all, trash) and in what order; the search stays. */
    view(next: Partial<DirectoryView>) {
      const state = store.getState(), view = { ...viewOf(), ...next }
      if (view.archived === state.archived && view.sort === state.sort) return
      cancel(); baseline = null
      store.setState({ ...empty(view), query: state.query, error: validDirectoryQuery(state.query) ? null : 'query' })
      if (validDirectoryQuery(state.query) && available()) timer = schedule(() => { timer = undefined; void load('initial') }, 0)
      else if (validDirectoryQuery(state.query) && identity) store.setState({ error: 'offline' })
    },
    refresh: () => load(store.getState().loaded ? 'refresh' : 'initial'),
    older: () => load('older'),
    noteRecent(ids: string[]) {
      if (!started || identity !== scope()) return
      recent = new Set(ids.filter(id => !options.privacy.getState().sessionIds.includes(id)))
      store.setState({ changed: changed() })
    },
    recheck,
    start() {
      if (started) return
      started = true
      unsubscribe = [options.auth.subscribe(recheck), options.workspace.subscribe((value, before) => { if (value.epoch !== before.epoch) recheck() }), options.privacy.subscribe(() => {
        store.setState(value => ({ rows: mask(value.rows) }))
        if (!publishing) { cancel(); recheck() }
        store.setState({ changed: changed() })
      })]
      recheck()
    },
    stop() { started = false; unsubscribe.forEach(stop => stop()); unsubscribe = []; cancel(); identity = null; recent = null; baseline = null; store.setState(empty()) },
  }
}
