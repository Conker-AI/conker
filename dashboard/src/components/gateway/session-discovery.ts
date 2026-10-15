import { createStore } from 'zustand/vanilla'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { RuntimeSession } from '@/lib/gateway/runtime'
import type { GatewayRuntimeWorkspaceState } from './runtime-state'
import { maskForgottenSession, type GatewaySourcePrivacyState } from './source-privacy'
import { readRuntimeWithDeadline, type ReadTimer, type ReadTiming } from './runtime-read-deadline'

export type SessionDiscoveryRead = { rows: RuntimeSession[]; loaded: boolean; refreshing: boolean; error: boolean }
const empty = (): SessionDiscoveryRead => ({ rows: [], loaded: false, refreshing: false, error: false })

/** The bounded discovery window is shared; its absence says nothing about a chat's deletion. */
export function createSessionDiscovery(options: ReadTiming & {
  read: (signal: AbortSignal) => Promise<RuntimeSession[]>
  auth: GatewayAuthStore
  workspace: GatewayRuntimeWorkspaceState
  privacy: GatewaySourcePrivacyState
  available: () => boolean
}) {
  const store = createStore<SessionDiscoveryRead>(empty)
  const schedule = options.schedule ?? ((run, delay) => setTimeout(run, delay))
  const unschedule = options.unschedule ?? (timer => clearTimeout(timer))
  let started = false, generation = 0, failures = 0, publishing = false
  let identity: string | null = null, timer: ReadTimer | undefined
  let request: { controller: AbortController; waiters: ((success: boolean) => void)[] } | null = null
  let waiting: ((success: boolean) => void)[] = []
  let unsubscribe: (() => void)[] = []
  const scope = () => {
    const auth = options.auth.getState()
    return auth.phase === 'authenticated' && auth.session?.authenticated && !auth.pending && !auth.logoutUnconfirmed
      ? JSON.stringify([auth.session.sessionId, options.workspace.getState().epoch]) : null
  }
  const available = () => started && identity !== null && identity === scope() && options.available()
  const clearTimer = () => { if (timer !== undefined) unschedule(timer); timer = undefined }
  function cancel() {
    generation++; clearTimer()
    const previous = request; request = null; previous?.controller.abort()
    previous?.waiters.forEach(resolve => resolve(false)); waiting.forEach(resolve => resolve(false)); waiting = []
    store.setState({ refreshing: false })
  }
  function queue(delay: number) {
    clearTimer()
    if (available()) timer = schedule(() => { timer = undefined; void poll() }, delay)
  }
  function mask(rows: RuntimeSession[]) {
    const forgotten = options.privacy.getState().sessionIds
    return rows.map(row => forgotten.includes(row.id) ? maskForgottenSession(row) : row)
  }
  async function poll() {
    if (!available() || request) return
    const ticket = generation, owner = identity
    const current = { controller: new AbortController(), waiters: waiting }
    waiting = []; request = current; store.setState({ refreshing: true })
    const valid = () => available() && generation === ticket && identity === owner
    let success = false
    try {
      const rows = await readRuntimeWithDeadline(options.read, current.controller, options)
      if (!valid() || current.controller.signal.aborted) return
      // Notify every content surface before making these rows visible. The same response's
      // privacy notification must not invalidate its own already-verified list read.
      publishing = true
      try { options.privacy.getState().markForgotten(rows.filter(row => row.status === 'forgotten').map(row => row.id)) }
      finally { publishing = false }
      if (!valid()) return
      store.setState({ rows: mask(rows), loaded: true, error: false })
      failures = 0; success = true
    } catch {
      if (valid()) { failures++; store.setState({ error: true }) }
    } finally {
      current.waiters.forEach(resolve => resolve(success)); current.waiters = []
      if (request === current) {
        request = null; store.setState({ refreshing: false })
        if (available()) queue(waiting.length ? 0 : failures ? Math.min(60_000, 2000 * 2 ** Math.min(failures - 1, 5)) : 15_000)
      }
    }
  }
  function refresh(): Promise<boolean> {
    if (!available()) return Promise.resolve(false)
    return new Promise(resolve => {
      // An in-flight read may precede a local commit. Coalesce demand into one NEXT read.
      waiting.push(resolve)
      if (!request) queue(0)
    })
  }
  function recheck() {
    const next = scope()
    if (identity !== next) {
      cancel(); identity = next; failures = 0; store.setState(empty())
    }
    if (!available()) { cancel(); return }
    if (!request && timer === undefined) queue(0)
  }
  return {
    store, refresh,
    wake: () => { recheck(); void refresh() },
    recheck,
    start() {
      if (started) return
      started = true
      unsubscribe = [options.auth.subscribe(recheck), options.workspace.subscribe((value, before) => {
        if (value.epoch !== before.epoch) recheck()
        else if (before.operation && !value.operation) void refresh()
      }), options.privacy.subscribe(() => {
        store.setState(value => ({ rows: mask(value.rows) }))
        if (!publishing) { cancel(); if (available()) queue(0) }
      })]
      recheck()
    },
    stop() {
      started = false; unsubscribe.forEach(stop => stop()); unsubscribe = []
      cancel(); identity = null; failures = 0; store.setState(empty())
    },
  }
}
export type SessionDiscovery = ReturnType<typeof createSessionDiscovery>
