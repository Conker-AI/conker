import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useStore } from 'zustand'
import { BookOpen, BriefcaseBusiness, ChevronDown, ChevronRight, CircleDashed, History, Library, LogOut, Moon, Search, Settings2, SquarePen, Sun } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarTrigger,
  SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from '@/components/ui/sidebar'
import { useCircularTransition } from '@/hooks/use-circular-transition'
import { useTheme } from '@/hooks/use-theme'
import { UniversalSearchContext } from '@/lib/workspace-chrome'
import type { GatewayOwnerClient } from '@/lib/gateway/owner'
import type { GatewayControlClient } from '@/lib/gateway/control'
import type { GatewayRuntimeWorkspaceState } from './runtime-state'
import { maskForgottenSession, type GatewaySourcePrivacyState } from './source-privacy'
import { gatewayDestinations, gatewayPageNavigation, type GatewayDestination } from './navigation'
import { OwnerAvatar } from './owner-avatar'
import { useOwnerProfile } from '@/lib/owner-profile'
import { summarizeSetup } from './setup-presentation'
import { useGatewaySetupStatus } from './setup-status-hook'
import { useSessionDiscovery } from './session-discovery-context'

function Destination({ item, active, onNavigate, count }: { item: GatewayDestination; active: boolean; onNavigate: () => void; count?: number | null }) {
  return <SidebarMenuItem>
    <SidebarMenuButton isActive={active} className="conker-nav-item" render={<Link to={item.path} aria-current={active ? 'page' : undefined} onClick={onNavigate} />}><span>{item.title}</span></SidebarMenuButton>
    {!!count && <SidebarMenuBadge aria-label={`${count} waiting for review`} className="conker-attention-count">{count}</SidebarMenuBadge>}
  </SidebarMenuItem>
}

