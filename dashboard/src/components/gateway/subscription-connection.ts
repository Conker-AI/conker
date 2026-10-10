import { createStore } from 'zustand/vanilla'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import { readRuntimeWithDeadline, type ReadTimer, type ReadTiming } from './runtime-read-deadline'

export type SubscriptionValue = { available: boolean; connected: boolean; loginId: string | null; loginState: string }
export type SubscriptionPhase = 'checking' | 'current' | 'unavailable' | 'awaiting-verification' | 'working' | 'uncertain' | 'inactive'
export type SubscriptionState<T> = { phase: SubscriptionPhase; value: T | null; uncertain: boolean; pollingPaused: boolean; notice: 'read' | 'not-started' | 'paused' | null }
export type SubscriptionOptions<T extends SubscriptionValue, O> = ReadTiming & {
  mutationTimeout?: number
  authStore: GatewayAuthStore
  read: (signal: AbortSignal) => Promise<T>
  apply: (operation: O, signal: AbortSignal, onDispatch: () => void) => Promise<T>
  allowed: (value: T, operation: O) => boolean
  accept: (previous: T | null, next: T, operation?: O) => T
  eligible: () => boolean
  subscribeEnvironment: (listener: () => void) => () => void
}

/** Status evidence and owner-verified operations share one fenced lifetime, never an automatic POST retry. */
export function createSubscriptionConnection<T extends SubscriptionValue, O>(options: SubscriptionOptions<T, O>) {
  const empty = (): SubscriptionState<T> => ({ phase: 'checking', value: null, uncertain: false, pollingPaused: false, notice: null })
  const store = createStore<SubscriptionState<T>>(empty)
  const schedule = options.schedule ?? ((run, delay) => setTimeout(run, delay))
  const unschedule = options.unschedule ?? (timer => clearTimeout(timer))
  let mounted = false, owner: string | null = null, generation = 0, request: AbortController | null = null
  let kind: 'read' | 'write' | null = null, timer: ReadTimer | null = null, polls = 0, pendingLogin: string | null = null
  const identity = () => {
    const auth = options.authStore.getState()
    return auth.phase === 'authenticated' && auth.session?.authenticated && !auth.pending && !auth.logoutUnconfirmed ? auth.session.sessionId : null
  }
  const clearTimer = () => { if (timer !== null) unschedule(timer); timer = null }
  function invalidate() { generation++; clearTimer(); request?.abort(); request = null; kind = null }
  const valid = (ticket: number, source: string | null) => mounted && ticket === generation && source === identity()
  function poll() {
    clearTimer()
    if (!mounted || !pendingLogin || request || !options.eligible() || store.getState().phase !== 'current') return
    if (polls >= 20) { store.setState({ pollingPaused: true }); return }
    timer = schedule(() => { timer = null; polls++; void read(false) }, 3000)
  }
  function publish(previous: T | null, next: T, operation?: O) {
    const value = options.accept(previous, next, operation)
    const login = value.available && !value.connected && value.loginState === 'pending' ? value.loginId : null
    if (pendingLogin !== login) polls = 0
    pendingLogin = login
    store.setState({ phase: 'current', value, notice: null, pollingPaused: false })
  }
  async function read(manual = true) {
    if (!mounted || !identity() || request) return false
    if (!options.eligible()) {
      const value = store.getState().value
      store.setState({ phase: 'unavailable', value: value?.loginState === 'pending' ? value : null, notice: 'paused' }); return false
    }
    if (manual) { polls = 0; store.setState({ pollingPaused: false }) }
    clearTimer()
    const previous = store.getState().value, controller = new AbortController(), ticket = ++generation, source = owner
    request = controller; kind = 'read'; store.setState({ phase: 'checking', notice: null })
    try {
      const next = await readRuntimeWithDeadline(options.read, controller, options)
      if (!valid(ticket, source) || controller.signal.aborted) return false
      publish(previous, next); return true
    } catch {
      if (valid(ticket, source)) { pendingLogin = null; store.setState({ phase: 'unavailable', value: null, notice: 'read' }) }
      return false
    } finally { if (request === controller) { request = null; kind = null; poll() } }
  }
  async function apply(operation: O, expected?: T | null) {
    const before = store.getState()
    if (!mounted || !identity() || request || before.phase !== 'current' || !before.value || expected !== undefined && expected !== before.value || !options.allowed(before.value, operation)) return false
    clearTimer()
    const controller = new AbortController(), ticket = ++generation, source = owner
    request = controller; kind = 'write'
    store.setState({ phase: 'awaiting-verification', notice: null, pollingPaused: false })
    let dispatched = false
    try {
      const next = await new Promise<T>((resolve, reject) => {
        let settled = false, deadline: ReadTimer | null = null
        const finish = (complete: () => void) => {
          if (settled) return
          settled = true; if (deadline !== null) unschedule(deadline)
          controller.signal.removeEventListener('abort', abort); complete()
        }
        const abort = () => finish(() => reject(new Error('Operation not confirmed')))
        controller.signal.addEventListener('abort', abort, { once: true })
        if (controller.signal.aborted || !valid(ticket, source)) { abort(); return }
        const onDispatch = () => {
          if (!valid(ticket, source) || controller.signal.aborted) { controller.abort(); throw new Error('Owner changed') }
          if (dispatched) return
          dispatched = true; store.setState({ phase: 'working' })
          if (settled || controller.signal.aborted || !valid(ticket, source)) { controller.abort(); throw new Error('Owner changed') }
          deadline = schedule(() => controller.abort(), options.mutationTimeout ?? 75000)
        }
        try { options.apply(operation, controller.signal, onDispatch).then(value => finish(() => resolve(value)), error => finish(() => reject(error))) }
        catch (error) { finish(() => reject(error)) }
      })
      if (!valid(ticket, source) || controller.signal.aborted) return false
      publish(before.value, next, operation); store.setState({ uncertain: false }); return true
    } catch (error) {
      if (valid(ticket, source)) {
        if (dispatched) { pendingLogin = null; store.setState({ phase: 'uncertain', value: null, uncertain: true, notice: null }) }
        else if (error && typeof error === 'object' && 'kind' in error && error.kind === 'verification-cancelled') store.setState({ phase: 'current', value: before.value, notice: null })
        else { pendingLogin = null; store.setState({ phase: 'unavailable', value: null, notice: 'not-started' }) }
      }
      return false
    } finally { if (request === controller) { request = null; kind = null; poll() } }
  }
  function syncOwner() {
    const next = identity()
    if (next === owner) return
    invalidate(); owner = next; pendingLogin = null; polls = 0
    store.setState({ ...empty(), phase: next ? 'checking' : 'inactive' })
    if (next) void read()
  }
  function environment() {
    if (!options.eligible()) {
      clearTimer()
      if (kind === 'read') {
        const value = store.getState().value
        invalidate(); store.setState({ phase: 'unavailable', value: value?.loginState === 'pending' ? value : null, notice: 'paused' })
      }
    } else if (!request && (pendingLogin && polls < 20 || store.getState().notice === 'paused')) void read(false)
  }
  return { store, read, apply,
    start() {
      mounted = true; owner = identity()
      const auth = options.authStore.subscribe(syncOwner), env = options.subscribeEnvironment(environment)
      if (owner) void read(); else store.setState({ ...empty(), phase: 'inactive' })
      return () => { mounted = false; auth(); env(); invalidate(); owner = null; pendingLogin = null; store.setState({ ...empty(), phase: 'inactive' }) }
    },
  }
}
