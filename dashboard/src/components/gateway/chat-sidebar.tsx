import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useStore } from 'zustand'
import { BookOpen, Bot, BriefcaseBusiness, ChevronDown, Ellipsis, Files, FolderKanban, History, House, Inbox, ListChecks, LogOut, MessageSquare, Moon, Server, Settings, SlidersHorizontal, SquarePen, Sun, Wrench } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader,
  SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from '@/components/ui/sidebar'
import { useCircularTransition } from '@/hooks/use-circular-transition'
import { useTheme } from '@/hooks/use-theme'
import type { GatewayRuntimeClient, RuntimeSession } from '@/lib/gateway/runtime'
import type { GatewayOwnerClient } from '@/lib/gateway/owner'
import type { GatewayRuntimeWorkspaceState } from './runtime-state'
import { maskForgottenSession, type GatewaySourcePrivacyState } from './source-privacy'
import { gatewaySidebarDestinations, resolveGatewayRoute, type GatewayRoute } from './navigation'
import { OwnerAvatar } from './owner-avatar'
import { useOwnerProfile } from '@/lib/owner-profile'

const destinationIcons: Readonly<Record<GatewayRoute, typeof House>> = {
  today: House, projects: FolderKanban, artifacts: Files, jobs: BriefcaseBusiness, memory: BookOpen,
  activity: History, agents: Bot, tools: Wrench, system: Server, setup: ListChecks, chat: SquarePen,
  chats: MessageSquare, inbox: Inbox, settings: Settings, 'companion-settings': Bot,
}

const primarySidebarRoutes: readonly GatewayRoute[] = ['today', 'chats', 'inbox', 'projects']
const primaryDestinations = gatewaySidebarDestinations.filter(item => primarySidebarRoutes.includes(item.route))
const moreDestinations = gatewaySidebarDestinations.filter(item => !primarySidebarRoutes.includes(item.route))

