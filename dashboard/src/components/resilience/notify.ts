import { toastManager } from '@/components/ui/toast'
import { GatewayError } from '@/lib/gateway/transport'

/**
 * Toasts only add to feedback shown beside the action; they are never the only place a failure
 * appears. Failures stay until dismissed, confirmations go after 4 s (rationale ledger: Toasts).
 */
export function notifyFailure(title: string, detail?: unknown, retry?: () => void) {
  toastManager.add({
    type: 'error',
    title,
    description: typeof detail === 'string' ? detail : detail instanceof GatewayError ? detail.message : undefined,
    timeout: 0,
    actionProps: retry ? { children: 'Try again', onClick: retry } : undefined,
  })
}

export function notifyDone(title: string, description?: string) {
  toastManager.add({ type: 'success', title, description, timeout: 4000 })
}
