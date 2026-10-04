import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Archive, ArrowLeft, Download, FileCode2, Files, Plus, RefreshCw, RotateCcw, Save } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArtifactPreview } from '@/components/artifacts/native-preview'
import { CollectionLoading, CollectionPanel, CollectionRow, CollectionSection, ConfirmationDialog, FormActions, OverlayBody, PageHeader, RecordItem, TaskDialogContent } from '@/components/design-system'
import { GatewayPageFrame } from './page-frame'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type { GatewayActivityClient, GatewayTask } from '@/lib/gateway/activity'
import { downloadAnswerFile } from '@/lib/rich-answer'
import type { GatewayControlClient } from '@/lib/gateway/control'
import { emptyGatewayArtifactContent, GatewayArtifactMutationError, normalizeGatewayArtifactContent, type GatewayArtifact, type GatewayArtifactContent, type GatewayArtifactSummary } from '@/lib/gateway/artifacts'
import { gatewayError } from '@/lib/gateway/transport'

const artifactKinds: Record<GatewayArtifactContent['kind'], string> = {
  markdown: 'Document', code: 'Code', table: 'Table', chart: 'Chart', diagram: 'Diagram', media: 'Media reference', html: 'HTML app',
}
const availabilityLabels: Record<GatewayArtifactSummary['availability'], string> = {
  available: 'Available', 'source-archived': 'Source archived', 'source-redacted': 'Source redacted',
  'source-unavailable': 'Source unavailable', 'source-changed': 'Source changed', 'privacy-unknown': 'Privacy unavailable',
}
const taskId = /^tsk_[0-9a-f]{32}$/

function mutationMessage(error: unknown) { return error instanceof GatewayArtifactMutationError ? error.message : gatewayError(error).message }
function artifactSummary(artifact: GatewayArtifact): GatewayArtifactSummary {
  const { versions, ...summary } = artifact
  void versions
  return { ...summary, contentIncluded: false }
}
function sourceText(content: GatewayArtifactContent) { return content.kind === 'markdown' || content.kind === 'code' || content.kind === 'html' ? content.text : JSON.stringify(content, null, 2) }
function parseSource(kind: GatewayArtifactContent['kind'], source: string, language: string) {
  if (source.length > 250_000) throw new Error('Source must fit within 250,000 characters.')
  if (kind === 'markdown' || kind === 'html') return normalizeGatewayArtifactContent({ kind, text: source })
  if (kind === 'code') return normalizeGatewayArtifactContent({ kind, text: source, language })
  let value: unknown
  try { value = JSON.parse(source) } catch { throw new Error('Use valid JSON for the structured artifact data.') }
  const parsed = normalizeGatewayArtifactContent(value)
  if (parsed.kind !== kind) throw new Error(`Keep this artifact's ${kind} format.`)
  return parsed
}