/** The product sidebar: new chat and your chats first; everything else is one level away. */
export function GatewayChatSidebar({ runtime, owner, conversationState, sourcePrivacy, onSignOut, badge }: {
  runtime: GatewayRuntimeClient; owner: GatewayOwnerClient; conversationState: GatewayRuntimeWorkspaceState
  sourcePrivacy: GatewaySourcePrivacyState; onSignOut: () => void; badge?: ReactNode
}) {
  const navigate = useNavigate(), location = useLocation(), { isMobile, setOpenMobile } = useSidebar()
  const currentRoute = resolveGatewayRoute(location.pathname)
  const secondaryActive = moreDestinations.some(item => item.route === currentRoute)
  const { toggleTheme } = useCircularTransition(), { theme } = useTheme()
  const isDark = theme === 'dark' || (theme !== 'light' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const selected = useStore(conversationState, value => value.selected)
  const operation = useStore(conversationState, value => value.operation)
  const forgotten = useStore(sourcePrivacy, value => value.sessionIds)
  const [sessions, setSessions] = useState<RuntimeSession[]>([])
  const [pendingApprovals, setPendingApprovals] = useState(0)
  const [loadFailed, setLoadFailed] = useState(false)
  const [moreOpen, setMoreOpen] = useState(secondaryActive)
  const [profileOpen, setProfileOpen] = useState(false)
  const profile = useOwnerProfile()
  const generation = useRef(0)

  const refresh = useCallback(() => {
    const id = ++generation.current
    // A failed load is said out loud; an empty list would claim there are no chats.
    runtime.listSessions().then(rows => { if (id === generation.current) { setSessions(rows); setLoadFailed(false) } }).catch(() => { if (id === generation.current) setLoadFailed(true) })
    owner.listRequests({ limit: 50 }).then(page => { if (id === generation.current) setPendingApprovals(page.results.filter(row => row.status === 'pending' && row.reviewable).length) }).catch(() => undefined)
  }, [runtime, owner])
  // Reload after a send or creation settles, and when the selection changes.
  useEffect(() => { if (!operation) queueMicrotask(refresh) }, [operation, selected, refresh])
  useEffect(() => {
    if (!secondaryActive) return
    let current = true
    queueMicrotask(() => { if (current) setMoreOpen(true) })
    return () => { current = false }
  }, [secondaryActive])
  const newChat = useCallback(() => { conversationState.setState({ selected: null }); navigate('/chat'); if (isMobile) setOpenMobile(false) }, [conversationState, navigate, isMobile, setOpenMobile])
  // Ctrl/Cmd+Shift+O starts a new chat from anywhere; Ctrl+K stays page search.
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'o') { event.preventDefault(); newChat() } }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [newChat])

  const visible = sessions
    .map(session => forgotten.includes(session.id) ? maskForgottenSession(session) : session)
    .filter(session => session.status !== 'forgotten')
    .slice(0, 5)
  const go = (to: string) => { navigate(to); if (isMobile) setOpenMobile(false) }
  const onChat = currentRoute === 'chat'

  return <Sidebar variant="inset" collapsible="offcanvas">
    <SidebarHeader className="gap-1 px-2 pt-2">
      <div className="flex h-10 items-center gap-2 px-1">
        <Link to="/chat" aria-label="Open Conker chat" onClick={() => isMobile && setOpenMobile(false)} className="flex size-8 items-center justify-center rounded-lg border bg-background hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-ring"><img src="/conker.png" alt="" width="24" height="24" className="size-6 object-contain" /></Link>
        <span className="flex min-w-0 flex-1">{badge}</span>
      </div>
      <SidebarMenu className="mt-1">
        <SidebarMenuItem>
          <SidebarMenuButton onClick={newChat} className="h-10 rounded-[10px] border bg-background font-medium shadow-xs hover:bg-background">
            <SquarePen />New chat<kbd className="ml-auto hidden font-sans text-xs font-normal text-muted-foreground md:inline">Ctrl ⇧ O</kbd>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <SidebarMenu>
        {primaryDestinations.map(item => { const Icon = destinationIcons[item.route]; return <SidebarMenuItem key={item.path}>
          <SidebarMenuButton asChild isActive={currentRoute === item.route} className="h-9 rounded-[10px]">
            <Link to={item.path} onClick={() => isMobile && setOpenMobile(false)}><Icon />{item.title}</Link>
          </SidebarMenuButton>
          {item.route === 'inbox' && pendingApprovals > 0 && <SidebarMenuBadge aria-label={`${pendingApprovals} waiting`} className="top-2 rounded-full bg-primary px-1.5 !text-primary-foreground">{pendingApprovals}</SidebarMenuBadge>}
        </SidebarMenuItem> })}
        <Collapsible asChild open={moreOpen} onOpenChange={setMoreOpen}><SidebarMenuItem>
          <CollapsibleTrigger asChild><SidebarMenuButton className="h-9 rounded-[10px] text-muted-foreground hover:text-foreground"><Ellipsis />{moreOpen ? 'Collapse' : 'More'}</SidebarMenuButton></CollapsibleTrigger>
          <CollapsibleContent><SidebarMenu className="mt-1">{moreDestinations.map(item => { const Icon = destinationIcons[item.route]; return <SidebarMenuItem key={item.path}><SidebarMenuButton asChild isActive={currentRoute === item.route} className="h-9 rounded-[10px]"><Link to={item.path} onClick={() => isMobile && setOpenMobile(false)}><Icon />{item.title}</Link></SidebarMenuButton></SidebarMenuItem> })}</SidebarMenu></CollapsibleContent>
        </SidebarMenuItem></Collapsible>
      </SidebarMenu>
    </SidebarHeader>
    <SidebarContent>
      <SidebarGroup className="py-1">
        <div className="flex h-8 items-center justify-between px-2 text-xs text-muted-foreground"><span>Recent chats</span><Link to="/chats" onClick={() => isMobile && setOpenMobile(false)} className="rounded-sm px-1.5 py-1 font-medium hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">View all</Link></div>
        <SidebarGroupContent><SidebarMenu>
          {visible.map(session => <SidebarMenuItem key={session.id}>
            <SidebarMenuButton isActive={onChat && session.id === selected} onClick={() => go(`/chat?session=${encodeURIComponent(session.id)}`)} className="h-9 rounded-[10px]">
              <span className="truncate">{session.title || 'New chat'}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>)}
        </SidebarMenu></SidebarGroupContent>
      </SidebarGroup>
      {loadFailed ? <div role="alert" className="space-y-2 px-4 py-2 text-sm text-muted-foreground"><p>Couldn’t load your chats.</p><button type="button" className="underline underline-offset-4 hover:text-foreground" onClick={refresh}>Try again</button></div>
        : !visible.length && <p className="px-4 py-2 text-sm text-muted-foreground">Your chats will appear here.</p>}
    </SidebarContent>
    <SidebarFooter className="p-2">
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu open={profileOpen} onOpenChange={setProfileOpen}>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton className="h-12 data-[state=open]:bg-sidebar-accent">
                <OwnerAvatar />
                <span className="grid min-w-0 flex-1 text-left leading-tight"><span className="truncate text-sm font-medium">{profile.name}</span><span className="truncate text-xs text-muted-foreground">Profile &amp; settings</span></span>
                <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 ease-out data-[open=true]:rotate-180" data-open={profileOpen} />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-52">
              <DropdownMenuItem asChild><Link to="/chat" onClick={() => isMobile && setOpenMobile(false)}><MessageSquare />Open chat</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/settings/companion" onClick={() => isMobile && setOpenMobile(false)}><span className="flex size-4 items-center justify-center"><img src="/conker.png" alt="" width="16" height="16" className="size-4 object-contain" /></span>Customize companion</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/settings" onClick={() => isMobile && setOpenMobile(false)}><SlidersHorizontal />Models &amp; settings</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/setup" onClick={() => isMobile && setOpenMobile(false)}><ListChecks />Setup &amp; readiness</Link></DropdownMenuItem>
              <DropdownMenuItem onClick={event => toggleTheme(event)}>{isDark ? <Sun /> : <Moon />}{isDark ? 'Light mode' : 'Dark mode'}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onSignOut}><LogOut />Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  </Sidebar>
}
