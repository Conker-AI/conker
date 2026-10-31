import { useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronRight, Plus, Search, Server } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuBadge,
  SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, SidebarTrigger, useSidebar,
} from '@/components/ui/sidebar'
import { Tooltip, TooltipPopup, TooltipTrigger } from '@/components/ui/tooltip'
import { UniversalSearchContext, useInboxAttention } from '@/lib/workspace-chrome'
import { useServerSetting } from '@/settings/server-setting'
import type { GatewayRuntimeWorkspaceState } from './runtime-state'
import { gatewayPageNavigation, gatewaySidebarDestinations, gatewaySidebarGroups, type GatewayDestination } from './navigation'
import { useSearchShortcut } from './search-shortcut'
import { placeIcons } from './page-icons'
/** Places the owner can hide (Settings, Appearance, Sidebar places); Home, Inbox, Chats and Settings always show. */
const optional: Partial<Record<GatewayDestination['id'], string>> = { projects: 'projects', memory: 'memory', agents: 'agents', tools: 'tools', jobs: 'jobs', system: 'server' }
const ALL_PLACES = ['projects', 'memory', 'agents', 'tools', 'jobs', 'server']

// The current place: a bar on the left edge in the primary colour, the icon at full strength;
// other places keep muted icons. Collapsed to icons, the tile background alone marks it.
const activeMark = "relative [&>svg]:text-muted-foreground data-[active=true]:[&>svg]:text-foreground data-[active=true]:font-semibold data-[active=true]:before:absolute data-[active=true]:before:inset-y-1.5 data-[active=true]:before:left-0 data-[active=true]:before:w-0.5 data-[active=true]:before:rounded-full data-[active=true]:before:bg-primary group-data-[collapsible=icon]:before:hidden"

/**
 * Places, never actions (the owner's rule): Ask Conker and Search sit above them. No profile,
 * help or status links; account and appearance live in Settings.
 */
export function GatewaySidebar({ conversationState, badge }: { conversationState: GatewayRuntimeWorkspaceState; badge?: ReactNode }) {
  const navigate = useNavigate(), location = useLocation(), { isMobile, setOpenMobile } = useSidebar()
  const page = gatewayPageNavigation(location.pathname, location.search)
  const openSearch = useContext(UniversalSearchContext)
  const attention = useInboxAttention()
  const places = useServerSetting('appearance.sidebar_places', ALL_PLACES), shortcuts = useServerSetting('keyboard.shortcuts', true)
  const searchKey = useSearchShortcut(), searchLabel = searchKey ? `Search · Ctrl ${searchKey.toUpperCase()}` : 'Search'
  const shown = (item: GatewayDestination) => !optional[item.id] || places.includes(optional[item.id]!)
  const afterNavigate = useCallback(() => { if (isMobile) setOpenMobile(false, 'content') }, [isMobile, setOpenMobile])
  const newChat = useCallback(() => {
    conversationState.setState({ selected: null }); navigate('/chat'); afterNavigate()
  }, [conversationState, navigate, afterNavigate])
  useEffect(() => {
    if (!shortcuts) return
    const key = (event: KeyboardEvent) => {
      if (!event.isComposing && (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'o') { event.preventDefault(); newChat() }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [newChat, shortcuts])
  const onServer = page.route === 'system'
  const [serverOpen, setServerOpen] = useState(onServer)
  const serverSections = gatewayPageNavigation('/system', '').sections
  const activeTab = page.activeSection

  const place = (item: GatewayDestination) => {
    const Icon = placeIcons[item.id]
    const active = page.destination?.id === item.id || (item.id === 'chats' && page.route === 'chat')
    const count = item.id === 'inbox' ? attention : null
    return <SidebarMenuItem key={item.id}>
      <SidebarMenuButton className={activeMark} isActive={active} tooltip={count ? `${item.title} · ${count} waiting for you` : item.title} render={<Link to={item.path} aria-current={active ? 'page' : undefined} onClick={afterNavigate} />}>
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
        <Tooltip><TooltipTrigger render={<Button size="icon" variant="outline" aria-label={searchKey ? `Search (Ctrl ${searchKey.toUpperCase()})` : 'Search'} disabled={!openSearch} onClick={event => openSearch?.('', event.currentTarget)} />}><Search /></TooltipTrigger><TooltipPopup side="right">{searchLabel}</TooltipPopup></Tooltip>
      </div>
    </SidebarHeader>
    <SidebarContent role="navigation" aria-label="Conker">
      {gatewaySidebarGroups.filter(group => gatewaySidebarDestinations.some(item => item.group === group.id && shown(item))).map(group => <SidebarGroup key={group.id}>
        <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
        <SidebarMenu>
          {gatewaySidebarDestinations.filter(item => item.group === group.id && shown(item)).map(item => item.id !== 'system' ? place(item)
            : <Collapsible key={item.id} open={serverOpen || onServer} onOpenChange={setServerOpen} render={<SidebarMenuItem />}>
              <CollapsibleTrigger render={<SidebarMenuButton className={cn(activeMark, 'group/server')} isActive={onServer} tooltip={item.title} />}>
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
