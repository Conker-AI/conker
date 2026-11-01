import type { MemoryDelivery } from '@/lib/gateway/memory-delivery'
import type { MemoryDeliveryWatchState } from '@/components/gateway/memory-delivery-watch'
import type { Action, MessageMemoryFeedback } from './contract'
import type { MemoryUndoState } from './memory-undo'

const unsupported: Action = { availability: 'unsupported', reason: 'Not supported by the gateway.' }
const labels: Record<MemoryDelivery['state'], string> = { pending: 'Memory pending', saved: 'Remembered', filtered: 'Not added to memory', unavailable: 'Memory status unavailable', excluded: 'Memory excluded', removed: 'Removed from memory' }
const explanation: Record<NonNullable<MemoryDelivery['reasonCode']>, string> = {
  queued: 'This message is queued for a memory check. Saving the chat does not confirm a memory write.',
  retry_scheduled: 'Memory has not acknowledged this message. Conker has scheduled another delivery attempt.',
  blocked: 'Memory delivery needs attention before it can continue. This chat is kept.',
  legacy_unknown: 'No verifiable memory receipt was recorded for this message. This chat is kept.',
  invalid_receipt: 'The memory acknowledgement could not be verified. This chat is kept.',
  privacy_disabled: 'Memory was off when this message was saved. This chat is kept.',
  agent_excluded: 'This agent was excluded from memory ingestion when this message was saved. This chat is kept.',
  forget_pending: 'A forget request is awaiting confirmation. An earlier memory write is not shown as active.',
  forgotten: 'The memory was removed. The original chat is kept.',
  destination_unknown: 'The original memory destination could not be verified. This chat is kept.',
}

/** True for the quiet "Remembered" / "Forgotten" note; every other state keeps its explained status. */
export const isMemoryNote = (memory: MessageMemoryFeedback) => memory.memoryId !== null || memory.undoState?.phase === 'forgotten'

/** Only an acknowledged, saved receipt becomes the quiet "Remembered" note with Undo; every other state keeps its explained status. */
export function memoryFeedback(messageId: string, state: MemoryDeliveryWatchState | null, refresh: Action, undo: { action: Action; state?: MemoryUndoState } = { action: unsupported }): MessageMemoryFeedback {
  const receipt = state?.receipts[messageId]
  const checking = state === null || state.phase === 'checking'
  const unavailable = state?.phase === 'error'
  const description = unavailable ? 'The latest memory status could not be checked. Checking again only reads its receipt; it does not resend this message.'
    : !receipt ? state?.truncated ? 'Automatic checks cover the latest 100 user messages. Check this message to read its own receipt.' : checking ? 'Reading the recorded memory outcome for this message.' : 'No memory receipt is available for this message. This chat is kept.'
    : receipt.reasonCode ? explanation[receipt.reasonCode]
    : receipt.state === 'saved' ? receipt.admissionMethod === 'owner_requested' ? 'Memory acknowledged your request to retain this message. This does not guarantee it will be recalled in every reply.' : 'Memory acknowledged this message. This does not guarantee it will be recalled in every reply.'
    : receipt.state === 'filtered' ? 'Memory checked this message and did not retain it as a memory. This chat is kept.'
    : receipt.state === 'removed' ? 'This memory was removed. The original chat is kept.'
    : receipt.state === 'excluded' ? 'This message was excluded from memory. This chat is kept.'
    : 'A memory write has not been confirmed. This chat is kept.'
  return {
    label: undo.state?.phase === 'forgotten' ? 'Forgotten' : unavailable ? 'Memory status unavailable' : !receipt ? checking ? 'Checking memory status…' : 'Memory status not refreshed' : labels[receipt.state],
    description: description + (state?.phase === 'paused' && receipt?.state === 'pending' ? ' Automatic status checks have paused. Check again whenever you need an update.' : ''),
    checking, refresh, memoryId: receipt?.state === 'saved' ? receipt.memoryId : null, undo: undo.action, ...(undo.state ? { undoState: undo.state } : {}),
  }
}
