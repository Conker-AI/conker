import { useEffect } from 'react'
import { useStore } from 'zustand'
import type { GatewayControlClient } from '@/lib/gateway/control'
import { refreshState, type RefreshState } from '@/lib/refresh-state'
import { setupRefreshEvent } from './setup-status-store'
import type { GatewayRuntimeWorkspaceState } from './runtime-state'

export function useRefreshState<T>(select: (state: RefreshState) => T): T {
  return useStore(refreshState, select)
}

/**
 * Connects "Refresh everything" to the signed-in workspace: one look at entry, one when the owner
 * comes back after a while. The logic loads on its own, after the first screen; entry waits a tick so
 * React's double mount in development starts one run.
 */
export function useRefreshWiring(control: GatewayControlClient, conversationState: GatewayRuntimeWorkspaceState) {
  useEffect(() => {
    let stop: () => void = () => undefined,
      cancelled = false
    const timer = window.setTimeout(() => {
      void Promise.all([import('@/lib/refresh-store'), import('@/components/resilience/notify')])
        .then(([{ refresh }, { notifyAction }]) => {
          if (cancelled) return
          const unbind = refresh.bind({
            checkUpdate: signal => control.hostOps.checkUpdate(signal),
            listUpdates: signal => control.updates.list(signal),
            probe: signal => control.gatewayHealth(signal),
            busy: () => {
              const work = conversationState.getState()
              return !!work.operation || !!work.turnCheck || Object.keys(work.uncertain).length > 0
            },
            onUpdateFound: version => notifyAction(`Update available: ${version}`, 'View', '/inbox'),
            onNewBuild: () => notifyAction('A new version of Conker is ready', 'Reload', null, () => window.location.reload()),
          })
          const away = refresh.watchReturn()
          stop = () => {
            away()
            unbind()
          }
          void refresh.enter()
        })
        .catch(() => undefined)
    }, 0)
    // The setup readers listen for this event instead of the store.
    const setup = refreshState.subscribe((state, before) => {
      if (state.reads !== before.reads) window.dispatchEvent(new Event(setupRefreshEvent))
    })
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      setup()
      stop()
    }
  }, [control, conversationState])
}
