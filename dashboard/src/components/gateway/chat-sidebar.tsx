import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useStore } from 'zustand'
import { BookOpen, Bot, BriefcaseBusiness, ChevronsUpDown, Files, FolderKanban, History, House, Inbox, ListChecks, LogOut, Moon, Search, Server, Settings, SquarePen, Sun, UserRound, Wrench } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInput,
  SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarTrigger, useSidebar,
} from '@/components/ui/sidebar'
import { useCircularTransition } from '@/hooks/use-circular-transition'
import { useTheme } from '@/hooks/use-theme'
import type { GatewayRuntimeClient, RuntimeSession } from '@/lib/gateway/runtime'
import type { GatewayOwnerClient } from '@/lib/gateway/owner'
import type { GatewayControlClient } from '@/lib/gateway/control'
import type { GatewayRuntimeWorkspaceState } from './runtime-state'
import { maskForgottenSession, type GatewaySourcePrivacyState } from './source-privacy'
import { useGatewaySetupStatus } from './setup-status-hook'
import { gatewaySidebarDestinations, resolveGatewayRoute, type GatewayRoute } from './navigation'

const destinationIcons: Readonly<Record<GatewayRoute, typeof House>> = {
  today: House, projects: FolderKanban, artifacts: Files, jobs: BriefcaseBusiness, memory: BookOpen,
  activity: History, agents: Bot, tools: Wrench, system: Server, setup: ListChecks, chat: SquarePen,
  inbox: Inbox, settings: Settings, 'companion-settings': Bot,
}

/** The product sidebar: new chat and your chats first; everything else is one level away. */
export function GatewayChatSidebar({ runtime, owner, control, conversationState, sourcePrivacy, onSignOut, badge }: {
  runtime: GatewayRuntimeClient; owner: GatewayOwnerClient; control: GatewayControlClient; conversationState: GatewayRuntimeWorkspaceState
  sourcePrivacy: GatewaySourcePrivacyState; onSignOut: () => void; badge?: ReactNode
}) {
  const navigate = useNavigate(), location = useLocation(), { isMobile, setOpenMobile } = useSidebar()
  const { toggleTheme } = useCircularTransition(), { theme } = useTheme()
  const isDark = theme === 'dark' || (theme !== 'light' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const selected = useStore(conversationState, value => value.selected)
  const operation = useStore(conversationState, value => value.operation)
  const forgotten = useStore(sourcePrivacy, value => value.sessionIds)
  const [sessions, setSessions] = useState<RuntimeSession[]>([])
  const [pendingApprovals, setPendingApprovals] = useState(0)
  const [loadFailed, setLoadFailed] = useState(false)
  const [query, setQuery] = useState('')
  const setup = useGatewaySetupStatus(control)
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
  const go = (to: string) => { navigate(to); if (isMobile) setOpenMobile(false) }
  const currentRoute = resolveGatewayRoute(location.pathname)
  const onChat = currentRoute === 'chat'

  return <Sidebar variant="inset" collapsible="offcanvas">
    <SidebarHeader className="gap-1 px-2 pt-2">
      <div className="flex h-10 items-center gap-2 px-1">
        <span className="flex size-8 items-center justify-center rounded-lg border bg-background"><img src="/conker.png" alt="" className="size-6 object-contain" /></span>
        <span className="flex min-w-0 flex-1">{badge}</span>
        <SidebarTrigger className="size-8 text-muted-foreground" aria-label="Collapse sidebar" />
      </div>
      <SidebarMenu className="mt-1">
        <SidebarMenuItem>
          <SidebarMenuButton onClick={newChat} className="h-10 rounded-[10px] border bg-background font-medium shadow-xs hover:bg-background">
            <SquarePen />New chat<kbd className="ml-auto hidden font-sans text-xs font-normal text-muted-foreground md:inline">Ctrl ⇧ O</kbd>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <label className="relative mt-1 block">
        <span className="sr-only">Search chats</span>
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <SidebarInput type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search chats" className="h-9 rounded-[10px] border-transparent bg-transparent pl-8 shadow-none hover:bg-sidebar-accent focus-visible:bg-background" />
      </label>
      <SidebarMenu>
        {setup.status && setup.status.state !== 'complete' && <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={currentRoute === 'setup'} className="h-9 rounded-[10px]">
            <Link to="/setup" onClick={() => isMobile && setOpenMobile(false)}><ListChecks />Finish setup</Link>
          </SidebarMenuButton>
          <SidebarMenuBadge className="top-2 tabular-nums">{setup.status.steps.filter(step => step.state === 'complete' || step.state === 'skipped').length}/{setup.status.steps.length}</SidebarMenuBadge>
        </SidebarMenuItem>}
        <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={currentRoute === 'inbox'} className="h-9 rounded-[10px]">
            <Link to="/inbox" onClick={() => isMobile && setOpenMobile(false)}><Inbox />Inbox</Link>
          </SidebarMenuButton>
          {pendingApprovals > 0 && <SidebarMenuBadge aria-label={`${pendingApprovals} waiting`} className="top-2 rounded-full bg-primary px-1.5 text-primary-foreground">{pendingApprovals}</SidebarMenuBadge>}
        </SidebarMenuItem>
        {gatewaySidebarDestinations.map(item => { const Icon = destinationIcons[item.route]; return <SidebarMenuItem key={item.path}>
          <SidebarMenuButton asChild isActive={currentRoute === item.route} className="h-9 rounded-[10px]">
            <Link to={item.path} onClick={() => isMobile && setOpenMobile(false)}><Icon />{item.title}</Link>
          </SidebarMenuButton>
        </SidebarMenuItem> })}
      </SidebarMenu>
    </SidebarHeader>
    <SidebarContent>
      <SidebarGroup className="py-1">
        <SidebarGroupLabel className="text-sm font-normal text-muted-foreground">Chats</SidebarGroupLabel>
        <SidebarGroupContent><SidebarMenu>
          {visible.map(session => <SidebarMenuItem key={session.id}>
            <SidebarMenuButton isActive={onChat && session.id === selected} onClick={() => go(`/chat?session=${encodeURIComponent(session.id)}`)} className="h-9 rounded-[10px]">
              <span className="truncate">{session.title || 'New chat'}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>)}
        </SidebarMenu></SidebarGroupContent>
      </SidebarGroup>
      {loadFailed ? <div role="alert" className="space-y-2 px-4 py-2 text-sm text-muted-foreground"><p>Couldn’t load your chats.</p><button type="button" className="underline underline-offset-4 hover:text-foreground" onClick={refresh}>Try again</button></div>
        : !visible.length && <p className="px-4 py-2 text-sm text-muted-foreground">{query ? 'No chats match.' : 'Your chats will appear here.'}</p>}
    </SidebarContent>
    <SidebarFooter className="p-2">
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                <span className="flex size-8 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-accent-foreground"><UserRound className="size-4" /></span>
                <span className="grid flex-1 text-left leading-tight"><span className="truncate text-sm font-medium">You</span><span className="truncate text-xs text-muted-foreground">Signed in</span></span>
                <ChevronsUpDown className="size-4 text-muted-foreground" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-52">
              <DropdownMenuItem asChild><Link to="/settings/companion" onClick={() => isMobile && setOpenMobile(false)}><Bot />Companion</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/settings" onClick={() => isMobile && setOpenMobile(false)}><Settings />Settings</Link></DropdownMenuItem>
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
