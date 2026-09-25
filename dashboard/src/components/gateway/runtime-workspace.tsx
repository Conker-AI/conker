import { ChatTranscript } from '@/components/chat/transcript'
import { ChatComposer } from '@/components/chat/composer'
import { gatewayChatContract, type GatewayChatState, type GatewayChatHandlers } from '@/lib/chat/gateway-adapter'
import type { Attempt, Generation } from '@/lib/chat/contract'
import { GatewayModelPicker } from './model-picker'
import type { GatewayControlClient } from '@/lib/gateway/control'
import { ModelRoutingEvidence, TurnFailureGuidance } from "./model-routing-evidence"
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowUp, MoreHorizontal, RefreshCw } from 'lucide-react'
import { SubmissionRecovery } from './submission-recovery'
import { TaskDispatchReview } from './task-dispatch-review'
import { readTaskDispatchSources, taskDispatchProblem, visibleTaskDispatchIntent, type PreparedTaskDispatch, type TaskSubmissionBinding } from './task-dispatch-state'
import type { GatewayActivityClient } from '@/lib/gateway/activity'
import { PendingSubmissions } from './pending-submissions'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import { createTurnRequestId, RuntimeMutationError, type GatewayRuntimeClient, type RuntimeMessage, type RuntimeSession, type RuntimeSessionDetail, type RuntimeSubmission, type RuntimePendingSubmission } from '@/lib/gateway/runtime'
import { followLivePreview } from '@/lib/gateway/live-preview'
import { gatewayError } from '@/lib/gateway/transport'
import { canReleaseTaskConflict, canSubmitRuntime, checkedAttempt, createGatewayRuntimeWorkspaceState, hasActiveRuntimeTurn, recoverSubmissionDraft, resolveAttempt, type GatewayRuntimeWorkspaceState } from './runtime-state'
import { createGatewaySourcePrivacyState, maskForgottenConversation, maskForgottenSession, type GatewaySourcePrivacyState } from './source-privacy'

export type { GatewayRuntimeWorkspaceState } from './runtime-state'
export type GatewayRuntimeWorkspaceProps = { harnessBySession?: Record<string, boolean>; control?: GatewayControlClient; client: GatewayRuntimeClient; activityClient?: GatewayActivityClient; authStore: GatewayAuthStore; state?: GatewayRuntimeWorkspaceState; sourcePrivacy?: GatewaySourcePrivacyState; visible?: boolean; onSelectSession?: (id: string | null) => void; headerExtra?: ReactNode }

/** A friendly greeting for the time of day, like a person would say it. */
function greeting(now = new Date()) {
  const hour = now.getHours()
  return hour < 5 ? 'Hello, night owl' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : hour < 23 ? 'Good evening' : 'Hello, night owl'
}

async function copyMessage(message: RuntimeMessage, kind: 'copy' | 'link') {
  if (message.content.kind !== 'text') return
  const url = new URL('/chat', window.location.origin)
  url.searchParams.set('session', message.sessionId)
  url.searchParams.set('message', message.id)
  await navigator.clipboard.writeText(kind === 'copy' ? message.content.text : url.href)
}

