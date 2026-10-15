import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { GatewayRuntimeClient } from '@/lib/gateway/runtime'
import type { GatewaySourcePrivacyState } from './source-privacy'
import { watchMemoryDelivery, type MemoryDeliveryWatchState } from './memory-delivery-watch'

export function useMemoryDelivery({ client, authStore, privacy, sessionId, messageKey, active, identity, epoch, selected }: {
  client: GatewayRuntimeClient; authStore: GatewayAuthStore; privacy: GatewaySourcePrivacyState
  sessionId: string | null; messageKey: string; active: boolean; identity: string; epoch: number; selected: () => string | null
}) {
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState === 'visible')
  const [cycle, setCycle] = useState(0)
  const key = `${identity}:${epoch}:${sessionId}:${messageKey}:${active}:${pageVisible}:${cycle}`
  const [lifetime, setLifetime] = useState({ key, version: 0 })
  if (lifetime.key !== key) setLifetime({ key, version: lifetime.version + 1 })
  const scope = `${key}:${lifetime.version}`
  const latest = useRef({ scope, active })
  useLayoutEffect(() => { latest.current = { scope, active } }, [scope, active])
  const [value, setValue] = useState<{ scope: string; state: MemoryDeliveryWatchState } | null>(null)
  const watch = useRef<ReturnType<typeof watchMemoryDelivery> | null>(null)
  useEffect(() => {
    const visibility = () => setPageVisible(document.visibilityState === 'visible')
    const refresh = () => { if (document.visibilityState === 'visible') setCycle(value => value + 1) }
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('focus', refresh); window.addEventListener('online', refresh)
    return () => { document.removeEventListener('visibilitychange', visibility); window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh) }
  }, [])
  useEffect(() => {
    if (!sessionId || !active || !pageVisible || !messageKey) return
    const available = () => {
      const auth = authStore.getState()
      return latest.current.scope === scope && latest.current.active && document.visibilityState === 'visible' && auth.phase === 'authenticated' && auth.session?.authenticated === true && auth.session.sessionId === identity && !auth.pending && !auth.logoutUnconfirmed && selected() === sessionId && !privacy.getState().sessionIds.includes(sessionId)
    }
    const current = watchMemoryDelivery({ available, read: (signal, messageId) => client.getMemoryDelivery(sessionId, { signal, messageId }),
      publish: state => setValue({ scope, state }), forgotten: () => privacy.getState().markForgotten([sessionId]) })
    watch.current = current
    return () => { current.cancel(); if (watch.current === current) watch.current = null }
  }, [client, authStore, privacy, sessionId, messageKey, active, pageVisible, identity, selected, scope])
  const refresh = useCallback((messageId: string) => { watch.current?.refresh(messageId) }, [])
  return { state: value?.scope === scope ? value.state : null, refresh }
}
