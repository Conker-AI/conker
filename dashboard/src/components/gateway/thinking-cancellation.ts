import { createStore } from 'zustand/vanilla'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { GatewayRuntimeClient, RuntimeSessionDetail } from '@/lib/gateway/runtime'
import type { GatewayRuntimeWorkspaceState } from './runtime-state'
import type { GatewaySourcePrivacyState } from './source-privacy'
import { readRuntimeWithDeadline, type ReadTiming } from './runtime-read-deadline'

export type ThinkingCancellationContext = { sessionId: string | null; turnId: string | null; working: boolean; identity: string; epoch: number; active: boolean }
export type ThinkingCancellationState = { key: string | null; turnId: string | null; pending: 'cancel' | 'refresh' | null; error: 'uncertain' | 'refresh' | null }
type ThinkingRead = Awaited<ReturnType<GatewayRuntimeClient['getThinking']>>
const empty: ThinkingCancellationState = { key: null, turnId: null, pending: null, error: null }

/** A queued React updater must not replace a newer completion with an older status read. */
export function applyThinkingCancellationRead(detail: RuntimeSessionDetail | null, sessionId: string, turnId: string, value: ThinkingRead) {
  const latest = detail?.thinking?.[0]
  if (!detail || detail.id !== sessionId || latest?.turnId !== turnId || !['queued', 'running'].includes(latest.status)) return detail
  return { ...detail, thinking: value.results }
}

/** Cancellation belongs to one Think request. Checking an uncertain outcome only reads. */
export function createThinkingCancellation(options: ReadTiming & {
  client: Pick<GatewayRuntimeClient, 'cancelThinking' | 'getThinking'>
  authStore: GatewayAuthStore; workspace: GatewayRuntimeWorkspaceState; privacy: GatewaySourcePrivacyState
  context: () => ThinkingCancellationContext
  apply: (sessionId: string, turnId: string, value: ThinkingRead) => void
}) {
  const store = createStore<ThinkingCancellationState>(() => empty)
  let mounted = false, generation = 0, request: AbortController | null = null
  const scope = () => {
    const value = options.context(), auth = options.authStore.getState(), workspace = options.workspace.getState()
    if (!mounted || !value.active || !value.working || !value.sessionId || !value.turnId || auth.phase !== 'authenticated' || !auth.session?.authenticated || auth.pending || auth.logoutUnconfirmed || auth.session.sessionId !== value.identity || workspace.epoch !== value.epoch || workspace.selected !== value.sessionId || options.privacy.getState().sessionIds.includes(value.sessionId)) return null
    return { ...value, sessionId: value.sessionId, turnId: value.turnId, key: JSON.stringify([value.identity, value.epoch, value.sessionId, value.turnId]) }
  }
  function invalidate() { generation++; request?.abort(); request = null; store.setState(empty) }
  function sync() { if (store.getState().key !== scope()?.key && store.getState().key !== null) invalidate() }
  async function run(kind: 'cancel' | 'refresh', turnId: string) {
    sync()
    const source = scope(), previous = store.getState()
    if (!source || source.turnId !== turnId || request || previous.pending || kind === 'cancel' && previous.error) return
    const controller = new AbortController(), ticket = generation
    request = controller
    store.setState({ key: source.key, turnId, pending: kind, error: previous.error })
    const current = () => generation === ticket && scope()?.key === source.key
    try {
      // The deadline helper only bounds/aborts transport; it never retries a mutation.
      if (kind === 'cancel') await readRuntimeWithDeadline(signal => options.client.cancelThinking(source.sessionId, turnId, { signal }), controller, options)
      if (!current() || controller.signal.aborted) return
      const value = await readRuntimeWithDeadline(signal => options.client.getThinking(source.sessionId, { signal }), controller, options)
      if (!current() || controller.signal.aborted) return
      if (value.forgotten) { options.privacy.getState().markForgotten([source.sessionId]); return }
      if (!value.results.some(row => row.turnId === turnId)) throw new Error('Thinking request was not included in the status read')
      options.apply(source.sessionId, turnId, value)
      if (current()) store.setState({ error: null })
    } catch {
      if (current()) store.setState({ error: kind === 'cancel' ? 'uncertain' : 'refresh' })
    } finally {
      if (request === controller) { request = null; if (current()) store.setState({ pending: null }) }
    }
  }
  return {
    store, sync, cancel: (turnId: string) => run('cancel', turnId), refresh: (turnId: string) => run('refresh', turnId),
    start() {
      mounted = true
      const unsubscribe = [options.authStore.subscribe(sync), options.workspace.subscribe(sync), options.privacy.subscribe(sync)]
      return () => { mounted = false; unsubscribe.forEach(stop => stop()); invalidate() }
    },
  }
}
