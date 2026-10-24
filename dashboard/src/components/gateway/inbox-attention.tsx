import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore } from 'zustand'
import type { GatewayOwnerClient } from '@/lib/gateway/owner'
import type { GatewayRuntimeWorkspaceState } from './runtime-state'
import { InboxAttentionContext } from '@/lib/workspace-chrome'

/** One read of the Inbox count for the whole shell, refreshed on navigation and after chat work. */
export function InboxAttentionProvider({ owner, conversationState, children }: {
  owner: GatewayOwnerClient; conversationState: GatewayRuntimeWorkspaceState; children: ReactNode
}) {
  const location = useLocation()
  const selected = useStore(conversationState, value => value.selected)
  const operation = useStore(conversationState, value => value.operation)
  const [count, setCount] = useState<number | null>(null)
  const request = useRef<AbortController | null>(null)
  const refresh = useCallback(() => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    owner.listRequests({ limit: 50 }).then(result => {
      if (!controller.signal.aborted) setCount(result.results.filter(row => row.status === 'pending' && row.reviewable).length)
    }).catch(() => { if (!controller.signal.aborted) setCount(null) })
  }, [owner])
  useEffect(() => {
    let cancelled = false
    if (!operation) queueMicrotask(() => { if (!cancelled) refresh() })
    return () => { cancelled = true; request.current?.abort() }
  }, [operation, selected, location.pathname, refresh])
  return <InboxAttentionContext.Provider value={count}>{children}</InboxAttentionContext.Provider>
}
