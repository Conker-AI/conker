import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ToolEditor } from '@/app/tools/tool-editor'
import '@/app/tools/tools-workspace.css'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { CollectionPanel, CollectionRow, CollectionSection, PageHeader } from '@/components/design-system/primitives'
import { FormActions, OverlayBody, TaskDialogContent } from '@/components/design-system/overlays'
import { createToolDefinition, type ToolDefinition } from '@/lib/tool-workspace'
import type { EditorDraft, GatewayEditorDrafts } from '@/lib/gateway/editor-drafts'

export function GatewayToolDrafts({ client }: { client: GatewayEditorDrafts }) {
  const [params, setParams] = useSearchParams(), id = params.get('draft')
  const [page, setPage] = useState<Awaited<ReturnType<GatewayEditorDrafts['list']>> | null>(null)
  const [draft, setDraft] = useState<EditorDraft | null>(null)
  const [error, setError] = useState(''), [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false), [name, setName] = useState(''), [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const lifetime = useRef<AbortController | null>(null)
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller
    const request = id ? client.get(id, controller.signal).then(value => { if (!controller.signal.aborted) setDraft(value) })
      : client.list(undefined, controller.signal).then(value => { if (!controller.signal.aborted) setPage(value) })
    request.catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load drafts.') })
    return () => controller.abort()
  }, [client, id, refresh])
  async function save(document: ToolDefinition) {
    if (!draft) throw new Error('Reload this draft before saving.')
    const value = await client.save(document, draft.revision, lifetime.current?.signal)
    if (!lifetime.current?.signal.aborted) setDraft(value)
  }
  async function create() {
    if (!name.trim() || busy) return
    setBusy(true); setError('')
    try {
      const value = await client.save(createToolDefinition(`tool-${crypto.randomUUID()}`, name.trim()), 0, lifetime.current?.signal)
      if (!lifetime.current?.signal.aborted) { setCreating(false); setName(''); setParams({ draft: value.id }) }
    } catch (error) { if (!lifetime.current?.signal.aborted) setError(error instanceof Error ? error.message : 'Could not create draft.') }
    finally { setBusy(false) }
  }
  async function more() {
    if (!page?.next_after || busy) return
    setBusy(true); setError('')
    try { const next = await client.list(page.next_after, lifetime.current?.signal); if (!lifetime.current?.signal.aborted) setPage({ ...next, items: [...page.items, ...next.items] }) }
    catch (error) { if (!lifetime.current?.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load more drafts.') }
    finally { setBusy(false) }
  }
  if (id && draft) return <ToolEditor key={id} record={{ id, draft: draft.document, published: [], runs: [] }} records={[]} liveSave={save} onBack={() => setParams({ view: 'drafts' })} />
  const items = page?.items.filter(item => `${item.name} ${item.id}`.toLowerCase().includes(query.trim().toLowerCase())) ?? []
  return <main className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><PageHeader title="Tool drafts" description="Saved in ToolGate. Draft changes do not publish or execute tools." density="compact" /><div className="flex gap-2"><Button variant="outline" size="sm" asChild><Link to="/tools">Available tools</Link></Button><Button size="sm" onClick={() => setCreating(true)}>New draft</Button></div></div>
    {error && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{error}</p><Button size="sm" variant="outline" onClick={() => { setError(''); setDraft(null); setPage(null); setRefresh(value => value + 1) }}>Reload drafts</Button></div>}
    {!page && !error && <p role="status">Loading draft…</p>}
    {page && <CollectionPanel query={query} onQueryChange={setQuery} label="Search loaded drafts" placeholder="Search loaded drafts…" count={items.length} unit="drafts" emptyTitle="No matching drafts" emptyDescription="Create a draft or adjust your search."><CollectionSection title="Saved drafts" contained><ul>{items.map(item => <CollectionRow key={item.id} to={`/tools?draft=${item.id}`} title={item.name} description={item.kind} trailing={`Revision ${item.revision}`} />)}</ul></CollectionSection></CollectionPanel>}
    {page?.next_after && <Button variant="outline" disabled={busy} onClick={() => void more()}>Load more drafts</Button>}
    <Dialog open={creating} onOpenChange={value => { if (!busy) setCreating(value) }}><TaskDialogContent title="New tool draft" description="Creates a saved workflow draft. Nothing runs or becomes available to your agent."><OverlayBody><Label htmlFor="draft-name">Name</Label><Input id="draft-name" value={name} maxLength={100} disabled={busy} onChange={event => setName(event.target.value)} />{error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}</OverlayBody><FormActions inset><Button variant="outline" disabled={busy} onClick={() => setCreating(false)}>Cancel</Button><Button disabled={busy || !name.trim()} onClick={() => void create()}>Create draft</Button></FormActions></TaskDialogContent></Dialog>
  </main>
}
