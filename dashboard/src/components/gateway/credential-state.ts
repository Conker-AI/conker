import { createStore } from 'zustand/vanilla'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { HostedProviderId, ProviderCredential, ProviderCredentialOperation, ProviderCredentialsStatus } from '@/lib/gateway/provider-control'
import { readRuntimeWithDeadline, type ReadTimer, type ReadTiming } from './runtime-read-deadline'

export type CredentialPhase = 'checking' | 'current' | 'unavailable' | 'awaiting-verification' | 'working' | 'uncertain' | 'inactive'
export type CredentialState = {
  phase: CredentialPhase; value: ProviderCredentialsStatus | null; uncertain: boolean; notice: 'read' | 'not-started' | 'selection-changed' | null
  selected: ProviderCredential | null; secret: string; scope: number
}
export function credentialOperationAllowed(value: ProviderCredentialsStatus, operation: ProviderCredentialOperation) {
  if (!value.available) return false
  if (operation.operation === 'recover-paid-policy') return value.policyRecoveryRequired
  if (value.policyRecoveryRequired) return false
  if (operation.operation === 'paid-policy') return value.paidAllowed === operation.expectedAllowed && operation.enabled !== operation.expectedAllowed
  const record = value.providers.find(row => row.id === operation.provider)
  if (!record) return false
  if (operation.operation === 'record-revoked') return operation.issuerConfirmed && /^credential_[0-9a-f]{32}$/.test(operation.revision) && ![record.activeRevision, record.stagedRevision].includes(operation.revision)
  if (operation.operation === 'recover') return record.activationPending && record.stagedRevision === operation.revision
  if (record.activationPending) return false
  if (operation.operation === 'stage') return /^[!-~]{8,4096}$/.test(operation.secret) && record.activeRevision === operation.activeRevision && record.stagedRevision === operation.stagedRevision
  if (record.stagedRevision !== operation.revision) return false
  return operation.operation !== 'activate' || record.verificationStatus === 'verified' && !record.verificationStale
}

