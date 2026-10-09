import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useStore } from 'zustand'
import { Activity, BookOpen, Bot, ChevronLeft, ChevronRight, Clock3, Folder, GitBranch, Inbox, MessageSquare, PanelRight, Pin, Plus, Settings2, X } from 'lucide-react'
import { BaseLayout } from '@/components/layouts/base-layout'
import { Button } from '@/components/ui/button'
import { useSidebar } from '@/components/ui/sidebar'
import type { GatewayRuntimeClient, RuntimeSession, RuntimeSessionDetail } from '@/lib/gateway/runtime'
import type { GatewayRuntimeWorkspaceState } from './runtime-state'
import type { GatewaySourcePrivacyState } from './source-privacy'
import { gatewayError } from '@/lib/gateway/transport'
import { closeTab, moveTab, visitTab, workspaceTab, type WorkspaceTab } from './workspace-tabs'
import '@/styles/connected-workspace.css'

const railItems = [
  { path: '/chats', title: 'Conversations', icon: MessageSquare },
  { path: '/projects', title: 'Projects', icon: Folder },
  { path: '/memory', title: 'Memory', icon: BookOpen },
  { path: '/agents', title: 'Agent studio', icon: Bot },
  { path: '/tools', title: 'Tools & workflows', icon: GitBranch },
  { path: '/jobs', title: 'Schedules', icon: Clock3 },
  { path: '/inbox', title: 'Inbox', icon: Inbox },
]

function WorkspaceRail() {
  const location = useLocation()
  const { setOpen, isMobile, setOpenMobile } = useSidebar()
  return <nav className="conker-mode-rail" aria-label="Workspace modes">
    <Link className="conker-monogram" to="/" aria-label="Conker home">C</Link>
    {railItems.map(({ path, title, icon: Icon }) => <Link key={path} to={path} title={title} aria-label={title} aria-current={location.pathname === path ? 'page' : undefined} onClick={() => { if (isMobile) setOpenMobile(false); else setOpen(true) }}><Icon size={17} /></Link>)}
    <span className="conker-rail-space" />
    <Link to="/activity" title="Activity" aria-label="Activity"><Activity size={17} /></Link>
    <Link to="/settings" title="Settings" aria-label="Settings"><Settings2 size={17} /></Link>
  </nav>
}

function ConversationReference({ detail, error, loading, onClose }: { detail: RuntimeSessionDetail | null; error: string | null; loading: boolean; onClose: () => void }) {
  return <aside className="conker-reference" aria-label="Conversation context">
    <div className="conker-reference-heading"><span>Conversation context</span><Button variant="ghost" size="icon" onClick={onClose} aria-label="Close context"><X size={15} /></Button></div>
    <div className="conker-reference-content">
      {loading ? <p role="status">Loading saved context…</p> : error ? <p role="alert">{error}</p> : !detail ? <p>Open a saved conversation to inspect its model, memory, and recorded work.</p> : <>
        <h2>{detail.title || 'Untitled conversation'}</h2>
        <p>{detail.messages.length} {detail.messages.length === 1 ? 'message' : 'messages'} · {detail.turns.length} {detail.turns.length === 1 ? 'turn' : 'turns'}</p>
        <h3>Memory</h3>
        <p>{detail.memory.configured ? 'Memory service connected' : 'Memory is not configured'}</p>
        <p>{detail.memory.retrieval ? `${detail.memory.retrieval.records} records · ${detail.memory.retrieval.status}` : 'No retrieval evidence for this conversation yet.'}</p>
        {detail.memory.notices.map((notice, index) => <p key={index}>{notice}</p>)}
        <h3>Recorded turns</h3>
        {!detail.turns.length && <p>No completed work yet.</p>}
        {detail.turns.slice(-8).reverse().map(turn => <section key={turn.id} className="conker-receipt">
          <strong>{turn.model || 'Model not recorded'}</strong>
          <p>{turn.status.replaceAll('_', ' ')}{turn.acted ? ' · action recorded' : ''}</p>
          <p>{turn.provider ?? 'Provider unknown'} · {turn.costUsd === null ? 'Cost unknown' : `$${turn.costUsd.toFixed(4)}`}</p>
          {turn.detail && <p>{turn.detail}</p>}
        </section>)}
        <Link to="/memory">Explore memory and sources</Link>
      </>}
    </div>
  </aside>
}

