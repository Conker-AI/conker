import { ForgetMemory } from './forget-memory'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Maximize, Minimize, RefreshCw } from 'lucide-react'
import { MemoryGraph } from '@/app/memory/memory-graph'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CollectionEmpty, CollectionSearch } from '@/components/design-system/primitives'
import { WorkspaceInspector } from '@/components/design-system/overlays'
import type { GatewayControlClient, MemoryConnections, MemoryContent, MemoryLibrary, MemoryObjectCard, MemoryObjectKind } from '@/lib/gateway/control'
import type { WorkspaceEdge, WorkspaceNode } from '@/lib/memory-layout'

const kinds: MemoryObjectKind[] = ['memory', 'entity', 'evidence', 'analysis', 'episode', 'observation', 'pattern', 'transcript']
const key = (value: MemoryObjectCard) => `${value.type}:${value.id}`
const kindLabels: Record<MemoryObjectKind, string> = {
  memory: 'Memories',
  entity: 'People and things',
  evidence: 'Sources',
  transcript: 'Sources',
  analysis: 'Notes',
  observation: 'Notes',
  pattern: 'Patterns',
  episode: 'Episodes',
}
/** One record's kind, for table rows and the inspector; the plural labels are for the filter. */
const kindLabel: Record<MemoryObjectKind, string> = {
  memory: 'Memory', entity: 'Person or thing', evidence: 'Source', transcript: 'Source',
  analysis: 'Note', observation: 'Note', pattern: 'Pattern', episode: 'Episode',
}
const fieldLabels: Record<string, string> = {
  content: 'Content',
  text: 'Text',
  preview: 'Preview',
  title: 'Title',
  summary: 'Summary',
  source: 'Source',
  evidence: 'Source',
  transcript: 'Transcript',
  analysis: 'Note',
  observation: 'Observation',
}
const fieldLabel = (value: string) => fieldLabels[value] ?? value.replaceAll('_', ' ')

