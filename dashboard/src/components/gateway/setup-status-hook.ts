import { useCallback, useEffect, useState } from 'react'
import type { GatewayControlClient, SetupStatus } from '@/lib/gateway/control'

const setupRefreshEvent = 'conker:setup-status-refresh'

export function useGatewaySetupStatus(client: GatewayControlClient, active = true) {
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [error, setError] = useState(false)
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => window.dispatchEvent(new Event(setupRefreshEvent)), [])
  useEffect(() => {
    const update = () => setRevision(value => value + 1)
    window.addEventListener(setupRefreshEvent, update)
    return () => window.removeEventListener(setupRefreshEvent, update)
  }, [])
  useEffect(() => {
    if (!active) return
    if (typeof client.setupStatus !== 'function') {
      let cancelled = false
      queueMicrotask(() => {
        if (!cancelled) { setStatus(null); setError(true) }
      })
      return () => { cancelled = true }
    }
    const controller = new AbortController()
    client.setupStatus(controller.signal).then(value => { setStatus(value); setError(false) }).catch(() => {
      if (!controller.signal.aborted) setError(true)
    })
    return () => controller.abort()
  }, [active, client, revision])
  return { status, error, refresh }
}