export function ConnectedWorkspaceShell({ children, header, sidebar, runtime, conversationState, sourcePrivacy, badge }: {
  children: ReactNode; header: ReactNode; sidebar: ReactNode; runtime: GatewayRuntimeClient
  conversationState: GatewayRuntimeWorkspaceState; sourcePrivacy: GatewaySourcePrivacyState; badge?: ReactNode
}) {
  const location = useLocation(), navigate = useNavigate()
  const current = workspaceTab(location.pathname, location.search)
  const [tabs, setTabs] = useState<WorkspaceTab[]>(() => current ? [current] : [])
  const [sessions, setSessions] = useState<RuntimeSession[]>([])
  const [referenceOpen, setReferenceOpen] = useState(false)
  const [detail, setDetail] = useState<RuntimeSessionDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const selected = useStore(conversationState, state => state.selected)
  const operation = useStore(conversationState, state => state.operation)
  const forgotten = useStore(sourcePrivacy, state => state.sessionIds)
  const dragged = useRef<string | null>(null)
  const tablist = useRef<HTMLDivElement>(null)
  const activeId = current?.id ?? ''
  useEffect(() => {
    let cancelled = false
    const incoming = workspaceTab(location.pathname, location.search)
    queueMicrotask(() => { if (!cancelled && incoming) setTabs(previous => visitTab(previous, incoming)) })
    return () => { cancelled = true }
  }, [location.pathname, location.search])
  useEffect(() => {
    const controller = new AbortController()
    if (!operation) runtime.listSessions({ signal: controller.signal }).then(value => { if (!controller.signal.aborted) setSessions(value) }).catch(() => undefined)
    return () => controller.abort()
  }, [runtime, operation, selected])
  const referenceSession = current?.sessionId && !forgotten.includes(current.sessionId) ? current.sessionId : null
  useEffect(() => {
    const controller = new AbortController()
    queueMicrotask(() => {
      if (controller.signal.aborted) return
      setDetail(null); setError(null); setLoading(Boolean(referenceOpen && referenceSession))
      if (referenceOpen && referenceSession) runtime.getSession(referenceSession, { signal: controller.signal }).then(value => {
        if (!controller.signal.aborted) setDetail(value)
      }).catch(failure => { if (!controller.signal.aborted) setError(gatewayError(failure).message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    })
    return () => controller.abort()
  }, [runtime, referenceOpen, referenceSession, operation])
  useEffect(() => {
    const list = tablist.current
    if (!list) return
    const revealActive = () => list.querySelector('[aria-selected="true"]')?.parentElement?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const observer = new ResizeObserver(revealActive)
    observer.observe(list)
    revealActive()
    return () => observer.disconnect()
  }, [activeId, tabs])
  const visibleTabs = tabs.filter(tab => !tab.sessionId || !forgotten.includes(tab.sessionId))
  const title = (tab: WorkspaceTab) => tab.sessionId ? sessions.find(session => session.id === tab.sessionId)?.title || tab.title : tab.title
  const go = (href: string) => {
    const url = new URL(href, window.location.origin)
    if (url.pathname === '/chat') conversationState.setState({ selected: url.searchParams.get('session') })
    navigate(href)
  }
  const newChat = () => go('/chat')
  const close = (id: string) => {
    const result = closeTab(visibleTabs, id, activeId)
    setTabs(result.tabs)
    if (result.next) go(result.next)
  }
  return <BaseLayout variant="canvas" className="conker-workspace" rail={<WorkspaceRail />} sidebar={sidebar} header={header}
    beforeHeader={<div className="conker-tabbar">
      <div className="conker-history"><Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Go back"><ChevronLeft /></Button><Button variant="ghost" size="icon" onClick={() => navigate(1)} aria-label="Go forward"><ChevronRight /></Button></div>
      <div className="conker-tabs" ref={tablist} role="tablist" aria-label="Open workspace tabs">
        {visibleTabs.map(tab => <div key={tab.id} className="conker-tab" data-active={tab.id === activeId} draggable onDragStart={() => { dragged.current = tab.id }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (dragged.current) setTabs(previous => moveTab(previous, dragged.current!, tab.id)); dragged.current = null }} onDragEnd={() => { dragged.current = null }}>
          <button type="button" role="tab" aria-controls="conker-workspace-document" aria-selected={tab.id === activeId} tabIndex={tab.id === activeId ? 0 : -1} title={title(tab)} onClick={() => go(tab.href)} onKeyDown={event => {
            const index = visibleTabs.findIndex(value => value.id === tab.id)
            const next = event.key === 'ArrowRight' ? (index + 1) % visibleTabs.length : event.key === 'ArrowLeft' ? (index + visibleTabs.length - 1) % visibleTabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? visibleTabs.length - 1 : null
            if (next !== null) { event.preventDefault(); go(visibleTabs[next].href); (tablist.current?.querySelectorAll('[role="tab"]')[next] as HTMLElement)?.focus() }
            if (event.key === 'Delete') { event.preventDefault(); close(tab.id) }
          }}><BookOpen size={13} /><span>{title(tab)}</span></button>
          <button type="button" className="conker-tab-pin" aria-label={`${tab.pinned ? 'Unpin' : 'Pin'} ${title(tab)}`} aria-pressed={tab.pinned} onClick={() => setTabs(previous => previous.map(value => value.id === tab.id ? { ...value, pinned: !value.pinned } : value))}><Pin size={12} /></button>
          {!tab.pinned && <button type="button" className="conker-tab-close" aria-label={`Close ${title(tab)}`} onClick={() => close(tab.id)}><X size={13} /></button>}
        </div>)}
      </div>
      <Button variant="ghost" size="icon" onClick={newChat} aria-label="New conversation"><Plus /></Button>
      <Button variant="ghost" size="icon" onClick={() => setReferenceOpen(value => !value)} aria-label="Toggle conversation context" aria-expanded={referenceOpen}><PanelRight /></Button>
    </div>}
    footer={<footer className="conker-statusbar"><span><span className="conker-local-dot" />{badge ? 'Demo workspace' : 'Connected workspace'}</span><span>{operation ? 'Conversation in progress' : 'Ready'} · <Link to="/system">Service status</Link></span><span className="conker-shortcuts">Ctrl K search · Ctrl B sidebar</span></footer>}
    reference={referenceOpen ? <ConversationReference detail={referenceSession && detail?.id === referenceSession ? detail : null} error={error} loading={loading} onClose={() => setReferenceOpen(false)} /> : null}>
    <div id="conker-workspace-document" role="tabpanel" aria-label={current ? title(current) : 'Workspace'} className="flex min-h-0 flex-1 flex-col">{children}</div>
  </BaseLayout>
}
