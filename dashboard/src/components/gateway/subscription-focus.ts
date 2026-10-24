import { useLayoutEffect, useRef, type MouseEvent } from 'react'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { SubscriptionPhase } from './subscription-connection'

type ActionFocus = { node: HTMLButtonElement; source: object; owner: string }
export function restoreSubscriptionFocus(action: ActionFocus, source: object, authStore: GatewayAuthStore, target: HTMLButtonElement | null, phase: SubscriptionPhase) {
  const auth = authStore.getState()
  if (action.source !== source || auth.phase !== 'authenticated' || auth.pending || auth.logoutUnconfirmed || auth.session?.sessionId !== action.owner || phase === 'inactive') return true
  if (action.node.isConnected) return phase === 'current'
  if (document.querySelector('[role="dialog"][data-open]')) return false
  if (document.activeElement === document.body && target?.isConnected) target.focus()
  return true
}
export function useSubscriptionActionFocus(source: object, authStore: GatewayAuthStore, phase: SubscriptionPhase) {
  const action = useRef<ActionFocus | null>(null), target = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => { if (action.current && restoreSubscriptionFocus(action.current, source, authStore, target.current, phase)) action.current = null })
  return { target, remember(event: MouseEvent<HTMLButtonElement>) {
    const owner = authStore.getState().session?.sessionId
    action.current = owner && document.activeElement === event.currentTarget ? { node: event.currentTarget, source, owner } : null
  } }
}

