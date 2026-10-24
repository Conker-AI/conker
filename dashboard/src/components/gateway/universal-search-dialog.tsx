import { useRef } from 'react'
import { Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Command, CommandDialog, CommandDialogPopup, CommandInput, CommandList, CommandGroup, CommandGroupLabel, CommandItem } from '@/components/ui/command'
import { isQueryEdit } from '@/lib/command-query'
import { searchStages as stages } from './universal-search-state'
import type { useUniversalSearch } from './use-universal-search'
import { gatewayCommandDestinations } from './navigation'

const labels = { metadata: 'Records', text: 'Exact retained text', semantic: 'Semantic matches' }

/** The palette itself, loaded on first use; state, shortcuts and navigation stay in the provider. */
export default function UniversalSearchDialog({ state, error, opener, select, selectRecord }: {
  state: ReturnType<typeof useUniversalSearch>; error: string | null; opener: { current: HTMLElement | null }
  select: (href: string) => void; selectRecord: (id: string) => void
}) {
  const { open, query, results, pending, search } = state
  const input = useRef<HTMLInputElement | null>(null)
  const trimmed = query.trim()
  const pages = gatewayCommandDestinations.filter(item => !trimmed || item.title.toLocaleLowerCase().includes(trimmed.toLocaleLowerCase()))
  const gaps = [...new Set(Object.values(results).flatMap(page => page.coverage.filter(item => item.status !== 'searched').map(item => `${item.source}: ${item.status}`)))]
  const exactRecords = new Set(results.text?.results.map(item => `${item.source}:${item.recordId}`))
  return <CommandDialog open={open} onOpenChange={search.setOpen}>
      <CommandDialogPopup className="workspace-search-dialog" aria-label="Search Conker" aria-description="Find pages and authorized records" finalFocus={() => opener.current?.isConnected ? opener.current : true}>
      <Command value={query} onValueChange={(value, details) => { if (isQueryEdit(details.reason)) search.query(value) }}>
      <CommandInput ref={input} placeholder="Search Conker..." maxLength={200} />
      <CommandList className="max-h-[60dvh]">
        {pages.length > 0 && <CommandGroup><CommandGroupLabel>Pages</CommandGroupLabel>{pages.map(item => <CommandItem key={item.path} value={`page:${item.path}`} onClick={() => select(item.path)}>{item.title}</CommandItem>)}</CommandGroup>}
        {stages.map(stage => {
          const page = results[stage]
          const shown = page?.results.filter(item => stage !== 'metadata' || !exactRecords.has(`${item.source}:${item.recordId}`)) ?? []
          // A stage with nothing to show keeps its heading out of the list.
          return page && (shown.length > 0 || page.nextCursor) && <CommandGroup key={stage}><CommandGroupLabel>{labels[stage]}</CommandGroupLabel>
          {shown.map(item => <CommandItem key={item.id} value={item.id} onClick={() => selectRecord(item.id)} className="items-start">
            <div className="min-w-0 flex-1 space-y-1"><div className="break-words font-medium">{item.title}</div><p className="line-clamp-2 break-words text-xs text-muted-foreground">{item.excerpt}</p><p className="text-xs text-muted-foreground">{item.source} · {item.matchType === 'text' ? 'Exact text' : item.matchType === 'semantic' ? 'Semantic' : 'Metadata'}{item.role ? ` · ${item.role}` : ''}</p></div>
          </CommandItem>)}
          {page.nextCursor && <CommandItem value={`more:${stage}`} disabled={pending} onClick={() => search.more(stage)}>Load more {labels[stage].toLowerCase()}</CommandItem>}
        </CommandGroup>
        })}
        {trimmed && !pending && !pages.length && !Object.values(results).some(page => page.results.length) && !error && <p className="p-6 text-center text-sm text-muted-foreground">No matches in searched sources.</p>}
      </CommandList>
      <div className="space-y-2 border-t p-3 text-xs text-muted-foreground" aria-live="polite" onKeyDown={event => {
        // Native footer buttons own Enter; the command list otherwise also activates its highlighted result.
        if (event.key === 'Enter') event.stopPropagation()
      }}>
        {pending && <p role="status">Searching...</p>}{error && <div className="flex flex-wrap items-center gap-2"><p role="status">{error}</p><Button variant="outline" size="sm" disabled={pending} onClick={() => { search.retry(); input.current?.focus() }}>Try again</Button></div>}
        {gaps.length > 0 && <p>Incomplete coverage: {gaps.join(', ')}.</p>}
        {Object.values(results).some(page => page.ranking.status === 'ranked') && <p>AI ranked bounded candidates; match labels remain unchanged.</p>}
        {Object.values(results).some(page => ['fallback', 'unavailable'].includes(page.ranking.status)) && <p>AI ranking unavailable; literal results retained.</p>}
        <Button variant="ghost" size="sm" onClick={() => select('/settings?tab=search')}><Settings2 />Search settings</Button>
      </div>
      </Command>
      </CommandDialogPopup>
    </CommandDialog>
}
