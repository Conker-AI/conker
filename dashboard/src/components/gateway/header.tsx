import { useEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { appNavigation, matchAppRoute } from '@/config/navigation'
import { AppbarBreadcrumbs, AppbarSections } from '@/components/appbar-navigation'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command'

export function GatewayHeader({ children }: { children?: ReactNode }) {
  const location = useLocation(), navigate = useNavigate(), [search, setSearch] = useState(false)
  const page = matchAppRoute(location.pathname)
  const title = location.pathname === '/chats' ? 'Chats' : appNavigation[page.key].title
  const params = new URLSearchParams(location.search)
  const tab = params.get('tab') ?? 'tasks'
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key === 'k') { event.preventDefault(); setSearch(value => !value) } }
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key)
  }, [])
  return <>
    <header data-slot="appbar" className="sticky top-0 z-20 flex shrink-0 flex-col border-b bg-background text-foreground">
      <div className="flex h-(--header-height) min-w-0 items-center gap-2 px-2"><SidebarTrigger className="size-(--control-height) shrink-0" /><Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" /><AppbarBreadcrumbs crumbs={[{ title, to: location.pathname }]} /><Badge variant="outline">Live</Badge><Button variant="outline" size="icon" aria-label="Search pages" onClick={() => setSearch(true)}><Search /></Button>{children}</div>
      {location.pathname === '/activity' && <AppbarSections activeSection={tab} sections={['tasks', 'runs', 'events'].map(value => ({ value, label: value[0].toUpperCase() + value.slice(1), to: `/activity?tab=${value}`, badge: undefined }))} />}
    </header>
    <CommandDialog open={search} onOpenChange={setSearch} title="Search Conker pages" description="Navigate the dashboard"><CommandInput placeholder="Find a page…" /><CommandList><CommandEmpty>No matching pages.</CommandEmpty><CommandGroup heading="Pages">{Object.values(appNavigation).filter(item => !item.path.includes(':') && item.path !== '*').map(item => <CommandItem key={item.path} value={item.title} onSelect={() => { setSearch(false); navigate(item.path) }}>{item.title}</CommandItem>)}</CommandGroup></CommandList></CommandDialog>
  </>
}
