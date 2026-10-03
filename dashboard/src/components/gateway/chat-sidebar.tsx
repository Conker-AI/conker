import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useStore } from 'zustand'
import { ChevronDown, ChevronRight, ChevronUp, CircleDashed, LogOut, MessageSquare, Moon, SlidersHorizontal, Sun } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarTrigger,
  SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from '@/components/ui/sidebar'
import { useCircularTransition } from '@/hooks/use-circular-transition'
import { useTheme } from '@/hooks/use-theme'
import type { GatewayRuntimeClient, RuntimeSession } from '@/lib/gateway/runtime'
import type { GatewayOwnerClient } from '@/lib/gateway/owner'
import type { GatewayControlClient } from '@/lib/gateway/control'
import type { GatewayProject } from '@/lib/gateway/projects'
import type { GatewayRuntimeWorkspaceState } from './runtime-state'
import { maskForgottenSession, type GatewaySourcePrivacyState } from './source-privacy'
import { gatewaySidebarDestinations, resolveGatewayRoute, type GatewayRoute } from './navigation'
import { OwnerAvatar } from './owner-avatar'
import { useOwnerProfile } from '@/lib/owner-profile'
import { summarizeSetup } from './setup-presentation'
import { useGatewaySetupStatus } from './setup-status-hook'
import { AnimatedIconGlyph, type AnimatedIconComponent } from '@/components/icons/animated/animated-icon'
import { useAnimatedIconController } from '@/components/icons/animated/use-animated-icon-controller'
import { BrainIcon, ClockIcon, CpuIcon, EllipsisIcon, FileTextIcon, FolderPlusIcon, HistoryIcon, HouseIcon, LayersIcon, MailIcon, MessageCircleIcon, PanelLeftIcon, PlugIcon, SquarePenIcon, UsersIcon } from '@/components/icons/animated/icons'

const destinationIcons: Readonly<Partial<Record<GatewayRoute, AnimatedIconComponent>>> = {
  today: HouseIcon, projects: LayersIcon, artifacts: FileTextIcon, jobs: ClockIcon, memory: BrainIcon,
  activity: HistoryIcon, agents: UsersIcon, tools: PlugIcon, system: CpuIcon, chat: SquarePenIcon,
  chats: MessageCircleIcon, inbox: MailIcon,
}

const primarySidebarRoutes: readonly GatewayRoute[] = ['today', 'chats', 'inbox']
const primaryDestinations = gatewaySidebarDestinations.filter(item => primarySidebarRoutes.includes(item.route))
const moreDestinations = gatewaySidebarDestinations.filter(item => !primarySidebarRoutes.includes(item.route))

const destinationDescriptions: Readonly<Partial<Record<GatewayRoute, string>>> = {
  today: 'Resume recent work and see what needs attention.',
  chats: 'Browse and continue your conversations.',
  inbox: 'Review requests waiting for your decision.',
  projects: 'Group related chats, tasks, and references.',
  artifacts: 'Open generated files and saved outputs.',
  jobs: 'Monitor scheduled and running work.',
  memory: 'Review what Conker remembers.',
  activity: 'Inspect tasks, runs, and recent changes.',
  agents: 'Manage assistants and teams.',
  tools: 'See connected capabilities and tool drafts.',
  system: 'Check hosts, services, terminal, and files.',
}

function SidebarHint({ children, title, description }: { children: ReactElement; title: string; description: string }) {
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent side="right" sideOffset={8} aria-label={`${title}: ${description}`} className="max-w-72">{description}</TooltipContent></Tooltip>
}

type SidebarDestination = (typeof gatewaySidebarDestinations)[number]

function AnimatedSidebarDestination({ item, active, onNavigate, badge }: { item: SidebarDestination; active: boolean; onNavigate: () => void; badge?: number }) {
  const Icon = destinationIcons[item.route]
  const { iconRef, animationProps } = useAnimatedIconController()
  return <SidebarMenuItem>
    <SidebarHint title={item.title} description={destinationDescriptions[item.route] ?? item.title}>
      <SidebarMenuButton asChild isActive={active} className="h-[38px] rounded-[10px]">
        <Link to={item.path} onClick={onNavigate} {...animationProps}>
          {Icon && <AnimatedIconGlyph icon={Icon} iconRef={iconRef} />}{item.title}
        </Link>
      </SidebarMenuButton>
    </SidebarHint>
    {!!badge && <SidebarMenuBadge aria-label={`${badge} waiting`} className="top-2 rounded-full bg-primary px-1.5 !text-primary-foreground">{badge}</SidebarMenuBadge>}
  </SidebarMenuItem>
}

