import { toastManager } from '@/components/ui/toast'
import { GatewayError } from '@/lib/gateway/transport'

/** The place where the owner can fix a failure, shown as the toast's button. */
export type FailureFix = { label: string; to: string }

// Toasts live outside the router, so the button moves through browser history, which the router follows.
function open(to: string) {
  history.pushState(null, '', (import.meta.env.VITE_BASENAME || '') + to)
  dispatchEvent(new PopStateEvent('popstate'))
}

/**
 * Toasts only add to feedback shown beside the action; they are never the only place a failure
 * appears. Failures stay until dismissed, confirmations go after 4 s (rationale ledger: Toasts).
 */
export function notifyFailure(title: string, detail?: unknown, retry?: () => void, fix?: FailureFix) {
  const id: string = toastManager.add({
    type: 'error',
    title,
    description: typeof detail === 'string' ? detail : detail instanceof GatewayError ? detail.message : undefined,
    timeout: 0,
    actionProps: retry ? { children: 'Try again', onClick: retry }
      : fix ? { children: fix.label, onClick: () => { toastManager.close(id); open(fix.to) } } : undefined,
  })
}

export function notifyDone(title: string, description?: string) {
  toastManager.add({ type: 'success', title, description, timeout: 4000 })
}
