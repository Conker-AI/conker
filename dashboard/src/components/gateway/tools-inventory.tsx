import { DetailPanel, OverlayBody } from '@/components/design-system/overlays'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { PageHeader, CollectionPanel, CollectionRow, CollectionSection } from '@/components/design-system/primitives'
import type { GatewayControlClient, ToolInventory } from '@/lib/gateway/control'
import { plainStatus } from './plain-status'

export function GatewayToolsInventory({ client }: { client: GatewayControlClient }) {
  const [value, setValue] = useState<ToolInventory | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [revision, setRevision] = useState(0)
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    const controller = new AbortController()
    client.tools(controller.signal).then(value => { if (!controller.signal.aborted) setValue(value) })
      .catch(() => { if (!controller.signal.aborted) setError('Tool availability could not be checked. Refresh to try again.') })
    return () => controller.abort()
  }, [client, revision])
  const selected = value?.status === 'ok' ? value.results.find(tool => tool.id === params.get('tool')) : undefined
  const rows = value?.results.filter(tool => `${tool.name} ${tool.id} ${tool.description}`.toLowerCase().includes(query.trim().toLowerCase())) ?? []
  return <main className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><PageHeader title="Available tools" description="Actions and workflows this workspace can offer right now." density="compact" /><Button size="sm" variant="outline" disabled={!value && !error} onClick={() => { setValue(null); setError(''); setRevision(v => v + 1) }}>Refresh tools</Button></div>
    <Button variant="outline" size="sm" asChild><Link to="/tools?view=drafts">Open tool drafts</Link></Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!value && !error && <p role="status" className="text-sm text-muted-foreground">Checking available tools…</p>}
    {value && value.status !== 'ok' && <p role="status" className="text-sm text-muted-foreground">{value.status === 'not_configured' ? 'Tools are not set up yet.' : `Tools are ${plainStatus(value.status).toLocaleLowerCase()}. This does not mean your tool list is empty.`}</p>}
    {value?.status === 'ok' && <>
      <CollectionPanel query={query} onQueryChange={setQuery} label="Search available tools" placeholder="Search tools…" count={rows.length} unit="tools" emptyTitle={query ? 'No matching tools' : 'No tools available here'} emptyDescription={query ? 'Try a tool name or description.' : 'The tool service is reachable, but this workspace does not currently have tools available.'}>
        <CollectionSection title="Available" contained><ul>{rows.map(tool => <CollectionRow key={tool.id} to={`/tools?tool=${encodeURIComponent(tool.id)}`} title={tool.name || 'Untitled tool'} description={<span className="truncate">{tool.description || 'No description supplied.'}</span>} trailing={tool.inputs.length === 1 ? '1 input' : `${tool.inputs.length} inputs`} />)}</ul></CollectionSection>
      </CollectionPanel>
      {params.get('tool') && !selected && <p role="status" className="text-sm text-muted-foreground">This tool is no longer available here.</p>}
      <DetailPanel open={Boolean(selected)} onOpenChange={open => { if (!open) setParams({}) }} title={selected?.name || 'Tool details'} description="Inputs available to this workspace.">
        {selected && <OverlayBody><div className="space-y-3">
          <p className="whitespace-pre-wrap break-words text-sm">{selected.description || 'No description supplied.'}</p>
          <h3 className="text-sm font-medium">Inputs</h3>
          {selected.inputs.length ? <dl className="divide-y">{selected.inputs.map((input, index) => <div key={`${input.name}:${index}`} className="space-y-1 py-2 text-sm"><dt className="break-words font-medium">{input.name} · {input.type}{input.required === undefined ? '' : input.required ? ' - required' : ' - optional'}</dt>{input.description && <dd className="break-words text-muted-foreground">{input.description}</dd>}</div>)}</dl> : <p className="text-sm text-muted-foreground">No inputs declared.</p>}
          <details className="text-xs text-muted-foreground"><summary className="cursor-pointer font-medium">Technical details</summary><code className="mt-2 block break-all">{selected.id}</code></details>
        </div></OverlayBody>}
      </DetailPanel>
    </>}
    <p className="text-xs text-muted-foreground">Anything that sends, spends or changes something still asks for your OK in the Inbox.</p>
  </main>
}
