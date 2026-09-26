import { useSidebarConfig } from '@/hooks/use-sidebar-config'
import { AppSidebar } from '@/components/app-sidebar'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useStore } from 'zustand'
import { LogOut, MessageCircle, SquarePen } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import {
  SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarInput,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from '@/components/ui/sidebar'
import type { GatewayRuntimeClient, RuntimeSession } from '@/lib/gateway/runtime'
import type { GatewayOwnerClient } from '@/lib/gateway/owner'
import type { GatewayRuntimeWorkspaceState } from './runtime-state'
import { maskForgottenSession, type GatewaySourcePrivacyState } from './source-privacy'

/** Live conversation data extends the same application sidebar on every route. */
export function GatewayChatSidebar({ runtime, owner, conversationState, sourcePrivacy, onSignOut, badge }: {
  runtime: GatewayRuntimeClient; owner: GatewayOwnerClient; conversationState: GatewayRuntimeWorkspaceState
  sourcePrivacy: GatewaySourcePrivacyState; onSignOut: () => void; badge?: ReactNode
}) {
  const { config } = useSidebarConfig()
  const navigate = useNavigate(), location = useLocation(), { isMobile, setOpenMobile } = useSidebar()
  const selected = useStore(conversationState, value => value.selected)
  const operation = useStore(conversationState, value => value.operation)
  const forgotten = useStore(sourcePrivacy, value => value.sessionIds)
  const [sessions, setSessions] = useState<RuntimeSession[]>([])
  const [pendingApprovals, setPendingApprovals] = useState(0)
  const [loadFailed, setLoadFailed] = useState(false)
  const [query, setQuery] = useState('')
  const generation = useRef(0)

  const refresh = useCallback(() => {
    const id = ++generation.current
    // A failed load is said out loud; an empty list would claim there are no chats.
    runtime.listSessions().then(rows => { if (id === generation.current) { setSessions(rows); setLoadFailed(false) } }).catch(() => { if (id === generation.current) setLoadFailed(true) })
    owner.listRequests({ limit: 50 }).then(page => { if (id === generation.current) setPendingApprovals(page.results.filter(row => row.status === 'pending' && row.reviewable).length) }).catch(() => undefined)
  }, [runtime, owner])
  // Reload after a send or creation settles, and when the selection changes.
  useEffect(() => { if (!operation) queueMicrotask(refresh) }, [operation, selected, refresh])
  const newChat = useCallback(() => { conversationState.setState({ selected: null }); navigate('/chat'); if (isMobile) setOpenMobile(false) }, [conversationState, navigate, isMobile, setOpenMobile])
  // Ctrl/Cmd+Shift+O starts a new chat from anywhere; Ctrl+K stays page search.
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'o') { event.preventDefault(); newChat() } }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [newChat])

  const visible = sessions
    .map(session => forgotten.includes(session.id) ? maskForgottenSession(session) : session)
    .filter(session => session.status !== 'forgotten' && (session.title || 'New chat').toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const onChat = ['/chat', '/chats', '/companion'].includes(location.pathname)
  const closeMobile = () => { if (isMobile) setOpenMobile(false) }

  return <AppSidebar
    variant={config.variant} collapsible={config.collapsible} side={config.side}
    ownerName="You" ownerDescription="Signed in" inboxCount={pendingApprovals}
    headerBadge={badge}
    headerActions={<SidebarMenu><SidebarMenuItem>
      <SidebarMenuButton onClick={newChat} tooltip="New chat (Ctrl/Cmd+Shift+O)">
        <SquarePen /><span>New chat</span>
      </SidebarMenuButton>
    </SidebarMenuItem></SidebarMenu>}
    accountFooter={<DropdownMenuItem onSelect={onSignOut}><LogOut />Sign out</DropdownMenuItem>}
  >
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Recent chats</SidebarGroupLabel>
      <SidebarGroupContent className="space-y-2">
        <SidebarInput aria-label="Search chats" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search chats" />
        <SidebarMenu>
          {visible.map(session => <SidebarMenuItem key={session.id}>
            <SidebarMenuButton asChild isActive={onChat && session.id === selected}>
              <Link to={`/chat?session=${encodeURIComponent(session.id)}`} onClick={closeMobile}>
                <MessageCircle /><span className="truncate">{session.title || 'New chat'}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>)}
        </SidebarMenu>
        {loadFailed ? <div role="alert" className="space-y-2 px-2 py-2 text-sm text-muted-foreground"><p>Couldn’t load your chats.</p><button type="button" className="underline underline-offset-4 hover:text-foreground" onClick={refresh}>Try again</button></div>
          : !visible.length && <p className="px-2 py-2 text-sm text-muted-foreground">{query ? 'No chats match.' : 'Your chats will appear here.'}</p>}
      </SidebarGroupContent>
    </SidebarGroup>
  </AppSidebar>
}
