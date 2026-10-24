import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { Check, CloudOff, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { connectionStore, watchConnection } from '@/lib/connection-store'

/** Seconds between checks while the server is unreachable (rationale ledger: Reconnect). */
const backoff = [2, 5, 10, 20, 30]
/** How long "Back online" stays (rationale ledger: Back-online note). */
const backOnlineMs = 3000

/**
 * One calm line above the page when the network or the server is gone. It checks again by itself
 * (no countdown), on focus and when the browser comes back online, and confirms when it is back.
 */
export function ConnectionBanner({ probe }: { probe: () => Promise<unknown> }) {
  const online = useStore(connectionStore, state => state.online)
  const gateway = useStore(connectionStore, state => state.gateway)
  const [checking, setChecking] = useState(false)
  const [back, setBack] = useState(false)
  const latestProbe = useRef(probe)
  useEffect(() => { latestProbe.current = probe }, [probe])

  const check = useCallback(async () => {
    setChecking(true)
    try { await latestProbe.current() } catch { /* The transport reports reachability either way. */ } finally { setChecking(false) }
  }, [])

  useEffect(() => {
    watchConnection()
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = connectionStore.subscribe((state, previous) => {
      // The browser says the network is back: ask the server straight away.
      if (state.online && !previous.online && state.gateway === 'unreachable') void check()
      if (state.recoveries !== previous.recoveries) {
        setBack(true)
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => setBack(false), backOnlineMs)
      }
    })
    return () => { unsubscribe(); if (timer) clearTimeout(timer) }
  }, [check])

  const unreachable = online && gateway === 'unreachable'
  useEffect(() => {
    if (!unreachable) return
    let attempt = 0, timer: ReturnType<typeof setTimeout> | null = null
    const schedule = () => { timer = setTimeout(() => { void check().finally(schedule) }, backoff[Math.min(attempt++, backoff.length - 1)] * 1000) }
    const now = () => { if (document.visibilityState === 'visible') void check() }
    schedule()
    window.addEventListener('focus', now)
    document.addEventListener('visibilitychange', now)
    return () => {
      if (timer) clearTimeout(timer)
      timer = null
      window.removeEventListener('focus', now)
      document.removeEventListener('visibilitychange', now)
    }
  }, [unreachable, check])

  if (!online) return <Line icon={<WifiOff className="text-warning-foreground" />} text="You’re offline. Conker reconnects when your connection is back." />
  if (unreachable) return <Line icon={<CloudOff className="text-warning-foreground" />} text={checking ? 'Can’t reach your Conker server. Checking…' : 'Can’t reach your Conker server. Trying again…'}
    action={<Button type="button" size="xs" variant="outline" disabled={checking} onClick={() => void check()}>Retry now</Button>} />
  if (back) return <Line icon={<Check className="text-success-foreground" />} text="Back online." />
  return null
}

function Line({ icon, text, action }: { icon: ReactNode; text: string; action?: ReactNode }) {
  return <div role="status" aria-live="polite" data-slot="connection-banner" className="flex min-h-10 shrink-0 items-center gap-2 border-b bg-muted px-4 py-1.5 text-sm [&_svg]:size-4 [&_svg]:shrink-0">
    {icon}<p className="min-w-0 flex-1">{text}</p>{action}
  </div>
}
