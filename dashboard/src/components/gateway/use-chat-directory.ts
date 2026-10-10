import { useEffect, useMemo } from 'react'
import { useStore } from 'zustand'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { GatewayRuntimeClient } from '@/lib/gateway/runtime'
import type { GatewayRuntimeWorkspaceState } from './runtime-state'
import type { GatewaySourcePrivacyState } from './source-privacy'
import { useSessionDiscovery } from './session-discovery-context'
import { createChatDirectory } from './chat-directory'

export function useChatDirectory(runtime: GatewayRuntimeClient, auth: GatewayAuthStore, workspace: GatewayRuntimeWorkspaceState, privacy: GatewaySourcePrivacyState) {
  const recent = useSessionDiscovery()
  const directory = useMemo(() => createChatDirectory({ auth, workspace, privacy,
    read: (q, cursor, signal) => runtime.getSessionHistory({ q, cursor, signal }),
    available: () => document.visibilityState === 'visible' && navigator.onLine !== false }), [runtime, auth, workspace, privacy])
  useEffect(() => {
    directory.start()
    const activity = () => directory.recheck()
    window.addEventListener('online', activity); window.addEventListener('offline', activity)
    document.addEventListener('visibilitychange', activity)
    return () => { window.removeEventListener('online', activity); window.removeEventListener('offline', activity); document.removeEventListener('visibilitychange', activity); directory.stop() }
  }, [directory])
  useEffect(() => { if (recent.loaded) directory.noteRecent(recent.rows.filter(row => row.status !== 'forgotten').map(row => row.id)) }, [directory, recent.loaded, recent.rows])
  return { ...useStore(directory.store), setQuery: directory.query, refresh: directory.refresh, older: directory.older }
}
