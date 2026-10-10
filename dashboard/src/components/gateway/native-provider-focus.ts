import { useLayoutEffect, useRef } from 'react'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'

/** Replacing a provider removes its actions; restore only after that change commits. */
export function useNativeProviderFocus(source: object, authStore: GatewayAuthStore, provider: string) {
  const binding = {}
  const lifetime = useRef({ active: false, version: 0, commit: 0, provider, binding }), intent = useRef<{ version: number; owner: string; provider: string } | null>(null)
  useLayoutEffect(() => { lifetime.current.binding = binding })
  useLayoutEffect(() => {
    const current = lifetime.current
    current.active = true; current.version++
    const stop = authStore.subscribe(() => { current.version++; intent.current = null })
    return () => { stop(); current.active = false; current.version++; intent.current = null }
  }, [source, authStore])
  useLayoutEffect(() => {
    lifetime.current.provider = provider
    const commit = ++lifetime.current.commit
    const captured = intent.current
    intent.current = null
    if (!captured || captured.provider !== provider) return
    requestAnimationFrame(() => {
      const auth = authStore.getState(), current = lifetime.current
      if (!current.active || current.commit !== commit || current.version !== captured.version || current.provider !== captured.provider || auth.phase !== 'authenticated' || auth.pending || auth.logoutUnconfirmed || auth.session?.sessionId !== captured.owner) return
      if (document.querySelector('[role="dialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"]')) return
      if (document.activeElement !== document.body && document.activeElement instanceof HTMLElement && document.activeElement.isConnected) return
      const toolbar = document.querySelector('[role="toolbar"][aria-label="Workspace actions"]')
      const target = toolbar?.querySelector<HTMLElement>('[aria-label="Native provider"]') ?? toolbar?.querySelector<HTMLElement>('[aria-label="More workspace actions"]')
      target?.focus()
    })
  }, [provider, source, authStore])
  return {
    changing(next: string) {
      const auth = authStore.getState(), current = lifetime.current
      if (!current.active || current.binding !== binding) return false
      intent.current = null; current.version++
      if (next === current.provider || auth.phase !== 'authenticated' || auth.pending || auth.logoutUnconfirmed || !auth.session?.authenticated) return false
      intent.current = { version: current.version, owner: auth.session.sessionId, provider: next }
      return true
    },
  }
}
