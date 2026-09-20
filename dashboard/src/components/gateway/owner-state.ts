import { createStore } from 'zustand/vanilla'
import type { OwnerDecision, OwnerRequest } from '@/lib/gateway/owner'

export type RetainedOwnerDecision = { status: OwnerDecision; note: string; checked: boolean; conflict?: boolean }
export function createGatewayOwnerState() {
  return createStore<{
    epoch: number; notes: Record<string, string>; attempts: Record<string, RetainedOwnerDecision>; pendingId: string | null
    reset: () => void
  }>((set, get) => ({ epoch: 0, notes: {}, attempts: {}, pendingId: null,
    reset: () => set({ epoch: get().epoch + 1, notes: {}, attempts: {}, pendingId: null }),
  }))
}
export type GatewayOwnerState = ReturnType<typeof createGatewayOwnerState>
export function ownerDecisionEligibility(request: OwnerRequest, now: number) {
  const expired = !request.approval.expiresAt || Date.parse(request.approval.expiresAt) <= now
  const reviewableContent = request.status === 'pending' && request.approval.originValid && request.action.args !== null &&
    !request.approval.consumedAt && [null, 'expired', 'unsupported_subject'].includes(request.unavailableReason)
  return { approve: reviewableContent && request.reviewable && !expired, reject: reviewableContent, expired }
}
/** A failed approval plus a fresh server-expired pending record cannot mint approval on retry. */
export function canReleaseExpiredOwnerDecision(request: OwnerRequest, attempt: RetainedOwnerDecision | undefined): boolean {
  return !!attempt?.checked && !!attempt.conflict && attempt.status === 'approved' && request.status === 'pending' && request.unavailableReason === 'expired'
}
export const ownerUnavailableText: Record<NonNullable<OwnerRequest['unavailableReason']>, string> = {
  invalid_origin: 'ToolGate could not verify the original action. This record cannot authorize execution.',
  invalid_action: 'The saved action is incomplete or invalid. Request fresh confirmation through the tool.',
  arguments_unavailable: 'The complete arguments cannot be displayed. Approval is unavailable.',
  unsupported_subject: 'This action type is not supported by this owner review surface yet.',
  expired: 'The approval window expired. The agent must request fresh confirmation before execution.',
  consumed: 'This approval was already consumed. Its recorded action outcome is separate from this decision.',
  already_decided: 'A decision has already been recorded for this request.',
}
