import { useCallback, useEffect, useSyncExternalStore } from 'react'
import type { GatewayControlClient } from '@/lib/gateway/control'
import { emptySetupRead, setupStatusStore } from './setup-status-store'

const empty = () => emptySetupRead
const inactive = () => () => undefined

export function useGatewaySetupStatus(client: GatewayControlClient, active = true, refreshOnMount = false) {
  const store = setupStatusStore(client)
  const subscribe = useCallback((listener: () => void) => active ? store.subscribe(listener) : inactive(), [active, store])
  const state = useSyncExternalStore(subscribe, active ? store.getSnapshot : empty, empty)
  useEffect(() => { if (active && refreshOnMount) store.enter() }, [active, refreshOnMount, store])
  return { ...state, refresh: store.refresh }
}
