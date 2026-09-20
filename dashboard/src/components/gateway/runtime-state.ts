import type { RuntimeSessionDetail, RuntimeSubmission } from '@/lib/gateway/runtime'
import type { TaskDispatchIntent, TaskSubmissionBinding } from './task-dispatch-state'
import { createStore } from 'zustand/vanilla'

export type UncertainTurn = { taskBinding?: TaskSubmissionBinding; rejectionStatus?: 409; text: string; turnId?: string; checked: boolean; accepted?: boolean; requestId?: string; requestedSessionId?: string; submission?: RuntimeSubmission; notFound?: boolean }

export function createGatewayRuntimeWorkspaceState() {
  return createStore<{
    epoch: number; selected: string | null; drafts: Record<string, string>; uncertain: Record<string, UncertainTurn>
    taskIntent: TaskDispatchIntent | null; title: string; createUnknown: 'unchecked' | 'checked' | null; operation: 'create' | 'send' | null
    reset: () => void
  }>((set, get) => ({ epoch: 0, selected: null, drafts: {}, uncertain: {}, taskIntent: null, title: '', createUnknown: null, operation: null,
    reset: () => set({ epoch: get().epoch + 1, selected: null, drafts: {}, uncertain: {}, taskIntent: null, title: '', createUnknown: null, operation: null }),
  }))
}
export type GatewayRuntimeWorkspaceState = ReturnType<typeof createGatewayRuntimeWorkspaceState>

/** A history read supplies evidence, never proof that an unacknowledged POST did not run. */
export function checkedAttempt(attempt: UncertainTurn): UncertainTurn {
  return { ...attempt, checked: true }
}

export function resolveAttempt(attempt: UncertainTurn, draft: string, decision: 'found' | 'allow-new') {
  if (!attempt.checked) throw new Error('Check server history before resolving this attempt.')
  return { draft: decision === 'found' && draft === attempt.text ? '' : draft }
}
export function recoverSubmissionDraft(attempt: UncertainTurn, draft: string): string {
  if (attempt.submission?.taskId || draft.length || attempt.submission?.contentStatus !== 'available' || !attempt.submission.pendingText) return draft
  return attempt.submission.pendingText
}

export function canSubmitRuntime(text: string, pending: boolean, uncertain: UncertainTurn | undefined, detail: RuntimeSessionDetail | null): boolean {
  return Boolean(detail && detail.status === 'open' && text.trim() && [...text].length <= 16_000 && !pending && !uncertain && !hasActiveRuntimeTurn(detail))
}

export function hasActiveRuntimeTurn(detail: RuntimeSessionDetail): boolean {
  // Pi records an ended_at timestamp when parking a recoverable turn too.
  const unresolved = new Set(['awaiting_approval', 'awaiting_budget', 'acted_no_reply', 'action_in_progress', 'outcome_unknown'])
  return detail.turns.some(turn => turn.endedAt === null || unresolved.has(turn.status) || turn.status === 'interrupted' && turn.acted) || (detail.pendingSubmissions ?? []).some(item => item.state === 'preparing')
}

/** A received conflict plus an absent durable receipt proves this task request did not bind. */
export function canReleaseTaskConflict(attempt: UncertainTurn): boolean {
  return !!attempt.taskBinding && attempt.rejectionStatus === 409 && attempt.notFound === true && attempt.checked && !attempt.submission
}
