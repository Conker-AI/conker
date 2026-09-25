import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { appNavigation, matchAppRoute } from '@/config/navigation'
import { AppbarSections } from '@/components/appbar-navigation'
import { CanvasToggle } from './canvas-toggle'
import { Button } from '@/components/ui/button'
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command'

export function GatewayHeader() {
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
    <header data-slot="appbar" className="sticky top-0 z-20 flex shrink-0 flex-col bg-background text-foreground">
      {/* The same quiet bar as the chat: the toggle when the sidebar is hidden, and page search. Pages carry their own title. */}
      <div className="flex h-14 min-w-0 items-center gap-1 px-3"><CanvasToggle /><span className="sr-only">{title}</span><Button variant="ghost" size="icon" className="ml-auto text-muted-foreground" aria-label="Search pages" onClick={() => setSearch(true)}><Search /></Button></div>
      {location.pathname === '/activity' && <AppbarSections activeSection={tab} sections={['tasks', 'runs', 'events'].map(value => ({ value, label: value[0].toUpperCase() + value.slice(1), to: `/activity?tab=${value}`, badge: undefined }))} />}
    </header>
    <CommandDialog open={search} onOpenChange={setSearch} title="Go to a page" description="Jump to any part of Conker"><CommandInput placeholder="Find a page…" /><CommandList><CommandEmpty>No matching pages.</CommandEmpty><CommandGroup heading="Pages">{Object.values(appNavigation).filter(item => !item.path.includes(':') && item.path !== '*').map(item => <CommandItem key={item.path} value={item.title} onSelect={() => { setSearch(false); navigate(item.path) }}>{item.title}</CommandItem>)}</CommandGroup></CommandList></CommandDialog>
  </>
}
