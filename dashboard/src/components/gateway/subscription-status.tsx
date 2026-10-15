import type { Ref } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SubscriptionPhase } from './subscription-connection'

export function SubscriptionRefresh({ phase, paused, refresh, focusRef }: { phase: SubscriptionPhase; paused: boolean; refresh: () => Promise<boolean>; focusRef?: Ref<HTMLButtonElement> }) {
  const busy = phase === 'checking' || phase === 'awaiting-verification' || phase === 'working'
  return <Button ref={focusRef} variant="ghost" size="sm" className="aria-disabled:opacity-50" disabled={phase === 'inactive'} aria-disabled={busy} aria-busy={busy} onClick={() => { if (!busy && phase !== 'inactive') void refresh() }}><RefreshCw />{phase === 'checking' ? 'Checking…' : phase === 'uncertain' || phase === 'unavailable' || paused ? 'Check status' : 'Refresh'}</Button>
}

export function SubscriptionFeedback({ phase, uncertain, pollingPaused, notice }: { phase: SubscriptionPhase; uncertain: boolean; pollingPaused: boolean; notice: 'read' | 'not-started' | 'paused' | null }) {
  const copy = phase === 'checking' ? 'Checking current connection status…' : phase === 'awaiting-verification' ? 'Waiting for owner verification. The operation has not been sent.' : phase === 'working' ? 'Waiting for the provider operation to finish. This can take about a minute; you can keep using Conker.' : phase === 'uncertain' ? 'The operation’s outcome was not confirmed. Check status before trying another action; authorization may have changed.' : phase === 'unavailable' ? notice === 'not-started' ? 'The operation could not be started. Check the current status before continuing.' : notice === 'paused' ? 'Status checks are paused while this page is hidden or offline. Check status when connected.' : 'Connection status is unavailable. Check status before continuing; this does not mean authorization was removed.' : phase === 'inactive' ? 'Sign in to Conker to check this connection.' : null
  return <>
    {copy && <p role="status" className="text-sm leading-6 text-muted-foreground">{copy}</p>}
    {phase === 'current' && uncertain && <p role="status" className="text-xs leading-5 text-muted-foreground">Current status is shown below. The earlier operation’s outcome was not confirmed.</p>}
    {phase === 'current' && pollingPaused && <p role="status" className="text-xs text-muted-foreground">Automatic sign-in checks have paused. Use Check status to continue.</p>}
  </>
}
