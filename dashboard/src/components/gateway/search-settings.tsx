import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { PageHeader, WorkspaceSection } from '@/components/design-system/primitives'
import { searchSources, type GatewaySearchClient, type SearchCapabilities, type SearchSettings } from '@/lib/gateway/search'
import { GatewayPageFrame } from './page-frame'

export function GatewaySearchSettings({ client }: { client: GatewaySearchClient }) {
  const [saved, setSaved] = useState<SearchSettings | null>(null)
  const [draft, setDraft] = useState<SearchSettings['configuration'] | null>(null)
  const [capabilities, setCapabilities] = useState<SearchCapabilities | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [pending, setPending] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const value = await client.settings(controller.signal)
        const caps = await client.capabilities(controller.signal)
        if (!controller.signal.aborted) { setSaved(value); setDraft(value.configuration); setCapabilities(caps); setError('') }
      } catch { if (!controller.signal.aborted) setError('Search settings are unavailable on this server. Retry after the search service is updated.') }
    }
    void load()
    return () => controller.abort()
  }, [client, retry])
  async function save() {
    if (!draft || !saved || pending) return
    setPending(true); setError(''); setStatus('')
    try { const next = await client.save(draft, saved.revision); setSaved(next); setDraft(next.configuration); setStatus('Search settings saved.') }
    catch (error) { setError(error instanceof Error ? error.message : 'Search settings could not be saved.') }
    finally { setPending(false) }
  }
  if (!draft || !capabilities) return <GatewayPageFrame>{error ? <><p role="alert">{error}</p><Button variant="outline" onClick={() => setRetry(value => value + 1)}>Retry</Button></> : <p role="status">Loading search settings...</p>}</GatewayPageFrame>
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved?.configuration)
  return <GatewayPageFrame><div className="max-w-3xl space-y-6">
    <PageHeader title="Search" actionsOnly actions={<Button size="sm" disabled={pending || !dirty} onClick={() => void save()}><Save />{pending ? 'Saving...' : 'Save changes'}</Button>} />
    <WorkspaceSection title="Included sources">
      <div className="grid gap-4 sm:grid-cols-3">{searchSources.map(source => <Label key={source} className="flex items-center gap-3"><Checkbox disabled={pending || !capabilities.sources.includes(source)} checked={draft.sources.includes(source)} onCheckedChange={on => { setStatus(''); setDraft(value => value && ({ ...value, sources: on === true ? [...value.sources, source] : value.sources.filter(item => item !== source) })) }} />{source[0].toUpperCase() + source.slice(1)}</Label>)}</div>
      <p className="text-sm text-muted-foreground">Only authorized records are searched. Private and forgotten conversations, credentials and protected inputs are excluded.</p>
    </WorkspaceSection>
    <WorkspaceSection title="Search levels" description="Pages and record metadata work without a model. Exact matches stay identifiable when AI stages are enabled.">
      {([
        ['exactText', 'Exact retained text', capabilities.exactText, 'Search permitted user and assistant messages and source-owned text.'],
        ['semantic', 'Semantic retrieval', capabilities.semanticSources.length > 0, capabilities.semanticSources.length ? `Uses existing indexes for ${capabilities.semanticSources.join(', ')}. Other sources remain literal-only.` : 'No semantic source is available on this server.'],
        ['reranking', 'AI relevance ranking', capabilities.reranking, 'Send a bounded set of permitted excerpts to the explicitly configured search-ranking model.'],
      ] as const).map(([key, label, available, description]) => <div key={key} className="flex items-start justify-between gap-4"><div className="space-y-1"><Label htmlFor={`search-${key}`}>{label}</Label><p className="text-sm text-muted-foreground">{description}</p></div><Switch id={`search-${key}`} disabled={pending || !available} checked={draft[key]} onCheckedChange={on => { setStatus(''); setDraft(value => value && ({ ...value, [key]: on })) }} /></div>)}
    </WorkspaceSection>
    <WorkspaceSection title="Model and fallback" divided={false} description="Assign the search-ranking role, timeout and fallback in advanced model settings. Provider failures retain literal results. Search never sends messages or executes tools."><Button variant="outline" asChild><Link to="/settings">Model settings</Link></Button><p className="text-xs text-muted-foreground">Source-owned indexes · bounded scans of {capabilities.scanLimit} records per source · incomplete coverage is reported with results.</p></WorkspaceSection>
    {status && <p role="status" className="text-sm">{status}</p>}{error && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="outline" disabled={pending} onClick={() => setRetry(value => value + 1)}>Reload settings</Button></div>}
  </div></GatewayPageFrame>
}