function CreateArtifactDialog({ client, activity, open, onOpenChange, onCreated }: {
  client: GatewayControlClient['artifacts']; activity: GatewayActivityClient; open: boolean; onOpenChange: (open: boolean) => void; onCreated: (artifact: GatewayArtifact) => void
}) {
  const [title, setTitle] = useState(''), [kind, setKind] = useState<GatewayArtifactContent['kind']>('markdown'), [selectedTask, setSelectedTask] = useState('none')
  const [tasks, setTasks] = useState<GatewayTask[]>([]), [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null)
  useEffect(() => { if (!open) return; let active = true; activity.listTasks({ limit: 200 }).then(page => active && setTasks(page.results.filter(item => taskId.test(item.id) && item.archivedAt === null && item.contentStatus === 'available'))).catch(() => undefined); return () => { active = false } }, [activity, open])
  const reset = () => { setTitle(''); setKind('markdown'); setSelectedTask('none'); setError(null) }
  const close = () => { reset(); onOpenChange(false) }
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setPending(true); setError(null)
    try { onCreated(await client.create({ title, content: emptyGatewayArtifactContent(kind), ...(selectedTask !== 'none' ? { taskId: selectedTask } : {}) })) } catch (cause) { setError(mutationMessage(cause)) } finally { setPending(false) }
  }
  return <Dialog open={open} onOpenChange={next => !pending && !next && close()}><TaskDialogContent title="New artifact" description="Create a durable, versioned output. Content remains inert unless you explicitly run an HTML preview in its browser sandbox." showCloseButton={!pending} onInteractOutside={event => event.preventDefault()}>
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col"><OverlayBody><fieldset disabled={pending} className="space-y-5">
      <div className="space-y-2"><Label htmlFor="artifact-title">Title</Label><Input id="artifact-title" required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} placeholder="Project brief" /></div>
      <div className="space-y-2"><Label htmlFor="artifact-kind">Format</Label><Select value={kind} onValueChange={value => setKind(value as GatewayArtifactContent['kind'])}><SelectTrigger id="artifact-kind"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(artifactKinds).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="artifact-task">Linked task</Label><Select value={selectedTask} onValueChange={setSelectedTask}><SelectTrigger id="artifact-task"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No linked task</SelectItem>{tasks.map(item => <SelectItem key={item.id} value={item.id}>{item.outcome}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">The task is provenance only. It does not run or grant authority.</p></div>
      <p className="text-xs leading-5 text-muted-foreground">Code is inert text. Tables, charts and diagrams use bounded data. Media stores an HTTPS reference, not the remote file. No model is called when creating an artifact.</p>
    </fieldset>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</OverlayBody><FormActions inset><Button type="button" variant="outline" disabled={pending} onClick={close}>Cancel</Button><Button type="submit" disabled={pending || !title.trim()}><Plus />{pending ? 'Creating…' : 'Create artifact'}</Button></FormActions></form>
  </TaskDialogContent></Dialog>
}

type Draft = { revision: number; title: string; source: string; language: string; note: string; preserveCitations: boolean }
function draftFrom(artifact: GatewayArtifact): Draft {
  const current = artifact.versions.at(-1)
  return { revision: artifact.revision, title: current?.title ?? artifact.title, source: current ? sourceText(current.content) : '', language: current?.content.kind === 'code' ? current.content.language : '', note: '', preserveCitations: true }
}

function ArtifactEditor({ initial, control, onChanged }: { initial: GatewayArtifact; control: GatewayControlClient; onChanged: (artifact: GatewayArtifact) => void }) {
  const [artifact, setArtifact] = useState(initial), [draft, setDraft] = useState(() => draftFrom(initial)), [tab, setTab] = useState('preview'), [selectedVersion, setSelectedVersion] = useState<number | null>(null)
  const [pending, setPending] = useState(false), [exporting, setExporting] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null), [archive, setArchive] = useState(false)
  const latest = artifact.versions.at(-1), selected = artifact.versions.find(item => item.version === selectedVersion) ?? latest
  const current = latest!
  const historical = !!selected && selected.version !== latest?.version
  const dirty = !!latest && (draft.title !== latest.title || draft.source !== sourceText(latest.content) || draft.note.trim() !== '')
  let parsed: GatewayArtifactContent | null = selected?.content ?? null, parseError: string | null = null
  if (!historical && latest && dirty) try { parsed = parseSource(latest.content.kind, draft.source, draft.language) } catch (cause) { parsed = null; parseError = cause instanceof Error ? cause.message : 'Source is invalid.' }
  const adopt = (saved: GatewayArtifact, message?: string) => { setArtifact(saved); setDraft(draftFrom(saved)); setSelectedVersion(null); setError(null); setNotice(message ?? null); onChanged(saved) }
  const mutate = async (operation: () => Promise<GatewayArtifact>, message: string) => { setPending(true); setError(null); setNotice(null); try { adopt(await operation(), message); return true } catch (cause) { setError(mutationMessage(cause)); return false } finally { setPending(false) } }
  const reload = async () => { setPending(true); setError(null); try { adopt(await control.artifacts.get(artifact.id), 'Reloaded the saved artifact.') } catch (cause) { setError(gatewayError(cause).message) } finally { setPending(false) } }
  const save = async () => { if (!parsed) return; await mutate(() => control.artifacts.append(artifact.id, { content: parsed!, title: draft.title, ...(draft.note.trim() ? { note: draft.note } : {}), preserveCitations: draft.preserveCitations }, artifact.revision), 'Saved a new immutable version.') }
  const exportVersion = async () => {
    if (!selected) return; setExporting(true); setError(null); setNotice(null)
    try { const result = await control.artifacts.export(artifact.id, selected.version); downloadAnswerFile(result.text, result.filename, result.mime); setNotice(`Exported version ${result.version}.`) } catch (cause) { setError(gatewayError(cause).message) } finally { setExporting(false) }
  }
  const unavailable = !artifact.contentIncluded || !selected
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div className="shrink-0 border-b px-4 py-4 sm:px-6 sm:py-6"><PageHeader title={artifact.title} description="Immutable versions with explicit provenance and inert exports." density="compact" actions={<div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link to="/artifacts"><ArrowLeft />Artifacts</Link></Button><Button variant="outline" disabled={pending || dirty} onClick={() => setArchive(true)}>{artifact.archivedAt ? <RotateCcw /> : <Archive />}{artifact.archivedAt ? 'Restore' : 'Archive'}</Button></div>} /></div>
    {unavailable ? <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"><div className="max-w-2xl space-y-4"><Badge variant="outline">{availabilityLabels[artifact.availability]}</Badge><h2 className="text-lg font-medium">Artifact content is unavailable</h2><p className="text-sm leading-6 text-muted-foreground">The source changed, was forgotten or removed, or its privacy could not be verified. History bodies, preview, editing and export are blocked.</p><p className="text-xs text-muted-foreground">The durable tombstone keeps identity and version count without exposing cached content.</p></div></div> : <>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-3 sm:px-6"><Tabs value={tab} onValueChange={setTab}><TabsList aria-label="Artifact view"><TabsTrigger value="preview">Preview</TabsTrigger><TabsTrigger value="source">Source</TabsTrigger><TabsTrigger value="history">History</TabsTrigger></TabsList></Tabs><div className="ml-auto flex items-center gap-2"><span className="hidden text-xs text-muted-foreground sm:inline">Version {selected.version}{historical ? ' · historical' : ''}</span><Button size="sm" variant="outline" disabled={pending || exporting} onClick={() => void exportVersion()}><Download />{exporting ? 'Exporting…' : 'Export'}</Button></div></div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'preview' && <div className="p-4 sm:p-6">{parsed ? <ArtifactPreview content={parsed} citations={(selected.citations ?? []).map(item => ({ id: item.id, label: item.label, ...(item.href ? { href: item.href } : {}), ...(item.excerpt ? { excerpt: item.excerpt } : {}) }))} /> : <p role="alert" className="text-sm text-destructive">{parseError}</p>}</div>}
        {tab === 'source' && <div className="space-y-5 p-4 sm:p-6"><p className="text-xs leading-5 text-muted-foreground">{historical ? 'Historical source is read-only. Restore it from History to create a new current version.' : artifact.archivedAt ? 'Restore this artifact before editing.' : 'Saving appends a new immutable version. Existing versions never change.'}</p>
          <div className="space-y-2"><Label htmlFor="artifact-editor-title">Title</Label><Input id="artifact-editor-title" maxLength={160} disabled={pending || historical || !!artifact.archivedAt} value={historical ? selected.title : draft.title} onChange={event => setDraft(value => ({ ...value, title: event.target.value }))} /></div>
          {current.content.kind === 'code' && <div className="space-y-2"><Label htmlFor="artifact-editor-language">Language</Label><Input id="artifact-editor-language" maxLength={40} disabled={pending || historical || !!artifact.archivedAt} value={historical && selected.content.kind === 'code' ? selected.content.language : draft.language} onChange={event => setDraft(value => ({ ...value, language: event.target.value }))} /></div>}
          <div className="space-y-2"><Label htmlFor="artifact-editor-source">{['markdown', 'code', 'html'].includes(current.content.kind) ? 'Source text' : 'Structured data (JSON)'}</Label><Textarea id="artifact-editor-source" rows={18} maxLength={250000} readOnly={historical || !!artifact.archivedAt} disabled={pending} value={historical ? sourceText(selected.content) : draft.source} onChange={event => setDraft(value => ({ ...value, source: event.target.value }))} className={current.content.kind === 'markdown' ? 'resize-y' : 'resize-y font-mono text-xs'} /></div>
          {!historical && <><div className="space-y-2"><Label htmlFor="artifact-version-note">Version note</Label><Input id="artifact-version-note" maxLength={1000} disabled={pending || !!artifact.archivedAt} value={draft.note} onChange={event => setDraft(value => ({ ...value, note: event.target.value }))} placeholder="What changed?" /></div>{current.content.kind === 'markdown' && current.citations.length > 0 && <label className="flex items-start gap-3 text-sm"><Checkbox checked={draft.preserveCitations} onCheckedChange={checked => setDraft(value => ({ ...value, preserveCitations: checked === true }))} disabled={pending || !!artifact.archivedAt} /><span><span className="block font-medium">Carry source citations forward</span><span className="block text-xs leading-5 text-muted-foreground">Citations remain supplied evidence, not independent verification.</span></span></label>}</>}
          {parseError && <p role="alert" className="text-sm text-destructive">{parseError}</p>}
        </div>}
        {tab === 'history' && <div className="space-y-4 p-4 sm:p-6"><p className="text-sm text-muted-foreground">Restoring appends a copy as a new version. Existing versions remain unchanged.</p><div className="divide-y rounded-lg border">{artifact.versions.slice().reverse().map(item => <RecordItem key={item.version} title={`Version ${item.version}: ${item.title}`} description={item.note} meta={<><span>{new Date(item.createdAt).toLocaleString()}</span><span>{item.author === 'owner' ? 'Owner' : 'Copied response'}</span>{item.restoredFromVersion && <span>Restored from version {item.restoredFromVersion}</span>}</>} actions={<><Button size="sm" variant="outline" disabled={pending || dirty} onClick={() => { setSelectedVersion(item.version); setTab('preview') }}>View</Button>{item.version !== current.version && <Button size="sm" variant="outline" disabled={pending || dirty || !!artifact.archivedAt || artifact.availability !== 'available'} onClick={() => void mutate(() => control.artifacts.restore(artifact.id, item.version, artifact.revision), `Restored version ${item.version} as a new version.`)}>Restore</Button>}</>} />)}</div></div>}
      </div>
      <div className="shrink-0 border-t px-4 py-3 sm:px-6"><div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0 text-sm text-muted-foreground">{error ? <span role="alert" className="text-destructive">{error} <button type="button" className="underline underline-offset-4" onClick={() => void reload()}>Reload current artifact</button></span> : notice ? <span role="status">{notice}</span> : dirty ? 'Unsaved draft. Save or reset before opening history actions.' : `Revision ${artifact.revision} · ${artifact.versionCount} immutable ${artifact.versionCount === 1 ? 'version' : 'versions'} · authority none`}</div>{!historical && <div className="flex gap-2"><Button variant="outline" disabled={pending || !dirty} onClick={() => setDraft(draftFrom(artifact))}>Reset</Button><Button disabled={pending || !!artifact.archivedAt || !dirty || !!parseError || !draft.title.trim()} onClick={() => void save()}><Save />{pending ? 'Saving…' : 'Save new version'}</Button></div>}</div></div>
    </>}
    <ConfirmationDialog open={archive} onOpenChange={setArchive} title={artifact.archivedAt ? `Restore ${artifact.title}?` : `Archive ${artifact.title}?`} description={artifact.archivedAt ? 'The artifact returns to active use with every immutable version retained.' : 'The artifact becomes read-only. Its versions and provenance remain durable.'} actionLabel={artifact.archivedAt ? 'Restore artifact' : 'Archive artifact'} actionVariant={artifact.archivedAt ? 'default' : 'destructive'} pending={pending} error={error} onConfirm={() => void mutate(() => control.artifacts.archive(artifact.id, !artifact.archivedAt, artifact.revision), artifact.archivedAt ? 'Artifact restored.' : 'Artifact archived.').then(saved => saved && setArchive(false))} />
  </div>
}