function AnimatedMoreDestination({ item, active, onNavigate }: { item: SidebarDestination; active: boolean; onNavigate: () => void }) {
  const Icon = destinationIcons[item.route]
  const { iconRef, animationProps } = useAnimatedIconController()
  return <Link to={item.path} aria-current={active ? 'page' : undefined} onClick={onNavigate} {...animationProps} className={`flex h-[38px] items-center gap-2 rounded-sm px-2 text-sm outline-hidden hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground ${active ? 'bg-accent text-accent-foreground' : ''}`}>
    {Icon && <AnimatedIconGlyph icon={Icon} iconRef={iconRef} />}{item.title}
  </Link>
}

function CollapseSidebarButton() {
  const { iconRef, animationProps } = useAnimatedIconController()
  return <SidebarTrigger className="size-8 shrink-0 text-muted-foreground hover:text-foreground" aria-label="Collapse sidebar" title="Collapse sidebar" {...animationProps}>
    <AnimatedIconGlyph icon={PanelLeftIcon} iconRef={iconRef} />
  </SidebarTrigger>
}

function NewChatButton({ onClick }: { onClick: () => void }) {
  const { iconRef, animationProps } = useAnimatedIconController()
  return <SidebarHint title="New chat" description="Start a fresh conversation with Conker.">
    <SidebarMenuButton onClick={onClick} className="h-10 rounded-[10px] border bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-xs hover:bg-sidebar-accent/80" {...animationProps}>
      <AnimatedIconGlyph icon={SquarePenIcon} iconRef={iconRef} />New chat
      <kbd className="ml-auto hidden font-sans text-xs font-normal text-muted-foreground md:inline">Ctrl ⇧ O</kbd>
    </SidebarMenuButton>
  </SidebarHint>
}

function NewProjectButton({ onClick }: { onClick: () => void }) {
  const { iconRef, animationProps } = useAnimatedIconController()
  return <SidebarHint title="New project" description="Create a workspace for related chats, tasks, and guidance.">
    <SidebarMenuButton onClick={onClick} className="h-[38px] rounded-[10px]" {...animationProps}>
      <AnimatedIconGlyph icon={FolderPlusIcon} iconRef={iconRef} />New project
    </SidebarMenuButton>
  </SidebarHint>
}

