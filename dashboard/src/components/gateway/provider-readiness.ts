import { createStore } from 'zustand/vanilla'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { ProviderStatus } from '@/lib/gateway/control'
import { readRuntimeWithDeadline, type ReadTiming } from './runtime-read-deadline'

export type ProviderReadinessState = { phase: 'checking' | 'current' | 'unavailable' | 'inactive'; rows: ProviderStatus[] }
/** Provider health is read evidence, never an inference or a connection mutation. */
export function createProviderReadiness(options: ReadTiming & { authStore: GatewayAuthStore; read: (signal: AbortSignal) => Promise<ProviderStatus[]> }) {
  const store = createStore<ProviderReadinessState>(() => ({ phase: 'checking', rows: [] }))
  let mounted = false, generation = 0, owner: string | null = null, controller: AbortController | null = null
  const identity = () => {
    const auth = options.authStore.getState()
    return auth.phase === 'authenticated' && auth.session?.authenticated && !auth.pending && !auth.logoutUnconfirmed ? auth.session.sessionId : null
  }
  function abort() { generation++; controller?.abort(); controller = null }
  function sync() {
    const next = identity()
    if (next === owner) return
    abort(); owner = next; store.setState({ phase: next ? 'checking' : 'inactive', rows: [] })
    if (mounted && next) void refresh()
  }
  async function refresh(replace = false) {
    if (!mounted || !identity()) return false
    if (owner !== identity()) { sync(); return false }
    if (controller && !replace) return false
    abort()
    const request = new AbortController(), ticket = generation, source = owner
    controller = request; store.setState({ phase: 'checking' })
    const current = () => mounted && generation === ticket && source === identity()
    try {
      const rows = await readRuntimeWithDeadline(options.read, request, options)
      if (!current() || request.signal.aborted) return false
      store.setState({ phase: 'current', rows }); return true
    } catch { if (current()) store.setState({ phase: 'unavailable' }); return false }
    finally { if (controller === request) controller = null }
  }
  return { store, refresh,
    start() {
      mounted = true; owner = identity()
      if (!owner) store.setState({ phase: 'inactive', rows: [] })
      const unsubscribe = options.authStore.subscribe(sync)
      return () => { mounted = false; unsubscribe(); abort(); owner = null; store.setState({ phase: 'inactive', rows: [] }) }
    },
  }
}
