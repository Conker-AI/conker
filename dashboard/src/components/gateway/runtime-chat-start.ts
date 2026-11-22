import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { ChatEffort } from '@/lib/gateway/chat-names'
import type { GatewayControlClient } from '@/lib/gateway/control'
import type { DraftStart, SavedDraft } from '@/lib/gateway/drafts'
import { createTurnRequestId, type GatewayRuntimeClient } from '@/lib/gateway/runtime'
import { GatewayError } from '@/lib/gateway/transport'
import { chooseTemplate } from './composer-parts'
import { draftCanSend, sameDraft, type DraftController } from './draft-controller'
import { clearDraftStart, rememberDraftStart, type PendingDraftStart } from './draft-start-recovery'
import { saveNewChatEffort } from './new-chat-effort'
import type { GatewayRuntimeWorkspaceState } from './runtime-state'
import type { useRuntimeSubmissions } from './runtime-submissions'
import type { useSessionDiscovery } from './session-discovery-context'
import type { GatewaySourcePrivacyState } from './source-privacy'

export type RuntimeChatStartContext = {
  client: GatewayRuntimeClient; control?: GatewayControlClient; authStore: GatewayAuthStore
  workspace: GatewayRuntimeWorkspaceState; privacy: GatewaySourcePrivacyState; draftController: DraftController
  pendingStart: PendingDraftStart | null; firstEffort: ChatEffort; activeRef: RefObject<boolean | undefined>
  request: <T>(action: (signal: AbortSignal) => Promise<T>) => Promise<T>
  refreshList: ReturnType<typeof useSessionDiscovery>['refresh']; openSession: (id: string) => void
  dispatchSubmission: ReturnType<typeof useRuntimeSubmissions>['dispatchSubmission']
  setPendingStart: Dispatch<SetStateAction<PendingDraftStart | null>>; setStartMissing: Dispatch<SetStateAction<boolean>>
  setCreateUnknown: (value: 'unchecked' | 'checked' | null) => void; setCreateError: Dispatch<SetStateAction<string | null>>
  setFirstEffort: Dispatch<SetStateAction<ChatEffort>>; setNotice: Dispatch<SetStateAction<string | null>>
  setSessionAgents: Dispatch<SetStateAction<Record<string, string>>>
}

/**
 * Starting a new chat from its saved draft, and recovering a start whose result this tab never saw.
 * Called on every render like the handlers it replaces, so each action sees that render's values.
 */
export function useRuntimeChatStart(context: RuntimeChatStartContext) {
  const { client, control, authStore, workspace, privacy, draftController, pendingStart, firstEffort, activeRef, request, refreshList, openSession, dispatchSubmission,
    setPendingStart, setStartMissing, setCreateUnknown, setCreateError, setFirstEffort, setNotice, setSessionAgents } = context
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
    if (firstEffort !== 'auto') {
      const failure = await saveNewChatEffort(control, receipt.sessionId, firstEffort); setFirstEffort('auto')
      if (workspace.getState().epoch !== epoch || !activeRef.current) return
      if (failure) setNotice(failure)
    }
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
  return { startChat, recoverChatStart }
}
