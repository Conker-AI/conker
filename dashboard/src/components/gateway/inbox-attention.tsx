import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore } from 'zustand'
import type { GatewayOwnerClient } from '@/lib/gateway/owner'
import type { GatewayProposalClient } from '@/lib/gateway/proposals'
import type { AgentNotesClient } from '@/components/inbox/agent-notes'
import type { ChangeRequestsClient } from '@/lib/gateway/change-requests'
import { isDrafting } from '@/lib/gateway/change-request-status'
import type { AsksClient } from '@/lib/gateway/asks'
import type { RecallNoticesClient } from '@/lib/gateway/recall-notices'
import { InboxAttentionContext, InboxBadgeContext } from '@/lib/workspace-chrome'
import { useServerSetting } from '@/settings/server-setting'
import type { GatewayRuntimeWorkspaceState } from './runtime-state'
import { useRefreshState } from './use-refresh'

/**
 * One read of the Inbox count for the whole shell: decisions waiting for the owner, Conker's
 * questions, open ideas and what AI jobs found (a tool still being drafted does not count yet).
 * Refreshed on navigation and after chat work. The badge counts the same items, or only what waits
 * for an answer (decisions, Conker's requests and questions: Inbox's Decisions), or nothing.
 */
export function InboxAttentionProvider({
  owner,
  proposals,
  checks,
  changes,
  asks,
  recall,
  conversationState,
  children,
}: {
  owner: GatewayOwnerClient
  proposals: GatewayProposalClient
  checks?: AgentNotesClient
  changes?: ChangeRequestsClient
  asks?: AsksClient
  recall?: RecallNoticesClient
  conversationState: GatewayRuntimeWorkspaceState
  children: ReactNode
}) {
  const location = useLocation()
  const selected = useStore(conversationState, value => value.selected)
  const operation = useStore(conversationState, value => value.operation)
  const reads = useRefreshState(state => state.reads)
  const [count, setCount] = useState<{ all: number; urgent: number | null } | null>(null)
  const badge = useServerSetting<'all' | 'urgent' | 'off'>('inbox.badge', 'all')
  const request = useRef<AbortController | null>(null)
  const refresh = useCallback(() => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    void Promise.allSettled([
      owner.listRequests({ limit: 50 }),
      proposals.list({ signal: controller.signal }),
      checks ? checks.agentNotes(controller.signal) : Promise.resolve([]),
      changes ? changes.list(controller.signal) : Promise.resolve([]),
      asks ? asks.list(controller.signal) : Promise.resolve([]),
      recall ? recall.list(controller.signal) : Promise.resolve([]),
    ]).then(([decisions, ideas, notes, requests, questions, memories]) => {
      if (controller.signal.aborted) return
      if (decisions.status === 'rejected' && ideas.status === 'rejected') {
        setCount(null)
        return
      }
      const urgent =
        (decisions.status === 'fulfilled' ? decisions.value.results.filter(row => row.status === 'pending' && row.reviewable).length : 0) +
        (requests.status === 'fulfilled' ? requests.value.filter(item => !isDrafting(item)).length : 0) +
        (questions.status === 'fulfilled' ? questions.value.length : 0)
      setCount({
        urgent: decisions.status === 'fulfilled' ? urgent : null,
        all: urgent + (ideas.status === 'fulfilled' ? ideas.value.filter(item => item.state === 'open').length : 0) + (notes.status === 'fulfilled' ? notes.value.length : 0) + (memories.status === 'fulfilled' ? memories.value.length : 0),
      })
    })
  }, [owner, proposals, checks, changes, asks, recall])
  useEffect(() => {
    let cancelled = false
    if (!operation)
      queueMicrotask(() => {
        if (!cancelled) refresh()
      })
    return () => {
      cancelled = true
      request.current?.abort()
    }
  }, [operation, selected, location.pathname, reads, refresh])
  // Urgent only: unknown while decisions did not load, never a guess from the other sources.
  const shown = badge === 'off' || count === null ? null : badge === 'urgent' ? count.urgent : count.all
  return (
    <InboxAttentionContext.Provider value={count?.all ?? null}>
      <InboxBadgeContext.Provider value={shown}>{children}</InboxBadgeContext.Provider>
    </InboxAttentionContext.Provider>
  )
}
