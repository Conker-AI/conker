import { lazy, Suspense, useState } from 'react'
import { useStore } from 'zustand'
import type { GatewayRuntimeClient } from '@/lib/gateway/runtime'
import type { GatewaySourcePrivacyState } from './source-privacy'

const UsageContent = lazy(() => import('./turn-usage-content').then(module => ({ default: module.TurnUsageContent })))
export type TurnUsageProps = { client: GatewayRuntimeClient; turnId: string; sessionId: string; sourcePrivacy: GatewaySourcePrivacyState; active?: boolean; refreshKey?: string }

/** Closing a parent surface unmounts the reader; no hidden or speculative usage fetches. */
export function TurnUsageDisclosure({ active = true, ...props }: TurnUsageProps) {
  const [open, setOpen] = useState(false)
  const forgotten = useStore(props.sourcePrivacy, state => state.sessionIds.includes(props.sessionId))
  if (forgotten) return null
  return <details className="min-w-0 pt-1 text-xs" open={open} onToggle={event => { if (event.target === event.currentTarget) setOpen(event.currentTarget.open) }}>
    <summary className="cursor-pointer rounded-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-ring">Calls &amp; usage</summary>
    {open && active && <Suspense fallback={<p role="status" className="py-3 text-muted-foreground">Loading usage…</p>}><UsageContent key={`${props.sessionId}/${props.turnId}`} {...props} /></Suspense>}
  </details>
}
