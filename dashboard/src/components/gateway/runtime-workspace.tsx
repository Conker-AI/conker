import { createDraftController, draftCanSend, draftNeedsUnload, sameDraft } from './draft-controller'
import { emptyDraft, mergeDraftPrivacy, type DraftStart, type SavedDraft } from '@/lib/gateway/drafts'
import { readDraftStart, rememberDraftStart, clearDraftStart, type PendingDraftStart } from './draft-start-recovery'
import { useThinkingCancellation } from './use-thinking-cancellation'
import { applyThinkingCancellationRead } from './thinking-cancellation'
import { useMemoryDelivery } from './use-memory-delivery'
import { useMemoryUndo } from './use-memory-undo'
import { useRuntimeObservation } from './use-runtime-observation'
import { createRuntimeDetailReader } from './runtime-detail-read'
import { useSessionDiscovery } from './session-discovery-context'
import { gatewayChatContract, type GatewayChatState, type GatewayChatHandlers } from '@/lib/chat/gateway-adapter'
import type { Attempt, Generation } from '@/lib/chat/contract'
import type { GatewayControlClient } from '@/lib/gateway/control'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { readTaskDispatchSources, taskDispatchProblem, visibleTaskDispatchIntent, type PreparedTaskDispatch, type TaskSubmissionBinding } from './task-dispatch-state'
import type { GatewayActivityClient } from '@/lib/gateway/activity'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import { createTurnRequestId, RuntimeMutationError, type GatewayRuntimeClient, type RuntimeMessage, type RuntimeSessionDetail, type RuntimeSubmission, type RuntimePendingSubmission } from '@/lib/gateway/runtime'
import { followLivePreview } from '@/lib/gateway/live-preview'
import { GatewayError, gatewayError } from '@/lib/gateway/transport'
import { canReleaseTaskConflict, canSubmitRuntime, checkableTurn, checkedAttempt, createGatewayRuntimeWorkspaceState, createRequestOptions, hasActiveRuntimeTurn, recoverSubmissionDraft, retainedRequestOptions, resolveAttempt, type GatewayRuntimeWorkspaceState, type RequestModelOptions } from './runtime-state'
import { createGatewaySourcePrivacyState, maskForgottenConversation, maskForgottenSession, type GatewaySourcePrivacyState } from './source-privacy'
import type { NewChatPrivacy } from './new-chat-privacy-control'
import { chooseTemplate, useTemplateActive } from './composer-parts'
import { TaskDispatchReview } from './task-dispatch-review'
import { NewChatView } from './new-chat-view'
import { OpenChatView } from './open-chat-view'

export type { GatewayRuntimeWorkspaceState } from './runtime-state'
export type GatewayRuntimeWorkspaceProps = { harnessBySession?: Record<string, boolean>; control?: GatewayControlClient; client: GatewayRuntimeClient; activityClient?: GatewayActivityClient; authStore: GatewayAuthStore; state?: GatewayRuntimeWorkspaceState; sourcePrivacy?: GatewaySourcePrivacyState; visible?: boolean; onSelectSession?: (id: string | null) => void; headerExtra?: ReactNode }

async function copyMessage(message: RuntimeMessage, kind: 'copy' | 'link') {
  if (message.content.kind !== 'text') return
  const url = new URL('/chat', window.location.origin)
  url.searchParams.set('session', message.sessionId)
  url.searchParams.set('message', message.id)
  await navigator.clipboard.writeText(kind === 'copy' ? message.content.text : url.href)
}

