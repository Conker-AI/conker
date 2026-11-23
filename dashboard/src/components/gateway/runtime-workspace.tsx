import { createDraftController, draftCanSend, draftNeedsUnload } from './draft-controller'
import { emptyDraft, mergeDraftPrivacy } from '@/lib/gateway/drafts'
import { readDraftStart, clearDraftStart, type PendingDraftStart } from './draft-start-recovery'
import { useThinkingCancellation } from './use-thinking-cancellation'
import { applyThinkingCancellationRead } from './thinking-cancellation'
import { useMemoryDelivery } from './use-memory-delivery'
import { useMemoryUndo } from './use-memory-undo'
import { useRuntimeObservation } from './use-runtime-observation'
import { createRuntimeDetailReader, useRefreshChat } from './runtime-detail-read'
import { useSessionDiscovery } from './session-discovery-context'
import { gatewayChatContract, type GatewayChatState, type GatewayChatHandlers } from '@/lib/chat/gateway-adapter'
import type { GatewayControlClient } from '@/lib/gateway/control'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { useStore } from 'zustand'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { visibleTaskDispatchIntent } from './task-dispatch-state'
import type { GatewayActivityClient } from '@/lib/gateway/activity'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import { createTurnRequestId, type GatewayRuntimeClient, type RuntimeMessage, type RuntimeSessionDetail } from '@/lib/gateway/runtime'
import { gatewayError } from '@/lib/gateway/transport'
import { canSubmitRuntime, createGatewayRuntimeWorkspaceState, recoverSubmissionDraft, type GatewayRuntimeWorkspaceState } from './runtime-state'
import { retryTurnText } from './retry-turn'
import { createGatewaySourcePrivacyState, maskForgottenConversation, maskForgottenSession, type GatewaySourcePrivacyState } from './source-privacy'
import type { NewChatPrivacy } from './new-chat-privacy-control'
import type { ChatEffort } from '@/lib/gateway/chat-names'
import { useTemplateActive } from './composer-parts'
import { TaskDispatchReview } from './task-dispatch-review'
import { NewChatView } from './new-chat-view'
import { OpenChatView } from './open-chat-view'
import { useRuntimeSubmissions, type RuntimeInFlight, type RuntimePreview } from './runtime-submissions'
import { useRuntimeChatStart } from './runtime-chat-start'

export type { GatewayRuntimeWorkspaceState } from './runtime-state'
export type GatewayRuntimeWorkspaceProps = { harnessBySession?: Record<string, boolean>; control?: GatewayControlClient; client: GatewayRuntimeClient; activityClient?: GatewayActivityClient; authStore: GatewayAuthStore; state?: GatewayRuntimeWorkspaceState; sourcePrivacy?: GatewaySourcePrivacyState; visible?: boolean; onSelectSession?: (id: string | null) => void; headerExtra?: ReactNode }

async function copyMessage(message: RuntimeMessage, kind: 'copy' | 'link') {
  if (message.content.kind !== 'text') return
  const url = new URL('/chat', window.location.origin)
  url.searchParams.set('session', message.sessionId)
  url.searchParams.set('message', message.id)
  await navigator.clipboard.writeText(kind === 'copy' ? message.content.text : url.href)
}

