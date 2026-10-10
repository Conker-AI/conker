import { useLayoutEffect, useMemo } from 'react'
import { useStore } from 'zustand'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { CodexSessionsClient } from '@/lib/gateway/codex-sessions'
import { createCodexSessionsState } from './codex-sessions-state'
export function useCodexSessions(client: CodexSessionsClient, authStore: GatewayAuthStore, archived: boolean) {
  const controller = useMemo(() => createCodexSessionsState({ client, authStore, archived }), [client, authStore, archived])
  useLayoutEffect(() => controller.start(), [controller])
  return { ...useStore(controller.store), controller }
}