export function createCredentialState(options: ReadTiming & {
  mutationTimeout?: number; authStore: GatewayAuthStore
  read: (signal: AbortSignal) => Promise<ProviderCredentialsStatus>
  apply: (operation: ProviderCredentialOperation, signal: AbortSignal, onDispatch: () => void) => Promise<ProviderCredentialsStatus>
}) {
  const empty = (): Omit<CredentialState, 'scope'> => ({ phase: 'checking', value: null, uncertain: false, notice: null, selected: null, secret: '' })
  const store = createStore<CredentialState>(() => ({ ...empty(), scope: 0 }))
  const schedule = options.schedule ?? ((run, delay) => setTimeout(run, delay)), unschedule = options.unschedule ?? (timer => clearTimeout(timer))
  let mounted = false, owner: string | null = null, generation = 0, request: AbortController | null = null
  const identity = () => { const auth = options.authStore.getState(); return auth.phase === 'authenticated' && auth.session?.authenticated && !auth.pending && !auth.logoutUnconfirmed ? auth.session.sessionId : null }
  const current = (ticket: number, source: string | null) => mounted && ticket === generation && source === identity()
  function invalidate() { generation++; request?.abort(); request = null }
  function selectionAfter(value: ProviderCredentialsStatus) {
    const selected = store.getState().selected
    if (!selected) return {}
    const next = value.providers.find(row => row.id === selected.id)
    return !value.available || value.policyRecoveryRequired || !next || JSON.stringify(next) !== JSON.stringify(selected)
      ? { selected: null, secret: '', notice: 'selection-changed' as const } : {}
  }
  async function read() {
    if (!mounted || !identity() || request) return false
    const controller = new AbortController(), ticket = ++generation, source = owner
    request = controller; store.setState({ phase: 'checking', notice: null })
    try {
      const value = await readRuntimeWithDeadline(options.read, controller, options)
      if (!current(ticket, source) || controller.signal.aborted) return false
      store.setState({ phase: 'current', value, notice: null, ...selectionAfter(value) }); return true
    } catch { if (current(ticket, source)) store.setState({ phase: 'unavailable', notice: 'read' }); return false }
    finally { if (request === controller) request = null }
  }
  async function apply(operation: ProviderCredentialOperation, expected: ProviderCredentialsStatus | null, editor: ProviderCredential | null = null) {
    const before = store.getState()
    if (!mounted || !identity() || request || before.phase !== 'current' || !before.value || before.value !== expected || !credentialOperationAllowed(before.value, operation)) return false
    if (operation.operation === 'stage' && (!editor || before.selected !== editor || editor.id !== operation.provider || before.secret !== operation.secret)) return false
    const controller = new AbortController(), ticket = ++generation, source = owner
    const frozen = structuredClone(operation)
    request = controller; store.setState({ phase: 'awaiting-verification', notice: null, secret: '' })
    let dispatched = false
    try {
      const value = await new Promise<ProviderCredentialsStatus>((resolve, reject) => {
        let settled = false, deadline: ReadTimer | null = null
        const finish = (complete: () => void) => { if (settled) return; settled = true; if (deadline !== null) unschedule(deadline); controller.signal.removeEventListener('abort', abort); complete() }
        const abort = () => finish(() => reject(new Error('Operation not confirmed')))
        controller.signal.addEventListener('abort', abort, { once: true })
        if (controller.signal.aborted || !current(ticket, source)) { abort(); return }
        const onDispatch = () => {
          if (!current(ticket, source) || controller.signal.aborted) { controller.abort(); throw new Error('Owner changed') }
          if (dispatched) return
          dispatched = true; store.setState({ phase: 'working' })
          if (settled || controller.signal.aborted || !current(ticket, source)) { controller.abort(); throw new Error('Owner changed') }
          deadline = schedule(() => controller.abort(), options.mutationTimeout ?? 210000)
        }
        try { options.apply(frozen, controller.signal, onDispatch).then(value => finish(() => resolve(value)), error => finish(() => reject(error))) }
        catch (error) { finish(() => reject(error)) }
      })
      if (!current(ticket, source) || controller.signal.aborted) return false
      store.setState({ phase: 'current', value, selected: null, secret: '', uncertain: false, notice: null }); return true
    } catch (error) {
      if (current(ticket, source)) {
        if (dispatched) store.setState({ phase: 'uncertain', uncertain: true, selected: null, secret: '', notice: null })
        else if (error && typeof error === 'object' && 'kind' in error && error.kind === 'verification-cancelled') store.setState({ phase: 'current', notice: null })
        else store.setState({ phase: 'unavailable', notice: 'not-started' })
      }
      return false
    } finally { if (request === controller) request = null }
  }
  function syncOwner() {
    const next = identity()
    if (next === owner) return
    invalidate(); owner = next
    store.setState({ ...empty(), phase: next ? 'checking' : 'inactive', scope: store.getState().scope + 1 })
    if (next) void read()
  }
  return { store, read, apply,
    select(provider: HostedProviderId, expected: ProviderCredentialsStatus | null) {
      const state = store.getState(), record = state.value?.providers.find(row => row.id === provider)
      if (!mounted || !identity() || state.phase !== 'current' || state.value !== expected || !state.value?.available || state.value.policyRecoveryRequired || !record || record.activationPending) return false
      store.setState({ selected: structuredClone(record), secret: '', notice: null }); return true
    },
    secret(value: string, expected: ProviderCredential | null) {
      const state = store.getState()
      if (mounted && identity() && state.phase === 'current' && expected && state.selected === expected) store.setState({ secret: value.slice(0, 4096) })
    },
    close(expected: ProviderCredential | null) {
      const state = store.getState()
      if (state.selected !== expected || state.phase === 'awaiting-verification' || state.phase === 'working') return false
      store.setState({ selected: null, secret: '' }); return true
    },
    start() {
      mounted = true; owner = identity(); const unsubscribe = options.authStore.subscribe(syncOwner)
      if (owner) void read(); else store.setState({ ...empty(), phase: 'inactive' })
      return () => { mounted = false; unsubscribe(); invalidate(); owner = null; store.setState({ ...empty(), phase: 'inactive', scope: store.getState().scope + 1 }) }
    },
  }
}
