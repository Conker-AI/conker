import { useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Bot, BookOpen, ChevronRight, Clock3, Folder, House, Inbox, MessagesSquare, Plus, Search, Server, Settings2, Wrench, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuBadge,
  SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, SidebarTrigger, useSidebar,
} from '@/components/ui/sidebar'
import { Tooltip, TooltipPopup, TooltipTrigger } from '@/components/ui/tooltip'
import { UniversalSearchContext, useInboxAttention } from '@/lib/workspace-chrome'
import type { GatewayRuntimeWorkspaceState } from './runtime-state'
import { gatewayPageNavigation, gatewaySidebarDestinations, gatewaySidebarGroups, type GatewayDestination } from './navigation'

const icons: Partial<Record<GatewayDestination['id'], LucideIcon>> = {
  today: House, inbox: Inbox, chats: MessagesSquare, projects: Folder, memory: BookOpen, agents: Bot, tools: Wrench,
  jobs: Clock3, system: Server, settings: Settings2,
}

/**
 * Places, never actions (the owner's rule): Ask Conker and Search sit above them. No profile,
 * help or status links; account and appearance live in Settings.
 */
export function GatewaySidebar({ conversationState, badge }: { conversationState: GatewayRuntimeWorkspaceState; badge?: ReactNode }) {
  const navigate = useNavigate(), location = useLocation(), { isMobile, setOpenMobile } = useSidebar()
  const page = gatewayPageNavigation(location.pathname, location.search)
  const openSearch = useContext(UniversalSearchContext)
  const attention = useInboxAttention()
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
  const onServer = page.route === 'system'
  const [serverOpen, setServerOpen] = useState(onServer)
  const serverSections = gatewayPageNavigation('/system', '').sections
  const activeTab = new URLSearchParams(location.search).get('tab') ?? 'overview'

  const place = (item: GatewayDestination) => {
    const Icon = icons[item.id]
    const active = page.destination?.id === item.id || (item.id === 'chats' && page.route === 'chat')
    const count = item.id === 'inbox' ? attention : null
    return <SidebarMenuItem key={item.id}>
      <SidebarMenuButton isActive={active} tooltip={count ? `${item.title} · ${count} waiting for you` : item.title} render={<Link to={item.path} aria-current={active ? 'page' : undefined} onClick={afterNavigate} />}>
        {Icon && <Icon aria-hidden="true" />}<span>{item.title}</span>
      </SidebarMenuButton>
      {!!count && <SidebarMenuBadge aria-label={`${count} waiting for you`}>{count}</SidebarMenuBadge>}
    </SidebarMenuItem>
  }

  return <Sidebar variant="floating" collapsible="icon" className="conker-sidebar">
    <SidebarHeader className="gap-3">
      <div className="flex items-center gap-2 px-1 pt-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
        <Link to="/overview" onClick={afterNavigate} aria-label="Conker home" className="flex min-w-0 items-center gap-2 rounded-md font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <img src="/conker.png" alt="" width="24" height="24" className="size-6 shrink-0" />
          <span className="truncate group-data-[collapsible=icon]:hidden">Conker</span>
        </Link>
        <span className="ml-auto min-w-0 group-data-[collapsible=icon]:hidden">{badge}</span>
        <SidebarTrigger className="text-muted-foreground group-data-[collapsible=icon]:hidden" aria-label="Collapse the sidebar" title="Collapse the sidebar" />
      </div>
      <div className="flex gap-2 group-data-[collapsible=icon]:flex-col">
        <Button className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden" onClick={newChat}><Plus />Ask Conker</Button>
        <Tooltip><TooltipTrigger render={<Button size="icon" className="hidden group-data-[collapsible=icon]:inline-flex" aria-label="Ask Conker" onClick={newChat} />}><Plus /></TooltipTrigger><TooltipPopup side="right">Ask Conker</TooltipPopup></Tooltip>
        <Tooltip><TooltipTrigger render={<Button size="icon" variant="outline" aria-label="Search (Ctrl K)" disabled={!openSearch} onClick={event => openSearch?.('', event.currentTarget)} />}><Search /></TooltipTrigger><TooltipPopup side="right">Search · Ctrl K</TooltipPopup></Tooltip>
      </div>
    </SidebarHeader>
    <SidebarContent role="navigation" aria-label="Conker">
      {gatewaySidebarGroups.map(group => <SidebarGroup key={group.id}>
        <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
        <SidebarMenu>
          {gatewaySidebarDestinations.filter(item => item.group === group.id).map(item => item.id !== 'system' ? place(item)
            : <Collapsible key={item.id} open={serverOpen || onServer} onOpenChange={setServerOpen} render={<SidebarMenuItem />}>
              <CollapsibleTrigger render={<SidebarMenuButton className="group/server" isActive={onServer} tooltip={item.title} />}>
                <Server aria-hidden="true" /><span>{item.title}</span>
                <ChevronRight className="ml-auto transition-transform group-data-panel-open/server:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
              </CollapsibleTrigger>
              <CollapsibleContent><SidebarMenuSub>
                {serverSections.map(section => <SidebarMenuSubItem key={section.value}>
                  <SidebarMenuSubButton isActive={onServer && activeTab === section.value} render={<Link to={section.to} aria-current={onServer && activeTab === section.value ? 'page' : undefined} onClick={afterNavigate} />}>{section.label}</SidebarMenuSubButton>
                </SidebarMenuSubItem>)}
              </SidebarMenuSub></CollapsibleContent>
            </Collapsible>)}
        </SidebarMenu>
      </SidebarGroup>)}
    </SidebarContent>
  </Sidebar>
}
