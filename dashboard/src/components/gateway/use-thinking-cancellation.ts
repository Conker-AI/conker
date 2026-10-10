import { useLayoutEffect, useMemo } from 'react'
import { useStore } from 'zustand'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { GatewayRuntimeClient } from '@/lib/gateway/runtime'
import type { GatewayRuntimeWorkspaceState } from './runtime-state'
import type { GatewaySourcePrivacyState } from './source-privacy'
import { createThinkingCancellation, type ThinkingCancellationContext } from './thinking-cancellation'

type Options = {
  client: GatewayRuntimeClient; authStore: GatewayAuthStore; workspace: GatewayRuntimeWorkspaceState; privacy: GatewaySourcePrivacyState
  context: ThinkingCancellationContext
  apply: (sessionId: string, turnId: string, value: Awaited<ReturnType<GatewayRuntimeClient['getThinking']>>) => void
}
function bindThinkingCancellation(dependencies: Pick<Options, 'client' | 'authStore' | 'workspace' | 'privacy'>) {
  let latest: Options | null = null
  const controller = createThinkingCancellation({ ...dependencies,
    context: () => latest?.context ?? { sessionId: null, turnId: null, working: false, identity: '', epoch: -1, active: false },
    apply: (...args) => latest?.apply(...args) })
  return { ...controller, update: (value: Options) => { latest = value; controller.sync() } }
}

export function useThinkingCancellation(options: Options) {
  const { client, authStore, workspace, privacy } = options
  const control = useMemo(() => bindThinkingCancellation({ client, authStore, workspace, privacy }), [client, authStore, workspace, privacy])
  useLayoutEffect(() => { control.update(options) })
  useLayoutEffect(() => control.start(), [control])
  const state = useStore(control.store)
  return { state, cancel: control.cancel, refresh: control.refresh }
}