export function GatewayArtifactsWorkspace({ control, activity }: { control: GatewayControlClient; activity: GatewayActivityClient }) {
  const location = useLocation(), navigate = useNavigate(), match = location.pathname.match(/^\/artifacts\/(artifact_[0-9a-f]{32})$/)
  const [artifacts, setArtifacts] = useState<GatewayArtifactSummary[] | null>(null), [details, setDetails] = useState<Record<string, GatewayArtifact>>({}), [query, setQuery] = useState(''), [filter, setFilter] = useState<'active' | 'archived' | 'all'>('active')
  const [creating, setCreating] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => { setLoading(true); setError(null); try { setArtifacts((await control.artifacts.list({ limit: 100 })).results) } catch (cause) { setError(gatewayError(cause).message) } finally { setLoading(false) } }, [control])
  useEffect(() => { let active = true; control.artifacts.list({ limit: 100 }).then(page => active && setArtifacts(page.results)).catch(cause => active && setError(gatewayError(cause).message)); return () => { active = false } }, [control])
  const selected = match ? details[match[1]] : undefined
  useEffect(() => {
    if (!match || selected) return; let active = true
    control.artifacts.get(match[1]).then(item => { if (active) setDetails(current => ({ ...current, [item.id]: item })) }).catch(cause => active && setError(gatewayError(cause).message))
    return () => { active = false }
  }, [control, match, selected])
  const update = (artifact: GatewayArtifact) => {
    setDetails(current => ({ ...current, [artifact.id]: artifact }))
    setArtifacts(current => current?.map(item => item.id === artifact.id ? artifactSummary(artifact) : item) ?? current)
  }
  if (match) {
    if (selected) return <ArtifactEditor key={selected.id} initial={selected} control={control} onChanged={update} />
    return <div className="space-y-4 p-6">{error ? <><PageHeader title="Artifact unavailable" description={error} density="compact" /><Button variant="outline" onClick={() => navigate('/artifacts')}>Back to artifacts</Button></> : <p role="status" className="text-sm text-muted-foreground">Loading artifact…</p>}</div>
  }
  const visible = (artifacts ?? []).filter(item => (filter === 'all' || (item.archivedAt !== null) === (filter === 'archived')) && item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  return <GatewayPageFrame><div className="space-y-6">
    <PageHeader actionsOnly title="Artifacts" description="Keep documents, code and structured outputs with a clear version history." density="compact" actions={<div className="flex gap-2"><Button variant="ghost" size="icon" aria-label="Refresh artifacts" title="Refresh artifacts" disabled={loading} onClick={() => void load()}><RefreshCw /></Button><Button onClick={() => setCreating(true)}><Plus />New artifact</Button></div>} />
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!artifacts && !error ? <CollectionLoading label="Loading artifacts…" /> : <CollectionPanel query={query} onQueryChange={setQuery} label="Search artifacts" placeholder="Search artifact titles…" count={visible.length} unit={visible.length === 1 ? 'artifact' : 'artifacts'}
      filters={<Select value={filter} onValueChange={value => setFilter(value as typeof filter)}><SelectTrigger className="w-44" aria-label="Filter artifacts"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active artifacts</SelectItem><SelectItem value="archived">Archived artifacts</SelectItem><SelectItem value="all">All artifacts</SelectItem></SelectContent></Select>}
      hint="Library rows contain metadata only. Open an artifact to read its bounded versions."
      emptyTitle={query ? 'No matching artifacts' : filter === 'archived' ? 'No archived artifacts' : 'Keep an output you can return to'} emptyDescription={query ? 'Try another title. Content is not indexed in this browser list.' : filter === 'archived' ? 'Archived artifacts retain their immutable versions.' : 'Create a document or structured output, then build its version history.'} emptyAction={<Button onClick={() => setCreating(true)}><Plus />Create artifact</Button>} icon={<Files />}>
      <CollectionSection title={filter === 'archived' ? 'Archived artifacts' : filter === 'all' ? 'All artifacts' : 'Active artifacts'}>{visible.map(item => <CollectionRow key={item.id} to={`/artifacts/${item.id}`} title={item.title} description={<span className="truncate">{availabilityLabels[item.availability]} · {item.origin === 'owner-authored' ? 'Owner authored' : 'Copied response'}{item.privateOrigin ? ' · Private origin' : ''}</span>} leading={<span className="flex size-8 items-center justify-center rounded-lg border bg-background"><FileCode2 className="size-4" /></span>} trailing={<><span>{item.versionCount} {item.versionCount === 1 ? 'version' : 'versions'}</span>{item.archivedAt && <span>Archived</span>}</>} />)}</CollectionSection>
    </CollectionPanel>}
    <CreateArtifactDialog client={control.artifacts} activity={activity} open={creating} onOpenChange={setCreating} onCreated={artifact => { setDetails(current => ({ ...current, [artifact.id]: artifact })); setArtifacts(current => [...(current ?? []), artifactSummary(artifact)]); setCreating(false); navigate(`/artifacts/${artifact.id}`) }} />
  </div></GatewayPageFrame>
}
