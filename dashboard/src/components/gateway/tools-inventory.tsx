import { DetailPanel, OverlayBody } from '@/components/design-system/overlays'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { PageHeader, CollectionPanel, CollectionRow, CollectionSection } from '@/components/design-system/primitives'
import type { GatewayControlClient, ToolInventory } from '@/lib/gateway/control'

export function GatewayToolsInventory({ client }: { client: GatewayControlClient }) {
  const [value, setValue] = useState<ToolInventory | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [revision, setRevision] = useState(0)
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    const controller = new AbortController()
    client.tools(controller.signal).then(value => { if (!controller.signal.aborted) setValue(value) })
      .catch(() => { if (!controller.signal.aborted) setError('Tool availability could not be verified. Refresh to try again.') })
    return () => controller.abort()
  }, [client, revision])
  const selected = value?.status === 'ok' ? value.results.find(tool => tool.id === params.get('tool')) : undefined
  const rows = value?.results.filter(tool => `${tool.name} ${tool.id} ${tool.description}`.toLowerCase().includes(query.trim().toLowerCase())) ?? []
  return <main className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><PageHeader title="Available tools" description="Tools currently exposed to Pi by its scoped ToolGate connection." density="compact" /><Button size="sm" variant="outline" disabled={!value && !error} onClick={() => { setValue(null); setError(''); setRevision(v => v + 1) }}>Refresh tools</Button></div>
    <Button variant="outline" size="sm" asChild><Link to="/tools?view=drafts">Open tool drafts</Link></Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!value && !error && <p role="status" className="text-sm text-muted-foreground">Checking ToolGate…</p>}
    {value && value.status !== 'ok' && <p role="status" className="text-sm text-muted-foreground">{value.status === 'not_configured' ? 'The runtime has no ToolGate connection configured.' : 'ToolGate is unavailable. This does not mean your tool inventory is empty.'}</p>}
    {value?.status === 'ok' && <>
      <CollectionPanel query={query} onQueryChange={setQuery} label="Search available tools" placeholder="Search tools…" count={rows.length} unit="tools" emptyTitle={query ? 'No matching tools' : 'No tools granted to this runtime'} emptyDescription={query ? 'Try a tool name or description.' : 'ToolGate is reachable, but this runtime currently has no tools available. Registered tools may exist outside its execution scope.'}>
        <CollectionSection title={`${rows.length} available tools`} contained><ul>{rows.map(tool => <CollectionRow key={tool.id} to={`/tools?tool=${encodeURIComponent(tool.id)}`} title={tool.name || tool.id} description={<span className="truncate">{tool.description || tool.id}</span>} trailing={`${tool.inputs.length} inputs`} />)}</ul></CollectionSection>
      </CollectionPanel>
      {params.get('tool') && !selected && <p role="status" className="text-sm text-muted-foreground">This tool is no longer available to the runtime.</p>}
      <DetailPanel open={Boolean(selected)} onOpenChange={open => { if (!open) setParams({}) }} title={selected?.name || selected?.id || 'Tool details'} description="Inputs exposed by ToolGate to this runtime.">
        {selected && <OverlayBody><div className="space-y-3"><code className="break-all text-xs">{selected.id}</code><p className="whitespace-pre-wrap break-words text-sm">{selected.description}</p><h3 className="text-sm font-medium">Inputs</h3>{selected.inputs.length ? <dl className="divide-y">{selected.inputs.map((input, index) => <div key={`${input.name}:${index}`} className="space-y-1 py-2 text-sm"><dt className="break-words font-medium">{input.name} · {input.type}{input.required === undefined ? '' : input.required ? ' · required' : ' · optional'}</dt>{input.description && <dd className="break-words text-muted-foreground">{input.description}</dd>}</div>)}</dl> : <p className="text-sm text-muted-foreground">No inputs declared.</p>}</div></OverlayBody>}
      </DetailPanel>
    </>}
    <p className="text-xs text-muted-foreground">This is the runtime's available-tool list. Draft editing is available separately. Publication and permission management are not connected here yet. Availability does not bypass ToolGate's approval rules.</p>
  </main>
}
