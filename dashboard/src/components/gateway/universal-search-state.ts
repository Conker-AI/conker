import { createStore } from 'zustand/vanilla'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { GatewaySearchClient, SearchPage, SearchResult } from '@/lib/gateway/search'
import type { GatewayRuntimeWorkspaceState } from './runtime-state'
import type { GatewaySourcePrivacyState } from './source-privacy'
import { readRuntimeWithDeadline, type ReadTimer, type ReadTiming } from './runtime-read-deadline'

export const searchStages = ['metadata', 'text', 'semantic'] as const
type Stage = SearchPage['stage']
export type UniversalSearchState = {
  open: boolean; query: string; results: Partial<Record<Stage, SearchPage>>
  pending: boolean; error: 'settings' | 'sources' | 'more' | null
}
const empty = (): UniversalSearchState => ({ open: false, query: '', results: {}, pending: false, error: null })

/** Only explicit source identity is evidence. Opaque derived records need a fresh source read. */
export function searchResultIsForgotten(result: SearchResult, forgotten: readonly string[]) {
  if (result.source === 'conversations' && forgotten.includes(result.recordId)) return true
  try {
    const url = new URL(result.href, 'https://conker.invalid')
    return ['session', 'sessionId'].some(key => url.searchParams.getAll(key).some(id => forgotten.includes(id)))
  } catch { return true }
}

export function createUniversalSearch(options: ReadTiming & {
  client: Pick<GatewaySearchClient, 'settings' | 'query'>; auth: GatewayAuthStore
  workspace: GatewayRuntimeWorkspaceState; privacy: GatewaySourcePrivacyState
}) {
  const store = createStore<UniversalSearchState>(empty)
  const schedule = options.schedule ?? ((run, delay) => setTimeout(run, delay))
  const unschedule = options.unschedule ?? (timer => clearTimeout(timer))
  let started = false, generation = 0, identity: string | null = null, sourceFailure = false
  let timer: ReadTimer | undefined, request: AbortController | null = null
  let unsubscribe: (() => void)[] = []
  const scope = () => {
    const auth = options.auth.getState()
    return auth.phase === 'authenticated' && auth.session?.authenticated && !auth.pending && !auth.logoutUnconfirmed
      ? JSON.stringify([auth.session.sessionId, options.workspace.getState().epoch]) : null
  }
  const eligible = () => started && identity !== null && identity === scope() && store.getState().open
  const mask = (page: SearchPage): SearchPage => ({ ...page, results: page.results.filter(row => !searchResultIsForgotten(row, options.privacy.getState().sessionIds)) })
  function cancel() {
    generation++
    if (timer !== undefined) unschedule(timer)
    timer = undefined
    const previous = request; request = null; previous?.abort()
    store.setState({ pending: false })
  }
  async function run(moreStage?: Stage) {
    const state = store.getState(), query = state.query.trim()
    const previous = moreStage ? state.results[moreStage] : undefined
    if (!eligible() || !query || request || moreStage && !previous?.nextCursor) return
    const controller = new AbortController(), ticket = generation, owner = identity
    request = controller; store.setState({ pending: true, error: moreStage ? state.error : null })
    const current = () => eligible() && generation === ticket && identity === owner && store.getState().query.trim() === query
    try {
      if (moreStage && previous?.nextCursor) {
        const page = await readRuntimeWithDeadline(signal => options.client.query(query, moreStage, signal, previous.nextCursor!), controller, options)
        if (!current() || controller.signal.aborted) return
        if (page.nextCursor === previous.nextCursor) throw new Error('Repeated search cursor')
        const rows = new Map(previous.results.map(row => [row.id, row]))
        page.results.forEach(row => rows.set(row.id, row))
        store.setState(value => ({ results: { ...value.results, [moreStage]: mask({ ...page, results: [...rows.values()] }) }, error: sourceFailure ? 'sources' : null }))
        return
      }
      const { configuration } = await readRuntimeWithDeadline(signal => options.client.settings(signal), controller, options)
      if (!current() || controller.signal.aborted) return
      for (const stage of searchStages) {
        if (stage === 'text' && !configuration.exactText || stage === 'semantic' && !configuration.semantic) continue
        try {
          const page = await readRuntimeWithDeadline(signal => options.client.query(query, stage, signal), controller, options)
          if (!current() || controller.signal.aborted) return
          store.setState(value => ({ results: { ...value.results, [stage]: mask(page) } }))
        } catch {
          if (!current()) return
          sourceFailure = true; store.setState({ error: 'sources' })
          if (controller.signal.aborted) return
        }
      }
    } catch { if (current()) store.setState({ error: moreStage ? 'more' : 'settings' }) }
    finally { if (request === controller) { request = null; store.setState({ pending: false }) } }
  }
  function queue() {
    if (!eligible() || !store.getState().query.trim()) return
    store.setState({ pending: true })
    timer = schedule(() => { timer = undefined; void run() }, 250)
  }
  function clearResults() { sourceFailure = false; store.setState({ results: {}, error: null }) }
  function resetScope() {
    const next = scope()
    if (identity === next) return
    cancel(); identity = next; sourceFailure = false; store.setState(empty())
  }
  return {
    store,
    setOpen(open: boolean) {
      if (open === store.getState().open) return
      cancel(); store.setState({ open }); clearResults(); if (open) queue()
    },
    query(query: string) {
      const same = query.trim() === store.getState().query.trim()
      if (same) { store.setState({ query }); return }
      cancel(); sourceFailure = false; store.setState({ query, results: {}, error: null }); queue()
    },
    retry() { cancel(); clearResults(); queue() },
    more(stage: Stage) { if (!store.getState().pending) void run(stage) },
    resultHref(id: string) {
      if (!eligible()) return null
      const row = Object.values(store.getState().results).flatMap(page => page.results).find(row => row.id === id)
      return row && !searchResultIsForgotten(row, options.privacy.getState().sessionIds) ? row.href : null
    },
    start() {
      if (started) return
      started = true; identity = scope()
      unsubscribe = [options.auth.subscribe(resetScope), options.workspace.subscribe((value, before) => { if (value.epoch !== before.epoch) resetScope() }), options.privacy.subscribe(() => {
        // Clear even opaque derived results; their session origin is not exposed by this DTO.
        cancel(); clearResults(); queue()
      })]
    },
    stop() { started = false; unsubscribe.forEach(stop => stop()); unsubscribe = []; cancel(); identity = null; sourceFailure = false; store.setState(empty()) },
  }
}
