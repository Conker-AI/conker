import { useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CommandDialog, CommandInput, CommandList, CommandGroup, CommandItem } from '@/components/ui/command'
import type { GatewaySearchClient, SearchPage } from '@/lib/gateway/search'
import { gatewayCommandDestinations } from './navigation'
import { UniversalSearchContext, useWorkspaceChrome } from '@/lib/workspace-chrome'

const stages = ['metadata', 'text', 'semantic'] as const
const labels = { metadata: 'Records', text: 'Exact retained text', semantic: 'Semantic matches' }
type Results = Partial<Record<SearchPage['stage'], SearchPage>>

export function UniversalSearchTrigger() {
  const open = useContext(UniversalSearchContext)
  const chrome = useWorkspaceChrome()
  if (chrome?.searchOwner) return null
  return <Button type="button" variant="outline" size="sm" className="workspace-search-trigger" aria-label="Search Conker" disabled={!open} onClick={() => open?.()}>
    <Search aria-hidden="true" /><span className="workspace-search-label">Search Conker</span>
  </Button>
}

export function UniversalSearchProvider({ children, client }: { children: ReactNode; client: GatewaySearchClient }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Results>({})
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const navigate = useNavigate()
  const trimmed = query.trim()
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !event.isComposing) {
        if (document.activeElement instanceof HTMLElement && !document.activeElement.closest('[data-slot="command"]')) opener.current = document.activeElement
        event.preventDefault(); request.current?.abort(); setResults({}); setError(''); setPending(false); setOpen(value => !value)
      }
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    request.current = controller
    const timer = window.setTimeout(async () => {
      if (!open || !trimmed) return
      setPending(true)
      try {
        const { configuration } = await client.settings(controller.signal)
        for (const stage of stages) {
          if (controller.signal.aborted) return
          if (stage === 'text' && !configuration.exactText || stage === 'semantic' && !configuration.semantic) continue
          try {
            const page = await client.query(trimmed, stage, controller.signal)
            if (!controller.signal.aborted) setResults(value => ({ ...value, [stage]: page }))
          } catch {
            if (controller.signal.aborted) return
            setError('Some record sources could not be searched. Available results remain below.')
          }
        }
      } catch {
        if (!controller.signal.aborted) setError('Record search is unavailable on this server. Page navigation still works.')
      } finally {
        if (!controller.signal.aborted) setPending(false)
      }
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [client, open, trimmed])
  function changeQuery(value: string) {
    request.current?.abort(); setQuery(value); setResults({}); setError(''); setPending(Boolean(value.trim()))
  }
  function changeOpen(value: boolean) {
    if (!value) request.current?.abort()
    setOpen(value); setResults({}); setError(''); setPending(false)
  }
  function select(href: string) { changeOpen(false); navigate(href) }
  async function more(stage: SearchPage['stage']) {
    const page = results[stage], controller = request.current
    if (!page?.nextCursor || !controller || controller.signal.aborted || pending) return
    setPending(true)
    try {
      const next = await client.query(trimmed, stage, controller.signal, page.nextCursor)
      if (!controller.signal.aborted) setResults(value => ({ ...value, [stage]: { ...next, results: [...(value[stage]?.results ?? []), ...next.results] } }))
    } catch { if (!controller.signal.aborted) setError('More results could not be loaded. Retry this search.') }
    finally { if (!controller.signal.aborted) setPending(false) }
  }
  const pages = gatewayCommandDestinations.filter(item => !trimmed || item.title.toLocaleLowerCase().includes(trimmed.toLocaleLowerCase()))
  const gaps = [...new Set(Object.values(results).flatMap(page => page.coverage.filter(item => item.status !== 'searched').map(item => `${item.source}: ${item.status}`)))]
  const exactRecords = new Set(results.text?.results.map(item => `${item.source}:${item.recordId}`))
  return <UniversalSearchContext.Provider value={(value, returnTo) => { opener.current = returnTo ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null); changeOpen(true); changeQuery(value ?? '') }}>{children}
    <CommandDialog open={open} onOpenChange={changeOpen} shouldFilter={false} title="Search Conker" description="Find pages and authorized records" className="workspace-search-dialog" onCloseAutoFocus={event => { if (opener.current?.isConnected) { event.preventDefault(); opener.current.focus() } }}>
      <CommandInput placeholder="Search Conker..." value={query} onValueChange={changeQuery} maxLength={200} />
      <CommandList className="max-h-[60dvh]">
        {pages.length > 0 && <CommandGroup heading="Pages">{pages.map(item => <CommandItem key={item.path} value={`page:${item.path}`} onSelect={() => select(item.path)}>{item.title}</CommandItem>)}</CommandGroup>}
        {stages.map(stage => results[stage] && <CommandGroup key={stage} heading={labels[stage]}>
          {results[stage]!.results.filter(item => stage !== 'metadata' || !exactRecords.has(`${item.source}:${item.recordId}`)).map(item => <CommandItem key={item.id} value={item.id} onSelect={() => select(item.href)} className="items-start">
            <div className="min-w-0 flex-1 space-y-1"><div className="break-words font-medium">{item.title}</div><p className="line-clamp-2 break-words text-xs text-muted-foreground">{item.excerpt}</p><p className="text-xs text-muted-foreground">{item.source} · {item.matchType === 'text' ? 'Exact text' : item.matchType === 'semantic' ? 'Semantic' : 'Metadata'}{item.role ? ` · ${item.role}` : ''}</p></div>
          </CommandItem>)}
          {results[stage]!.nextCursor && <CommandItem value={`more:${stage}`} disabled={pending} onSelect={() => void more(stage)}>Load more {labels[stage].toLowerCase()}</CommandItem>}
        </CommandGroup>)}
        {trimmed && !pending && !pages.length && !Object.values(results).some(page => page.results.length) && !error && <p className="p-6 text-center text-sm text-muted-foreground">No matches in searched sources.</p>}
      </CommandList>
      <div className="space-y-2 border-t p-3 text-xs text-muted-foreground" aria-live="polite">
        {pending && <p role="status">Searching...</p>}{error && <p role="status">{error}</p>}
        {gaps.length > 0 && <p>Incomplete coverage: {gaps.join(', ')}.</p>}
        {Object.values(results).some(page => page.ranking.status === 'ranked') && <p>AI ranked bounded candidates; match labels remain unchanged.</p>}
        {Object.values(results).some(page => ['fallback', 'unavailable'].includes(page.ranking.status)) && <p>AI ranking unavailable; literal results retained.</p>}
        <Button variant="ghost" size="sm" onClick={() => select('/settings?tab=search')}><Settings2 />Search settings</Button>
      </div>
    </CommandDialog>
  </UniversalSearchContext.Provider>
}