/** Live Pi records only. All drafts and mutation locks belong to this mounted workspace. */
export function GatewayRuntimeWorkspace({ harnessBySession, control, client, activityClient, authStore, state, sourcePrivacy, visible = true, onSelectSession, headerExtra }: GatewayRuntimeWorkspaceProps) {
  const auth = useStore(authStore)
  const [routeParams] = useSearchParams()
  const focusedMessageId = routeParams.get('message')
  const [localState] = useState(createGatewayRuntimeWorkspaceState)
  const workspace = state ?? localState
  const [localPrivacy] = useState(createGatewaySourcePrivacyState)
  const privacy = sourcePrivacy ?? localPrivacy
  const forgottenIds = useStore(privacy, value => value.sessionIds)
  const { selected, drafts, uncertain, title, createUnknown, operation, taskIntent } = useStore(workspace)
  const safeTaskIntent = visibleTaskDispatchIntent(taskIntent, forgottenIds)
  const setSelected = (value: string | null) => workspace.setState({ selected: value })
  const setCreateUnknown = (value: 'unchecked' | 'checked' | null) => workspace.setState({ createUnknown: value })
  const [sessions, setSessions] = useState<RuntimeSession[]>([])
  const [detail, setDetail] = useState<RuntimeSessionDetail | null>(null)
  const [modelChoices, setModelChoices] = useState<Record<string, string>>({})
  const [detailPending, setDetailPending] = useState(false)
  const sendPending = operation === 'send'
  const [detailError, setDetailError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [reviewed, setReviewed] = useState(false)
  const createPending = operation === 'create'
  const [taskError, setTaskError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [firstMessage, setFirstMessage] = useState('')
  // Display-only text of the answer being written; the saved turn replaces it.
  const [preview, setPreview] = useState<{ sessionId: string; text: string; resetVersion: number; end?: Generation['end'] } | null>(null)
  // The request being answered right now, so Stop can name it; cleared when the send settles.
  const [inFlight, setInFlight] = useState<Attempt & { requestId: string; stopping: boolean; epoch: number } | null>(null)
  const [rejected, setRejected] = useState<string | null>(null)
  const chatLatest = useRef<{ snapshot: GatewayChatState; handlers: GatewayChatHandlers } | null>(null)
  const mounted = useRef(false)
  const controllers = useRef(new Set<AbortController>())
  const detailGeneration = useRef(0)
  const listGeneration = useRef(0)
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const active = auth.phase === 'authenticated' && auth.session?.authenticated && !auth.pending && !auth.logoutUnconfirmed
  const activeRef = useRef(active)
  activeRef.current = active
  const current = detail?.id === selected ? forgottenIds.includes(detail.id) ? maskForgottenConversation(detail) : detail : null
  const draft = selected && !forgottenIds.includes(selected) ? drafts[selected] ?? '' : ''
  const attempt = selected ? uncertain[selected] : undefined
  const manualRequired = Boolean(selected && harnessBySession?.[selected] && !modelChoices[selected])
  const pending = sendPending || operation === 'resume' || detailPending || !active || manualRequired

  const request = useCallback(async <T,>(action: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const controller = new AbortController()
    controllers.current.add(controller)
    try { return await action(controller.signal) }
    finally { controllers.current.delete(controller) }
  }, [])
  const refreshList = useCallback(async () => {
    const generation = ++listGeneration.current
    try {
      const rows = await request(signal => client.listSessions({ signal }))
      if (!mounted.current || !activeRef.current || generation !== listGeneration.current) return false
      privacy.getState().markForgotten(rows.filter(row => row.status === 'forgotten').map(row => row.id))
      setSessions(rows.map(row => privacy.getState().sessionIds.includes(row.id) ? maskForgottenSession(row) : row))
      if (workspace.getState().createUnknown) workspace.setState({ createUnknown: 'checked' })
      return true
    } catch {
      // The sidebar shows list errors; here the list only supplies chat titles.
      return false
    }
  }, [client, privacy, request, workspace])
  const refreshDetail = useCallback(async (id: string) => {
    const generation = ++detailGeneration.current
    setDetailPending(true); setDetailError(null)
    try {
      const response = await request(signal => client.getSession(id, { signal }))
      if (!mounted.current || !activeRef.current || generation !== detailGeneration.current || selectedRef.current !== id) return false
      if (response.status === 'forgotten') privacy.getState().markForgotten([id])
      const next = privacy.getState().sessionIds.includes(id) ? maskForgottenConversation(response) : response
      setDetail(next)
      const accepted = workspace.getState().uncertain[id]
      if (accepted?.accepted && next.turns.some(turn => turn.id === accepted.turnId)) workspace.setState(values => {
        if (values.uncertain[id] !== accepted) return {}
        const updated = { ...values.uncertain }; delete updated[id]
        return { uncertain: updated }
      })
      return true
    } catch (error) {
      if (mounted.current && activeRef.current && generation === detailGeneration.current) setDetailError(gatewayError(error).message)
      return false
    } finally { if (mounted.current && generation === detailGeneration.current) setDetailPending(false) }
  }, [client, privacy, request, workspace])

  useEffect(() => {
    mounted.current = true
    const pendingControllers = controllers.current
    return () => { mounted.current = false; for (const controller of pendingControllers) controller.abort(); pendingControllers.clear() }
  }, [])
  useEffect(() => { if (active) void refreshList(); else { for (const controller of controllers.current) controller.abort(); controllers.current.clear() } }, [active, refreshList])
  useEffect(() => { if (selected && active) void refreshDetail(selected) }, [selected, active, refreshDetail])
  useEffect(() => {
    if (!visible || !focusedMessageId || !current?.messages.some(message => message.id === focusedMessageId)) return
    document.getElementById(`record-${focusedMessageId}`)?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
  }, [visible, focusedMessageId, current])
  useEffect(() => {
    if (!forgottenIds.length) return
    workspace.setState(value => ({ taskIntent: value.taskIntent && forgottenIds.includes(value.taskIntent.sessionId) ? null : value.taskIntent, drafts: Object.fromEntries(Object.entries(value.drafts).filter(([id]) => !forgottenIds.includes(id))), uncertain: Object.fromEntries(Object.entries(value.uncertain).map(([id, attempt]) => [id, forgottenIds.includes(id) || attempt.requestedSessionId && forgottenIds.includes(attempt.requestedSessionId) ? { ...attempt, text: '', submission: attempt.submission ? { ...attempt.submission, pendingText: null, contentStatus: 'forgotten', state: 'forgotten' } : undefined } : attempt])) }))
    setDetail(value => value && forgottenIds.includes(value.id) ? maskForgottenConversation(value) : value)
    setSessions(values => values.map(value => forgottenIds.includes(value.id) ? maskForgottenSession(value) : value))
  }, [forgottenIds, workspace])
  useEffect(() => {
    if (!Object.values(drafts).some(value => value.length) && !Object.keys(uncertain).length && !title && !createUnknown && !taskIntent && !sendPending && !createPending) return
    const preventLoss = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', preventLoss)
    return () => window.removeEventListener('beforeunload', preventLoss)
  }, [drafts, uncertain, title, createUnknown, taskIntent, sendPending, createPending])

  function openSession(id: string) { selectedRef.current = id; setSelected(id); setDetail(null); setDetailError(null); setNotice(null); setRejected(null); setReviewed(false); onSelectSession?.(id) }
  /** A new chat is created by its first message, like any chat app. */
  async function startChat() {
    const text = firstMessage
    if (!text.trim() || [...text].length > 16_000 || workspace.getState().operation || createUnknown || !activeRef.current) return
    const epoch = workspace.getState().epoch
    workspace.setState({ operation: 'create' }); setCreateError(null)
    let created: string
    try {
      created = (await request(signal => client.createSession(text.trim().split('\n')[0].slice(0, 60), { signal }))).sessionId
    } catch (error) {
      if (workspace.getState().epoch !== epoch) return
      const rejected = error instanceof RuntimeMutationError && error.outcome === 'rejected'
      if (mounted.current) setCreateError(rejected ? error.message : 'We could not confirm the chat was created. Check your chats in the sidebar before trying again.')
      // Reload the list so the owner can look for the chat before being offered another try.
      if (!rejected) { setCreateUnknown('unchecked'); void refreshList() }
      return
    } finally { if (workspace.getState().epoch === epoch) workspace.setState({ operation: null }) }
    if (workspace.getState().epoch !== epoch || !mounted.current || !activeRef.current) return
    // Seed the draft so the text survives a failed send, exactly like a message typed in the chat.
    workspace.setState(values => ({ drafts: { ...values.drafts, [created]: text } }))
    setFirstMessage('')
    openSession(created)
    void refreshList()
    await dispatchSubmission(created, text, createTurnRequestId())
  }
  async function submit() {
    const live = workspace.getState(), id = live.selected
    const text = id ? live.drafts[id] ?? '' : ''
    if (live.operation || !id || id !== current?.id || !canSubmitRuntime(text, pending, live.uncertain[id], current)) return
    await dispatchSubmission(id, text, createTurnRequestId())
  }
  async function acceptSubmission(id: string, text: string, receipt: RuntimeSubmission, taskBinding?: TaskSubmissionBinding) {
    if (receipt.contentStatus === 'forgotten') privacy.getState().markForgotten([id, ...(receipt.sessionId ? [receipt.sessionId] : [])])
    if (!receipt.turnId || !receipt.sessionId || receipt.state === 'forgotten') {
      workspace.setState(values => ({ uncertain: { ...values.uncertain, [id]: { text: privacy.getState().sessionIds.includes(id) ? '' : text, taskBinding, requestId: receipt.requestId, requestedSessionId: receipt.requestedSessionId, submission: receipt, checked: true } } }))
      if (mounted.current) setNotice(`Submission is ${receipt.state.replaceAll('_', ' ')}. No request was repeated.`)
      if (mounted.current && selectedRef.current === id) await refreshDetail(id)
      return
    }
    const destination = receipt.sessionId
    workspace.setState(values => {
      const uncertain = { ...values.uncertain }; delete uncertain[id]
      uncertain[destination] = { text: privacy.getState().sessionIds.includes(destination) ? '' : text, taskBinding, requestId: receipt.requestId, requestedSessionId: receipt.requestedSessionId, turnId: receipt.turnId!, checked: false, accepted: true, submission: receipt }
      return { drafts: { ...values.drafts, [id]: !taskBinding && values.drafts[id] === text ? '' : values.drafts[id] ?? '' }, uncertain, selected: destination }
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
    if (!selected || workspace.getState().operation || !activeRef.current) return
    const id = selected, epoch = workspace.getState().epoch
    let failure: string | null = null
    workspace.setState({ operation: 'resume' }); setNotice(null); setDetailError(null)
    try {
      const status = await request(signal => client.resumeTurn(turnId, { signal }))
      // The reply appears on its own; only say something when the turn is still waiting on the owner.
      if (workspace.getState().epoch === epoch && status === 'awaiting_approval') setNotice('Still waiting for your OK. Approve it in the Inbox, then continue.')
    } catch (error) {
      failure = error instanceof Error ? error.message : 'Resume could not be confirmed. Check history before trying again.'
    } finally {
      if (workspace.getState().epoch === epoch) {
        await refreshDetail(id)
        if (workspace.getState().epoch === epoch && selectedRef.current === id && failure) setDetailError(failure)
        if (workspace.getState().epoch === epoch) workspace.setState({ operation: null })
      }
    }
  }
  async function dispatchSubmission(id: string, text: string, requestId: string, taskBinding?: TaskSubmissionBinding, prepared?: PreparedTaskDispatch) {
    if (workspace.getState().operation || !activeRef.current) return
    if (harnessBySession?.[id] && !modelChoices[id]) { setDetailError('Choose an answer model while harness processing is disabled.'); return }
    const epoch = workspace.getState().epoch
    workspace.setState({ operation: 'send' }); setDetailError(null); setNotice(null); setTaskError(null)
    let dispatched = false
    const previewStop = new AbortController()
    try {
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
      setRejected(null)
      setInFlight({ requestId, requestedSessionId: id, input: { kind: 'text', text }, stopping: false, epoch })
      let resetVersion = 0
      const previewCurrent = () => mounted.current && activeRef.current && workspace.getState().epoch === epoch && !previewStop.signal.aborted && !privacy.getState().sessionIds.includes(id)
      void followLivePreview(requestId, streamed => { if (previewCurrent()) setPreview({ sessionId: id, text: streamed, resetVersion }) }, { signal: previewStop.signal, onReset: () => { resetVersion++; if (previewCurrent()) setPreview({ sessionId: id, text: '', resetVersion }) } }).then(end => { if (previewCurrent()) setPreview(value => ({ sessionId: id, text: value?.text ?? '', resetVersion, end })) })
      const receipt = await request(signal => client.submitRequest(id, text, requestId, { signal, ...taskBinding, ...(modelChoices[id] ? { modelId: modelChoices[id] } : {}) }))
      if (workspace.getState().epoch !== epoch) return
      if (prepared) workspace.setState({ taskIntent: null })
      await acceptSubmission(id, text, receipt, taskBinding)
    } catch (error) {
      if (workspace.getState().epoch !== epoch) return
      if (!dispatched || error instanceof RuntimeMutationError && error.outcome === 'rejected') {
        if (mounted.current) { const message = error instanceof Error ? error.message : gatewayError(error).message; if (prepared) setTaskError(message); else { setRejected(message); setDetailError(message) } }
      }
      else {
        workspace.setState(values => ({ uncertain: { ...values.uncertain, [id]: { taskBinding, rejectionStatus: error instanceof RuntimeMutationError && error.status === 409 ? 409 : undefined, text: privacy.getState().sessionIds.includes(id) ? '' : text, requestId, requestedSessionId: id, turnId: error instanceof RuntimeMutationError ? error.turnId : undefined, checked: false } } }))
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
      await acceptSubmission(id, saved.text, receipt, saved.taskBinding)
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
    if (!selected || detailPending || sendPending) return
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
    workspace.setState(values => { const next = { ...values.uncertain }; delete next[selected]; return { drafts: { ...values.drafts, [selected]: result.draft }, uncertain: next } })
    setReviewed(false); setDetailError(null)
    setNotice(decision === 'found' ? 'Marked as found in server history. No text was sent.' : 'Sending is enabled after your review. No text was sent; the earlier operation may still finish.')
  }

  const chatSnapshot: GatewayChatState = {
    sessionId: selected ?? '', epoch: workspace.getState().epoch, active: !!active, current, draft, pending, sendPending, detailPending,
    forgotten: !!selected && (forgottenIds.includes(selected) || current?.status === 'forgotten' || !!attempt?.requestedSessionId && forgottenIds.includes(attempt.requestedSessionId)),
    attempt, reviewed, notice, error: detailError, rejected, inFlight: inFlight?.epoch === workspace.getState().epoch ? inFlight : null, preview, focusedMessageId,
  }
  const chatHandlers: GatewayChatHandlers = {
    copy: copyMessage, setDraft: text => { if (selected) workspace.setState(values => ({ drafts: { ...values.drafts, [selected]: text } })) },
    send: submit, stop: stopAnswer, checkHistory,
    check: () => attempt?.requestId ? checkSubmission() : checkHistory(),
    retrySameRequest: () => { if (selected && attempt?.requestId) return dispatchSubmission(attempt.requestedSessionId ?? selected, attempt.text, attempt.requestId, attempt.taskBinding) },
    restoreDraft: () => { if (selected && attempt) workspace.setState(values => ({ drafts: { ...values.drafts, [selected]: recoverSubmissionDraft(attempt, values.drafts[selected] ?? '') } })) },
    releaseUnstarted: releaseUnstartedSubmission, acknowledgeFound: () => resolve('found'), acknowledgeUnknown: () => resolve('allow-new'),
  }
  // Event callbacks must see current committed props plus synchronous store/privacy changes.
  useEffect(() => { chatLatest.current = { snapshot: chatSnapshot, handlers: chatHandlers } })
  const chat = gatewayChatContract(chatSnapshot, () => {
    const latest = chatLatest.current?.snapshot ?? chatSnapshot
    const store = workspace.getState()
    const ids = privacy.getState().sessionIds
    return { ...latest, epoch: store.epoch, sessionId: store.selected ?? '', active: !!activeRef.current,
      draft: store.drafts[store.selected ?? ''] ?? '', attempt: store.uncertain[store.selected ?? ''],
      sendPending: store.operation === 'send', pending: latest.pending || !!store.operation,
      forgotten: latest.forgotten || ids.includes(latest.sessionId) || !!latest.attempt?.requestedSessionId && ids.includes(latest.attempt.requestedSessionId),
    }
  }, () => chatLatest.current?.handlers ?? chatHandlers)
  const recoveryActions = 'actions' in chat.submission ? chat.submission.actions : null
  const recover = (name: keyof NonNullable<typeof recoveryActions>) => { const action = recoveryActions?.[name]; if (action?.availability === 'enabled') void action.run() }
  const safeSessions = sessions.map(session => forgottenIds.includes(session.id) ? maskForgottenSession(session) : session)

  if (!active) return null
  return <div className="flex h-full min-h-0 flex-1 flex-col bg-background text-foreground">
    <main className="flex min-h-0 flex-1">
      <section aria-label="Selected conversation" className="flex min-h-0 min-w-0 flex-1 flex-col">
        {!selected ? <>
          <header className="flex h-14 shrink-0 items-center px-2"><SidebarTrigger className="size-9" /></header>
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-[12vh]">
            <div className="w-full max-w-2xl space-y-7">
              <h2 className="flex items-center justify-center gap-3 font-serif text-3xl font-normal tracking-tight sm:text-4xl"><img src="/conker.png" alt="" className="size-9 object-contain sm:size-10" />{greeting()}</h2>
              <form className="rounded-2xl border border-input bg-card p-3 shadow-sm transition-colors focus-within:border-foreground/20" onSubmit={event => { event.preventDefault(); void startChat() }}>
                <Label htmlFor="new-chat-composer" className="sr-only">Message Conker</Label>
                <Textarea id="new-chat-composer" dir="auto" autoFocus rows={2} value={firstMessage} placeholder="How can I help you today?" disabled={createPending || sendPending} onChange={event => setFirstMessage(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void startChat() } }} className="max-h-48 min-h-14 resize-none border-0 bg-transparent px-1 py-1 text-base shadow-none focus-visible:ring-0 md:text-base dark:bg-transparent" />
                <div className="flex justify-end"><Button type="submit" size="icon" className="size-8 rounded-lg" aria-label="Send message" disabled={createPending || sendPending || !firstMessage.trim() || Boolean(createUnknown)}><ArrowUp /></Button></div>
              </form>
              {createError && <p role="alert" className="text-center text-sm text-destructive">{createError}</p>}
              {createUnknown === 'checked' && <div className="flex justify-center"><Button type="button" variant="ghost" size="sm" onClick={() => { setCreateUnknown(null); setCreateError(null) }}>I checked my chats. Start a new one</Button></div>}
            </div>
          </div>
        </> : <>
          <header className="flex h-14 shrink-0 items-center gap-1 px-2">
            <SidebarTrigger className="size-9" />
            <span className="flex-1 sm:hidden" /><h2 className="sr-only min-w-0 flex-1 truncate px-1 text-sm font-medium sm:not-sr-only">{current?.status === 'forgotten' ? 'Forgotten chat' : current?.title || safeSessions.find(item => item.id === selected)?.title || 'New chat'}</h2>
            {control && <GatewayModelPicker compact key={`model:${selected}`} client={control} value={modelChoices[selected] ?? ""} disabled={sendPending || detailPending || !active || Boolean(attempt)} manualRequired={Boolean(harnessBySession?.[selected])} onChange={value => setModelChoices(current => ({ ...current, [selected]: value }))} />}
            {headerExtra}
            <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label="Chat options"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
              <DropdownMenuItem disabled={chat.checkHistory.availability !== 'enabled'} onSelect={() => { if (chat.checkHistory.availability === 'enabled') void chat.checkHistory.run() }}><RefreshCw />Refresh this chat</DropdownMenuItem>
            </DropdownMenuContent></DropdownMenu>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6" tabIndex={0} aria-label="Saved conversation history"><div className="mx-auto w-full max-w-3xl space-y-6">
            {current && current.status !== 'forgotten' && <PendingSubmissions key={`${current.id}:${current.pendingSubmissions.map(item => item.updatedAt).join(',')}`} client={client} sessionId={current.id} initial={current.pendingSubmissions} truncated={current.pendingSubmissionsTruncated} disabled={pending || !!attempt} onInspect={saved => void inspectSubmission(saved)} />}
            {attempt && (attempt.requestId ? <SubmissionRecovery attempt={attempt} pending={detailPending || sendPending} forgotten={forgottenIds.includes(selected) || !!attempt.requestedSessionId && forgottenIds.includes(attempt.requestedSessionId)} draftEmpty={!draft.length && !attempt.taskBinding} onRestore={() => recover('restoreDraft')} onCheck={() => recover('check')} onRetry={() => recover('retrySameRequest')} onRelease={() => recover('releaseUnstarted')} /> : <div className="space-y-3 rounded-lg border p-3"><p className="text-sm font-medium">{attempt.accepted ? 'Conker got your message; the reply isn’t saved yet' : 'Not sure your last message went through'}</p><p className="text-xs leading-5 text-muted-foreground">{attempt.accepted ? 'Sending is paused until the reply shows up, so nothing is done twice.' : 'Your text is kept. Sending is paused because the last message may still be running.'} Check the chat, and your chat list in case it continued in a new chat.</p><Button size="sm" variant="outline" disabled={chat.checkHistory.availability !== 'enabled'} onClick={() => { if (chat.checkHistory.availability === 'enabled') void chat.checkHistory.run() }}>Check the chat</Button>{attempt.checked && <><Label className="flex items-center gap-2 text-xs"><Checkbox checked={reviewed} onCheckedChange={value => setReviewed(value === true)} />I checked. Sending again might do the same work twice.</Label><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" className="h-auto min-h-(--control-height-sm) whitespace-normal text-left" disabled={recoveryActions?.acknowledgeFound.availability !== 'enabled'} onClick={() => recover('acknowledgeFound')}>It’s in the chat</Button><Button size="sm" variant="outline" className="h-auto min-h-(--control-height-sm) whitespace-normal text-left" disabled={recoveryActions?.acknowledgeUnknown.availability !== 'enabled'} onClick={() => recover('acknowledgeUnknown')}>Let me send again</Button></div></>}</div>)}
            {current?.status === 'forgotten' && <p className="text-sm text-muted-foreground">This conversation was forgotten. Sending is disabled.</p>}{current && hasActiveRuntimeTurn(current) && !current.turns.some(turn => turn.status === 'awaiting_approval' || turn.status === 'acted_no_reply') && <p role="status" className="text-sm text-muted-foreground">The server has an unfinished turn. Check history for its status before sending again.</p>}<ChatTranscript chat={chat} />
            {/* Waiting on the owner is the main loop, so it is shown in the chat, not under Details. */}
            {current && current.status !== 'forgotten' && current.turns.filter(turn => turn.status === 'awaiting_approval' || turn.status === 'acted_no_reply').map(turn => <div key={`waiting:${turn.id}`} role="status" className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium">{turn.status === 'awaiting_approval' ? 'Conker is waiting for your OK' : 'Conker acted but did not reply'}</p>
                <p className="text-sm text-muted-foreground">{turn.status === 'awaiting_approval' ? 'Nothing has been done yet. Review the exact action, then continue here.' : 'The action already happened. Ask for the reply; it will not be done again.'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {turn.status === 'awaiting_approval' && turn.approvalRequestId && <Button asChild size="sm"><Link to={`/inbox?request=${encodeURIComponent(turn.approvalRequestId)}`}>Review</Link></Button>}
                <Button size="sm" variant={turn.status === 'awaiting_approval' ? 'outline' : 'default'} disabled={Boolean(operation) || detailPending} onClick={() => void resumeTurn(turn.id)}>{turn.status === 'acted_no_reply' ? 'Get the reply' : 'Continue'}</Button>
              </div>
            </div>)}
            {current && current.turns.length > 0 && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ring">Details</summary><ul className="mt-3 space-y-3">{current.turns.map(turn => <li key={turn.id} className="space-y-1 text-xs text-muted-foreground"><p className="break-all"><span className="font-medium text-foreground">{turn.status.replaceAll('_', ' ')}</span> · {turn.id}</p>{(turn.provider || turn.model) && <p className="break-words">{[turn.provider, turn.model].filter(Boolean).join(' / ')}</p>}{turn.approvalRequestId && turn.status === 'awaiting_approval' && <Button asChild variant="outline" size="sm"><Link to={`/inbox?request=${encodeURIComponent(turn.approvalRequestId)}`}>Review action</Link></Button>}{['awaiting_approval', 'acted_no_reply'].includes(turn.status) && <Button variant="outline" size="sm" disabled={Boolean(operation) || detailPending} onClick={() => void resumeTurn(turn.id)}>{turn.status === 'acted_no_reply' ? 'Ask only for the reply' : 'Continue after approval'}</Button>}<TurnFailureGuidance status={turn.status} detail={turn.detail} hasAction={Boolean(turn.action)} /><ModelRoutingEvidence detail={turn.detail} />{turn.memory.retrieval && <details><summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ring">Memory · {turn.memory.retrieval.status.replaceAll('_', ' ')}</summary><div className="space-y-1 py-2"><p>{turn.memory.retrieval.records} records supplied{turn.memory.retrieval.mode ? ` · ${turn.memory.retrieval.mode}` : ''}</p>{turn.memory.retrieval.reranking && <p>Relevance ranking: {turn.memory.retrieval.reranking.status.replaceAll('_', ' ')}{turn.memory.retrieval.reranking.model ? ` · ${turn.memory.retrieval.reranking.model}` : ''}</p>}{turn.memory.notices.map((notice, index) => <p key={index}>{notice}</p>)}</div></details>}{turn.action && <p>Action: {turn.action.state.replaceAll('_', ' ')}</p>}</li>)}</ul></details>}
          </div></div>
          <div className="mx-auto w-full max-w-3xl shrink-0 space-y-3 px-3 pb-4 sm:px-6">
            {safeTaskIntent && !safeTaskIntent.open && <div className="flex flex-wrap items-center gap-2 text-xs"><span className="text-muted-foreground">Task request saved separately from your draft.</span><Button size="sm" variant="outline" disabled={!!operation} onClick={() => workspace.setState({ taskIntent: { ...safeTaskIntent, open: true } })}>Review task request</Button><Button size="sm" variant="ghost" disabled={!!operation} onClick={() => workspace.setState({ taskIntent: null })}>Discard task request</Button></div>}
            <ChatComposer chat={chat} />
          </div>
        </>}
      </section>
    </main>
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
