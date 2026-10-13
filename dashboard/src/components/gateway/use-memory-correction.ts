import { useLayoutEffect, useMemo } from 'react'
import { useStore } from 'zustand'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { GatewayControlClient } from '@/lib/gateway/control'
import type { GatewaySourcePrivacyState } from './source-privacy'
import { createMemoryCorrectionState } from './memory-correction-state'

export function useMemoryCorrection(client: GatewayControlClient, authStore: GatewayAuthStore, sourcePrivacy: GatewaySourcePrivacyState, memoryId: string | null) {
  const controller = useMemo(() => createMemoryCorrectionState({ client: client.memoryCorrections, authStore, sourcePrivacy }), [client, authStore, sourcePrivacy])
  useLayoutEffect(() => controller.start(), [controller])
  useLayoutEffect(() => { controller.select(memoryId) }, [controller, memoryId])
  return { controller, authStore, ...useStore(controller.store) }
}
export type MemoryCorrectionControl = ReturnType<typeof useMemoryCorrection>