/** Live Pi records only. All drafts and mutation locks belong to this mounted workspace. */
export function GatewayRuntimeWorkspace({ harnessBySession, control, client, activityClient, authStore, state, sourcePrivacy, visible = true, onSelectSession, headerExtra }: GatewayRuntimeWorkspaceProps) {
  const navigate = useNavigate()
  const auth = useStore(authStore)
  const [routeParams] = useSearchParams()
  const focusedMessageId = routeParams.get('message')
  const [localState] = useState(createGatewayRuntimeWorkspaceState)
  const workspace = state ?? localState
  const [localPrivacy] = useState(createGatewaySourcePrivacyState)
  const privacy = sourcePrivacy ?? localPrivacy
  const forgottenIds = useStore(privacy, value => value.sessionIds)
  const { selected, uncertain, createUnknown, operation, taskIntent, epoch: workspaceEpoch, turnCheck } = useStore(workspace)
  const draftEpoch = useRef(workspaceEpoch)
  const [draftController] = useState(() => createDraftController(client.drafts, () => {
    const value = authStore.getState()
    return workspace.getState().epoch === draftEpoch.current && value.phase === 'authenticated' && !!value.session?.authenticated && !value.pending && !value.logoutUnconfirmed
  }))
  const draftEntries = useStore(draftController.store, value => value.entries)
  const selectedValue = (selected ? draftEntries[selected]?.value : undefined) ?? emptyDraft()
  const firstValue = draftEntries.new?.value ?? emptyDraft()
  const firstMessage = firstValue.text, firstAgent = firstValue.agentId ?? 'companion', firstModel = firstValue.modelId ?? '', firstPrivacy: NewChatPrivacy = { memoryDisabled: firstValue.privacy.memoryDisabled ?? false, harnessDisabled: firstValue.privacy.harnessDisabled ?? false }
  const firstSkills = firstValue.skillIds
  const setFirstMessage = (text: string) => draftController.edit('new', { text })
  const setFirstAgent = (agentId: string) => draftController.edit('new', { agentId, ...(agentId !== 'companion' ? { think: false } : {}) })
  const setFirstModel = (modelId: string) => draftController.edit('new', { modelId: modelId || null })
  const setFirstPrivacy = (privacy: NewChatPrivacy, reviewed?: string) => {
    const current = draftController.current('new')?.value.privacy ?? {}
    if (reviewed !== JSON.stringify(current)) { setCreateError('Privacy changed. Reopen its settings before applying changes.'); return }
    draftController.edit('new', { privacy: mergeDraftPrivacy(current, privacy), ...(privacy.harnessDisabled ? { skillIds: [], think: false } : {}) })
  }
  const setSkillChoices = (id: string, skillIds: string[]) => draftController.edit(id === '__new__' ? 'new' : id, { skillIds })
  const setThinkChoice = (id: string, think: boolean) => draftController.edit(id === '__new__' ? 'new' : id, { think })
  const [pendingStart, setPendingStart] = useState<PendingDraftStart | null>(null)
  const [startMissing, setStartMissing] = useState(false)
  const safeTaskIntent = visibleTaskDispatchIntent(taskIntent, forgottenIds)
  const setSelected = (value: string | null) => workspace.setState({ selected: value, turnCheck: null })
  const setCreateUnknown = (value: 'unchecked' | 'checked' | null) => workspace.setState({ createUnknown: value })
  const { rows: sessions, refresh: refreshList } = useSessionDiscovery()
  const [agentNames, setAgentNames] = useState<Record<string, string>>({ companion: 'Conker' })
  const [sessionAgents, setSessionAgents] = useState<Record<string, string>>({})
  const [detail, setDetail] = useState<RuntimeSessionDetail | null>(null)
  const [detailPending, setDetailPending] = useState(false)
  const [turnDetailsOpen, setTurnDetailsOpen] = useState(false)
  const sendPending = operation === 'send'
  const [detailError, setDetailError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [reviewed, setReviewed] = useState(false)
  const createPending = operation === 'create'
  const [taskError, setTaskError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const newChatComposer = useRef<HTMLTextAreaElement>(null)
  const replyComposer = useRef<HTMLTextAreaElement>(null), modeHints = useRef<Record<string, { isAnalysis?: true }>>({}), templateActive = useTemplateActive(selected ?? 'new')
  const [dictating, setDictating] = useState(false)
  // Display-only text of the answer being written; the saved turn replaces it.
  const [preview, setPreview] = useState<{ sessionId: string; text: string; resetVersion: number; end?: Generation['end'] } | null>(null)
  // The request being answered right now, so Stop can name it; cleared when the send settles.
  const [inFlight, setInFlight] = useState<Attempt & { requestId: string; stopping: boolean; epoch: number } | null>(null)
  const [rejected, setRejected] = useState<string | null>(null)
  const chatLatest = useRef<{ snapshot: GatewayChatState; handlers: GatewayChatHandlers } | null>(null)
  const mounted = useRef(false)
  const controllers = useRef(new Set<AbortController>())
  const detailReadError = useRef<string | null>(null)
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const active = auth.phase === 'authenticated' && auth.session?.authenticated && !auth.pending && !auth.logoutUnconfirmed
  const activeRef = useRef(active)
  activeRef.current = active
  const current = detail?.id === selected ? forgottenIds.includes(detail.id) ? maskForgottenConversation(detail) : detail : null
  const knownForgotten = !!selected && (forgottenIds.includes(selected) || current?.status === 'forgotten')
  const latestThinking = current?.thinking?.[0]
  const thinkingCancellation = useThinkingCancellation({ client, authStore, workspace, privacy,
    context: { sessionId: current?.id ?? null, turnId: latestThinking?.turnId ?? null, working: latestThinking?.status === 'running' || latestThinking?.status === 'queued', active: !!active && !knownForgotten, identity: auth.session?.sessionId ?? '', epoch: workspaceEpoch },
    apply: (sessionId, turnId, value) => setDetail(previous => previous?.id === sessionId && privacy.getState().sessionIds.includes(sessionId) ? maskForgottenConversation(previous) : applyThinkingCancellationRead(previous, sessionId, turnId, value)),
  })
  const selectedForMemory = useCallback(() => workspace.getState().selected, [workspace])
  const memoryRead = useMemoryDelivery({ client, authStore, privacy, sessionId: current?.id ?? null, messageKey: current?.messages.filter(message => message.role === 'user').at(-1)?.id ?? '',
    active: Boolean(active && visible && current?.status !== 'forgotten'), identity: auth.session?.sessionId ?? '', epoch: workspaceEpoch, selected: selectedForMemory })
  const memoryUndo = useMemoryUndo(control, memoryRead.refresh)
  const draft = selected && !forgottenIds.includes(selected) ? selectedValue.text : ''
  const attempt = selected ? uncertain[selected] : undefined
  const manualRequired = Boolean(selected && harnessBySession?.[selected] && !selectedValue.modelId)
  const pending = sendPending || operation === 'resume' || detailPending || !active || manualRequired || !draftCanSend(draftEntries[selected ?? 'new'])

  useEffect(() => {
    draftController.setActive(Boolean(active))
    if (active) {
      const identity = authStore.getState().session?.sessionId
      const saved = identity ? readDraftStart(identity) : null
      setPendingStart(saved)
      if (saved) workspace.setState({ createUnknown: 'unchecked' })
      void draftController.load(selected ?? 'new')
    }
  }, [active, auth.session?.sessionId, authStore, draftController, selected, workspace])
  useEffect(() => {
    const unsubscribe = workspace.subscribe((value, before) => {
      if (value.epoch !== before.epoch) { draftController.reset(); draftEpoch.current = value.epoch; clearDraftStart(); setPendingStart(null) }
    })
    const forget = privacy.subscribe(value => draftController.forget(value.sessionIds))
    return () => { unsubscribe(); forget(); draftController.setActive(false) }
  }, [draftController, workspace, privacy])
  useEffect(() => {
    if (!active) return
    const check = () => { if (document.visibilityState === 'visible') void draftController.load(selected ?? 'new') }
    window.addEventListener('online', check); window.addEventListener('focus', check)
    return () => { window.removeEventListener('online', check); window.removeEventListener('focus', check) }
  }, [active, selected, draftController])

  useEffect(() => {
    if (!visible || selected || !window.matchMedia('(pointer: fine) and (min-width: 768px)').matches) return
    const frame = window.requestAnimationFrame(() => newChatComposer.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [selected, visible])

  const request = useCallback(async <T,>(action: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const controller = new AbortController()
    controllers.current.add(controller)
    try { return await action(controller.signal) }
    finally { controllers.current.delete(controller) }
  }, [])
  const detailReader = useMemo(() => createRuntimeDetailReader({
    read: (id, signal) => client.getSession(id, { signal }),
    scope: id => {
      const auth = authStore.getState(), state = workspace.getState()
      return auth.phase === 'authenticated' && auth.session?.authenticated && !auth.pending && !auth.logoutUnconfirmed && state.selected === id
        ? JSON.stringify([auth.session.sessionId, state.epoch, id]) : null
    },
    pending: setDetailPending,
    failure: error => { detailReadError.current = error === null ? null : gatewayError(error).message; setDetailError(detailReadError.current) },
    apply: response => {
      const id = response.id
      if (response.status === 'forgotten') privacy.getState().markForgotten([id])
      const next = privacy.getState().sessionIds.includes(id) ? maskForgottenConversation(response) : response
      setDetail(next)
      const accepted = workspace.getState().uncertain[id]
      if (accepted?.accepted && next.turns.some(turn => turn.id === accepted.turnId)) workspace.setState(values => {
        if (values.uncertain[id] !== accepted) return {}
        const updated = { ...values.uncertain }; delete updated[id]
        return { uncertain: updated }
      })
    },
  }), [client, authStore, privacy, workspace])
  const refreshDetail = useCallback((id: string) => detailReader.refresh(id), [detailReader])
  useEffect(() => {
    const auth = authStore.subscribe((value, before) => {
      if (value.session?.sessionId !== before.session?.sessionId || value.phase !== before.phase || value.pending !== before.pending || value.logoutUnconfirmed !== before.logoutUnconfirmed) detailReader.cancel()
    })
    const selection = workspace.subscribe((value, before) => { if (value.selected !== before.selected || value.epoch !== before.epoch || value.operation !== before.operation) detailReader.cancel() })
    const forget = privacy.subscribe(() => detailReader.cancel())
    return () => { auth(); selection(); forget(); detailReader.cancel(false) }
  }, [authStore, workspace, privacy, detailReader])

  const observation = useRuntimeObservation({ client, authStore, workspace, privacy, sessionId: selected,
    active: Boolean(active && visible && !operation && !detailPending && !knownForgotten), identity: auth.session?.sessionId ?? '', epoch: workspaceEpoch,
    version: detailReader.generation,
    apply: response => {
      // Background reads update saved history only. Drafts, receipts and mutation locks keep their owners.
      setDetail(privacy.getState().sessionIds.includes(response.id) ? maskForgottenConversation(response) : response)
      if (detailReadError.current) {
        const oldError = detailReadError.current
        detailReadError.current = null; setDetailError(value => value === oldError ? null : value)
      }
    } })
  const historyLoading = Boolean(selected && !current && !observation.error && !knownForgotten)

  const refreshThinking = useCallback(async (id: string, signal: AbortSignal) => {
    const generation = detailReader.generation()
    const result = await client.getThinking(id, { signal })
    if (signal.aborted || !mounted.current || !activeRef.current || selectedRef.current !== id || generation !== detailReader.generation()) return
    if (result.forgotten) privacy.getState().markForgotten([id])
    // The submission receipt owns transcript reconciliation; polling only updates analysis.
    setDetail(previous => previous?.id !== id ? previous : privacy.getState().sessionIds.includes(id)
      ? maskForgottenConversation(previous) : { ...previous, thinking: result.results })
  }, [client, privacy, detailReader])
  useEffect(() => {
    // A local send owns transcript reconciliation; the observer covers external/background work.
    if (!selected || !active || !visible || !sendPending) return
    const id = selected, controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        await refreshThinking(id, controller.signal)
      } catch { /* Explicit history refresh remains available; never repeat a mutation. */ }
      if (!controller.signal.aborted) timer = setTimeout(poll, 2000)
    }
    timer = setTimeout(poll, 1000)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [selected, active, visible, sendPending, refreshThinking])

  async function saveArtifact(message: RuntimeMessage) {
    if (!control || message.role !== 'assistant' || message.content.kind !== 'text' || !current || current.status !== 'open') return
    setNotice(null)
    try {
      const artifact = await control.artifacts.copyFromMessage({
        title: `${current.title || 'Saved response'} response`.slice(0, 160),
        sessionId: message.sessionId,
        messageId: message.id,
      })
      setNotice(`Saved “${artifact.title}” to Artifacts.`)
    } catch (error) { setNotice(gatewayError(error).message) }
  }

  useEffect(() => {
    mounted.current = true
    const pendingControllers = controllers.current
    return () => { mounted.current = false; for (const controller of pendingControllers) controller.abort(); pendingControllers.clear() }
  }, [])
  useEffect(() => { if (!active) { for (const controller of controllers.current) controller.abort(); controllers.current.clear() } }, [active])
  useEffect(() => {
    if (!active || !control) return
    const controller = new AbortController()
    control.agents(controller.signal).then(profiles => {
      if (!controller.signal.aborted) setAgentNames(Object.fromEntries(profiles.map(profile => [profile.id, profile.configuration.name])))
    }).catch(() => {})
    return () => controller.abort()
  }, [active, control])
  useEffect(() => {
    if (!active || !control || !selected) return
    const id = selected, controller = new AbortController()
    control.sessionSettings(id, controller.signal).then(value => {
      if (!controller.signal.aborted) setSessionAgents(current => ({ ...current, [id]: value.settings.agentId }))
    }).catch(() => {})
    return () => controller.abort()
  }, [active, control, selected])
  useEffect(() => {
    if (!forgottenIds.length) return
    workspace.setState(value => ({ taskIntent: value.taskIntent && forgottenIds.includes(value.taskIntent.sessionId) ? null : value.taskIntent, drafts: Object.fromEntries(Object.entries(value.drafts).filter(([id]) => !forgottenIds.includes(id))), skillChoices: Object.fromEntries(Object.entries(value.skillChoices).filter(([id]) => !forgottenIds.includes(id))), thinkChoices: Object.fromEntries(Object.entries(value.thinkChoices).filter(([id]) => !forgottenIds.includes(id))), uncertain: Object.fromEntries(Object.entries(value.uncertain).map(([id, attempt]) => [id, forgottenIds.includes(id) || attempt.requestedSessionId && forgottenIds.includes(attempt.requestedSessionId) ? { ...attempt, text: '', requestOptions: {}, submission: attempt.submission ? { ...attempt.submission, skillIds: [], modelId: null, think: false, draftRevision: null, researchMode: 'off', pendingText: null, contentStatus: 'forgotten', state: 'forgotten' } : undefined } : attempt])) }))
    setDetail(value => value && forgottenIds.includes(value.id) ? maskForgottenConversation(value) : value)
  }, [forgottenIds, workspace])
  useEffect(() => {
    if (!Object.values(draftEntries).some(draftNeedsUnload) && !Object.keys(uncertain).length && !pendingStart && !taskIntent && !sendPending && !createPending) return
    const preventLoss = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', preventLoss)
    return () => window.removeEventListener('beforeunload', preventLoss)
  }, [draftEntries, uncertain, pendingStart, taskIntent, sendPending, createPending])

  function openSession(id: string) { selectedRef.current = id; setSelected(id); setDetail(null); setDetailError(null); setNotice(null); setRejected(null); setReviewed(false); onSelectSession?.(id) }
  async function finishChatStart(receipt: DraftStart, send: boolean, original?: SavedDraft) {
    if (receipt.contentStatus === 'forgotten') {
      privacy.getState().markForgotten([receipt.sessionId]); clearDraftStart(); setPendingStart(null); setCreateUnknown(null)
      await draftController.load('new'); setCreateError('That chat was forgotten. Its draft is no longer available.'); return
    }
    const epoch = workspace.getState().epoch
    await draftController.load(receipt.sessionId)
    if (workspace.getState().epoch !== epoch || !activeRef.current) return
    const saved = draftController.current(receipt.sessionId)
    if (!saved?.base || saved.status !== 'saved') { setCreateError('The chat was created, but its draft could not be read. Check the saved chat start to continue.'); return }
    // Promotion clears only its source revision; a newer draft in another tab survives.
    await draftController.consumed('new', receipt.sourceRevision!)
    if (workspace.getState().epoch !== epoch || !activeRef.current) return
    if (original) setSessionAgents(current => ({ ...current, [receipt.sessionId]: original.agentId ?? 'companion' }))
    openSession(receipt.sessionId); clearDraftStart(); setPendingStart(null); setCreateUnknown(null); setStartMissing(false); void refreshList(); chooseTemplate('new', null)
    if (send && original && saved.base.revision === receipt.draftRevision && sameDraft(saved.value, original, receipt.sessionId)) {
      workspace.setState({ operation: null })
      await dispatchSubmission(receipt.sessionId, original.text, createTurnRequestId(), undefined, undefined, undefined, undefined, undefined, saved.base)
    } else if (send) setNotice('The chat was created, but its draft changed before sending. Review the saved draft and send when ready.')
  }
  /** Save first, then promote the exact intent. A start receipt never implies inference ran. */
  async function startChat() {
    const value = draftController.current('new')?.value
    if (!value?.text.trim() || value.privacy.harnessDisabled && !value.modelId || workspace.getState().operation || workspace.getState().createUnknown || pendingStart || !activeRef.current || !draftCanSend(draftController.current('new'))) return
    const epoch = workspace.getState().epoch
    workspace.setState({ operation: 'create' }); setCreateError(null)
    let receipt: DraftStart | undefined, savedStart: PendingDraftStart | undefined, original: SavedDraft | undefined
    try {
      draftController.edit('new', { title: value.title || value.text.trim().split('\n')[0].slice(0, 60) })
      const saved = await draftController.flush('new'); original = saved
      if (workspace.getState().epoch !== epoch || !activeRef.current) return
      const candidate = { requestId: createTurnRequestId(), revision: saved.revision, identity: authStore.getState().session!.sessionId }
      rememberDraftStart(candidate); savedStart = candidate; setPendingStart(candidate); setCreateUnknown('unchecked')
      receipt = await request(signal => client.drafts.start(savedStart!.requestId, savedStart!.revision, signal))
    } catch (error) {
      if (workspace.getState().epoch !== epoch) return
      if (savedStart && error instanceof GatewayError && [400, 403, 404, 413, 422].includes(error.status ?? 0)) { clearDraftStart(); setPendingStart(null); setCreateUnknown(null); setCreateError('The chat was not created. Review the draft, agent and privacy options before trying again.'); void draftController.load('new') }
      else if (savedStart) { setCreateUnknown('unchecked'); setCreateError('Chat creation was not confirmed. Check this saved start before continuing; your message has not been sent by this tab.') }
      else setCreateError(error instanceof Error ? error.message : 'Save the draft before starting this chat.')
    } finally { if (!receipt && workspace.getState().epoch === epoch) workspace.setState({ operation: null }) }
    try { if (receipt && workspace.getState().epoch === epoch && activeRef.current) await finishChatStart(receipt, true, original) }
    finally { if (workspace.getState().epoch === epoch) workspace.setState({ operation: null }) }
  }
  async function recoverChatStart(replay = false) {
    if (!pendingStart || workspace.getState().operation || !activeRef.current) return
    const saved = pendingStart, epoch = workspace.getState().epoch
    workspace.setState({ operation: 'create' }); setCreateError(null)
    let receipt: DraftStart | undefined
    try { receipt = await request(signal => replay ? client.drafts.start(saved.requestId, saved.revision, signal) : client.drafts.checkStart(saved.requestId, signal)) }
    catch (error) {
      if (workspace.getState().epoch !== epoch) return
      if (error instanceof GatewayError && error.status === 404 && !replay) { setStartMissing(true); setCreateError('No chat is recorded for this start yet. Retry the same saved start to avoid creating a second chat.') }
      else if (error instanceof GatewayError && [400, 403, 404, 409, 413, 422].includes(error.status ?? 0) && replay) {
        clearDraftStart(); setPendingStart(null); setCreateUnknown(null); setStartMissing(false)
        await draftController.load('new'); setCreateError('The draft changed before a chat was created. Review its saved version, then send when ready.')
      } else setCreateError('The saved chat start could not be checked. Keep this tab open and try again when connected.')
    } finally { if (!receipt && workspace.getState().epoch === epoch) workspace.setState({ operation: null }) }
    try { if (receipt && workspace.getState().epoch === epoch && activeRef.current) await finishChatStart(receipt, false) }
    finally { if (workspace.getState().epoch === epoch) workspace.setState({ operation: null }) }
  }
  async function submit() {
    const live = workspace.getState(), id = live.selected
    const text = id ? draftController.current(id)?.value.text ?? '' : ''
    if (live.operation || !id || id !== current?.id || !canSubmitRuntime(text, pending, live.uncertain[id], current)) return
    await dispatchSubmission(id, text, createTurnRequestId())
  }
  async function acceptSubmission(id: string, text: string, receipt: RuntimeSubmission, taskBinding?: TaskSubmissionBinding, requestOptions?: RequestModelOptions) {
    const frozenOptions = requestOptions ?? retainedRequestOptions({ text, checked: true, submission: receipt })
    if (receipt.contentStatus === 'forgotten') privacy.getState().markForgotten([id, ...(receipt.sessionId ? [receipt.sessionId] : [])])
    if (!receipt.turnId || !receipt.sessionId || receipt.state === 'forgotten') {
      workspace.setState(values => ({ uncertain: { ...values.uncertain, [id]: { text: privacy.getState().sessionIds.includes(id) ? '' : text, requestOptions: frozenOptions, taskBinding, requestId: receipt.requestId, requestedSessionId: receipt.requestedSessionId, submission: receipt, checked: true } } }))
      if (mounted.current) setNotice(`Submission is ${receipt.state.replaceAll('_', ' ')}. No request was repeated.`)
      if (mounted.current && selectedRef.current === id) await refreshDetail(id)
      return
    }
    const destination = receipt.sessionId
    const epoch = workspace.getState().epoch
    if (!taskBinding && frozenOptions.draftRevision) await draftController.consumed(id, frozenOptions.draftRevision)
    if (workspace.getState().epoch !== epoch || !activeRef.current) return
    workspace.setState(values => {
      const uncertain = { ...values.uncertain }; delete uncertain[id]
      uncertain[destination] = { text: privacy.getState().sessionIds.includes(destination) ? '' : text, requestOptions: frozenOptions, taskBinding, requestId: receipt.requestId, requestedSessionId: receipt.requestedSessionId, turnId: receipt.turnId!, checked: false, accepted: true, submission: receipt }
      return { uncertain, selected: destination }
    })
    if (!mounted.current || !activeRef.current) return
    if (selectedRef.current !== destination) openSession(destination)
    // A completed answer speaks for itself and a parked turn has its own card; only a fork or an unusual outcome needs a line.
    if (destination !== id || !['complete', 'awaiting_approval', 'acted_no_reply'].includes(receipt.status)) setNotice(`${destination !== id ? 'The server continued in a fork. ' : ''}Turn ${receipt.turnId} is recorded (${receipt.status.replaceAll('_', ' ')}).`)
    selectedRef.current = destination
    await refreshDetail(destination)
    void refreshList()
  }
  async function resumeTurn(turnId: string) {
    const latest = chatLatest.current?.snapshot.current
    const turn = latest?.turns.find(turn => turn.id === turnId)
    if (!selected || workspace.getState().selected !== selected || latest?.id !== selected || latest.status !== 'open' || privacy.getState().sessionIds.includes(selected) || workspace.getState().uncertain[selected] || !turn || !(turn.status === 'awaiting_approval' || turn.status === 'acted_no_reply' && turn.acted || checkableTurn(turn.status)) || workspace.getState().operation || !activeRef.current) return
    const id = selected, epoch = workspace.getState().epoch, checking = checkableTurn(turn.status)
    let failure: string | null = null
    workspace.setState({ operation: 'resume', turnCheck: checking ? { turnId, phase: 'checking' } : null }); setNotice(null); setDetailError(null)
    try {
      const status = await request(signal => client.resumeTurn(turnId, { signal }))
      // A check always reports what it found; otherwise the reply appears on its own, and only a turn still waiting on the owner needs a line.
      if (workspace.getState().epoch === epoch) { if (checking) workspace.setState({ turnCheck: { turnId, phase: 'checked', status } }); else if (status === 'awaiting_approval') setNotice('Still waiting for you in the Inbox. Your answer there continues this chat.') }
    } catch (error) {
      failure = error instanceof Error ? error.message : 'Resume could not be confirmed. Check history before trying again.'
    } finally {
      if (workspace.getState().epoch === epoch) {
        await refreshDetail(id)
        if (workspace.getState().epoch === epoch && selectedRef.current === id && failure) { if (checking) workspace.setState({ turnCheck: { turnId, phase: 'failed', reason: failure } }); else setDetailError(failure) }
        if (workspace.getState().epoch === epoch) workspace.setState({ operation: null })
      }
    }
  }
  async function dispatchSubmission(id: string, text: string, requestId: string, taskBinding?: TaskSubmissionBinding, prepared?: PreparedTaskDispatch, modelOverride?: string, skillOverride?: string[], thinkOverride?: boolean, promotedDraft?: SavedDraft) {
    if (workspace.getState().operation || !activeRef.current) return
    const prior = Object.values(workspace.getState().uncertain).find(attempt => attempt.requestId === requestId)
    const composer = draftController.current(id)?.value
    let requestOptions = prior ? retainedRequestOptions(prior) : createRequestOptions(modelOverride ?? composer?.modelId, skillOverride ?? (taskBinding || harnessBySession?.[id] ? [] : composer?.skillIds ?? []), thinkOverride ?? (!taskBinding && (sessionAgents[id] ?? 'companion') === 'companion' && !harnessBySession?.[id] && Boolean(composer?.think)))
    const { modelId } = requestOptions
    if (harnessBySession?.[id] && !modelId) { setDetailError('Choose an answer model while harness processing is disabled.'); return }
    const epoch = workspace.getState().epoch
    workspace.setState({ operation: 'send', turnCheck: null }); setDetailError(null); setNotice(null); setTaskError(null)
    let dispatched = false
    const previewStop = new AbortController()
    try {
      if (!prior && promotedDraft) {
        const live = draftController.current(id)
        if (!live || live.base?.revision !== promotedDraft.revision || !sameDraft(live.value, promotedDraft, id)) throw new Error('The draft changed before sending. Review it, then send again.')
        requestOptions = createRequestOptions(promotedDraft.modelId, promotedDraft.skillIds, promotedDraft.think, promotedDraft.revision, promotedDraft.researchMode, Boolean(modeHints.current.new?.isAnalysis))
      } else if (!prior && !taskBinding) {
        draftController.edit(id, { modelId: requestOptions.modelId ?? null, skillIds: requestOptions.skillIds ?? [], think: !!requestOptions.think })
        const saved = await draftController.flush(id)
        if (workspace.getState().epoch !== epoch || !activeRef.current || privacy.getState().sessionIds.includes(id)) return
        if (saved.text !== text) throw new Error('The draft changed while preparing to send. Review it, then send again.')
        requestOptions = createRequestOptions(saved.modelId, saved.skillIds, saved.think, saved.revision, saved.researchMode, Boolean(modeHints.current[id]?.isAnalysis))
      }
      if (prepared) {
        if (!activityClient || workspace.getState().uncertain[id]) throw new Error('Review the previous request before starting task work.')
        const { task, session } = await request(signal => readTaskDispatchSources(prepared.taskId, activityClient, client, forgottenId => {
          if (workspace.getState().epoch !== epoch) return
          privacy.getState().markForgotten([forgottenId])
          workspace.setState(value => ({ taskIntent: visibleTaskDispatchIntent(value.taskIntent, privacy.getState().sessionIds) }))
        }, signal))
        if (session.id !== id) throw new Error('The task and reviewed conversation do not match. Reload the saved task.')
        const problem = taskDispatchProblem(task, session, prepared.taskExpectedRevision)
        if (problem) throw new Error(problem)
        if (workspace.getState().epoch !== epoch || !activeRef.current || privacy.getState().sessionIds.includes(id)) return
      }
      dispatched = true
      if (prepared) workspace.setState(value => value.taskIntent?.taskId === prepared.taskId ? { taskIntent: { ...value.taskIntent, open: false } } : {})
      setRejected(null)
      setInFlight({ requestId, requestedSessionId: id, input: { kind: 'text', text }, stopping: false, epoch })
      let resetVersion = 0
      const previewCurrent = () => mounted.current && activeRef.current && workspace.getState().epoch === epoch && !previewStop.signal.aborted && !privacy.getState().sessionIds.includes(id)
      void followLivePreview(requestId, streamed => { if (previewCurrent()) setPreview({ sessionId: id, text: streamed, resetVersion }) }, { signal: previewStop.signal, onReset: () => { resetVersion++; if (previewCurrent()) setPreview({ sessionId: id, text: '', resetVersion }) } }).then(end => { if (previewCurrent()) setPreview(value => ({ sessionId: id, text: value?.text ?? '', resetVersion, end })) })
      const receipt = await request(signal => client.submitRequest(id, text, requestId, { signal, ...taskBinding, ...requestOptions }))
      if (workspace.getState().epoch !== epoch) return
      if (prepared) workspace.setState({ taskIntent: null })
      await acceptSubmission(id, text, receipt, taskBinding, requestOptions); chooseTemplate(id, null)
    } catch (error) {
      if (workspace.getState().epoch !== epoch) return
      if (error instanceof RuntimeMutationError && error.outcome === 'rejected' && error.status === 409 && !taskBinding) void draftController.load(id)
      if (!dispatched || error instanceof RuntimeMutationError && error.outcome === 'rejected' || error instanceof GatewayError && ['validation', 'configuration', 'too-large'].includes(error.kind)) {
        if (prepared) workspace.setState(value => value.taskIntent?.taskId === prepared.taskId ? { taskIntent: { ...value.taskIntent, open: true } } : {})
        if (mounted.current) { const message = error instanceof Error ? error.message : gatewayError(error).message; if (prepared) setTaskError(message); else { setRejected(message); setDetailError(message) } }
      }
      else {
        workspace.setState(values => ({ uncertain: { ...values.uncertain, [id]: { requestOptions, taskBinding, rejectionStatus: error instanceof RuntimeMutationError && error.status === 409 ? 409 : undefined, text: privacy.getState().sessionIds.includes(id) ? '' : text, requestId, requestedSessionId: id, turnId: error instanceof RuntimeMutationError ? error.turnId : undefined, checked: false } } }))
        if (prepared) workspace.setState({ taskIntent: null })
        if (mounted.current) { setReviewed(false); setDetailError('Send outcome unknown. Check the saved request identity before continuing.') }
      }
    } finally {
      previewStop.abort()
      if (mounted.current && workspace.getState().epoch === epoch) { setPreview(null); setInFlight(null) }
      if (workspace.getState().epoch === epoch) workspace.setState({ operation: null })
    }
  }
  async function stopAnswer() {
    if (!inFlight || inFlight.stopping || inFlight.epoch !== workspace.getState().epoch || !activeRef.current) return
    const saved = inFlight
    setInFlight({ ...inFlight, stopping: true })
    try { await client.cancelSubmission(inFlight.requestId) }
    catch (error) {
      if (mounted.current && workspace.getState().epoch === saved.epoch) { setInFlight(value => value?.requestId === saved.requestId ? { ...value, stopping: false } : value); setDetailError(`Stop was not confirmed: ${gatewayError(error).message}`) }
    }
  }
  async function checkSubmission() {
    if (!selected || !attempt?.requestId || sendPending || detailPending) return
    const id = selected, saved = attempt, epoch = workspace.getState().epoch
    setDetailPending(true); setDetailError(null)
    try {
      const receipt = await request(signal => client.getSubmission(saved.requestId!, saved.requestedSessionId ?? id, { signal }))
      if (workspace.getState().epoch !== epoch) return
      await acceptSubmission(id, saved.text, receipt, saved.taskBinding, retainedRequestOptions(saved))
    } catch (failure) {
      if (workspace.getState().epoch !== epoch) return
      const safe = gatewayError(failure)
      if (safe.status === 404) workspace.setState(values => ({ uncertain: { ...values.uncertain, [id]: { ...saved, checked: true, notFound: true } } }))
      if (mounted.current) setDetailError(safe.status === 404 ? saved.taskBinding && saved.rejectionStatus === 409 ? 'The task request was declined and no saved submission exists. Dismiss this attempt, then review the current task before sending again.' : 'No saved submission was found yet. Check again or retry the same retained request; its identity prevents another execution.' : safe.message)
    } finally { if (mounted.current) setDetailPending(false) }
  }
  function releaseUnstartedSubmission() {
    if (!selected || !attempt || (!canReleaseTaskConflict(attempt) && !['preparation_failed', 'preparation_interrupted'].includes(attempt.submission?.state ?? ''))) return
    workspace.setState(values => { const uncertain = { ...values.uncertain }; delete uncertain[selected]; return { uncertain } })
    setDetailError(null); setNotice(attempt.taskBinding || attempt.submission?.taskId ? 'No task turn was started. Reopen Work on this task to review its current revision before sending again. Your chat draft is unchanged.' : 'The recorded preparation did not bind a turn. Your draft is retained; sending again starts a new request.')
  }
  async function inspectSubmission(saved: RuntimePendingSubmission) {
    if (!selected || attempt || sendPending || detailPending) return
    const id = selected, epoch = workspace.getState().epoch
    setDetailPending(true); setDetailError(null)
    try {
      const receipt = await request(signal => client.getSubmission(saved.requestId, saved.requestedSessionId, { signal }))
      if (workspace.getState().epoch !== epoch || selectedRef.current !== id) return
      await acceptSubmission(id, '', receipt)
    } catch (failure) { if (mounted.current) setDetailError(gatewayError(failure).message) }
    finally { if (mounted.current) setDetailPending(false) }
  }
  async function checkHistory() {
    if (!selected || detailPending || sendPending || workspace.getState().operation) return
    setReviewed(false)
    const id = selected
    workspace.setState(values => values.uncertain[id] ? { uncertain: { ...values.uncertain, [id]: { ...values.uncertain[id], checked: false } } } : {})
    const detailChecked = await refreshDetail(id)
    const listChecked = await refreshList()
    if (detailChecked && listChecked && mounted.current && selectedRef.current === id) workspace.setState(values => values.uncertain[id] ? { uncertain: { ...values.uncertain, [id]: checkedAttempt(values.uncertain[id]) } } : {})
  }
  function resolve(decision: 'found' | 'allow-new') {
    if (!selected || !attempt?.checked || !reviewed || !current || current.status === 'forgotten' || hasActiveRuntimeTurn(current)) return
    const result = resolveAttempt(attempt, draft, decision)
    draftController.edit(selected, { text: result.draft })
    workspace.setState(values => { const next = { ...values.uncertain }; delete next[selected]; return { uncertain: next } })
    setReviewed(false); setDetailError(null)
    setNotice(decision === 'found' ? 'Marked as found in server history. No text was sent.' : 'Sending is enabled after your review. No text was sent; the earlier operation may still finish.')
  }

  const activeAgentId = selected ? sessionAgents[selected] ?? 'companion' : firstAgent
  const activeAgentName = agentNames[activeAgentId] ?? (activeAgentId === 'companion' ? 'Conker' : 'Agent')
  const chatSnapshot: GatewayChatState = {
    operationPending: !!operation,
    memoryRead: memoryRead.state, memoryUndo: memoryUndo.status,
    sessionId: selected ?? '', epoch: workspace.getState().epoch, active: !!active, current, draft, pending, sendPending, detailPending: detailPending || historyLoading,
    activeAgentName, agentNames,
    forgotten: !!selected && (forgottenIds.includes(selected) || current?.status === 'forgotten' || !!attempt?.requestedSessionId && forgottenIds.includes(attempt.requestedSessionId)),
    attempt, reviewed, notice, error: detailError, historyUnavailable: !!observation.error && !current, rejected, turnCheck, inFlight: inFlight?.epoch === workspace.getState().epoch ? inFlight : null, preview, focusedMessageId,
  }
  const chatHandlers: GatewayChatHandlers = {
    resumeTurn,
    reviewTurn: (id, destination) => {
      const saved = chatLatest.current?.snapshot.current
      const turn = saved?.turns.find(row => row.id === id)
      if (!saved || !turn || saved.id !== workspace.getState().selected || !activeRef.current || privacy.getState().sessionIds.includes(saved.id)) return
      if (destination === 'approval' && turn.approvalRequestId) navigate(`/inbox?request=${encodeURIComponent(turn.approvalRequestId)}`)
      else if (destination === 'run') navigate(`/activity?tab=runs&run=${encodeURIComponent(turn.id)}`)
      else if (destination === 'models') navigate('/settings?tab=providers')
      else if (destination === 'tools') navigate('/tools')
    },
    refreshMemory: memoryRead.refresh, undoMemory: memoryUndo.undo,
    copy: copyMessage, saveArtifact, exportAnswer: control ? (message, format) => control.exports.answer(message.sessionId, message.id, format) : undefined, setDraft: text => { if (selected) draftController.edit(selected, { text }) },
    send: submit, stop: stopAnswer, checkHistory,
    check: () => attempt?.requestId ? checkSubmission() : checkHistory(),
    retrySameRequest: () => { if (selected && attempt?.requestId) return dispatchSubmission(attempt.requestedSessionId ?? selected, attempt.text, attempt.requestId, attempt.taskBinding) },
    restoreDraft: () => { if (selected && attempt) draftController.edit(selected, { text: recoverSubmissionDraft(attempt, draftController.current(selected)?.value.text ?? '') }) },
    releaseUnstarted: releaseUnstartedSubmission, acknowledgeFound: () => resolve('found'), acknowledgeUnknown: () => resolve('allow-new'),
  }
  // Event callbacks must see current committed props plus synchronous store/privacy changes.
  useEffect(() => { chatLatest.current = { snapshot: chatSnapshot, handlers: chatHandlers } })
  const chat = gatewayChatContract(chatSnapshot, () => {
    const latest = chatLatest.current?.snapshot ?? chatSnapshot
    const store = workspace.getState()
    const ids = privacy.getState().sessionIds
    return { ...latest, epoch: store.epoch, sessionId: store.selected ?? '', active: !!activeRef.current, operationPending: !!store.operation,
      draft: draftController.current(store.selected ?? '')?.value.text ?? '', attempt: store.uncertain[store.selected ?? ''],
      sendPending: store.operation === 'send', pending: latest.pending || !!store.operation || !draftCanSend(draftController.current(store.selected ?? 'new')),
      forgotten: latest.forgotten || ids.includes(latest.sessionId) || !!latest.attempt?.requestedSessionId && ids.includes(latest.attempt.requestedSessionId),
    }
  }, () => chatLatest.current?.handlers ?? chatHandlers)
  const recoveryActions = 'actions' in chat.submission ? chat.submission.actions : null
  const recover = (name: keyof NonNullable<typeof recoveryActions>) => { const action = recoveryActions?.[name]; if (action?.availability === 'enabled') void action.run() }
  const safeSessions = sessions.map(session => forgottenIds.includes(session.id) ? maskForgottenSession(session) : session)

  if (!active) return null
  return <div className="relative flex h-full min-h-0 flex-1 flex-col bg-background text-foreground">
    <div className="flex min-h-0 flex-1">
      <section aria-label="Selected conversation" className="flex min-h-0 min-w-0 flex-1 flex-col">
        {!selected ? <NewChatView visible={visible} firstAgent={firstAgent} activeAgentName={activeAgentName} firstMessage={firstMessage} setFirstMessage={setFirstMessage} newChatComposer={newChatComposer} createPending={createPending} sendPending={sendPending} createUnknown={createUnknown} dictating={dictating}
          startChat={startChat} templateActive={templateActive} firstValue={firstValue} firstPrivacy={firstPrivacy} client={client} draftController={draftController} modeHints={modeHints} control={control} setFirstAgent={setFirstAgent} firstModel={firstModel}
          setFirstModel={setFirstModel} firstSkills={firstSkills} setSkillChoices={setSkillChoices} setThinkChoice={setThinkChoice} setFirstPrivacy={setFirstPrivacy} setDictating={setDictating} draftEntries={draftEntries}
          createError={createError} pendingStart={pendingStart} recoverChatStart={recoverChatStart} startMissing={startMissing} /> : <OpenChatView visible={visible} knownForgotten={knownForgotten} current={current} safeSessions={safeSessions} selected={selected} control={control}
          pending={pending} historyLoading={historyLoading} attempt={attempt} chat={chat} observation={observation} focusedMessageId={focusedMessageId} thinkingCancellation={thinkingCancellation} draftController={draftController} replyComposer={replyComposer}
          turnDetailsOpen={turnDetailsOpen} setTurnDetailsOpen={setTurnDetailsOpen} operation={operation} detailPending={detailPending} sendPending={sendPending} resumeTurn={resumeTurn} client={client} privacy={privacy} harnessBySession={harnessBySession}
          active={active} draftEntries={draftEntries} forgottenIds={forgottenIds} draft={draft} recover={recover} recoveryActions={recoveryActions} reviewed={reviewed} setReviewed={setReviewed} safeTaskIntent={safeTaskIntent} workspace={workspace}
          selectedValue={selectedValue} activeAgentId={activeAgentId} activeAgentName={activeAgentName} setSessionAgents={setSessionAgents} modeHints={modeHints} headerExtra={headerExtra} setDictating={setDictating} dictating={dictating} templateActive={templateActive}
          inspectSubmission={inspectSubmission} setSkillChoices={setSkillChoices} setThinkChoice={setThinkChoice} />}
      </section>
    </div>
    {safeTaskIntent && activityClient && <TaskDispatchReview key={safeTaskIntent.taskId} intent={safeTaskIntent} activity={activityClient} runtime={client} visible={visible} busy={!!operation} error={taskError} onForgotten={id => {
      privacy.getState().markForgotten([id])
      workspace.setState(value => ({ taskIntent: visibleTaskDispatchIntent(value.taskIntent, privacy.getState().sessionIds) }))
    }} onPrepared={prepared => {
      if (privacy.getState().sessionIds.includes(prepared.sessionId)) return
      workspace.setState(value => value.taskIntent?.taskId === prepared.taskId ? { taskIntent: { ...value.taskIntent, prepared } } : {})
      setTaskError(null)
    }} onClose={() => workspace.setState(value => ({ taskIntent: value.taskIntent ? { ...value.taskIntent, open: false } : null }))} onSend={prepared => void dispatchSubmission(prepared.sessionId, prepared.text, prepared.requestId, { taskId: prepared.taskId, taskExpectedRevision: prepared.taskExpectedRevision }, prepared)} />}
  </div>
}
