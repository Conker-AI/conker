/** Presentation of one selected conversation. Adapters own persistence and eligibility. */
export type Content = { kind: 'text'; text: string } | { kind: 'unavailable'; reason: 'forgotten' | 'unsupported' }
export type Action<Args extends unknown[] = []> =
  | { availability: 'unsupported' | 'disabled'; reason: string }
  | { availability: 'enabled'; run: (...args: Args) => void | Promise<void> }
export type MessageAction = 'copy' | 'link' | 'edit' | 'retry' | 'fork' | 'pin' | 'rateUp' | 'rateDown' | 'redact' | 'saveArtifact'
export type ChatMessage = {
  id: string; sessionId: string; sequence: number; role: 'user' | 'assistant' | 'system' | 'tool'
  createdAt: string; content: Content; actions: Record<MessageAction, Action>
}
export type Generation = {
  id: string; sessionId: string; phase: 'starting' | 'streaming' | 'stopping' | 'ended'
  /** Replacement text; even resets of empty text increment resetVersion. */
  previewText: string; resetVersion: number; end?: 'done' | 'unavailable' | 'stopped'; stop: Action
}
export type Attempt = {
  requestId?: string; requestedSessionId: string; effectiveSessionId?: string; turnId?: string; input: Content
}
export type RecoveryAction = 'check' | 'retrySameRequest' | 'restoreDraft' | 'releaseUnstarted' | 'acknowledgeFound' | 'acknowledgeUnknown'
export type Submission =
  | { kind: 'idle' }
  | { kind: 'sending'; attempt: Attempt }
  | { kind: 'rejected'; message: string }
  | {
      kind: 'uncertain' | 'accepted-awaiting-history' | 'recovery'; attempt: Attempt
      checked: boolean; notFound: boolean
      preparation?: 'preparing' | 'bound' | 'preparation_failed' | 'preparation_interrupted' | 'forgotten'
      status?: string; acted?: boolean; explanation: string; actions: Record<RecoveryAction, Action>
    }
export type ChatContract = {
  source: 'gateway' | 'fixture'; sessionId: string; messages: readonly ChatMessage[]
  history: 'loading' | 'ready' | 'error'; notice: string | null; error: string | null
  draft: string; setDraft: Action<[text: string]>; send: Action; checkHistory: Action
  generation: Generation | null; submission: Submission
  /** URL focus is presentation state; routing remains in the wrapper. */
  focusedMessageId?: string | null
}
