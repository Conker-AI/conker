import type { Action, Attempt, ChatContract, ChatMessage, Generation, RecoveryAction, Submission } from './contract'
import type { RuntimeMessage, RuntimeSessionDetail } from '@/lib/gateway/runtime'
import { canReleaseTaskConflict, canSubmitRuntime, hasActiveRuntimeTurn, type UncertainTurn } from '@/components/gateway/runtime-state'

export type GatewayChatState = {
  sessionId: string; epoch: number; active: boolean; current: RuntimeSessionDetail | null
  draft: string; pending: boolean; sendPending: boolean; detailPending: boolean; forgotten: boolean
  attempt?: UncertainTurn; reviewed: boolean; notice: string | null; error: string | null; rejected: string | null
  inFlight: (Attempt & { requestId: string; stopping: boolean }) | null
  preview: { sessionId: string; text: string; resetVersion: number; end?: Generation['end'] } | null
  focusedMessageId?: string | null
}
export type GatewayChatHandlers = {
  setDraft: (text: string) => void; send: () => void | Promise<void>; checkHistory: () => void | Promise<void>
  stop: () => void | Promise<void>; copy: (message: RuntimeMessage, kind: 'copy' | 'link') => Promise<void>
} & Record<RecoveryAction, () => void | Promise<void>>
const unsupported: Action = { availability: 'unsupported', reason: 'Not supported by the gateway.' }

/** Reads fresh eligibility on invocation, retaining the selected session and request identity. */
export function gatewayChatContract(state: GatewayChatState, read: () => GatewayChatState, handlers: () => GatewayChatHandlers): ChatContract {
  function action<Args extends unknown[]>(eligible: (value: GatewayChatState) => boolean, run: (value: GatewayChatHandlers, ...args: Args) => void | Promise<void>, reason: string): Action<Args> {
    const allowed = (value: GatewayChatState) => value.active && value.epoch === state.epoch && value.sessionId === state.sessionId && eligible(value)
    return allowed(state) ? { availability: 'enabled', run: (...args) => { if (allowed(read())) return run(handlers(), ...args) } } : { availability: 'disabled', reason }
  }
  const isForgotten = (value: GatewayChatState) => value.forgotten || value.current?.status === 'forgotten' || value.attempt?.submission?.contentStatus === 'forgotten'
  const messages: ChatMessage[] = (state.current?.messages ?? []).map(message => ({ ...message,
    content: isForgotten(state) ? { kind: 'unavailable', reason: 'forgotten' } : message.content,
    actions: {
      copy: messageAction(message, 'copy'), link: messageAction(message, 'link'),
      edit: unsupported, retry: unsupported, fork: unsupported, pin: unsupported, rateUp: unsupported, rateDown: unsupported, redact: unsupported, saveArtifact: unsupported,
    },
  }))
  function messageAction(message: RuntimeMessage, kind: 'copy' | 'link'): Action {
    return action(value => !isForgotten(value) && value.current?.messages.some(item => item.id === message.id && item.content.kind === 'text') === true,
      handler => handler.copy(read().current!.messages.find(item => item.id === message.id)!, kind), 'Message content is unavailable.')
  }
  const saved = state.attempt
  const input = (text: string): Attempt['input'] => isForgotten(state) ? { kind: 'unavailable', reason: 'forgotten' } : { kind: 'text', text }
  let submission: Submission = state.rejected ? { kind: 'rejected', message: state.rejected } : { kind: 'idle' }
  if (state.sendPending && state.inFlight?.requestedSessionId === state.sessionId) submission = { kind: 'sending', attempt: { requestId: state.inFlight.requestId, requestedSessionId: state.inFlight.requestedSessionId, input: isForgotten(state) ? { kind: 'unavailable', reason: 'forgotten' } : state.inFlight.input } }
  else if (saved) {
    const recovery = (name: RecoveryAction, eligible: (value: GatewayChatState, attempt: UncertainTurn) => boolean) => action(
      value => !!value.attempt && value.attempt === saved && !value.detailPending && !value.sendPending && eligible(value, value.attempt),
      handler => handler[name](), 'Check the saved outcome and review eligibility first.')
    submission = {
      kind: saved.accepted ? 'accepted-awaiting-history' : saved.submission ? 'recovery' : 'uncertain',
      attempt: { requestId: saved.requestId, requestedSessionId: saved.requestedSessionId ?? state.sessionId, effectiveSessionId: saved.submission?.sessionId ?? undefined, turnId: saved.turnId, input: input(saved.submission?.pendingText ?? saved.text) },
      checked: saved.checked, notFound: !!saved.notFound, preparation: saved.submission?.state, status: saved.submission?.status, acted: saved.submission?.acted,
      explanation: saved.requestId ? 'This request has a permanent identity. Checking reads its saved result without repeating execution.' : 'Review server history and the conversation list for a possible fork before acknowledging this outcome.',
      actions: {
        check: recovery('check', () => true),
        retrySameRequest: recovery('retrySameRequest', (value, attempt) => !isForgotten(value) && !value.pending && !!attempt.requestId && !!attempt.notFound && !!attempt.text && !canReleaseTaskConflict(attempt)),
        restoreDraft: recovery('restoreDraft', (value, attempt) => !isForgotten(value) && !value.draft.length && !attempt.taskBinding && !attempt.submission?.taskId && attempt.submission?.contentStatus === 'available' && !!attempt.submission.pendingText),
        releaseUnstarted: recovery('releaseUnstarted', (value, attempt) => !isForgotten(value) && (canReleaseTaskConflict(attempt) || ['preparation_failed', 'preparation_interrupted'].includes(attempt.submission?.state ?? ''))),
        acknowledgeFound: recovery('acknowledgeFound', canAcknowledge), acknowledgeUnknown: recovery('acknowledgeUnknown', canAcknowledge),
      },
    }
  }
  function canAcknowledge(value: GatewayChatState, attempt: UncertainTurn) { return !attempt.requestId && attempt.checked && value.reviewed && !isForgotten(value) && !!value.current && !hasActiveRuntimeTurn(value.current) }
  const flight = state.inFlight
  const preview = state.preview?.sessionId === state.sessionId && !isForgotten(state) ? state.preview : null
  const generation: Generation | null = flight && state.sendPending && flight.requestedSessionId === state.sessionId ? {
    id: flight.requestId, sessionId: state.sessionId, phase: flight.stopping ? 'stopping' : preview?.end ? 'ended' : preview ? 'streaming' : 'starting',
    previewText: preview?.text ?? '', resetVersion: preview?.resetVersion ?? 0, end: preview?.end,
    stop: action(value => value.inFlight?.requestId === flight.requestId && !value.inFlight.stopping && value.sendPending, handler => handler.stop(), 'Stop is already requested.'),
  } : null
  return {
    source: 'gateway', sessionId: state.sessionId, messages, history: state.detailPending ? 'loading' : state.error ? 'error' : 'ready',
    notice: state.notice, error: state.error, draft: isForgotten(state) ? '' : state.draft, focusedMessageId: state.focusedMessageId,
    setDraft: action(value => !value.sendPending && !isForgotten(value), (handler, text: string) => handler.setDraft(text), 'The composer is unavailable while sending or after forgetting.'),
    send: action(value => !isForgotten(value) && canSubmitRuntime(value.draft, value.pending, value.attempt, value.current), handler => handler.send(), 'Sending requires an open conversation, a valid draft, and no unresolved turn.'),
    checkHistory: action(value => !value.detailPending && !value.sendPending, handler => handler.checkHistory(), 'A request is in progress.'), generation, submission,
  }
}
