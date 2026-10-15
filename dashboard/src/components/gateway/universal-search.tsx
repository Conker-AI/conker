import { useContext, useEffect, useRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CommandDialog, CommandInput, CommandList, CommandGroup, CommandItem } from '@/components/ui/command'
import type { GatewaySearchClient } from '@/lib/gateway/search'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { GatewayRuntimeWorkspaceState } from './runtime-state'
import type { GatewaySourcePrivacyState } from './source-privacy'
import { searchStages as stages } from './universal-search-state'
import { useUniversalSearch } from './use-universal-search'
import { gatewayCommandDestinations } from './navigation'
import { UniversalSearchContext, useWorkspaceChrome } from '@/lib/workspace-chrome'

const labels = { metadata: 'Records', text: 'Exact retained text', semantic: 'Semantic matches' }

export function UniversalSearchTrigger() {
  const open = useContext(UniversalSearchContext)
  const chrome = useWorkspaceChrome()
  if (chrome?.searchOwner) return null
  return <Button type="button" variant="outline" size="sm" className="workspace-search-trigger" aria-label="Search Conker" disabled={!open} onClick={() => open?.()}>
    <Search aria-hidden="true" /><span className="workspace-search-label">Search Conker</span>
  </Button>
}

export function UniversalSearchProvider({ children, client, authStore, workspace, sourcePrivacy }: {
  children: ReactNode; client: GatewaySearchClient; authStore: GatewayAuthStore
  workspace: GatewayRuntimeWorkspaceState; sourcePrivacy: GatewaySourcePrivacyState
}) {
  const { open, query, results, pending, error: failure, search } = useUniversalSearch(client, authStore, workspace, sourcePrivacy)
  const error = failure === 'settings' ? 'Record search is unavailable. Page navigation still works.'
    : failure === 'sources' ? 'Some record sources could not be searched. Available results remain below.'
    : failure === 'more' ? 'More results could not be loaded. Your loaded results are still here.' : null
  const opener = useRef<HTMLElement | null>(null)
  const input = useRef<HTMLInputElement | null>(null)
  const navigate = useNavigate()
  const trimmed = query.trim()
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !event.isComposing) {
        if (document.activeElement instanceof HTMLElement && !document.activeElement.closest('[data-slot="command"]')) opener.current = document.activeElement
        event.preventDefault(); search.setOpen(!search.store.getState().open)
      }
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [search])
  function select(href: string) { search.setOpen(false); navigate(href) }
  function selectRecord(id: string) { const href = search.resultHref(id); if (href) select(href) }
  const pages = gatewayCommandDestinations.filter(item => !trimmed || item.title.toLocaleLowerCase().includes(trimmed.toLocaleLowerCase()))
  const gaps = [...new Set(Object.values(results).flatMap(page => page.coverage.filter(item => item.status !== 'searched').map(item => `${item.source}: ${item.status}`)))]
  const exactRecords = new Set(results.text?.results.map(item => `${item.source}:${item.recordId}`))
  return <UniversalSearchContext.Provider value={(value, returnTo) => { opener.current = returnTo ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null); search.query(value ?? ''); search.setOpen(true) }}>{children}
    <CommandDialog open={open} onOpenChange={search.setOpen} shouldFilter={false} title="Search Conker" description="Find pages and authorized records" className="workspace-search-dialog" onCloseAutoFocus={event => { if (opener.current?.isConnected) { event.preventDefault(); opener.current.focus() } }}>
      <CommandInput ref={input} placeholder="Search Conker..." value={query} onValueChange={search.query} maxLength={200} />
      <CommandList className="max-h-[60dvh]">
        {pages.length > 0 && <CommandGroup heading="Pages">{pages.map(item => <CommandItem key={item.path} value={`page:${item.path}`} onSelect={() => select(item.path)}>{item.title}</CommandItem>)}</CommandGroup>}
        {stages.map(stage => results[stage] && <CommandGroup key={stage} heading={labels[stage]}>
          {results[stage]!.results.filter(item => stage !== 'metadata' || !exactRecords.has(`${item.source}:${item.recordId}`)).map(item => <CommandItem key={item.id} value={item.id} onSelect={() => selectRecord(item.id)} className="items-start">
            <div className="min-w-0 flex-1 space-y-1"><div className="break-words font-medium">{item.title}</div><p className="line-clamp-2 break-words text-xs text-muted-foreground">{item.excerpt}</p><p className="text-xs text-muted-foreground">{item.source} · {item.matchType === 'text' ? 'Exact text' : item.matchType === 'semantic' ? 'Semantic' : 'Metadata'}{item.role ? ` · ${item.role}` : ''}</p></div>
          </CommandItem>)}
          {results[stage]!.nextCursor && <CommandItem value={`more:${stage}`} disabled={pending} onSelect={() => search.more(stage)}>Load more {labels[stage].toLowerCase()}</CommandItem>}
        </CommandGroup>)}
        {trimmed && !pending && !pages.length && !Object.values(results).some(page => page.results.length) && !error && <p className="p-6 text-center text-sm text-muted-foreground">No matches in searched sources.</p>}
      </CommandList>
      <div className="space-y-2 border-t p-3 text-xs text-muted-foreground" aria-live="polite" onKeyDown={event => {
        // Native footer buttons own Enter; cmdk otherwise also activates its selected result.
        if (event.key === 'Enter') event.stopPropagation()
      }}>
        {pending && <p role="status">Searching...</p>}{error && <div className="flex flex-wrap items-center gap-2"><p role="status">{error}</p><Button variant="outline" size="sm" disabled={pending} onClick={() => { search.retry(); input.current?.focus() }}>Try again</Button></div>}
        {gaps.length > 0 && <p>Incomplete coverage: {gaps.join(', ')}.</p>}
        {Object.values(results).some(page => page.ranking.status === 'ranked') && <p>AI ranked bounded candidates; match labels remain unchanged.</p>}
        {Object.values(results).some(page => ['fallback', 'unavailable'].includes(page.ranking.status)) && <p>AI ranking unavailable; literal results retained.</p>}
        <Button variant="ghost" size="sm" onClick={() => select('/settings?tab=search')}><Settings2 />Search settings</Button>
      </div>
    </CommandDialog>
  </UniversalSearchContext.Provider>
}
