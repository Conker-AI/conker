import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { Attempt, Generation } from '@/lib/chat/contract'
import type { GatewayChatHandlers, GatewayChatState } from '@/lib/chat/gateway-adapter'
import type { GatewayActivityClient } from '@/lib/gateway/activity'
import type { SavedDraft } from '@/lib/gateway/drafts'
import { followLivePreview } from '@/lib/gateway/live-preview'
import { RuntimeMutationError, type GatewayRuntimeClient, type RuntimePendingSubmission, type RuntimeSessionDetail, type RuntimeSubmission } from '@/lib/gateway/runtime'
import { GatewayError, gatewayError } from '@/lib/gateway/transport'
import { chooseTemplate } from './composer-parts'
import { sameDraft, type DraftController } from './draft-controller'
import type { createRuntimeDetailReader } from './runtime-detail-read'
import { canReleaseTaskConflict, checkableTurn, checkedAttempt, createRequestOptions, hasActiveRuntimeTurn, resolveAttempt, retainedRequestOptions, type GatewayRuntimeWorkspaceState, type RequestModelOptions, type UncertainTurn } from './runtime-state'
import type { useSessionDiscovery } from './session-discovery-context'
import type { GatewaySourcePrivacyState } from './source-privacy'
import { readTaskDispatchSources, taskDispatchProblem, visibleTaskDispatchIntent, type PreparedTaskDispatch, type TaskSubmissionBinding } from './task-dispatch-state'

/** The request being answered right now, so Stop can name it; cleared when the send settles. */
export type RuntimeInFlight = Attempt & { requestId: string; stopping: boolean; epoch: number }
/** Display-only text of the answer being written; the saved turn replaces it. */
export type RuntimePreview = { sessionId: string; text: string; resetVersion: number; end?: Generation['end'] }

export type RuntimeSubmissionContext = {
  client: GatewayRuntimeClient; activityClient?: GatewayActivityClient; harnessBySession?: Record<string, boolean>
  workspace: GatewayRuntimeWorkspaceState; privacy: GatewaySourcePrivacyState; draftController: DraftController
  selected: string | null; current: RuntimeSessionDetail | null; attempt: UncertainTurn | undefined; draft: string; reviewed: boolean
  inFlight: RuntimeInFlight | null; sendPending: boolean; detailPending: boolean; sessionAgents: Record<string, string>
  mounted: RefObject<boolean>; activeRef: RefObject<boolean | undefined>; selectedRef: RefObject<string | null>
  chatLatest: RefObject<{ snapshot: GatewayChatState; handlers: GatewayChatHandlers } | null>
  request: <T>(action: (signal: AbortSignal) => Promise<T>) => Promise<T>
  refreshDetail: ReturnType<typeof createRuntimeDetailReader>['refresh']; refreshList: ReturnType<typeof useSessionDiscovery>['refresh']
  openSession: (id: string) => void
  setNotice: Dispatch<SetStateAction<string | null>>; setDetailError: Dispatch<SetStateAction<string | null>>; setTaskError: Dispatch<SetStateAction<string | null>>
  setRejected: Dispatch<SetStateAction<string | null>>; setReviewed: Dispatch<SetStateAction<boolean>>; setDetailPending: Dispatch<SetStateAction<boolean>>
  setInFlight: Dispatch<SetStateAction<RuntimeInFlight | null>>; setPreview: Dispatch<SetStateAction<RuntimePreview | null>>
}

/**
 * Sending, checking, resuming and stopping a chat turn for the runtime workspace. Called on every render
 * like the handlers it replaces, so each action sees that render's values; the refs carry what must be live.
 */
export function useRuntimeSubmissions(context: RuntimeSubmissionContext) {
  const { client, activityClient, harnessBySession, workspace, privacy, draftController, selected, current, attempt, draft, reviewed, inFlight, sendPending, detailPending, sessionAgents,
    mounted, activeRef, selectedRef, chatLatest, request, refreshDetail, refreshList, openSession,
    setNotice, setDetailError, setTaskError, setRejected, setReviewed, setDetailPending, setInFlight, setPreview } = context
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
        requestOptions = createRequestOptions(promotedDraft.modelId, promotedDraft.skillIds, promotedDraft.think, promotedDraft.revision, promotedDraft.researchMode)
      } else if (!prior && !taskBinding) {
        draftController.edit(id, { modelId: requestOptions.modelId ?? null, skillIds: requestOptions.skillIds ?? [], think: !!requestOptions.think })
        const saved = await draftController.flush(id)
        if (workspace.getState().epoch !== epoch || !activeRef.current || privacy.getState().sessionIds.includes(id)) return
        if (saved.text !== text) throw new Error('The draft changed while preparing to send. Review it, then send again.')
        requestOptions = createRequestOptions(saved.modelId, saved.skillIds, saved.think, saved.revision, saved.researchMode)
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
  return { acceptSubmission, resumeTurn, dispatchSubmission, stopAnswer, checkSubmission, releaseUnstartedSubmission, inspectSubmission, checkHistory, resolve }
}
