import { useEffect, useRef, useState } from 'react'
import { ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandInput, CommandList, CommandItem } from '@/components/ui/command'
import type { GatewayEditorDrafts, EditorCapability } from '@/lib/gateway/editor-drafts'
import type { ToolNode } from '@/lib/tool-workspace'

export function GatewayCapabilityPicker({ client, node, onChange }: { client: GatewayEditorDrafts; node: ToolNode; onChange: (node: ToolNode) => void }) {
  const kind = node.type === 'workflow_call' ? 'workflow' : 'tool'
  const [open, setOpen] = useState(false), [query, setQuery] = useState('')
  const [page, setPage] = useState<Awaited<ReturnType<GatewayEditorDrafts['capabilities']>> | null>(null)
  const [selected, setSelected] = useState<EditorCapability | null>(null)
  const [error, setError] = useState(''), [loading, setLoading] = useState(false), [retry, setRetry] = useState(0)
  const request = useRef<AbortController | null>(null)
  const identity = String(kind === 'workflow' ? node.config.toolId : node.config.tool)
  useEffect(() => {
    if (!open) return
    const controller = new AbortController(); request.current = controller
    const timeout = setTimeout(() => {
      setLoading(true)
      client.capabilities(kind, query, undefined, controller.signal).then(value => {
        if (!controller.signal.aborted) { setPage(value); setError('') }
      }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load capabilities.') })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 180)
    return () => { clearTimeout(timeout); controller.abort() }
  }, [client, kind, open, query, retry])
  async function more() {
    if (!page?.next_after || loading) return
    setLoading(true)
    const signal = request.current?.signal
    try {
      const next = await client.capabilities(kind, query, page.next_after, signal)
      if (!signal?.aborted) setPage({ ...next, items: [...page.items, ...next.items] })
    } catch (error) { if (!signal?.aborted) setError(error instanceof Error ? error.message : 'Could not load more capabilities.') }
    finally { if (!signal?.aborted) setLoading(false) }
  }
  function choose(item: EditorCapability) {
    setSelected(item); setOpen(false)
    onChange({ ...node, config: { ...node.config, ...(kind === 'workflow' ? { toolId: item.id, version: item.version } : { tool: item.id }) } })
  }
  const details = selected?.id === identity ? selected : page?.items.find(item => item.id === identity)
  return <div className="space-y-2"><Popover open={open} onOpenChange={value => { setOpen(value); if (value) { setPage(null); setError(''); setLoading(true) } }}><PopoverTrigger asChild>
    <Button variant="outline" role="combobox" aria-label={kind === 'workflow' ? 'Published workflow to call' : 'Registered tool to call'} aria-expanded={open} className="w-full justify-between gap-2"><span className="truncate">{details?.name || identity || 'Choose a capability'}{kind === 'workflow' && node.config.version ? ` · v${node.config.version}` : ''}</span><ChevronsUpDown className="shrink-0" /></Button>
  </PopoverTrigger><PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start"><Command shouldFilter={false}>
    <CommandInput value={query} maxLength={100} onValueChange={value => { setQuery(value); setPage(null); setError(''); setLoading(true) }} placeholder={`Search registered ${kind === 'workflow' ? 'workflows' : 'tools'}…`} />
    <CommandList aria-label="Registered capabilities">
      {page?.items.map(item => <CommandItem key={item.id} value={item.id} onSelect={() => choose(item)} className="items-start"><div className="min-w-0"><p className="font-medium">{item.name}{kind === 'workflow' ? ` · v${item.version}` : ''}</p><p className="truncate text-xs text-muted-foreground">{item.id}</p>{item.description && <p className="line-clamp-2 text-xs text-muted-foreground">{item.description}</p>}</div></CommandItem>)}
      {loading && <p role="status" className="p-3 text-xs text-muted-foreground">Loading…</p>}
      {!loading && page?.items.length === 0 && <p className="p-3 text-xs text-muted-foreground">No matching registered capabilities.</p>}
      {error && <div className="p-3"><p role="alert" className="text-xs text-destructive">{error}</p><Button size="sm" variant="ghost" onClick={() => setRetry(value => value + 1)}>Retry</Button></div>}
      {page?.next_after && <Button variant="ghost" size="sm" disabled={loading} onClick={() => void more()}>Load more</Button>}
    </CommandList>
  </Command></PopoverContent></Popover>
    {details && <div className="space-y-1 text-xs text-muted-foreground"><p>{details.authorization === 'auto' ? 'Subject to caller permissions' : 'Requires owner approval'}</p><p>{details.inputs.length ? `Inputs: ${details.inputs.map(field => `${field.name}${field.required ? '*' : ''} (${field.type})`).join(', ')}` : 'No declared inputs.'}</p></div>}
  </div>
}
