import { lazy, Suspense, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { GatewaySearchClient } from '@/lib/gateway/search'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { GatewayRuntimeWorkspaceState } from './runtime-state'
import type { GatewaySourcePrivacyState } from './source-privacy'
import { useUniversalSearch } from './use-universal-search'
import { useSearchShortcut } from './search-shortcut'
import { UniversalSearchContext, useWorkspaceChrome } from '@/lib/workspace-chrome'

const UniversalSearchDialog = lazy(() => import('./universal-search-dialog'))

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
  const state = useUniversalSearch(client, authStore, workspace, sourcePrivacy)
  const { open, error: failure, search } = state
  const error = failure === 'settings' ? 'Record search is unavailable. Page navigation still works.'
    : failure === 'sources' ? 'Some record sources could not be searched. Available results remain below.'
    : failure === 'more' ? 'More results could not be loaded. Your loaded results are still here.' : null
  const opener = useRef<HTMLElement | null>(null)
  const navigate = useNavigate()
  // Mount the palette on first open and keep it, so closing still animates and returns focus.
  const [mounted, setMounted] = useState(open)
  if (open && !mounted) setMounted(true)
  useEffect(() => {
    // Warm the palette module after start-up so the first search opens without a wait.
    const timer = setTimeout(() => { void import('./universal-search-dialog') }, 2000)
    return () => clearTimeout(timer)
  }, [])
  const shortcut = useSearchShortcut()
  useEffect(() => {
    if (!shortcut) return
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === shortcut && !event.isComposing) {
        if (document.activeElement instanceof HTMLElement && !document.activeElement.closest('[data-slot="command-dialog-popup"]')) opener.current = document.activeElement
        event.preventDefault(); search.setOpen(!search.store.getState().open)
      }
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [search, shortcut])
  function select(href: string) { search.setOpen(false); navigate(href) }
  function selectRecord(id: string) { const href = search.resultHref(id); if (href) select(href) }
  return <UniversalSearchContext.Provider value={(value, returnTo) => { opener.current = returnTo ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null); search.query(value ?? ''); search.setOpen(true) }}>{children}
    {mounted && <Suspense fallback={null}><UniversalSearchDialog state={state} error={error} opener={opener} select={select} selectRecord={selectRecord} /></Suspense>}
  </UniversalSearchContext.Provider>
}