/** Conversation history owns the space; work and resources stay one disclosure away. */
export function GatewayChatSidebar({ owner, control, conversationState, sourcePrivacy, onSignOut, badge }: {
  owner: GatewayOwnerClient; control: GatewayControlClient; conversationState: GatewayRuntimeWorkspaceState
  sourcePrivacy: GatewaySourcePrivacyState; onSignOut: () => void; badge?: ReactNode
}) {
  const navigate = useNavigate(), location = useLocation(), { isMobile, setOpenMobile } = useSidebar()
  const page = gatewayPageNavigation(location.pathname, location.search)
  const openSearch = useContext(UniversalSearchContext)
  const { toggleTheme } = useCircularTransition(), { theme } = useTheme()
  const isDark = theme === 'dark' || (theme !== 'light' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const selected = useStore(conversationState, value => value.selected)
  const operation = useStore(conversationState, value => value.operation)
  const forgotten = useStore(sourcePrivacy, value => value.sessionIds)
  const { rows: sessions, loaded, error, refresh } = useSessionDiscovery()
  const [pendingApprovals, setPendingApprovals] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<Partial<Record<'work' | 'library', boolean>>>({})
  const [profileOpen, setProfileOpen] = useState(false)
  const profile = useOwnerProfile()
  const { status: setupStatus, error: setupError } = useGatewaySetupStatus(control)
  const setupSummary = setupStatus && setupStatus.state !== 'complete' ? summarizeSetup(setupStatus) : null
  const request = useRef<AbortController | null>(null)

  const refreshApprovals = useCallback(() => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    owner.listRequests({ limit: 50 }).then(result => {
      if (!controller.signal.aborted) setPendingApprovals(result.results.filter(row => row.status === 'pending' && row.reviewable).length)
    }).catch(() => { if (!controller.signal.aborted) setPendingApprovals(null) })
  }, [owner])
  useEffect(() => {
    let cancelled = false
    if (!operation) queueMicrotask(() => { if (!cancelled) refreshApprovals() })
    return () => { cancelled = true; request.current?.abort() }
  }, [operation, selected, location.pathname, refreshApprovals])
  const afterNavigate = useCallback(() => { if (isMobile) setOpenMobile(false, 'content') }, [isMobile, setOpenMobile])
  const newChat = useCallback(() => {
    conversationState.setState({ selected: null }); navigate('/chat'); afterNavigate()
  }, [conversationState, navigate, afterNavigate])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!event.isComposing && (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'o') { event.preventDefault(); newChat() }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [newChat])

  const visible = sessions
    .map(session => forgotten.includes(session.id) ? maskForgottenSession(session) : session)
    .filter(session => session.status !== 'forgotten')
    .slice(0, 24)
  const onChat = page.route === 'chat'
  const group = (id: 'work' | 'library') => {
    const active = page.destination?.group === id
    const open = expanded[id] ?? active
    const Icon = id === 'work' ? BriefcaseBusiness : Library
    return <Collapsible key={id} open={open} onOpenChange={value => setExpanded({ work: id === 'work' && value, library: id === 'library' && value })} render={<SidebarMenuItem />}>
        <CollapsibleTrigger render={<SidebarMenuButton className="conker-nav-item" isActive={active && !open} />}>
          <Icon aria-hidden="true" /><span>{id === 'work' ? 'Work' : 'Library'}</span>
          {id === 'work' && !!pendingApprovals && <span className="conker-inline-count" aria-label={`${pendingApprovals} waiting for review`}>{pendingApprovals}</span>}
          <ChevronRight className={`ml-auto size-4 transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="conker-nav-group"><SidebarMenu>
          {gatewayDestinations.filter(item => item.group === id).map(item => <Destination key={item.id} item={item} active={page.destination?.id === item.id} onNavigate={afterNavigate} count={item.id === 'inbox' ? pendingApprovals : undefined} />)}
        </SidebarMenu></CollapsibleContent>
      </Collapsible>
  }

  return <Sidebar variant="sidebar" collapsible="offcanvas" className="conker-sidebar">
    <SidebarHeader className="conker-sidebar-header">
      <div className="conker-brand-row">
        <Link to="/chat" aria-label="Open Conker chat" onClick={afterNavigate} className="conker-wordmark"><img src="/conker.png" alt="" width="28" height="28" />Conker</Link>
        <span className="ml-auto">{badge}</span>
        <SidebarTrigger className="text-muted-foreground" aria-label="Collapse sidebar" title="Collapse sidebar" />
      </div>
      <SidebarMenu>
        <SidebarMenuItem><SidebarMenuButton onClick={newChat} className="conker-new-chat"><SquarePen aria-hidden="true" /><span>New chat</span><kbd className="conker-key-hint" aria-hidden="true">Ctrl ⇧ O</kbd></SidebarMenuButton></SidebarMenuItem>
        <SidebarMenuItem><SidebarMenuButton className="conker-nav-item" disabled={!openSearch} onClick={event => openSearch?.('', event.currentTarget)}><Search aria-hidden="true" /><span>Search Conker</span><kbd className="conker-key-hint" aria-hidden="true">Ctrl K</kbd></SidebarMenuButton></SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
    <SidebarContent className="conker-sidebar-content">
      <SidebarGroup className="conker-destinations" role="navigation" aria-label="Conker navigation"><SidebarMenu>
        {group('work')}
        <SidebarMenuItem><SidebarMenuButton className="conker-nav-item" isActive={page.route === 'memory'} render={<Link to="/memory" onClick={afterNavigate} aria-current={page.route === 'memory' ? 'page' : undefined} />}><BookOpen aria-hidden="true" /><span>Memory</span></SidebarMenuButton></SidebarMenuItem>
        {group('library')}
      </SidebarMenu></SidebarGroup>
      <SidebarGroup className="conker-chat-history">
        <div className="conker-history-heading"><span>Recent chats</span><Link to="/chats" onClick={afterNavigate} aria-label="View all chats" aria-current={page.route === 'chats' ? 'page' : undefined}><History aria-hidden="true" /><span>View all</span></Link></div>
        <div className="conker-history-list" aria-label="Recent chats" aria-busy={!loaded && !error}>
          <SidebarMenu>{visible.map(session => <SidebarMenuItem key={session.id}>
            <SidebarMenuButton className="conker-chat-link" isActive={onChat && session.id === selected} render={<Link to={`/chat?session=${encodeURIComponent(session.id)}`} onClick={afterNavigate} aria-current={onChat && session.id === selected ? 'page' : undefined} title={session.title || 'Untitled chat'} />}><span className="truncate">{session.title || 'Untitled chat'}</span></SidebarMenuButton>
          </SidebarMenuItem>)}</SidebarMenu>
          {!loaded && !error && <p role="status" className="conker-sidebar-note">Loading your chats…</p>}
          {loaded && !error && !visible.length && <p className="conker-sidebar-note">Start a conversation. You can return to it here.</p>}
          {error && <div role="status" className="conker-sidebar-note"><p>Couldn’t refresh your chats.</p><button type="button" className="mt-2 underline underline-offset-4 hover:text-foreground" onClick={() => void refresh()}>Try again</button></div>}
        </div>
      </SidebarGroup>
    </SidebarContent>
    <SidebarFooter className="conker-sidebar-footer"><SidebarMenu>
      {(setupSummary || setupError) && <SidebarMenuItem><SidebarMenuButton className="conker-setup-link" isActive={page.route === 'setup'} render={<Link to="/setup" onClick={afterNavigate} />}>
        <CircleDashed aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block truncate font-medium">{setupError ? 'Review setup status' : setupSummary?.attention ? 'Setup needs attention' : 'Finish setup'}</span><span className="block truncate text-xs text-muted-foreground">{setupError ? 'Status unavailable' : setupSummary && setupStatus ? `${setupSummary.resolved} of ${setupStatus.steps.length} steps resolved` : 'Checking setup…'}</span></span><ChevronRight aria-hidden="true" />
      </SidebarMenuButton></SidebarMenuItem>}
      <SidebarMenuItem><SidebarMenuButton className="conker-nav-item" isActive={page.route === 'settings'} render={<Link to="/settings" onClick={afterNavigate} />}><Settings2 aria-hidden="true" /><span>Settings</span></SidebarMenuButton></SidebarMenuItem>
      <SidebarMenuItem><DropdownMenu open={profileOpen} onOpenChange={setProfileOpen}><DropdownMenuTrigger render={<SidebarMenuButton className="conker-profile" />}><OwnerAvatar /><span className="min-w-0 flex-1 truncate">{profile.name}</span><ChevronDown className="size-4 text-muted-foreground" /></DropdownMenuTrigger><DropdownMenuContent side="top" align="start" className="w-(--anchor-width) min-w-52">
        <DropdownMenuItem render={<Link to="/settings/companion" onClick={afterNavigate} />}>Customize companion</DropdownMenuItem>
        <DropdownMenuItem render={<Link to="/settings?tab=providers" onClick={afterNavigate} />}>Providers &amp; models</DropdownMenuItem>
        <DropdownMenuItem render={<Link to="/system" onClick={afterNavigate} />}>System &amp; diagnostics</DropdownMenuItem>
        <DropdownMenuItem render={<Link to="/setup" onClick={afterNavigate} />}>Setup &amp; readiness</DropdownMenuItem>
        <DropdownMenuItem onClick={event => toggleTheme(event)}>{isDark ? <Sun /> : <Moon />}{isDark ? 'Light mode' : 'Dark mode'}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut}><LogOut />Sign out</DropdownMenuItem>
      </DropdownMenuContent></DropdownMenu></SidebarMenuItem>
    </SidebarMenu></SidebarFooter>
  </Sidebar>
}