/** The product sidebar: new chat and your chats first; everything else is one level away. */
export function GatewayChatSidebar({ runtime, owner, control, conversationState, sourcePrivacy, onSignOut, badge }: {
  runtime: GatewayRuntimeClient; owner: GatewayOwnerClient; control: GatewayControlClient; conversationState: GatewayRuntimeWorkspaceState
  sourcePrivacy: GatewaySourcePrivacyState; onSignOut: () => void; badge?: ReactNode
}) {
  const navigate = useNavigate(), location = useLocation(), { isMobile, setOpenMobile } = useSidebar()
  const currentRoute = resolveGatewayRoute(location.pathname)
  const { toggleTheme } = useCircularTransition(), { theme } = useTheme()
  const isDark = theme === 'dark' || (theme !== 'light' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const selected = useStore(conversationState, value => value.selected)
  const operation = useStore(conversationState, value => value.operation)
  const forgotten = useStore(sourcePrivacy, value => value.sessionIds)
  const [sessions, setSessions] = useState<RuntimeSession[]>([])
  const [projects, setProjects] = useState<GatewayProject[]>([])
  const [pendingApprovals, setPendingApprovals] = useState(0)
  const [loadFailed, setLoadFailed] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [moreExpanded, setMoreExpanded] = useState(false)
  const [projectsExpanded, setProjectsExpanded] = useState(true)
  const [chatsExpanded, setChatsExpanded] = useState(true)
  const [profileOpen, setProfileOpen] = useState(false)
  const profile = useOwnerProfile()
  const { status: setupStatus, error: setupError } = useGatewaySetupStatus(control)
  const setupSummary = setupStatus && setupStatus.state !== 'complete' ? summarizeSetup(setupStatus) : null
  const generation = useRef(0)
  const moreCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const moreTrigger = useRef<HTMLButtonElement>(null)
  const moreContent = useRef<HTMLDivElement>(null)
  const moreIcon = useAnimatedIconController()

  const refresh = useCallback(() => {
    const id = ++generation.current
    // A failed load is said out loud; an empty list would claim there are no chats.
    runtime.listSessions().then(rows => { if (id === generation.current) { setSessions(rows); setLoadFailed(false) } }).catch(() => { if (id === generation.current) setLoadFailed(true) })
    owner.listRequests({ limit: 50 }).then(page => { if (id === generation.current) setPendingApprovals(page.results.filter(row => row.status === 'pending' && row.reviewable).length) }).catch(() => undefined)
    control.projects.list({ limit: 50 }).then(page => { if (id === generation.current) setProjects(page.results) }).catch(() => undefined)
  }, [runtime, owner, control])
  // Reload after a send or creation settles, and when the selection changes.
  useEffect(() => { if (!operation) queueMicrotask(refresh) }, [operation, selected, location.pathname, refresh])
  useEffect(() => () => { if (moreCloseTimer.current) clearTimeout(moreCloseTimer.current) }, [])
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
  const visibleProjects = projects
    .filter(project => project.archivedAt === null)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 4)
  const selectedProjectId = location.pathname.match(/^\/projects\/(project_[0-9a-f]{32})$/)?.[1]
  const go = (to: string) => { navigate(to); if (isMobile) setOpenMobile(false) }
  const onChat = currentRoute === 'chat'
  const keepMoreOpen = () => { if (moreCloseTimer.current) clearTimeout(moreCloseTimer.current); moreCloseTimer.current = null; if (!moreExpanded && !isMobile) setMoreMenuOpen(true) }
  const closeMoreSoon = () => {
    if (moreCloseTimer.current) clearTimeout(moreCloseTimer.current)
    moreCloseTimer.current = setTimeout(() => {
      if (
        moreTrigger.current?.matches(':hover')
        || moreContent.current?.matches(':hover')
        || moreTrigger.current?.matches(':focus-visible')
        || moreContent.current?.contains(document.activeElement)
      ) return
      setMoreMenuOpen(false)
    }, 220)
  }

  return <Sidebar variant="inset" collapsible="offcanvas">
    <SidebarHeader className="gap-1 px-2 pt-2">
      <div className="flex h-10 items-center gap-2 px-1">
        <Link to="/chat" aria-label="Open Conker chat" onClick={() => isMobile && setOpenMobile(false)} className="flex size-8 items-center justify-center rounded-lg border bg-background hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-ring"><img src="/conker.png" alt="" width="24" height="24" className="size-6 object-contain" /></Link>
        <span className="flex min-w-0 flex-1">{badge}</span>
        <CollapseSidebarButton />
      </div>
      <SidebarMenu className="mt-1">
        <SidebarMenuItem>
          <NewChatButton onClick={newChat} />
        </SidebarMenuItem>
      </SidebarMenu>
      <SidebarMenu>
        {primaryDestinations.map(item => <AnimatedSidebarDestination key={item.path} item={item} active={currentRoute === item.route} onNavigate={() => isMobile && setOpenMobile(false)} badge={item.route === 'inbox' ? pendingApprovals : undefined} />)}
        <Collapsible asChild open={moreExpanded}><SidebarMenuItem onKeyDown={event => { if (event.key === 'Escape' && moreMenuOpen) { event.preventDefault(); moreTrigger.current?.focus(); setMoreMenuOpen(false) } }}>
          <SidebarMenuButton ref={moreTrigger} className="group/more h-[38px] rounded-[10px]" aria-expanded={moreExpanded} onMouseEnter={() => { moreIcon.animationProps.onMouseEnter(); keepMoreOpen() }} onMouseLeave={() => { moreIcon.animationProps.onMouseLeave(); closeMoreSoon() }} onFocus={() => { moreIcon.animationProps.onFocus(); keepMoreOpen() }} onBlur={() => { moreIcon.animationProps.onBlur(); closeMoreSoon() }} onClick={() => { setMoreExpanded(value => !value); setMoreMenuOpen(false) }}><AnimatedIconGlyph icon={EllipsisIcon} iconRef={moreIcon.iconRef} />More<ChevronUp className={`ml-auto size-4 transition-transform duration-200 ${moreExpanded ? 'rotate-180' : 'group-hover/more:rotate-90'}`} /></SidebarMenuButton>
          {moreMenuOpen && !moreExpanded && <div ref={moreContent} role="navigation" aria-label="More destinations" className="absolute top-0 left-[calc(100%+0.5rem)] z-50 max-h-[60dvh] w-56 overflow-y-auto rounded-md border bg-popover p-2 text-popover-foreground shadow-md" onMouseEnter={keepMoreOpen} onMouseLeave={closeMoreSoon} onFocus={keepMoreOpen} onBlur={closeMoreSoon}>
            {moreDestinations.map(item => <AnimatedMoreDestination key={item.path} item={item} active={currentRoute === item.route} onNavigate={() => { setMoreMenuOpen(false); if (isMobile) setOpenMobile(false) }} />)}
          </div>}
          <CollapsibleContent className="max-h-[40dvh] overflow-y-auto"><SidebarMenu className="mt-1">{moreDestinations.map(item => <AnimatedSidebarDestination key={item.path} item={item} active={currentRoute === item.route} onNavigate={() => isMobile && setOpenMobile(false)} />)}</SidebarMenu></CollapsibleContent>
        </SidebarMenuItem></Collapsible>
      </SidebarMenu>
    </SidebarHeader>
    <SidebarContent>
      <Collapsible open={projectsExpanded} onOpenChange={setProjectsExpanded}>
        <SidebarGroup className="py-1">
          <CollapsibleTrigger className="flex h-8 items-center gap-1 px-2 text-xs font-medium text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring" aria-label={projectsExpanded ? 'Collapse projects' : 'Expand projects'}>
            <span>Projects</span><ChevronRight className={`size-3.5 transition-transform duration-200 ${projectsExpanded ? 'rotate-90' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent asChild><SidebarGroupContent><SidebarMenu>
            <SidebarMenuItem><NewProjectButton onClick={() => go('/projects?create=1')} /></SidebarMenuItem>
            {visibleProjects.map(project => <SidebarMenuItem key={project.id}>
              <SidebarMenuButton isActive={project.id === selectedProjectId} onClick={() => go(`/projects/${project.id}`)} className="h-[38px] rounded-[10px]">
                <span className="truncate">{project.name}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>)}
          </SidebarMenu></SidebarGroupContent></CollapsibleContent>
        </SidebarGroup>
      </Collapsible>
      <Collapsible open={chatsExpanded} onOpenChange={setChatsExpanded}>
        <SidebarGroup className="py-1">
          <CollapsibleTrigger className="flex h-8 items-center gap-1 px-2 text-xs font-medium text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring" aria-label={chatsExpanded ? 'Collapse chats' : 'Expand chats'}>
            <span>Chats</span><ChevronRight className={`size-3.5 transition-transform duration-200 ${chatsExpanded ? 'rotate-90' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent asChild><SidebarGroupContent>
            <SidebarMenu>
              {visible.map(session => <SidebarMenuItem key={session.id}>
                <SidebarMenuButton isActive={onChat && session.id === selected} onClick={() => go(`/chat?session=${encodeURIComponent(session.id)}`)} className="h-[38px] rounded-[10px]">
                  <span className="truncate">{session.title || 'New chat'}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>)}
            </SidebarMenu>
            {!loadFailed && !visible.length && <p className="px-2 py-2 text-sm text-muted-foreground">Your chats will appear here.</p>}
          </SidebarGroupContent></CollapsibleContent>
        </SidebarGroup>
      </Collapsible>
      {loadFailed ? <div role="alert" className="space-y-2 px-4 py-2 text-sm text-muted-foreground"><p>Couldn’t load your chats.</p><button type="button" className="underline underline-offset-4 hover:text-foreground" onClick={refresh}>Try again</button></div>
        : null}
    </SidebarContent>
    <SidebarFooter className="p-2">
      <SidebarMenu>
        {(setupSummary || (setupError && !setupStatus)) && <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={currentRoute === 'setup'} className="h-auto min-h-14 rounded-[10px] border border-sidebar-border bg-sidebar-accent/60 py-2.5 hover:bg-sidebar-accent">
            <Link to="/setup" onClick={() => isMobile && setOpenMobile(false)}>
              <CircleDashed className="size-4 shrink-0 text-warning" aria-hidden="true" />
              <span className="grid min-w-0 flex-1 gap-0.5 leading-tight">
                <span className="truncate text-sm font-medium">{setupSummary?.attention ? 'Setup needs attention' : setupSummary ? 'Finish setup' : 'Review setup'}</span>
                <span className="truncate text-xs text-muted-foreground">{setupSummary && setupStatus ? `${setupSummary.resolved} of ${setupStatus.steps.length} steps resolved` : 'Status unavailable'}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>}
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
