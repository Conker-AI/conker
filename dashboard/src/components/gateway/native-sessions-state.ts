import { createStore } from 'zustand/vanilla'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { NativeSession, NativeSessions, NativeSessionOutput, NativeSessionsClient } from '@/lib/gateway/native-sessions'
import { readRuntimeWithDeadline, type ReadTimer, type ReadTiming } from './runtime-read-deadline'

type Pending = 'list' | 'detail' | 'output' | 'verification' | 'stop' | null
export type NativeSessionsState = { rows: NativeSessions | null; listError: boolean; selected: NativeSession | null; detailCurrent: boolean; detailError: boolean; output: NativeSessionOutput | null; outputError: boolean; pending: Pending; active: boolean; stopNotice: { id: string; identity: string; kind: 'requested' | 'uncertain'; checked: boolean } | null; notStarted: boolean; scope: number }
export function createNativeSessionsState(options: ReadTiming & { authStore: GatewayAuthStore; client: NativeSessionsClient; stopTimeout?: number }) {
  const empty = (): Omit<NativeSessionsState, 'scope'> => ({ rows: null, listError: false, selected: null, detailCurrent: false, detailError: false, output: null, outputError: false, pending: null, active: false, stopNotice: null, notStarted: false })
  const store = createStore<NativeSessionsState>(() => ({ ...empty(), scope: 0 }))
  const schedule = options.schedule ?? ((run, delay) => setTimeout(run, delay)), unschedule = options.unschedule ?? (timer => clearTimeout(timer))
  let mounted = false, owner: string | null = null, generation = 0, request: AbortController | null = null
  const identity = () => { const auth = options.authStore.getState(); return auth.phase === 'authenticated' && auth.session?.authenticated && !auth.pending && !auth.logoutUnconfirmed ? auth.session.sessionId : null }
  const valid = (ticket: number, source: string | null) => mounted && ticket === generation && source === identity()
  const mutating = () => ['verification', 'stop'].includes(store.getState().pending ?? '')
  function cancel() { generation++; request?.abort(); request = null }
  async function read(kind: 'list' | 'detail' | 'output', expected?: NativeSession) {
    const state = store.getState()
    if (!mounted || !identity() || request || (kind !== 'list' && (!expected || state.selected !== expected)) || (kind === 'output' && !state.detailCurrent)) return false
    const controller = new AbortController(), ticket = ++generation, source = owner
    request = controller; store.setState({ pending: kind, ...(kind === 'list' ? { listError: false } : kind === 'detail' ? { detailError: false, detailCurrent: false, output: null } : { outputError: false, output: null }) })
    try {
      if (kind === 'list') {
        const rows = await readRuntimeWithDeadline(signal => options.client.list(signal), controller, { ...options, timeout: options.timeout ?? 35000 })
        if (!valid(ticket, source) || controller.signal.aborted) return false
        const selected = store.getState().selected, next = rows.results.find(row => row.id === selected?.id)
        store.setState({ rows, listError: false, ...(selected ? next?.identity === selected.identity ? { selected: next, detailCurrent: true, detailError: false, outputError: false, notStarted: false } : { output: null, detailCurrent: false } : {}) })
      } else if (kind === 'detail') {
        const selected = await readRuntimeWithDeadline(signal => options.client.get(expected!.id, signal), controller, { ...options, timeout: options.timeout ?? 35000 })
        if (!valid(ticket, source) || controller.signal.aborted) return false
        const state = store.getState(), notice = state.stopNotice
        store.setState({ selected, detailCurrent: true, detailError: false, output: null, notStarted: false,
          rows: state.rows ? { ...state.rows, results: state.rows.results.map(row => row.id === selected.id ? selected : row) } : null,
          stopNotice: notice?.id === selected.id && notice.identity === selected.identity ? { ...notice, checked: true } : notice })
      } else {
        const output = await readRuntimeWithDeadline(signal => options.client.output(expected!, signal), controller, { ...options, timeout: options.timeout ?? 35000 })
        if (!valid(ticket, source) || controller.signal.aborted || store.getState().selected !== expected) return false
        if (output.id !== expected!.id || output.identity !== expected!.identity) throw new Error('Session changed')
        store.setState({ output, outputError: false })
      }
      return true
    } catch {
      if (valid(ticket, source)) store.setState(kind === 'list' ? { listError: true, detailCurrent: false, output: null } : kind === 'detail' ? { detailError: true, detailCurrent: false, output: null } : { outputError: true, output: null, detailCurrent: false })
      return false
    } finally { if (request === controller) { request = null; store.setState({ pending: null }) } }
  }
  async function stop(expected: NativeSession) {
    const state = store.getState(), notice = state.stopNotice
    if (!mounted || !identity() || request || state.selected !== expected || !state.detailCurrent || !expected.canStop || notice?.id === expected.id && notice.identity === expected.identity && !notice.checked) return false
    const controller = new AbortController(), ticket = ++generation, source = owner, frozen = { id: expected.id, identity: expected.identity }
    request = controller; store.setState({ pending: 'verification', notStarted: false })
    let dispatched = false
    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false, timer: ReadTimer | null = null
        const finish = (action: () => void) => { if (settled) return; settled = true; if (timer !== null) unschedule(timer); controller.signal.removeEventListener('abort', abort); action() }
        const abort = () => finish(() => reject(new Error('Stop not confirmed')))
        controller.signal.addEventListener('abort', abort, { once: true })
        if (controller.signal.aborted || !valid(ticket, source)) { abort(); return }
        const dispatch = () => {
          if (!valid(ticket, source) || controller.signal.aborted) { controller.abort(); throw new Error('Owner changed') }
          if (dispatched) return
          dispatched = true; store.setState({ pending: 'stop', output: null })
          if (settled || controller.signal.aborted || !valid(ticket, source)) { controller.abort(); throw new Error('Owner changed') }
          timer = schedule(() => controller.abort(), options.stopTimeout ?? 45000)
        }
        try { options.client.stop(frozen, controller.signal, dispatch).then(() => finish(resolve), error => finish(() => reject(error))) } catch (error) { finish(() => reject(error)) }
      })
      if (!valid(ticket, source) || controller.signal.aborted) return false
      store.setState({ detailCurrent: false, output: null, stopNotice: { ...frozen, kind: 'requested', checked: false } }); return true
    } catch (error) {
      if (valid(ticket, source)) {
        if (dispatched) store.setState({ detailCurrent: false, output: null, stopNotice: { ...frozen, kind: 'uncertain', checked: false } })
        else if (!(error && typeof error === 'object' && 'kind' in error && error.kind === 'verification-cancelled')) store.setState({ notStarted: true, detailCurrent: false })
      }
      return false
    } finally { if (request === controller) { request = null; store.setState({ pending: null }) } }
  }
  function syncOwner() {
    const next = identity(); if (next === owner) return
    cancel(); owner = next; store.setState({ ...empty(), active: !!next, scope: store.getState().scope + 1 }); if (next) void read('list')
  }
  return { store, list: () => read('list'), get: (expected: NativeSession) => read('detail', expected), output: (expected: NativeSession) => read('output', expected), stop,
    select(row: NativeSession) {
      if (!mounted || !identity() || mutating() || !store.getState().rows?.results.includes(row)) return false
      cancel(); const selected = { ...row }; store.setState({ selected, detailCurrent: false, detailError: false, output: null, outputError: false, pending: null, notStarted: false }); void read('detail', selected); return true
    },
    close(expected: NativeSession | null) { if (!mounted || mutating() || store.getState().selected !== expected) return false; cancel(); store.setState({ selected: null, detailCurrent: false, output: null, outputError: false, detailError: false, pending: null }); return true },
    clearOutput() { store.setState({ output: null, outputError: false }) },
    start() { mounted = true; owner = identity(); const unsubscribe = options.authStore.subscribe(syncOwner); store.setState({ active: !!owner }); if (owner) void read('list'); return () => { mounted = false; unsubscribe(); cancel(); owner = null; store.setState({ ...empty(), scope: store.getState().scope + 1 }) } },
  }
}
