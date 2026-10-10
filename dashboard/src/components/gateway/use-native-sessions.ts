import { useLayoutEffect, useMemo } from 'react'
import { useStore } from 'zustand'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { NativeSessionsClient } from '@/lib/gateway/native-sessions'
import { createNativeSessionsState } from './native-sessions-state'
export function useNativeSessions(client: NativeSessionsClient, authStore: GatewayAuthStore) {
  const controller = useMemo(() => createNativeSessionsState({ client, authStore }), [client, authStore])
  useLayoutEffect(() => controller.start(), [controller])
  const state = useStore(controller.store)
  return { ...state, controller }
}
