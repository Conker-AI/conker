import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { CredentialPhase } from './credential-state'

type FocusOrigin = { source: object; scope: number; owner: string; node: HTMLElement }
export function useCredentialFocus(source: object, scope: number, authStore: GatewayAuthStore, phase: CredentialPhase, target: RefObject<HTMLButtonElement | null>) {
  const operation = useRef<FocusOrigin | null>(null), dialog = useRef<FocusOrigin | null>(null)
  const [closingOrigin, setClosingOrigin] = useState<FocusOrigin | null>(null)
  const binding = useRef({ source, scope, authStore })
  const valid = (origin: FocusOrigin) => {
    const current = binding.current, auth = current.authStore.getState()
    return origin.source === current.source && origin.scope === current.scope && auth.phase === 'authenticated' && !auth.pending && !auth.logoutUnconfirmed && auth.session?.sessionId === origin.owner
  }
  useLayoutEffect(() => {
    binding.current = { source, scope, authStore }
    let observer: MutationObserver | null = null, timer: ReturnType<typeof setTimeout> | null = null
    const stop = () => { observer?.disconnect(); if (timer !== null) clearTimeout(timer); timer = null }
    const restore = () => {
      const origin = operation.current
      if (!origin) { stop(); return }
      if (!valid(origin) || phase === 'inactive') { operation.current = null; stop(); return }
      const containing = origin.node.closest('[role="dialog"][data-state="open"]')
      if ([...document.querySelectorAll('[role="dialog"][data-state="open"]')].some(node => node !== containing)) return
      if (phase === 'awaiting-verification' || phase === 'working') return
      if (document.activeElement === document.body) {
        const destination = origin.node.isConnected ? origin.node : target.current
        if (destination?.isConnected) destination.focus()
      }
      operation.current = null; stop()
    }
    restore()
    if (!operation.current || phase === 'awaiting-verification' || phase === 'working') return
    observer = new MutationObserver(() => {
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(restore, 0)
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return stop
  })
  const capture = () => {
    const owner = authStore.getState().session?.sessionId, node = document.activeElement
    return owner && node instanceof HTMLElement && node !== document.body ? { source, scope, owner, node } : null
  }
  return { operation: () => { operation.current = capture() }, dialog: () => { const origin = capture(); dialog.current = origin; setClosingOrigin(origin) }, closeDialog(event: Event) {
    event.preventDefault()
    if (!closingOrigin || dialog.current !== closingOrigin) return
    dialog.current = null; setClosingOrigin(null)
    if (!valid(closingOrigin) || document.querySelector('[role="dialog"][data-state="open"]')) return
    const active = document.activeElement
    if (active !== document.body && active instanceof HTMLElement && active.isConnected) return
    const destination = closingOrigin.node.isConnected ? closingOrigin.node : target.current
    destination?.focus()
  } }
}