/** Remembers the error the detail reader showed, so a later good background read clears only that error. */
function readErrorMemory(setError: Dispatch<SetStateAction<string | null>>) {
  let shown: string | null = null
  return {
    show: (error: unknown | null) => { shown = error === null ? null : gatewayError(error).message; setError(shown) },
    settle: () => {
      if (!shown) return
      const oldError = shown
      shown = null; setError(value => value === oldError ? null : value)
    },
  }
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
  // The controller saves only for the workspace epoch it was last reset for; the epoch lives in its closure, not in render data.
  const [{ draftController, markDraftEpoch }] = useState(() => {
    let draftEpoch = workspaceEpoch
    const controller = createDraftController(client.drafts, () => {
      const value = authStore.getState()
      return workspace.getState().epoch === draftEpoch && value.phase === 'authenticated' && !!value.session?.authenticated && !value.pending && !value.logoutUnconfirmed
    })
    return { draftController: controller, markDraftEpoch: (epoch: number) => { draftEpoch = epoch } }
  })
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
  // Effort picked before the chat exists; it is saved with the new chat's output settings once the chat is created.
  const [firstEffort, setFirstEffort] = useState<ChatEffort>('auto')
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
  const replyComposer = useRef<HTMLTextAreaElement>(null), templateActive = useTemplateActive(selected ?? 'new')
  const [dictating, setDictating] = useState(false)
  const [preview, setPreview] = useState<RuntimePreview | null>(null)
  const [inFlight, setInFlight] = useState<RuntimeInFlight | null>(null)
  const [rejected, setRejected] = useState<string | null>(null)
  const chatLatest = useRef<{ snapshot: GatewayChatState; handlers: GatewayChatHandlers } | null>(null)
  const mounted = useRef(false)
  const controllers = useRef(new Set<AbortController>())
  const selectedRef = useRef(selected)
  const active = auth.phase === 'authenticated' && auth.session?.authenticated && !auth.pending && !auth.logoutUnconfirmed
  const activeRef = useRef(active)
  // Callbacks read the committed selection and sign-in state; layout effects run before any passive effect or event.
  useLayoutEffect(() => { selectedRef.current = selected; activeRef.current = active })
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- The saved chat start is read from browser storage after sign-in and on each reselect; reading it during render would read storage while rendering and change when the recovery notice appears.
      setPendingStart(saved)
      if (saved) workspace.setState({ createUnknown: 'unchecked' })
      void draftController.load(selected ?? 'new')
    }
  }, [active, auth.session?.sessionId, authStore, draftController, selected, workspace])
  useEffect(() => {
    const unsubscribe = workspace.subscribe((value, before) => {
      if (value.epoch !== before.epoch) { draftController.reset(); markDraftEpoch(value.epoch); clearDraftStart(); setPendingStart(null) }
    })
    const forget = privacy.subscribe(value => draftController.forget(value.sessionIds))
    return () => { unsubscribe(); forget(); draftController.setActive(false) }
  }, [draftController, markDraftEpoch, workspace, privacy])
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
  const { detailReader, settleDetailReadError } = useMemo(() => { const readError = readErrorMemory(setDetailError); const reader = createRuntimeDetailReader({
    read: (id, signal) => client.getSession(id, { signal }),
    scope: id => {
      const auth = authStore.getState(), state = workspace.getState()
      return auth.phase === 'authenticated' && auth.session?.authenticated && !auth.pending && !auth.logoutUnconfirmed && state.selected === id
        ? JSON.stringify([auth.session.sessionId, state.epoch, id]) : null
    },
    pending: setDetailPending,
    failure: readError.show,
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
  })
  return { detailReader: reader, settleDetailReadError: readError.settle } }, [client, authStore, privacy, workspace, setDetail, setDetailError, setDetailPending])
  const refreshDetail = useCallback((id: string) => detailReader.refresh(id), [detailReader])
  useRefreshChat({ active: !!active, selected, busy: !!operation, refreshDetail, draftController })
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
      settleDetailReadError()
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
  }, [client, privacy, detailReader, setDetail])
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
  }, [forgottenIds, workspace])
  // A forgotten chat is masked in saved state the moment it is forgotten, not one render later.
  useEffect(() => privacy.subscribe(value => setDetail(detail => detail && value.sessionIds.includes(detail.id) ? maskForgottenConversation(detail) : detail)), [privacy])
  useEffect(() => {
    if (!Object.values(draftEntries).some(draftNeedsUnload) && !Object.keys(uncertain).length && !pendingStart && !taskIntent && !sendPending && !createPending) return
    const preventLoss = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', preventLoss)
    return () => window.removeEventListener('beforeunload', preventLoss)
  }, [draftEntries, uncertain, pendingStart, taskIntent, sendPending, createPending])

  function openSession(id: string) { selectedRef.current = id; setSelected(id); setDetail(null); setDetailError(null); setNotice(null); setRejected(null); setReviewed(false); onSelectSession?.(id) }
  const { resumeTurn, dispatchSubmission, stopAnswer, checkSubmission, releaseUnstartedSubmission, inspectSubmission, checkHistory, resolve } = useRuntimeSubmissions({
    client, activityClient, harnessBySession, workspace, privacy, draftController, selected, current, attempt, draft, reviewed, inFlight, sendPending, detailPending, sessionAgents,
    mounted, activeRef, selectedRef, chatLatest, request, refreshDetail, refreshList, openSession,
    setNotice, setDetailError, setTaskError, setRejected, setReviewed, setDetailPending, setInFlight, setPreview })
  const { startChat, recoverChatStart } = useRuntimeChatStart({ client, control, authStore, workspace, privacy, draftController, pendingStart, firstEffort, activeRef, request, refreshList, openSession, dispatchSubmission,
    setPendingStart, setStartMissing, setCreateUnknown, setCreateError, setFirstEffort, setNotice, setSessionAgents })
  async function submit() {
    const live = workspace.getState(), id = live.selected
    const text = id ? draftController.current(id)?.value.text ?? '' : ''
    if (live.operation || !id || id !== current?.id || !canSubmitRuntime(text, pending, live.uncertain[id], current)) return
    await dispatchSubmission(id, text, createTurnRequestId())
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
    retryTurn: turnId => {
      const text = selected && activeRef.current && !workspace.getState().operation && !privacy.getState().sessionIds.includes(selected) ? retryTurnText(chatLatest.current?.snapshot.current, turnId, !!workspace.getState().uncertain[selected], draftController.current(selected)?.value.text ?? '') : null
      if (selected && text) { draftController.edit(selected, { text }); return dispatchSubmission(selected, text, createTurnRequestId()) }
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
  const readLatestChat = (): GatewayChatState => {
    const latest = chatLatest.current?.snapshot ?? chatSnapshot
    const store = workspace.getState()
    const ids = privacy.getState().sessionIds
    return { ...latest, epoch: store.epoch, sessionId: store.selected ?? '', active: !!activeRef.current, operationPending: !!store.operation,
      draft: draftController.current(store.selected ?? '')?.value.text ?? '', attempt: store.uncertain[store.selected ?? ''],
      sendPending: store.operation === 'send', pending: latest.pending || !!store.operation || !draftCanSend(draftController.current(store.selected ?? 'new')),
      forgotten: latest.forgotten || ids.includes(latest.sessionId) || !!latest.attempt?.requestedSessionId && ids.includes(latest.attempt.requestedSessionId),
    }
  }
  const latestChatHandlers = () => chatLatest.current?.handlers ?? chatHandlers
  // eslint-disable-next-line react-hooks/refs -- Actions must run the latest committed handlers at click time, so they read a ref; the contract also asks once while rendering whether undo exists. Removing the ref changes which handlers a click runs.
  const chat = gatewayChatContract(chatSnapshot, readLatestChat, latestChatHandlers)
  const recoveryActions = 'actions' in chat.submission ? chat.submission.actions : null
  const recover = (name: keyof NonNullable<typeof recoveryActions>) => { const action = recoveryActions?.[name]; if (action?.availability === 'enabled') void action.run() }
  const safeSessions = sessions.map(session => forgottenIds.includes(session.id) ? maskForgottenSession(session) : session)

  if (!active) return null
  return <div className="relative flex h-full min-h-0 flex-1 flex-col bg-background text-foreground">
    <div className="flex min-h-0 flex-1">
      <section aria-label="Selected conversation" className="flex min-h-0 min-w-0 flex-1 flex-col">
        {!selected ? <NewChatView visible={visible} firstAgent={firstAgent} activeAgentName={activeAgentName} firstMessage={firstMessage} setFirstMessage={setFirstMessage} newChatComposer={newChatComposer} createPending={createPending} sendPending={sendPending} createUnknown={createUnknown} dictating={dictating}
          startChat={startChat} templateActive={templateActive} firstValue={firstValue} firstPrivacy={firstPrivacy} client={client} draftController={draftController} control={control} setFirstAgent={setFirstAgent} firstModel={firstModel}
          setFirstModel={setFirstModel} firstSkills={firstSkills} setSkillChoices={setSkillChoices} setThinkChoice={setThinkChoice} firstEffort={firstEffort} setFirstEffort={setFirstEffort} setFirstPrivacy={setFirstPrivacy} setDictating={setDictating} draftEntries={draftEntries}
          createError={createError} pendingStart={pendingStart} recoverChatStart={recoverChatStart} startMissing={startMissing} /> : <OpenChatView visible={visible} knownForgotten={knownForgotten} current={current} safeSessions={safeSessions} selected={selected} control={control}
          pending={pending} historyLoading={historyLoading} attempt={attempt} chat={chat} observation={observation} focusedMessageId={focusedMessageId} thinkingCancellation={thinkingCancellation} draftController={draftController} replyComposer={replyComposer}
          turnDetailsOpen={turnDetailsOpen} setTurnDetailsOpen={setTurnDetailsOpen} operation={operation} detailPending={detailPending} sendPending={sendPending} resumeTurn={resumeTurn} client={client} privacy={privacy} harnessBySession={harnessBySession}
          active={active} draftEntries={draftEntries} forgottenIds={forgottenIds} draft={draft} recover={recover} recoveryActions={recoveryActions} reviewed={reviewed} setReviewed={setReviewed} safeTaskIntent={safeTaskIntent} workspace={workspace}
          selectedValue={selectedValue} activeAgentId={activeAgentId} activeAgentName={activeAgentName} setSessionAgents={setSessionAgents} headerExtra={headerExtra} setDictating={setDictating} dictating={dictating} templateActive={templateActive}
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
