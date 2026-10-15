import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { GatewayRuntimeClient, RuntimeSessionDetail } from '@/lib/gateway/runtime'
import type { GatewayRuntimeWorkspaceState } from './runtime-state'
import type { GatewaySourcePrivacyState } from './source-privacy'
import { watchRuntimeObservation } from './runtime-observation-watch'

export function useRuntimeObservation({ client, authStore, workspace, privacy, sessionId, active, identity, epoch, version, apply }: {
  client: GatewayRuntimeClient; authStore: GatewayAuthStore; workspace: GatewayRuntimeWorkspaceState; privacy: GatewaySourcePrivacyState
  sessionId: string | null; active: boolean; identity: string; epoch: number
  version: () => number; apply: (detail: RuntimeSessionDetail) => void
}) {
  const latest = useRef({ active, sessionId, identity, epoch, version, apply })
  useLayoutEffect(() => { latest.current = { active, sessionId, identity, epoch, version, apply } })
  const [failed, setFailed] = useState<{ sessionId: string; identity: string; epoch: number; value: boolean } | null>(null)
  const observer = useRef<ReturnType<typeof watchRuntimeObservation> | null>(null)
  useEffect(() => {
    if (!sessionId || !active) return
    let mounted = true
    const available = () => {
      const auth = authStore.getState(), state = workspace.getState(), current = latest.current
      return mounted && current.active && current.sessionId === sessionId && current.identity === identity && current.epoch === epoch && document.visibilityState === 'visible' && navigator.onLine !== false && auth.phase === 'authenticated' && auth.session?.authenticated === true && auth.session.sessionId === identity && !auth.pending && !auth.logoutUnconfirmed && state.selected === sessionId && state.epoch === epoch && !state.operation && !privacy.getState().sessionIds.includes(sessionId)
    }
    const watch = watchRuntimeObservation({ available, version: () => latest.current.version(),
      observe: signal => client.getObservation(sessionId, { signal }), detail: signal => client.getSession(sessionId, { signal }),
      apply: detail => latest.current.apply(detail), forgotten: () => privacy.getState().markForgotten([sessionId]),
      failure: value => setFailed({ sessionId, identity, epoch, value }) })
    observer.current = watch
    const activity = () => available() ? watch.wake() : watch.recheck()
    const unAuth = authStore.subscribe(() => watch.recheck())
    const unWorkspace = workspace.subscribe((value, before) => {
      if (value.selected !== before.selected || value.epoch !== before.epoch || value.operation !== before.operation) watch.recheck()
    })
    const unPrivacy = privacy.subscribe(() => watch.recheck())
    window.addEventListener('focus', activity); window.addEventListener('online', activity); window.addEventListener('offline', activity)
    document.addEventListener('visibilitychange', activity)
    return () => {
      mounted = false; watch.cancel(); if (observer.current === watch) observer.current = null
      unAuth(); unWorkspace(); unPrivacy()
      window.removeEventListener('focus', activity); window.removeEventListener('online', activity); window.removeEventListener('offline', activity)
      document.removeEventListener('visibilitychange', activity)
    }
  }, [client, authStore, workspace, privacy, sessionId, active, identity, epoch])
  const refresh = useCallback(() => observer.current?.wake(), [])
  return { error: Boolean(active && failed?.value && failed.sessionId === sessionId && failed.identity === identity && failed.epoch === epoch), refresh }
}
