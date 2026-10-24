import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore } from 'zustand'
import type { GatewayOwnerClient } from '@/lib/gateway/owner'
import type { GatewayProposalClient } from '@/lib/gateway/proposals'
import { InboxAttentionContext } from '@/lib/workspace-chrome'
import type { GatewayRuntimeWorkspaceState } from './runtime-state'

/**
 * One read of the Inbox count for the whole shell: decisions waiting for the owner plus open ideas,
 * the same things Home counts. Refreshed on navigation and after chat work.
 */
export function InboxAttentionProvider({ owner, proposals, conversationState, children }: {
  owner: GatewayOwnerClient; proposals: GatewayProposalClient; conversationState: GatewayRuntimeWorkspaceState; children: ReactNode
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
    void Promise.allSettled([owner.listRequests({ limit: 50 }), proposals.list({ signal: controller.signal })]).then(([decisions, ideas]) => {
      if (controller.signal.aborted) return
      if (decisions.status === 'rejected' && ideas.status === 'rejected') { setCount(null); return }
      setCount((decisions.status === 'fulfilled' ? decisions.value.results.filter(row => row.status === 'pending' && row.reviewable).length : 0)
        + (ideas.status === 'fulfilled' ? ideas.value.filter(item => item.state === 'open').length : 0))
    })
  }, [owner, proposals])
  useEffect(() => {
    let cancelled = false
    if (!operation) queueMicrotask(() => { if (!cancelled) refresh() })
    return () => { cancelled = true; request.current?.abort() }
  }, [operation, selected, location.pathname, refresh])
  return <InboxAttentionContext.Provider value={count}>{children}</InboxAttentionContext.Provider>
}
