import type { RuntimeSessionDetail } from '@/lib/gateway/runtime'
import { retryableTurn, retryText } from '@/lib/chat/turn-outcomes'
import { hasActiveRuntimeTurn } from './runtime-state'

/**
 * The words to send again for a turn that ended without an answer and ran nothing, or null when
 * sending now would not be safe: another request is unsettled, or the owner typed something else.
 */
export function retryTurnText(detail: RuntimeSessionDetail | null | undefined, turnId: string, unsettled: boolean, typed: string): string | null {
  const turn = detail?.turns.find(row => row.id === turnId)
  const text = detail && turn && retryableTurn(turn) && detail.status === 'open' && !unsettled && !hasActiveRuntimeTurn(detail) ? retryText(detail.messages, turnId) : null
  return text && (!typed.trim() || typed === text) ? text : null
}
