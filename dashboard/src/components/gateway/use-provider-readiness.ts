import { useEffect, useMemo } from 'react'
import { useStore } from 'zustand'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { GatewayControlClient } from '@/lib/gateway/control'
import { createProviderReadiness } from './provider-readiness'

export function useProviderReadiness(client: GatewayControlClient, authStore: GatewayAuthStore, refreshKey: number) {
  const controller = useMemo(() => createProviderReadiness({ authStore, read: signal => client.providers(signal) }), [client, authStore])
  useEffect(() => controller.start(), [controller])
  useEffect(() => { void controller.refresh(true) }, [controller, refreshKey])
  return { ...useStore(controller.store), refresh: controller.refresh }
}
