import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useStore } from 'zustand'
import { BookOpen, ChevronRight, History, Inbox, Search, Server, Settings, SquarePen, Wrench } from 'lucide-react'
import { CompanionPortrait } from '@/components/companion-portrait'
import { ModeToggle } from '@/components/mode-toggle'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInput,
  SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from '@/components/ui/sidebar'
import type { GatewayRuntimeClient, RuntimeSession } from '@/lib/gateway/runtime'
import type { GatewayOwnerClient } from '@/lib/gateway/owner'
import type { GatewayRuntimeWorkspaceState } from './runtime-state'
import { maskForgottenSession, type GatewaySourcePrivacyState } from './source-privacy'

const more = [
  { title: 'Memory', url: '/memory', icon: BookOpen },
  { title: 'Activity', url: '/activity', icon: History },
  { title: 'Tools', url: '/tools', icon: Wrench },
  { title: 'System', url: '/system', icon: Server },
  { title: 'Settings', url: '/settings', icon: Settings },
]

function group(session: RuntimeSession, now: Date): string {
  const created = new Date(session.createdAt)
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(created.toDateString()).getTime()) / 86_400_000)
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 7 ? 'Previous 7 days' : 'Earlier'
}

/** The product sidebar: your chats first; everything else is one level away. */
export function GatewayChatSidebar({ runtime, owner, conversationState, sourcePrivacy, footer, badge }: {
  runtime: GatewayRuntimeClient; owner: GatewayOwnerClient; conversationState: GatewayRuntimeWorkspaceState
  sourcePrivacy: GatewaySourcePrivacyState; footer?: ReactNode; badge?: ReactNode
}) {
  const navigate = useNavigate(), location = useLocation(), { isMobile, setOpenMobile } = useSidebar()
  const selected = useStore(conversationState, value => value.selected)
  const operation = useStore(conversationState, value => value.operation)
  const forgotten = useStore(sourcePrivacy, value => value.sessionIds)
  const [sessions, setSessions] = useState<RuntimeSession[]>([])
  const [pendingApprovals, setPendingApprovals] = useState(0)
  const [loadFailed, setLoadFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [moreOpen, setMoreOpen] = useState(() => more.some(item => item.url === location.pathname))
  const generation = useRef(0)

  const refresh = useCallback(() => {
    const id = ++generation.current
    // A failed load is said out loud; an empty list would claim there are no chats.
    runtime.listSessions().then(rows => { if (id === generation.current) { setSessions(rows); setLoadFailed(false) } }).catch(() => { if (id === generation.current) setLoadFailed(true) })
    owner.listRequests({ limit: 50 }).then(page => { if (id === generation.current) setPendingApprovals(page.results.filter(row => row.status === 'pending' && row.reviewable).length) }).catch(() => undefined)
  }, [runtime, owner])
  // Reload after a send or creation settles, and when the selection changes.
  useEffect(() => { if (!operation) queueMicrotask(refresh) }, [operation, selected, refresh])

  const now = new Date()
  const visible = sessions
    .map(session => forgotten.includes(session.id) ? maskForgottenSession(session) : session)
    .filter(session => session.status !== 'forgotten' && (session.title || 'New chat').toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const groups = visible.reduce<Record<string, RuntimeSession[]>>((all, session) => ({ ...all, [group(session, now)]: [...(all[group(session, now)] ?? []), session] }), {})
  const go = (to: string) => { navigate(to); if (isMobile) setOpenMobile(false) }
  const onChat = ['/chat', '/chats', '/companion'].includes(location.pathname)

  return <Sidebar variant="sidebar" collapsible="offcanvas">
    <SidebarHeader className="gap-2 px-3 pt-3">
      <div className="flex items-center gap-2">
        <CompanionPortrait portrait="/conker.png" name="Conker" className="size-7 rounded-md" />
        <span className="truncate font-semibold">Conker</span>
        <span className="flex min-w-0 flex-1">{badge}</span>
        <ModeToggle />
      </div>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton onClick={() => { conversationState.setState({ selected: null }); go('/chat') }} className="font-medium">
            <SquarePen />New chat
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <label className="relative block">
        <span className="sr-only">Search chats</span>
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <SidebarInput type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search chats" className="pl-8" />
      </label>
    </SidebarHeader>
    <SidebarContent>
      {Object.entries(groups).map(([label, rows]) => <SidebarGroup key={label} className="py-1">
        <SidebarGroupLabel>{label}</SidebarGroupLabel>
        <SidebarGroupContent><SidebarMenu>
          {rows.map(session => <SidebarMenuItem key={session.id}>
            <SidebarMenuButton isActive={onChat && session.id === selected} onClick={() => go(`/chat?session=${encodeURIComponent(session.id)}`)} className="truncate">
              <span className="truncate">{session.title || 'New chat'}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>)}
        </SidebarMenu></SidebarGroupContent>
      </SidebarGroup>)}
      {loadFailed ? <div role="alert" className="space-y-2 px-4 py-2 text-sm text-muted-foreground"><p>Couldn’t load your chats.</p><button type="button" className="underline underline-offset-4 hover:text-foreground" onClick={refresh}>Try again</button></div>
        : !visible.length && <p className="px-4 py-2 text-sm text-muted-foreground">{query ? 'No chats match.' : 'Your chats will appear here.'}</p>}
    </SidebarContent>
    <SidebarFooter className="gap-1">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={location.pathname === '/inbox'}>
            <Link to="/inbox" onClick={() => isMobile && setOpenMobile(false)}><Inbox />Inbox</Link>
          </SidebarMenuButton>
          {pendingApprovals > 0 && <SidebarMenuBadge aria-label={`${pendingApprovals} waiting`}>{pendingApprovals}</SidebarMenuBadge>}
        </SidebarMenuItem>
        <Collapsible open={moreOpen} onOpenChange={setMoreOpen} asChild>
          <SidebarMenuItem>
            <CollapsibleTrigger asChild>
              <SidebarMenuButton><ChevronRight className="transition-transform data-[state=open]:rotate-90" data-state={moreOpen ? 'open' : 'closed'} />More</SidebarMenuButton>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarMenu className="pl-4">
                {more.map(item => <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild size="sm" isActive={location.pathname === item.url}>
                    <Link to={item.url} onClick={() => isMobile && setOpenMobile(false)}><item.icon />{item.title}</Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>)}
              </SidebarMenu>
            </CollapsibleContent>
          </SidebarMenuItem>
        </Collapsible>
      </SidebarMenu>
      {footer}
    </SidebarFooter>
  </Sidebar>
}
