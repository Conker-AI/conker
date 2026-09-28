import { useEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { activePageSection, appNavigation, matchAppRoute, pageSectionHref, pageSections } from '@/config/navigation'
import { AppbarBreadcrumbs, AppbarSections } from '@/components/appbar-navigation'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command'
import { gatewayCommandDestinations } from './navigation'

export function GatewayHeader({ children }: { children?: ReactNode }) {
  const location = useLocation(), navigate = useNavigate(), [search, setSearch] = useState(false)
  const page = matchAppRoute(location.pathname)
  const title = location.pathname === '/' ? 'Today' : location.pathname === '/chats' ? 'Chats' : location.pathname === '/setup' ? 'Setup'
    : location.pathname === '/settings/companion' ? 'Companion'
    : /^\/agents\/agent_[0-9a-f]{32}\/edit$/.test(location.pathname) ? 'Edit agent' : appNavigation[page.key].title
  const params = new URLSearchParams(location.search)
  const tab = params.get('tab') ?? 'tasks'
  const studioSections = page.key === 'companionSettings' ? (pageSections.companionSettings ?? []).map(section => ({
    ...section, to: pageSectionHref('companionSettings', location.search, section.value), badge: undefined,
  })) : []
  const systemSections = page.key === 'system' ? (pageSections.system ?? []).filter(section => ['overview', 'processes', 'ports', 'containers', 'terminal', 'files'].includes(section.value)).map(section => ({
    ...section, to: pageSectionHref('system', location.search, section.value), badge: undefined,
  })) : []
  const agentSections = page.key === 'agents' ? (pageSections.agents ?? []).filter(section => ['agents', 'teams'].includes(section.value)).map(section => ({
    ...section, to: pageSectionHref('agents', location.search, section.value), badge: undefined,
  })) : []
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key === 'k') { event.preventDefault(); setSearch(value => !value) } }
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key)
  }, [])
  return <>
    <header data-slot="appbar" className="sticky top-0 z-20 flex shrink-0 flex-col border-b bg-background text-foreground">
      <div className="flex h-(--header-height) min-w-0 items-center gap-2 px-2"><SidebarTrigger className="size-(--control-height) shrink-0" /><Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" /><AppbarBreadcrumbs crumbs={[{ title, to: location.pathname }]} /><Button variant="ghost" size="icon" className="ml-auto" aria-label="Search pages" onClick={() => setSearch(true)}><Search /></Button>{children}</div>
      {location.pathname === '/activity' && <AppbarSections activeSection={tab} sections={['tasks', 'runs', 'events'].map(value => ({ value, label: value[0].toUpperCase() + value.slice(1), to: `/activity?tab=${value}`, badge: undefined }))} />}
      {studioSections.length > 0 && <AppbarSections activeSection={activePageSection('companionSettings', location.search)} sections={studioSections} />}
      {systemSections.length > 0 && <AppbarSections activeSection={activePageSection('system', location.search)} sections={systemSections} />}
      {agentSections.length > 0 && <AppbarSections activeSection={activePageSection('agents', location.search)} sections={agentSections} />}
    </header>
    <CommandDialog open={search} onOpenChange={setSearch} title="Go to a page" description="Jump to any connected part of Conker"><CommandInput placeholder="Find a page…" /><CommandList><CommandEmpty>No matching pages.</CommandEmpty><CommandGroup heading="Pages">{gatewayCommandDestinations.map(item => <CommandItem key={item.path} value={item.title} onSelect={() => { setSearch(false); navigate(item.path) }}>{item.title}</CommandItem>)}</CommandGroup></CommandList></CommandDialog>
  </>
}
