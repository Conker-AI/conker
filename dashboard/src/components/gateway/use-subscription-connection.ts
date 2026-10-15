import { useEffect, useMemo } from 'react'
import { useStore } from 'zustand'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import { createSubscriptionConnection, type SubscriptionOptions, type SubscriptionValue } from './subscription-connection'

type Client<T, O> = { status: (signal?: AbortSignal) => Promise<T>; apply: (operation: O, signal?: AbortSignal, onDispatch?: () => void) => Promise<T> }
type Rules<T extends SubscriptionValue, O> = Pick<SubscriptionOptions<T, O>, 'allowed' | 'accept'>
export function useSubscriptionConnection<T extends SubscriptionValue, O>(client: Client<T, O>, authStore: GatewayAuthStore, rules: Rules<T, O>) {
  const controller = useMemo(() => createSubscriptionConnection({ authStore, read: signal => client.status(signal), apply: (operation: O, signal, onDispatch) => client.apply(operation, signal, onDispatch), ...rules,
    eligible: () => document.visibilityState === 'visible' && navigator.onLine,
    subscribeEnvironment(listener) {
      document.addEventListener('visibilitychange', listener); window.addEventListener('online', listener); window.addEventListener('offline', listener)
      return () => { document.removeEventListener('visibilitychange', listener); window.removeEventListener('online', listener); window.removeEventListener('offline', listener) }
    },
  }), [client, authStore, rules])
  useEffect(() => controller.start(), [controller])
  const state = useStore(controller.store)
  return { ...state, source: controller, refresh: controller.read, apply: (operation: O) => controller.apply(operation, state.value) }
}
