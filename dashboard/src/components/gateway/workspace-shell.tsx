import { useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore } from 'zustand'
import { X } from 'lucide-react'
import { LayoutFrame } from '@/components/layouts/layout-frame'
import { Button } from '@/components/ui/button'
import { DetailPanel } from '@/components/design-system/overlays'
import { useIsMobile } from '@/hooks/use-mobile'
import type { GatewayRuntimeClient, RuntimeSessionDetail } from '@/lib/gateway/runtime'
import { ConversationViewContent } from './conversation-views'
import { conversationViewLabel, type ConversationView } from './conversation-view-list'
import type { GatewayRuntimeWorkspaceState } from './runtime-state'
import type { GatewaySourcePrivacyState } from './source-privacy'
import { gatewayError } from '@/lib/gateway/transport'
import { ConnectedShellContext } from './workspace-shell-context'
import { resolveGatewayRoute } from './navigation'
import '@/styles/connected-workspace.css'

export function ConnectedWorkspaceShell({ children, header, sidebar, runtime, conversationState, sourcePrivacy }: {
  children: ReactNode; header: ReactNode; sidebar: ReactNode; runtime: GatewayRuntimeClient
  conversationState: GatewayRuntimeWorkspaceState; sourcePrivacy: GatewaySourcePrivacyState; badge?: ReactNode
}) {
  const location = useLocation()
  const [openView, setOpenView] = useState<ConversationView | null>(null)
  const [referenceRetry, setReferenceRetry] = useState(0)
  const [detail, setDetail] = useState<RuntimeSessionDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const operation = useStore(conversationState, state => state.operation)
  const forgotten = useStore(sourcePrivacy, state => state.sessionIds)
  const isMobile = useIsMobile()
  const onChat = resolveGatewayRoute(location.pathname) === 'chat'
  const view = onChat ? openView : null
  const contextOpen = view !== null
  const requested = onChat ? new URLSearchParams(location.search).get('session') : null
  const referenceSession = requested && /^[A-Za-z0-9_-]{1,128}$/.test(requested) && !forgotten.includes(requested) ? requested : null
  useEffect(() => {
    const controller = new AbortController()
    queueMicrotask(() => {
      if (controller.signal.aborted) return
      setDetail(null); setError(null); setLoading(Boolean(contextOpen && referenceSession))
      if (contextOpen && referenceSession) runtime.getSession(referenceSession, { signal: controller.signal }).then(value => {
        if (!controller.signal.aborted) setDetail(value)
      }).catch(failure => { if (!controller.signal.aborted) setError(gatewayError(failure).message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    })
    return () => controller.abort()
  }, [runtime, contextOpen, referenceSession, operation, referenceRetry])
  const reference = view && <ConversationViewContent view={view} runtime={runtime} sourcePrivacy={sourcePrivacy} active={contextOpen} detail={referenceSession && detail?.id === referenceSession ? detail : null} error={error} loading={loading} onRetry={() => setReferenceRetry(value => value + 1)} />
  const viewLabel = view ? conversationViewLabel(view) : ''
  const closeReference = () => { const closing = view; setOpenView(null); if (closing) document.querySelector<HTMLButtonElement>(`[data-conversation-view="${closing}"]`)?.focus() }
  return <ConnectedShellContext.Provider value={{ view, toggleView: (next: ConversationView) => setOpenView(value => value === next ? null : next), showViews: onChat }}>
  <LayoutFrame variant="canvas" className="conker-workspace" sidebar={sidebar} header={header}
    reference={contextOpen && !isMobile ? <aside className="conker-reference" aria-label={viewLabel} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); closeReference() } }}><div className="conker-reference-heading"><h2>{viewLabel}</h2><Button variant="ghost" size="icon" onClick={closeReference} aria-label={`Close ${viewLabel}`}><X /></Button></div>{reference}</aside> : null}>
    <div id="conker-workspace-document" className="flex min-h-0 flex-1 flex-col">{children}</div>
  </LayoutFrame>
  {isMobile && <DetailPanel open={contextOpen} onOpenChange={open => { if (!open) setOpenView(null) }} title={viewLabel} description="Saved records for this chat.">{reference}</DetailPanel>}
  </ConnectedShellContext.Provider>
}