export function GatewayMemoryWorkspace({ client }: { client: GatewayControlClient }) {
  const [page, setPage] = useState<MemoryLibrary | null>(null)
  const [search, setSearch] = useState(''), [query, setQuery] = useState('')
  const [type, setType] = useState<MemoryObjectKind | 'all'>('all')
  const [view, setView] = useState('database'), [expanded, setExpanded] = useState(false)
  const [selected, setSelected] = useState<MemoryObjectCard | null>(null)
  const [detail, setDetail] = useState<MemoryConnections | null>(null)
  const [content, setContent] = useState<MemoryContent | null>(null)
  const [error, setError] = useState(''), [detailError, setDetailError] = useState('')
  const [busy, setBusy] = useState(true), [revision, setRevision] = useState(0)
  const workspace = useRef<HTMLDivElement>(null)
  const detailEpoch = useRef(0), libraryEpoch = useRef(0), contentEpoch = useRef(0)
  useEffect(() => {
    const controller = new AbortController(), epoch = ++libraryEpoch.current
    client.library({ search: query, type: type === 'all' ? undefined : type, signal: controller.signal }).then(value => {
      if (epoch === libraryEpoch.current && !controller.signal.aborted) setPage(value)
    }).catch(error => { if (!controller.signal.aborted) setError(error.message) }).finally(() => { if (!controller.signal.aborted) setBusy(false) })
    return () => { controller.abort(); libraryEpoch.current = epoch + 1 }
  }, [client, query, type, revision])
  useEffect(() => {
    const controller = new AbortController(), epoch = ++detailEpoch.current
    if (selected) client.connections(selected.type, selected.id, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setDetail(value) }).catch(error => { if (!controller.signal.aborted) setDetailError(error.message) })
    return () => { controller.abort(); detailEpoch.current = epoch + 1 }
  }, [client, selected])
  useEffect(() => {
    if (!expanded) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false) }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [expanded])
  const records = useMemo(() => [...new Map([...(page?.objects ?? []), ...(detail?.nodes ?? []), ...(selected ? [selected] : [])].map(item => [key(item), item])).values()], [page, detail, selected])
  const graph = useMemo(() => ({
    nodes: records.map(item => ({ id: key(item), kind: item.type === 'evidence' || item.type === 'transcript' ? 'source' : 'memory', label: `${item.title === item.type ? item.preview.slice(0, 65) || item.type : item.title}`, memoryIds: [item.id], displayKind: item.type, colorIndex: kinds.indexOf(item.type) % 5 }) as WorkspaceNode),
    edges: (detail?.links ?? []).map(item => ({ id: item.id, source: `${item.source_type}:${item.source_id}`, target: `${item.target_type}:${item.target_id}`, kind: 'source' }) as WorkspaceEdge),
  }), [records, detail])
  function selectRecord(item: MemoryObjectCard | null) {
    detailEpoch.current++; contentEpoch.current++; setSelected(item); setDetail(null); setContent(null); setDetailError('')
  }
  function refresh() {
    libraryEpoch.current++; setBusy(true); setError(''); setPage(null); selectRecord(null); setRevision(value => value + 1)
  }
  async function more() {
    if (!page?.next_after || busy) return
    const epoch = libraryEpoch.current
    setBusy(true); setError('')
    try {
      const next = await client.library({ search: query, type: type === 'all' ? undefined : type, after: page.next_after })
      if (epoch === libraryEpoch.current) setPage({ ...next, objects: [...new Map([...page.objects, ...next.objects].map(item => [key(item), item])).values()] })
    } catch (error) { if (epoch === libraryEpoch.current) setError(error instanceof Error ? error.message : 'Could not load records.') }
    finally { if (epoch === libraryEpoch.current) setBusy(false) }
  }
  async function expandField(field: string, offset = 0) {
    if (!selected) return
    const epoch = detailEpoch.current, request = ++contentEpoch.current
    setDetailError('')
    try { const value = await client.content(selected.type, selected.id, field, offset); if (epoch === detailEpoch.current && request === contentEpoch.current) setContent(value) }
    catch (error) { if (epoch === detailEpoch.current && request === contentEpoch.current) setDetailError(error instanceof Error ? error.message : 'Could not load field.') }
  }
  return <div ref={workspace} className={`memory-workspace${expanded ? ' memory-workspace-expanded' : ''}`}>
    <div className="memory-workspace-toolbar">
      <Select value={view} onValueChange={setView}><SelectTrigger aria-label="Memory view" className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="database">List</SelectItem><SelectItem value="network">Map</SelectItem></SelectContent></Select>
      <form className="memory-live-search flex min-w-0 flex-1 gap-2" onSubmit={event => { event.preventDefault(); setQuery(search); refresh() }}><CollectionSearch label="Search memory records" value={search} maxLength={200} onChange={event => setSearch(event.target.value)} placeholder="Search your memory…" /><Button type="submit" variant="outline" disabled={busy}>Search</Button></form>
      <Select value={type} onValueChange={value => { setType(value as typeof type); refresh() }}><SelectTrigger aria-label="Memory type" className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All memories</SelectItem>{kinds.map(kind => <SelectItem key={kind} value={kind}>{kindLabels[kind]}</SelectItem>)}</SelectContent></Select>
      <Button size="icon" variant="ghost" aria-label="Refresh memory" disabled={busy} onClick={refresh}><RefreshCw /></Button>
      <Button size="icon" variant="ghost" aria-label={expanded ? 'Restore workspace' : 'Maximize workspace'} onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize /> : <Maximize />}</Button>
    </div>
    {error && <p role="alert" className="border-b p-3 text-sm text-destructive">{error}</p>}
    <div className="memory-workspace-body">
      {!page ? <p role="status" className="p-4 text-sm">{busy ? 'Loading your memory…' : 'Memory could not be loaded.'}</p> : !page.objects.length ? <CollectionEmpty title={query ? 'No matching memories' : 'Your memory list is empty'} description={query ? 'Try a different search or memory type.' : 'Saved memories will appear here with their source relationships.'} /> : view === 'network' ? <MemoryGraph graph={graph} hierarchy={false} selectedId={selected ? key(selected) : ''} focusRequest="" onSelect={node => selectRecord(records.find(item => key(item) === node?.id) ?? null)} /> : <div className="min-w-0 flex-1 overflow-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-muted"><tr><th className="p-3">Memory</th><th className="p-3">Type</th><th className="p-3">Connections</th></tr></thead><tbody>{page.objects.map(item => <tr key={key(item)} className="border-b"><td className="p-3"><button className="text-left underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring" onClick={() => selectRecord(item)}>{item.title === item.type ? item.preview.slice(0, 100) || item.title : item.title}</button></td><td className="p-3">{kindLabel[item.type]}</td><td className="p-3 tabular-nums">{Object.values(item.connections).reduce((sum, count) => sum + count, 0)}</td></tr>)}</tbody></table></div>}
      {selected && <WorkspaceInspector title={selected.title} description={kindLabel[selected.type]} onClose={() => selectRecord(null)}>
        <div className="space-y-4 overflow-y-auto p-4 text-sm">
          <p className="whitespace-pre-wrap break-words">{selected.preview}{selected.preview_truncated && '…'}</p>
          {detailError && <p role="alert" className="text-destructive">{detailError}</p>}
          {selected.type === 'memory' && <ForgetMemory key={selected.id} client={client} memoryId={selected.id} onForgotten={() => { selectRecord(null); setRevision(value => value + 1) }} />}
          <section className="space-y-2 border-t pt-3"><h3 className="font-medium">Content</h3><div className="flex flex-wrap gap-1">{selected.available_fields.map(field => <Button key={field} size="sm" variant="outline" onClick={() => void expandField(field)}>{fieldLabel(field)}</Button>)}</div>{content && <><p className="text-xs text-muted-foreground">{fieldLabel(content.field)} · {content.total_characters} characters</p><pre className="whitespace-pre-wrap break-words font-sans text-sm">{content.content}</pre>{content.next_offset !== null && <Button size="sm" variant="outline" onClick={() => void expandField(content.field, content.next_offset!)}>Next part</Button>}</>}</section>
          <section className="space-y-2 border-t pt-3"><h3 className="font-medium">Connections</h3>{!detail ? <p role="status">Loading connections…</p> : !detail.links.length ? <p className="text-muted-foreground">No recorded relationships.</p> : detail.links.map(link => {
            const outgoing = link.source_type === selected.type && link.source_id === selected.id
            const neighbor = detail.nodes.find(item => item.type === (outgoing ? link.target_type : link.source_type) && item.id === (outgoing ? link.target_id : link.source_id))
            return <Button key={link.id} variant="ghost" className="h-auto w-full justify-start whitespace-normal text-left" onClick={() => { if (neighbor) selectRecord(neighbor) }}>{outgoing ? 'To' : 'From'} {link.relationship.replaceAll('_', ' ')} · {neighbor?.title ?? 'Memory'}</Button>
          })}{detail?.next_after && <Button variant="outline" size="sm" onClick={async () => { const epoch = detailEpoch.current; try { const next = await client.connections(selected.type, selected.id, { after: detail.next_after! }); if (epoch === detailEpoch.current) setDetail({ ...next, links: [...detail.links, ...next.links], nodes: [...new Map([...detail.nodes, ...next.nodes].map(item => [key(item), item])).values()] }) } catch (error) { if (epoch === detailEpoch.current) setDetailError(error instanceof Error ? error.message : 'Could not load connections.') } }}>More connections</Button>}</section>
        </div>
      </WorkspaceInspector>}
    </div>
    <div className="memory-workspace-status"><span role="status">{page ? `${page.objects.length} of ${page.total} memories loaded` : 'Memory'} · Search ready</span>{page?.next_after && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void more()}>Load more</Button>}<span className="hidden md:inline">Select a memory to see its relationships</span></div>
  </div>
}
