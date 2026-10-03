import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command'
import { gatewayCommandDestinations } from './navigation'

const SearchContext = createContext<(() => void) | null>(null)

export function UniversalSearchTrigger() {
  const open = useContext(SearchContext)
  return <Button type="button" variant="outline" size="sm" className="workspace-search-trigger" aria-label="Search Conker" disabled={!open} onClick={() => open?.()}>
    <Search aria-hidden="true" /><span className="workspace-search-label">Search Conker</span>
  </Button>
}

export function UniversalSearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !event.isComposing) {
        event.preventDefault(); setOpen(value => !value)
      }
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [])
  return <SearchContext.Provider value={() => setOpen(true)}>{children}
    <CommandDialog open={open} onOpenChange={setOpen} title="Search Conker" description="Find pages and records" className="workspace-search-dialog">
      <CommandInput placeholder="Search Conker..." />
      <CommandList><CommandEmpty>No matching pages.</CommandEmpty><CommandGroup heading="Pages">
        {gatewayCommandDestinations.map(item => <CommandItem key={item.path} value={item.title} onSelect={() => { setOpen(false); navigate(item.path) }}>{item.title}</CommandItem>)}
      </CommandGroup></CommandList>
    </CommandDialog>
  </SearchContext.Provider>
}
