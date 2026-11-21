import { lazy, Suspense, useEffect, useState } from 'react'
import { Check, RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipPopup, TooltipTrigger } from '@/components/ui/tooltip'
import { refresh, type RefreshBlocker } from '@/lib/refresh-store'
import type { RefreshState } from '@/lib/refresh-state'
import { useRefreshState } from './use-refresh'

// Only opened when something is unsaved, so the dialog stays out of the app's first download.
const RefreshConfirm = lazy(() => import('./refresh-confirm').then(module => ({ default: module.RefreshConfirm })))
const DONE_SHOWN_MS = 2500, ERROR_SHOWN_MS = 4000
const LABEL = 'Refresh everything'

const asking: Record<RefreshBlocker, string> = {
  unsaved: 'Something on this page is not saved yet. Refreshing reads everything again and can lose it.',
  dialog: 'A window is open. Refreshing reads everything again and closes it.',
}

function words(state: RefreshState): string {
  if (state.status === 'refreshing') return 'Refreshing…'
  if (state.status === 'error') return 'Couldn’t reach your server. Try again.'
  if (state.status !== 'done') return LABEL
  if (state.note === 'update-unchecked') return 'Refreshed. Couldn’t check for updates.'
  if (state.note === 'update-slow') return 'Refreshed. Still checking for updates.'
  return state.updateFound ? `Refreshed. Update available: ${state.updateFound}` : 'Refreshed. Everything is up to date.'
}

/** Reads everything again and asks the server to look for a new Conker release (owner, 2026-11-21). */
export function RefreshButton() {
  const state = useRefreshState(current => current)
  const [asked, setAsked] = useState<RefreshBlocker | null>(null)
  const { status } = state
  useEffect(() => {
    if (status !== 'done' && status !== 'error') return
    const timer = window.setTimeout(refresh.acknowledge, status === 'done' ? DONE_SHOWN_MS : ERROR_SHOWN_MS)
    return () => window.clearTimeout(timer)
  }, [status, state.lastDoneAt])
  const Icon = status === 'done' ? Check : status === 'error' ? TriangleAlert : RefreshCw
  const click = () => { const needed = refresh.manual(); if (needed) setAsked(needed) }
  const text = words(state)
  return <>
    <Tooltip><TooltipTrigger render={<Button variant="outline" size="icon" aria-label={LABEL} aria-busy={status === 'refreshing'} disabled={status === 'refreshing'} onClick={click} />}>
      <Icon className={status === 'refreshing' ? 'animate-spin motion-reduce:animate-none' : status === 'done' ? 'text-success-foreground' : status === 'error' ? 'text-warning-foreground' : undefined} aria-hidden="true" />
    </TooltipTrigger><TooltipPopup side="right">{text}</TooltipPopup></Tooltip>
    <span role="status" className="sr-only">{status === 'idle' || status === 'refreshing' ? '' : text}</span>
    {asked && <Suspense fallback={null}><RefreshConfirm description={asking[asked]} onCancel={() => setAsked(null)} onConfirm={() => { setAsked(null); refresh.manual(true) }} /></Suspense>}
  </>
}
