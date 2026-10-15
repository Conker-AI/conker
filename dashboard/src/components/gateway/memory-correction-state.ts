import { createStore } from 'zustand/vanilla'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import { correctionTextValid, type MemoryCorrectionApply, type MemoryCorrectionsClient, type MemoryCorrectionIdentity, type MemoryCorrectionReceipt, type MemoryCorrectionSnapshot } from '@/lib/gateway/memory-corrections'
import type { GatewaySourcePrivacyState } from './source-privacy'
import { readRuntimeWithDeadline, type ReadTimer, type ReadTiming } from './runtime-read-deadline'

export type CorrectionEditor = { memoryId: string; snapshot: MemoryCorrectionSnapshot | null; text: string; token: object }
type Busy = null | 'snapshot' | 'pending' | 'status' | 'verification' | 'saving'
type Notice = null | 'read' | 'unsupported' | 'changed' | 'not-started' | 'not-recorded' | 'work-active' | 'change-pending' | 'revision-conflict'
export type MemoryCorrectionState = { editor: CorrectionEditor | null; recovery: MemoryCorrectionIdentity | null; previousUnconfirmed: MemoryCorrectionIdentity | null; receipt: MemoryCorrectionReceipt | null; busy: Busy; ready: boolean; notice: Notice; changed: number; scope: number }
export function createMemoryCorrectionState(options: ReadTiming & {
  client: MemoryCorrectionsClient; authStore: GatewayAuthStore; sourcePrivacy: GatewaySourcePrivacyState; mutationTimeout?: number; requestId?: () => string
}) {
  const initial = (): MemoryCorrectionState => ({ editor: null, recovery: null, previousUnconfirmed: null, receipt: null, busy: null, ready: false, notice: null, changed: 0, scope: 0 })
  const store = createStore<MemoryCorrectionState>(initial)
  const schedule = options.schedule ?? ((run, delay) => setTimeout(run, delay)), unschedule = options.unschedule ?? (timer => clearTimeout(timer))
  let mounted = false, owner: string | null = null, generation = 0, request: AbortController | null = null, selected: string | null = null, newReviewTicket: number | null = null
  const identity = () => { const value = options.authStore.getState(); return value.phase === 'authenticated' && value.session?.authenticated && !value.pending && !value.logoutUnconfirmed ? value.session.sessionId : null }
  const current = (ticket: number, source: string | null) => mounted && !!source && ticket === generation && source === identity()
  function invalidate() { generation++; request?.abort(); request = null; newReviewTicket = null }
  function clearEditor() { store.setState({ editor: null }) }
  function receive(value: MemoryCorrectionReceipt) {
    const terminal = value.status === 'applied' || value.status === 'rejected'
    store.setState({ receipt: value, recovery: terminal ? null : { requestId: value.requestId, memoryId: value.memoryId, expectedRevision: value.previousRevision, payloadHash: value.payloadHash }, editor: null, ready: true, notice: null,
      changed: store.getState().changed + (value.status === 'applied' || value.errorCode === 'memory_forgotten' || value.errorCode === 'not_found' ? 1 : 0) })
  }
  async function read(kind: 'pending' | 'status' | 'snapshot', id?: string, expected?: MemoryCorrectionIdentity | null) {
    if (!mounted || !identity() || request) return false
    const before = store.getState()
    if (kind === 'snapshot' && (!id || id !== selected || before.recovery || !before.ready)) return false
    if (kind === 'status' && (!expected || before.recovery !== expected)) return false
    const controller = new AbortController(), ticket = ++generation, source = owner
    request = controller
    store.setState({ busy: kind, notice: null, ...(kind === 'snapshot' ? { editor: { memoryId: id!, snapshot: null, text: '', token: {} } } : {}) })
    try {
      const value = await readRuntimeWithDeadline<unknown>(signal => kind === 'snapshot' ? options.client.snapshot(id!, signal) : kind === 'status' ? options.client.status(expected!, signal) : options.client.pending(signal), controller, { ...options, timeout: options.timeout ?? 35000 })
      if (!current(ticket, source) || controller.signal.aborted) return false
      if (kind === 'snapshot') { const snapshot = value as MemoryCorrectionSnapshot; store.setState({ editor: { memoryId: id!, snapshot, text: snapshot.text, token: {} } }) }
      else if (kind === 'status') receive(value as MemoryCorrectionReceipt)
      else {
        // A pending read cannot disprove an earlier dispatch whose admission may still be in flight.
        const pending = value as Awaited<ReturnType<MemoryCorrectionsClient['pending']>>
        store.setState({ ready: true, ...(pending ? { recovery: pending, receipt: null } : {}), notice: null })
      }
      return true
    } catch (error) {
      if (current(ticket, source)) {
        const status = error && typeof error === 'object' && 'status' in error ? error.status : null
        store.setState({ notice: status === 404 ? kind === 'snapshot' ? 'unsupported' : 'not-recorded' : 'read', ...(kind === 'snapshot' ? { editor: null } : {}) })
      }
      return false
    } finally { if (request === controller) { request = null; store.setState({ busy: null }) } }
  }
  async function mutate(editor: CorrectionEditor | null, expected: MemoryCorrectionIdentity | null) {
    const before = store.getState(), retry = expected !== null
    if (!mounted || !identity() || request || !before.ready) return false
    if (retry ? before.recovery !== expected || !expected.payloadHash : !editor || before.editor !== editor || editor.memoryId !== selected || !editor.snapshot || before.recovery || !correctionTextValid(editor.text) || editor.text === editor.snapshot.text) return false
    const body: MemoryCorrectionApply | null = retry ? null : { request_id: options.requestId?.() ?? `correction_${crypto.randomUUID().replaceAll('-', '')}`, memory_id: editor!.memoryId, expected_revision: editor!.snapshot!.revision, text: editor!.text }
    const intent: MemoryCorrectionIdentity = body ? { requestId: body.request_id, memoryId: body.memory_id, expectedRevision: body.expected_revision, payloadHash: null } : { ...expected! }
    const controller = new AbortController(), ticket = ++generation, source = owner
    let dispatched = false
    request = controller; store.setState({ busy: 'verification', notice: null })
    try {
      const value = await new Promise<MemoryCorrectionReceipt>((resolve, reject) => {
        let settled = false, deadline: ReadTimer | null = null
        const finish = (complete: () => void) => { if (settled) return; settled = true; if (deadline !== null) unschedule(deadline); controller.signal.removeEventListener('abort', abort); complete() }
        const abort = () => finish(() => reject(new Error('Memory change not confirmed')))
        controller.signal.addEventListener('abort', abort, { once: true })
        if (controller.signal.aborted || !current(ticket, source)) { abort(); return }
        const onDispatch = () => {
          if (!current(ticket, source) || controller.signal.aborted) { controller.abort(); throw new Error('Memory scope changed') }
          if (dispatched) return
          dispatched = true; store.setState({ busy: 'saving', recovery: intent, receipt: null, editor: editor ? { ...editor, text: '' } : null })
          if (settled || !current(ticket, source) || controller.signal.aborted) { controller.abort(); throw new Error('Memory scope changed') }
          deadline = schedule(() => controller.abort(), options.mutationTimeout ?? 45000)
        }
        try {
          const work = body ? options.client.apply(body, controller.signal, onDispatch) : options.client.retry(intent, controller.signal, onDispatch)
          work.then(value => finish(() => resolve(value)), error => finish(() => reject(error)))
        } catch (error) { finish(() => reject(error)) }
      })
      if (!current(ticket, source) || controller.signal.aborted) return false
      receive(value); return true
    } catch (error) {
      if (current(ticket, source)) {
        const kind = error && typeof error === 'object' && 'kind' in error ? error.kind : null
        const code = error && typeof error === 'object' && 'code' in error ? error.code : null
        // These static responses explicitly reject a new admission; no edit is repeated.
        if (dispatched && !retry && ['work_active', 'change_pending', 'invalid_request', 'not_found', 'not_configured', 'revision_conflict'].includes(String(code))) store.setState({ recovery: null, editor: null, ready: code !== 'change_pending', notice: code === 'work_active' ? 'work-active' : code === 'change_pending' ? 'change-pending' : code === 'revision_conflict' ? 'revision-conflict' : 'not-started' })
        else store.setState({ ...(dispatched ? { editor: null } : {}), notice: dispatched || kind === 'verification-cancelled' ? null : 'not-started' })
      }
      return false
    } finally { if (request === controller) { request = null; store.setState({ busy: null }) } }
  }
  async function reviewNew(expected: MemoryCorrectionIdentity | null) {
    const before = store.getState()
    if (!mounted || !identity() || request || !expected || before.recovery !== expected || before.notice !== 'not-recorded') return false
    const controller = new AbortController(), ticket = ++generation, source = owner
    request = controller; newReviewTicket = ticket; store.setState({ busy: 'pending', notice: null })
    let available = false
    try {
      const pending = await readRuntimeWithDeadline(options.client.pending, controller, { ...options, timeout: options.timeout ?? 35000 })
      if (!current(ticket, source) || controller.signal.aborted) return false
      if (pending) store.setState({ recovery: pending, receipt: null, ready: true })
      else { selected = expected.memoryId; store.setState({ recovery: null, previousUnconfirmed: expected, receipt: null, ready: true }); available = true }
    } catch { if (current(ticket, source)) store.setState({ notice: 'read' }) }
    finally { if (newReviewTicket === ticket) newReviewTicket = null; if (request === controller) { request = null; store.setState({ busy: null }) } }
    return available && current(ticket, source) ? read('snapshot', expected.memoryId) : false
  }
  function scopeChanged() { invalidate(); store.setState({ editor: null, busy: null, ready: false, notice: 'changed', scope: store.getState().scope + 1 }) }
  function syncOwner() {
    const next = identity(); if (next === owner) return
    invalidate(); owner = next; selected = null; store.setState({ ...initial(), scope: store.getState().scope + 1 })
    if (next) void read('pending')
  }
  return { store, reviewNew,
    open: (id: string) => read('snapshot', id), refresh: () => read('pending'), check: (expected: MemoryCorrectionIdentity | null) => read('status', undefined, expected),
    apply: (editor: CorrectionEditor | null) => mutate(editor, null), retry: (expected: MemoryCorrectionIdentity | null) => mutate(null, expected),
    select(id: string | null) { if (id === selected) return; selected = id; if (newReviewTicket !== null || store.getState().editor || store.getState().busy === 'verification' || store.getState().busy === 'saving') { invalidate(); store.setState({ busy: null, editor: null }) } },
    edit(text: string, editor: CorrectionEditor | null) { const value = store.getState(); if (mounted && identity() && !request && editor && value.editor === editor) store.setState({ editor: { ...editor, text } }) },
    close(editor: CorrectionEditor | null) { if (!editor || store.getState().editor !== editor || ['verification', 'saving'].includes(store.getState().busy ?? '')) return false; if (request) invalidate(); clearEditor(); store.setState({ busy: null }); return true },
    invalidate: scopeChanged,
    start() { mounted = true; owner = identity(); const offAuth = options.authStore.subscribe(syncOwner), offPrivacy = options.sourcePrivacy.subscribe(scopeChanged); if (owner) void read('pending'); return () => { mounted = false; offAuth(); offPrivacy(); invalidate(); owner = null; selected = null; store.setState({ ...initial(), scope: store.getState().scope + 1 }) } },
  }
}
