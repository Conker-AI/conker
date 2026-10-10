import { useEffect, useMemo, type ReactNode } from 'react'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { GatewayRuntimeClient } from '@/lib/gateway/runtime'
import type { GatewayRuntimeWorkspaceState } from './runtime-state'
import type { GatewaySourcePrivacyState } from './source-privacy'
import { createSessionDiscovery } from './session-discovery'
import { SessionDiscoveryContext } from './session-discovery-context'

export function SessionDiscoveryProvider({ runtime, authStore, workspace, privacy, children }: {
  runtime: GatewayRuntimeClient; authStore: GatewayAuthStore; workspace: GatewayRuntimeWorkspaceState
  privacy: GatewaySourcePrivacyState; children: ReactNode
}) {
  const discovery = useMemo(() => createSessionDiscovery({ read: signal => runtime.listSessions({ signal }), auth: authStore, workspace, privacy,
    available: () => document.visibilityState === 'visible' && navigator.onLine !== false }), [runtime, authStore, workspace, privacy])
  useEffect(() => {
    discovery.start()
    const activity = () => discovery.wake()
    window.addEventListener('focus', activity); window.addEventListener('online', activity); window.addEventListener('offline', activity)
    document.addEventListener('visibilitychange', activity)
    return () => {
      window.removeEventListener('focus', activity); window.removeEventListener('online', activity); window.removeEventListener('offline', activity)
      document.removeEventListener('visibilitychange', activity); discovery.stop()
    }
  }, [discovery])
  return <SessionDiscoveryContext.Provider value={discovery}>{children}</SessionDiscoveryContext.Provider>
}
