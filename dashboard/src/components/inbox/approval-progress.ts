import type { OwnerRequest } from '@/lib/gateway/owner'
import type { CardTemplate } from '@/lib/inbox-buttons'

/**
 * What the saved request says happened after his approval. ToolGate marks an approval used when
 * the action runs with it; the action's own result is in the chat, so "ran" is as far as this
 * record can confirm. Until then it is Working. A request that can no longer run is Failed. No
 * word for a minute is Unknown: he can check again, and checking only reads.
 */
export type ApprovalProgress = 'working' | 'ran' | 'failed' | 'unknown'
export const APPROVAL_CHECK_MS = 2000
export const APPROVAL_UNKNOWN_AFTER_MS = 60_000

const doing: Record<CardTemplate, string> = {
  do: 'Conker is doing it now…', send: 'Sending now…', publish: 'Publishing now…', ship: 'Shipping now…',
  run: 'Running it now…', delete: 'Deleting now…', pay: 'Paying now…', save: 'Saving now…',
}

const ranOut = (request: OwnerRequest, now: number) =>
  request.unavailableReason === 'expired' || request.approval.expiresAt !== null && Date.parse(request.approval.expiresAt) <= now

export function approvalProgress(request: OwnerRequest, now: number, since: number): ApprovalProgress {
  if (request.approval.consumedAt) return 'ran'
  if (request.status !== 'approved' || ranOut(request, now) || ![null, 'already_decided'].includes(request.unavailableReason)) return 'failed'
  return now - since >= APPROVAL_UNKNOWN_AFTER_MS ? 'unknown' : 'working'
}

export function approvalProgressText(progress: ApprovalProgress, request: OwnerRequest, now: number): string {
  const title = `“${request.title || 'Review this action'}”`
  if (progress === 'working') return `Approved ${title}. ${doing[request.card]}`
  if (progress === 'ran') {
    const at = new Date(request.approval.consumedAt!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return `${title} ran at ${at}. The chat shows how it went.`
  }
  if (progress === 'failed') {
    const why = request.status === 'cancelled' ? 'the request was cancelled'
      : request.status === 'approved' && ranOut(request, now) ? 'the approval ran out before Conker used it'
        : 'this request can no longer run'
    return `${title} didn’t run: ${why}. Nothing was done; ask Conker again in the chat.`
  }
  return `Approved ${title}, but it isn’t confirmed yet that it ran. The chat shows how it went.`
}
