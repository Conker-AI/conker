import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { ToolEditor } from '@/app/tools/tool-editor'
import '@/app/tools/tools-workspace.css'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { CollectionPanel, CollectionRow, CollectionSection, PageHeader } from '@/components/design-system/primitives'
import { GatewayPageFrame } from './page-frame'
import { FormActions, OverlayBody, TaskDialogContent } from '@/components/design-system/overlays'
import type { SavedCheck, ToolDefinition } from '@/lib/tool-workspace'
import type { EditorDraft, GatewayEditorDrafts } from '@/lib/gateway/editor-drafts'
import type { ChangeRequestsClient } from '@/lib/gateway/change-requests'
import { draftOrigin, forgetDraftOrigin } from '@/lib/tool-draft-origin'
import { GatewayCapabilityPicker } from './capability-picker'
import { GatewayWorkflowRuns } from './workflow-runs'
import { NewToolDialog } from './new-tool-dialog'

export function GatewayToolDrafts({ client, changes }: { client: GatewayEditorDrafts; changes?: ChangeRequestsClient }) {
  const [params, setParams] = useSearchParams(), id = params.get('draft')
  const [page, setPage] = useState<Awaited<ReturnType<GatewayEditorDrafts['list']>> | null>(null)
  const [draft, setDraft] = useState<EditorDraft | null>(null)
  const [error, setError] = useState(''), [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false), [busy, setBusy] = useState(false)
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
  async function more() {
    if (!page?.next_after || busy) return
    setBusy(true); setError('')
    try { const next = await client.list(page.next_after, lifetime.current?.signal); if (!lifetime.current?.signal.aborted) setPage({ ...next, items: [...page.items, ...next.items] }) }
    catch (error) { if (!lifetime.current?.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load more drafts.') }
    finally { setBusy(false) }
  }
  if (id && draft) return <LiveDraftEditor key={id} draft={draft} client={client} changes={changes} request={draftOrigin(id, params.get('request'))} save={save} onBack={() => setParams({ view: 'drafts' })} />
  const items = page?.items.filter(item => `${item.name} ${item.id}`.toLowerCase().includes(query.trim().toLowerCase())) ?? []
  return <GatewayPageFrame className="space-y-4">
    <PageHeader title="Tool drafts" actionsOnly />
    <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" size="sm" render={<Link to="/tools" />}>Available tools</Button><Button size="sm" onClick={() => setCreating(true)}><Plus aria-hidden="true" />New tool</Button></div>
    {error && <div className="space-y-2"><p role="alert" className="text-sm text-destructive-foreground">{error}</p><Button size="sm" variant="outline" onClick={() => { setError(''); setDraft(null); setPage(null); setRefresh(value => value + 1) }}>Reload drafts</Button></div>}
    {!page && !error && <p role="status">Loading draft…</p>}
    {page && <CollectionPanel query={query} onQueryChange={setQuery} label="Search loaded drafts" placeholder="Search loaded drafts…" count={items.length} unit="drafts" emptyTitle="No matching drafts" emptyDescription="Create a draft or adjust your search."><CollectionSection title="Saved drafts" contained><ul>{items.map(item => <CollectionRow key={item.id} to={`/tools?draft=${item.id}`} title={item.name} description={item.kind} />)}</ul></CollectionSection></CollectionPanel>}
    {page?.next_after && <Button variant="outline" disabled={busy} onClick={() => void more()}>Load more drafts</Button>}
    <NewToolDialog drafts={client} open={creating} onOpenChange={setCreating} />
  </GatewayPageFrame>
}

function LiveDraftEditor({ draft, client, changes, request, save, onBack }: { draft: EditorDraft; client: GatewayEditorDrafts; changes?: ChangeRequestsClient; request: string | null; save: (document: ToolDefinition) => Promise<void>; onBack: () => void }) {
  const [runsOpen, setRunsOpen] = useState(false)
  const [open, setOpen] = useState(false), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false)
  const [versions, setVersions] = useState<Awaited<ReturnType<GatewayEditorDrafts['publications']>> | null>(null)
  const [authorization, setAuthorization] = useState<'auto' | 'owner_confirmation'>('owner_confirmation')
  // On by default (owner, 2026-10-29): a tool he asked Conker for is one Conker should be able to use.
  const [conkerMayUse, setConkerMayUse] = useState(true)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [told, setTold] = useState<{ chat: string | null } | { failed: string; toolId: string } | null>(null)
  const [check, setCheck] = useState<{ revision: number; result: SavedCheck } | null>(null)
  const lifetime = useRef<AbortController | null>(null)
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller
    return () => controller.abort()
  }, [])
  // ToolGate checks each saved revision; until it answers, the editor's quick check stands in and says so.
  useEffect(() => {
    const controller = new AbortController()
    client.validation(draft.id, controller.signal)
      .then(value => { if (!controller.signal.aborted) setCheck({ revision: draft.revision, result: value.revision === draft.revision ? value.issues : 'failed' }) })
      .catch(() => { if (!controller.signal.aborted) setCheck({ revision: draft.revision, result: 'failed' }) })
    return () => controller.abort()
  }, [client, draft.id, draft.revision])
  async function show() {
    setOpen(true); setLoading(true); setError(''); setNotice(''); setVersions(null)
    try { const rows = await client.publications(draft.id, lifetime.current?.signal); if (!lifetime.current?.signal.aborted) setVersions(rows) }
    catch (error) { if (!lifetime.current?.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load versions.') }
    finally { setLoading(false) }
  }
  /** Tells the request this draft came from that it is live; a chat that asked gets Conker's message there. */
  async function tell(toolId: string) {
    if (!changes || !request) return
    try {
      const recorded = await changes.published(request, toolId, draft.document.name)
      forgetDraftOrigin(draft.id)
      if (!lifetime.current?.signal.aborted) setTold({ chat: recorded?.sessionId ?? null })
    } catch (error) { if (!lifetime.current?.signal.aborted) setTold({ failed: error instanceof Error ? error.message : 'Could not reach Conker.', toolId }) }
  }
  async function publish() {
    if (busy || !versions) return
    setBusy(true); setError(''); setNotice(''); setTold(null)
    let result: Awaited<ReturnType<GatewayEditorDrafts['publish']>>
    try { result = await client.publish(draft.id, draft.revision, versions[0]?.version ?? 0, authorization, conkerMayUse, lifetime.current?.signal) }
    catch (error) {
      if (!lifetime.current?.signal.aborted) { setError(error instanceof Error ? error.message : 'Could not publish this version.'); setBusy(false) }
      return
    }
    if (lifetime.current?.signal.aborted) return
    // Only what ToolGate's answer confirms: an answer without `conkerMayUse` confirms nothing about Conker.
    setNotice(result.conkerMayUse === true ? 'Published. Conker can use it now.' : result.conkerMayUse === false ? 'Published. Only you can run it for now.' : `Published version ${result.version}. Whether Conker can use it isn’t confirmed; check it under Run.`)
    if (result.conkerMayUse === true) await tell(result.toolId ?? result.automation_id)
    try { const rows = await client.publications(draft.id, lifetime.current?.signal); if (!lifetime.current?.signal.aborted) setVersions(rows) }
    catch { if (!lifetime.current?.signal.aborted) setError('The version list didn’t load again. Reload versions to see it.') }
    finally { setBusy(false) }
  }
  const published = versions?.some(version => version.revision === draft.revision)
  return <>
    <ToolEditor record={{ id: draft.id, draft: draft.document, published: [], runs: [] }} records={[]} savedCheck={check?.revision === draft.revision ? check.result : 'checking'} liveSave={save} livePublish={() => void show()} liveHistory={() => void show()} liveRun={() => setRunsOpen(true)} capabilityPicker={(node, onChange) => <GatewayCapabilityPicker client={client} node={node} onChange={onChange} />} onBack={onBack} />
    <GatewayWorkflowRuns id={draft.id} name={draft.document.name} client={client} open={runsOpen} onClose={() => setRunsOpen(false)} />
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value) }}>
      <TaskDialogContent title="Published versions" description={draft.document.name}>
        <OverlayBody className="space-y-4">
          <p className="text-sm text-muted-foreground">Publishing makes the saved draft a fixed version that can run. Later edits stay in the draft until you publish again.</p>
          {loading && <p role="status" className="text-sm">Loading versions…</p>}
          {error && <p role="alert" className="text-sm text-destructive-foreground">{error}</p>}
          {notice && <div role="status" className="space-y-1 text-sm"><p className="font-medium">{notice}</p>
            {told && 'chat' in told && told.chat && <p className="text-muted-foreground">Conker told the chat that asked for it. <Link className="font-medium text-foreground underline underline-offset-4" to={`/chat?session=${encodeURIComponent(told.chat)}`}>Open the chat</Link></p>}
            {told && 'failed' in told && <div className="flex flex-wrap items-center gap-2"><p className="text-destructive-foreground">The chat that asked wasn’t told: {told.failed}</p><Button type="button" size="xs" variant="outline" onClick={() => void tell(told.toolId)}>Tell it again</Button></div>}
          </div>}
          {versions && <>
            {!published && <div className="space-y-2"><Label htmlFor="workflow-authorization">Approval</Label><Select value={authorization} onValueChange={value => { if (value !== null) setAuthorization(value as typeof authorization) }} disabled={busy} items={[{ value: "owner_confirmation", label: "Ask me before each use" }, { value: "auto", label: "Allow callers with an explicit grant" }]}><SelectTrigger id="workflow-authorization"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="owner_confirmation">Ask me before each use</SelectItem><SelectItem value="auto">Allow callers with an explicit grant</SelectItem></SelectContent></Select></div>}
            {!published && <div className="flex items-start justify-between gap-4 rounded-lg border p-3"><Label htmlFor="conker-may-use" className="min-w-0 flex-col items-start gap-0"><span className="block text-sm">Let Conker use this tool</span><span className="mt-0.5 block text-xs font-normal leading-5 text-muted-foreground">{conkerMayUse ? 'Conker sees it in its tools and can run it. Each run follows the approval above.' : 'Conker won’t see it. You can still run it yourself.'}</span></Label><Switch id="conker-may-use" checked={conkerMayUse} disabled={busy} onCheckedChange={setConkerMayUse} /></div>}
            <div className="divide-y rounded-lg border">{versions.length ? versions.map(version => <div key={version.version} className="flex items-center justify-between gap-3 p-3 text-sm"><div><p className="font-medium">Version {version.version}</p><p className="text-xs text-muted-foreground">{new Date(version.published_at).toLocaleString()}</p><details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Technical details</summary><p className="mt-1">Draft revision {version.revision}</p></details></div><span className="text-xs text-muted-foreground">{version.available ? version.authorization === 'auto' ? 'Allowed access' : 'Ask me first' : 'Unavailable'}</span></div>) : <p className="p-3 text-sm text-muted-foreground">No published versions.</p>}</div>
          </>}
        </OverlayBody>
        <FormActions inset><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Close</Button>{error && <Button variant="outline" disabled={busy || loading} onClick={() => void show()}>Reload versions</Button>}<Button disabled={busy || loading || !versions || published} onClick={() => void publish()}>{busy ? 'Publishing…' : published ? 'Current draft published' : 'Publish current draft'}</Button></FormActions>
      </TaskDialogContent>
    </Dialog>
  </>
}
