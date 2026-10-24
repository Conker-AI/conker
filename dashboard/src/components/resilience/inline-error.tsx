import { useEffect, useRef, useState } from 'react'
import { CircleAlert, RotateCcw, TriangleAlert } from 'lucide-react'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { connectionStore } from '@/lib/connection-store'
import { GatewayError } from '@/lib/gateway/transport'
import { cn } from '@/lib/utils'
import { CopyErrorDetails } from './error-fallbacks'
import { failureTitle, loadFailureDescription, retryableKinds } from './error-details'

/**
 * A failed load shown where the content would be: what happened, why, and a next step.
 * Reads refresh by themselves once the server is reachable again; writes never retry silently
 * (pass `retryOnReconnect={false}` and say the outcome is unknown instead).
 */
export function InlineError({ error, onRetry, title, description, retryOnReconnect = true, className }: {
  error: unknown; onRetry?: () => unknown; title?: string; description?: string; retryOnReconnect?: boolean; className?: string
}) {
  const failure = error instanceof GatewayError ? error : null
  const [busy, setBusy] = useState(false)
  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false }, [])
  const retry = async () => {
    if (!onRetry || busy) return
    setBusy(true)
    try { await onRetry() } catch { /* The caller shows the new failure. */ } finally { if (mounted.current) setBusy(false) }
  }
  const canRetry = !!onRetry && (!failure || retryableKinds.has(failure.kind))
  const latestRetry = useRef(retry)
  useEffect(() => { latestRetry.current = retry })
  const refreshOnRecovery = retryOnReconnect && canRetry && (!failure || failure.kind === 'network' || failure.kind === 'dependency')
  useEffect(() => {
    if (!refreshOnRecovery) return
    return connectionStore.subscribe((state, previous) => { if (state.recoveries !== previous.recoveries) void latestRetry.current() })
  }, [refreshOnRecovery])
  const unknownOutcome = failure?.kind === 'aborted' || failure?.kind === 'session-changed'
  return <Alert variant={unknownOutcome ? 'warning' : 'error'} className={cn('min-w-0', className)}>
    {unknownOutcome ? <TriangleAlert /> : <CircleAlert />}
    <AlertTitle>{title ?? failureTitle(error)}</AlertTitle>
    <AlertDescription>
      <p>{description ?? loadFailureDescription(error)}</p>
      {error != null && <details className="text-xs">
        <summary className="w-fit cursor-pointer select-none rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">Details</summary>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{failure ? `${failure.kind}${failure.status ? ` · HTTP ${failure.status}` : ''}` : 'browser error'}</span>
          <CopyErrorDetails error={error} size="sm" />
        </div>
      </details>}
    </AlertDescription>
    {canRetry && <AlertAction>
      <Button type="button" size="sm" variant="outline" loading={busy} onClick={() => void retry()}><RotateCcw />Try again</Button>
    </AlertAction>}
  </Alert>
}
