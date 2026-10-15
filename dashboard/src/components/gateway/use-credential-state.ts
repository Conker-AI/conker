import { useEffect, useMemo } from 'react'
import { useStore } from 'zustand'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { GatewayControlClient } from '@/lib/gateway/control'
import type { HostedProviderId, ProviderCredentialOperation } from '@/lib/gateway/provider-control'
import { createCredentialState } from './credential-state'

export function useCredentialState(client: GatewayControlClient, authStore: GatewayAuthStore) {
  const controller = useMemo(() => createCredentialState({ authStore, read: signal => client.providerCredentials.status(signal), apply: (operation, signal, onDispatch) => client.providerCredentials.apply(operation, signal, onDispatch) }), [client, authStore])
  useEffect(() => controller.start(), [controller])
  const state = useStore(controller.store)
  return { ...state, source: controller, refresh: controller.read,
    apply: (operation: ProviderCredentialOperation) => controller.apply(operation, state.value, state.selected),
    select: (provider: HostedProviderId) => controller.select(provider, state.value),
    setSecret: (value: string) => controller.secret(value, state.selected),
    close: () => controller.close(state.selected),
  }
}
