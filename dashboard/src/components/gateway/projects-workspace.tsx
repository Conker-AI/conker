import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Archive, FolderKanban, Link2, Plus, RefreshCw, RotateCcw, Save, Unlink } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CollectionLoading, CollectionPanel, CollectionRow, CollectionSearch, CollectionSection, ConfirmationDialog, FormActions, OverlayBody, PageHeader, WorkspaceAction, WorkspaceSplit, TaskDialogContent } from '@/components/design-system'
import { GatewayPageFrame } from './page-frame'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { GatewayActivityClient, GatewayTask } from '@/lib/gateway/activity'
import type { GatewayControlClient } from '@/lib/gateway/control'
import { GatewayProjectMutationError, projectReferenceKey, type GatewayProject, type GatewayProjectLink, type ProjectFields, type ProjectReference } from '@/lib/gateway/projects'
import type { GatewayRuntimeClient, RuntimeSession } from '@/lib/gateway/runtime'
import { gatewayError } from '@/lib/gateway/transport'

const blank: ProjectFields = { name: '', description: '', instructions: '' }
const canonicalSession = /^ses_[0-9a-f]{16}$/
const canonicalTask = /^tsk_[0-9a-f]{32}$/

function mutationMessage(error: unknown) {
  return error instanceof GatewayProjectMutationError ? error.message : gatewayError(error).message
}

function ProjectFieldsEditor({ value, onChange, disabled, includeInstructions = true }: {
  value: ProjectFields; onChange: (value: ProjectFields) => void; disabled: boolean; includeInstructions?: boolean
}) {
  return <div className="space-y-5">
    <div className="space-y-2"><Label htmlFor="project-name">Name</Label><Input id="project-name" required maxLength={120} disabled={disabled} value={value.name} onChange={event => onChange({ ...value, name: event.target.value })} placeholder="School, home renovation, training…" /></div>
    <div className="space-y-2"><Label htmlFor="project-description">Description</Label><Textarea id="project-description" maxLength={2000} disabled={disabled} value={value.description} onChange={event => onChange({ ...value, description: event.target.value })} className="min-h-24 resize-y" placeholder="What belongs in this project?" /><p className="text-xs text-muted-foreground tabular-nums">{value.description.length}/2,000</p></div>
    {includeInstructions && <div className="space-y-2"><Label htmlFor="project-instructions">Project instructions</Label><Textarea id="project-instructions" maxLength={16000} disabled={disabled} value={value.instructions} onChange={event => onChange({ ...value, instructions: event.target.value })} className="min-h-44 resize-y" placeholder="Guidance to apply only when this project is selected." /><div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>Separate from chat history, memory, and agent authority.</span><span className="tabular-nums">{value.instructions.length}/16,000</span></div></div>}
  </div>
}

function CreateProjectDialog({ client, open, onOpenChange, onCreated }: {
  client: GatewayControlClient['projects']; open: boolean; onOpenChange: (open: boolean) => void; onCreated: (project: GatewayProject) => void
}) {
  const [value, setValue] = useState(blank), [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null)
  const close = () => { setValue(blank); setError(null); onOpenChange(false) }
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setPending(true); setError(null)
    try { onCreated(await client.create(value)) } catch (cause) { setError(mutationMessage(cause)) } finally { setPending(false) }
  }
  return <Dialog open={open} onOpenChange={next => !pending && !next && close()}><TaskDialogContent title="New project" description="Create a durable workspace for guidance and references to existing work." showCloseButton={!pending} onInteractOutside={event => event.preventDefault()}>
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col"><OverlayBody><ProjectFieldsEditor value={value} onChange={setValue} disabled={pending} includeInstructions={false} />{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</OverlayBody><FormActions inset description="No conversation content is copied into the project."><Button type="button" variant="outline" disabled={pending} onClick={close}>Cancel</Button><Button type="submit" disabled={pending || !value.name.trim()}><Plus />{pending ? 'Creating…' : 'Create project'}</Button></FormActions></form>
  </TaskDialogContent></Dialog>
}

type Candidate = { reference: ProjectReference; label: string; detail: string }

function LinkDialog({ open, onOpenChange, project, runtime, activity, onLink, pending, error }: {
  open: boolean; onOpenChange: (open: boolean) => void; project: GatewayProject; runtime: GatewayRuntimeClient; activity: GatewayActivityClient
  onLink: (reference: ProjectReference) => void; pending: boolean; error: string | null
}) {
  const [sessions, setSessions] = useState<RuntimeSession[]>([]), [tasks, setTasks] = useState<GatewayTask[]>([]), [loading, setLoading] = useState(false), [loadError, setLoadError] = useState<string | null>(null), [query, setQuery] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setLoadError(null)
    const [sessionResult, taskResult] = await Promise.allSettled([runtime.listSessions(), activity.listTasks({ limit: 200 })])
    if (sessionResult.status === 'fulfilled') setSessions(sessionResult.value.filter(item => canonicalSession.test(item.id) && item.status !== 'forgotten'))
    if (taskResult.status === 'fulfilled') setTasks(taskResult.value.results.filter(item => canonicalTask.test(item.id) && item.archivedAt === null && item.contentStatus === 'available'))
    if (sessionResult.status === 'rejected' && taskResult.status === 'rejected') setLoadError('Chats and tasks are unavailable right now. Nothing was linked.')
    setLoading(false)
  }, [activity, runtime])
  useEffect(() => { if (open) queueMicrotask(() => void load()) }, [load, open])
  const linked = new Set(project.links.map(item => projectReferenceKey(item.reference)))
  const candidates: Candidate[] = [
    ...sessions.filter(item => item.status === 'open' || item.status === 'forked').map(item => ({ reference: { kind: 'conversation' as const, sessionId: item.id }, label: item.title || 'Untitled chat', detail: 'Chat' })),
    ...tasks.map(item => ({ reference: { kind: 'task' as const, taskId: item.id }, label: item.outcome, detail: 'Task' })),
  ].filter(item => !linked.has(projectReferenceKey(item.reference)) && `${item.label} ${item.detail}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  return <Dialog open={open} onOpenChange={next => !pending && onOpenChange(next)}><TaskDialogContent title="Link existing work" description="Keep a live reference to an existing chat or task. Its content and permissions stay at the source." size="wide" showCloseButton={!pending}>
    <OverlayBody>
      <CollectionSearch value={query} onChange={event => setQuery(event.target.value)} label="Search available work" placeholder="Search chats and tasks" />
      {(error || loadError) && <p role="alert" className="text-sm text-destructive">{error ?? loadError}</p>}
      {loading ? <p role="status" className="text-sm text-muted-foreground">Loading available work…</p> : candidates.length ? <div className="divide-y rounded-lg border">{candidates.map(item => <div key={projectReferenceKey(item.reference)} className="flex min-w-0 items-center gap-3 px-3 py-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background"><Link2 className="size-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.label}</p><p className="text-xs text-muted-foreground">{item.detail}</p></div><Button size="sm" variant="outline" disabled={pending} onClick={() => onLink(item.reference)}>Link</Button></div>)}</div> : <p className="text-sm text-muted-foreground">{query ? 'No available work matches.' : 'No linkable chats or tasks are available.'}</p>}
      <p className="text-xs leading-5 text-muted-foreground">Files are not offered until Pi exposes an authoritative file-reference inventory. This screen never accepts filesystem paths or uploads.</p>
    </OverlayBody><FormActions inset><Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Close</Button></FormActions>
  </TaskDialogContent></Dialog>
}

function ContextDialog({ open, onOpenChange, project, runtime, control }: {
  open: boolean; onOpenChange: (open: boolean) => void; project: GatewayProject; runtime: GatewayRuntimeClient; control: GatewayControlClient
}) {
  const eligible = project.links.filter(item => item.availability === 'available' && item.labelSource === 'live-source').slice(0, 20)
  const [sessions, setSessions] = useState<RuntimeSession[]>([]), [sessionId, setSessionId] = useState(''), [selected, setSelected] = useState(() => new Set(eligible.map(item => projectReferenceKey(item.reference))))
  const [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    runtime.listSessions().then(rows => active && setSessions(rows.filter(item => canonicalSession.test(item.id) && (item.status === 'open' || item.status === 'forked')))).catch(cause => active && setError(gatewayError(cause).message))
    return () => { active = false }
  }, [runtime])
  const apply = async () => {
    setPending(true); setError(null); setNotice(null)
    try {
      const current = await control.sessionSettings(sessionId)
      await control.saveSessionSettings(sessionId, { ...current, settings: { ...current.settings, projectId: project.id, projectSources: eligible.filter(item => selected.has(projectReferenceKey(item.reference))).map(item => item.reference) } })
      setNotice('Project selected for this chat. Pi will recheck every source when context is prepared.')
    } catch (cause) { setError(gatewayError(cause).message) } finally { setPending(false) }
  }
  return <Dialog open={open} onOpenChange={next => !pending && onOpenChange(next)}><TaskDialogContent title="Use project in a chat" description="Choose the destination and which linked sources Pi may consider. Eligibility is rechecked at runtime." size="wide" showCloseButton={!pending}>
    <OverlayBody>
      <div className="space-y-2"><Label htmlFor="project-target-chat">Destination chat</Label><Select value={sessionId} onValueChange={setSessionId} disabled={pending}><SelectTrigger id="project-target-chat"><SelectValue placeholder="Choose a chat" /></SelectTrigger><SelectContent>{sessions.map(item => <SelectItem key={item.id} value={item.id}>{item.title || 'Untitled chat'}</SelectItem>)}</SelectContent></Select></div>
      <fieldset className="space-y-3" disabled={pending}><legend className="text-sm font-medium">Linked sources</legend>{eligible.length ? eligible.map(item => { const key = projectReferenceKey(item.reference); return <label key={key} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3"><Checkbox checked={selected.has(key)} onCheckedChange={checked => setSelected(current => { const next = new Set(current); if (checked) next.add(key); else next.delete(key); return next })} /><span className="min-w-0"><span className="block truncate text-sm font-medium">{item.label}</span><span className="block text-xs text-muted-foreground">{item.reference.kind === 'conversation' ? 'Chat' : item.reference.kind === 'task' ? 'Task' : 'File reference'}</span></span></label> }) : <p className="text-sm text-muted-foreground">This project has no currently available references. You can still apply its saved instructions.</p>}</fieldset>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
      <p className="text-xs leading-5 text-muted-foreground">This selection grants no provider, tool, memory, or execution authority. It retrieves no content from this screen.</p>
    </OverlayBody><FormActions inset><Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Close</Button><Button disabled={pending || !sessionId} onClick={() => void apply()}>{pending ? 'Applying…' : 'Use in chat'}</Button></FormActions>
  </TaskDialogContent></Dialog>
}

function ReferenceRow({ item, pending, onUnlink }: { item: GatewayProjectLink; pending: boolean; onUnlink: () => void }) {
  const type = item.reference.kind === 'conversation' ? 'Chat' : item.reference.kind === 'task' ? 'Task' : 'File reference'
  return <div className="flex min-w-0 items-start gap-3 py-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background"><Link2 className="size-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-medium">{item.label}</p>{item.availability !== 'available' && <Badge variant="outline">{item.availability.replace('-', ' ')}</Badge>}</div><p className="mt-1 text-xs text-muted-foreground">{type} · {item.labelSource === 'live-source' ? 'Live source label' : 'Identity retained; source details unavailable'}</p></div><Button size="icon" variant="ghost" aria-label={`Unlink ${item.label}`} title={`Unlink ${item.label}`} disabled={pending} onClick={onUnlink}><Unlink /></Button></div>
}

function ProjectEditor({ project: initial, control, runtime, activity, onChanged }: {
  project: GatewayProject; control: GatewayControlClient; runtime: GatewayRuntimeClient; activity: GatewayActivityClient; onChanged: (project: GatewayProject) => void
}) {
  const [project, setProject] = useState(initial), [value, setValue] = useState<ProjectFields>({ name: initial.name, description: initial.description, instructions: initial.instructions })
  const [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null), [linking, setLinking] = useState(false), [context, setContext] = useState(false), [archive, setArchive] = useState(false)
  const dirty = value.name !== project.name || value.description !== project.description || value.instructions !== project.instructions
  const adopt = (saved: GatewayProject) => { setProject(saved); setValue({ name: saved.name, description: saved.description, instructions: saved.instructions }); onChanged(saved); setError(null) }
  const save = async (event: FormEvent) => { event.preventDefault(); setPending(true); setError(null); try { adopt(await control.projects.update(project.id, value, project.revision)) } catch (cause) { setError(mutationMessage(cause)) } finally { setPending(false) } }
  const mutate = async (operation: () => Promise<GatewayProject>) => { setPending(true); setError(null); try { adopt(await operation()); return true } catch (cause) { setError(mutationMessage(cause)); return false } finally { setPending(false) } }
  const reload = async () => { setPending(true); setError(null); try { adopt(await control.projects.get(project.id)) } catch (cause) { setError(gatewayError(cause).message) } finally { setPending(false) } }
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <PageHeader actionsOnly document title={project.name} actions={<WorkspaceAction disabled={pending || dirty} onClick={() => setArchive(true)}>{project.archivedAt === null ? <Archive /> : <RotateCcw />}{project.archivedAt === null ? 'Archive' : 'Restore'}</WorkspaceAction>} />
    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <WorkspaceSplit asideLabel="Project references" aside={<section className="space-y-4" aria-labelledby="project-references"><div className="space-y-3"><div><h2 id="project-references" className="text-sm font-semibold">Linked work</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Live references keep their original privacy and source. The project stores identity and link time, not source content.</p></div><div className="flex flex-wrap gap-2"><WorkspaceAction disabled={pending || project.archivedAt !== null || dirty} onClick={() => setLinking(true)}><Link2 />Link work</WorkspaceAction><WorkspaceAction disabled={pending || project.archivedAt !== null || dirty} onClick={() => setContext(true)}>Use in chat</WorkspaceAction></div></div>
        {dirty && <p role="status" className="text-xs text-muted-foreground">Save or reset the project fields before changing references.</p>}
        {project.links.length ? <div className="divide-y border-y">{project.links.map(item => <ReferenceRow key={projectReferenceKey(item.reference)} item={item} pending={pending} onUnlink={() => void mutate(() => control.projects.unlink(project.id, item.reference, project.revision))} />)}</div> : <div className="border-y py-5 text-sm text-muted-foreground">No linked work yet. Link an existing chat or task when it belongs in this project.</div>}
        <p className="text-xs leading-5 text-muted-foreground">Authority: none. Content included: no. Grants inherited: no.</p>
      </section>}>
        <form onSubmit={save}><fieldset disabled={pending || project.archivedAt !== null} className="space-y-6"><ProjectFieldsEditor value={value} onChange={setValue} disabled={pending || project.archivedAt !== null} /></fieldset><div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-4"><div className="min-w-0 text-sm text-muted-foreground">{error ? <span role="alert" className="text-destructive">{error} <button type="button" className="underline underline-offset-4" onClick={() => void reload()}>Reload current project</button></span> : project.archivedAt !== null ? 'Archived projects are read-only until restored.' : `Durable revision ${project.revision}.`}</div><div className="flex gap-2"><Button type="button" variant="outline" disabled={pending || !dirty} onClick={() => setValue({ name: project.name, description: project.description, instructions: project.instructions })}>Reset</Button><Button type="submit" disabled={pending || project.archivedAt !== null || !dirty || !value.name.trim()}><Save />{pending ? 'Saving…' : 'Save changes'}</Button></div></div></form>
      </WorkspaceSplit>
    </div>
    <LinkDialog open={linking} onOpenChange={setLinking} project={project} runtime={runtime} activity={activity} pending={pending} error={error} onLink={reference => void mutate(() => control.projects.link(project.id, reference, project.revision)).then(saved => saved && setLinking(false))} />
    {context && <ContextDialog open onOpenChange={setContext} project={project} runtime={runtime} control={control} />}
    <ConfirmationDialog open={archive} onOpenChange={setArchive} title={project.archivedAt === null ? `Archive ${project.name}?` : `Restore ${project.name}?`} description={project.archivedAt === null ? 'Its guidance and references remain durable, but the project becomes read-only and cannot be selected for chats.' : 'The project returns to active use with its current guidance and links.'} actionLabel={project.archivedAt === null ? 'Archive project' : 'Restore project'} actionVariant={project.archivedAt === null ? 'destructive' : 'default'} pending={pending} error={error} onConfirm={() => void mutate(() => control.projects.archive(project.id, project.archivedAt === null, project.revision)).then(saved => saved && setArchive(false))} />
  </div>
}

export function GatewayProjectsWorkspace({ control, runtime, activity }: { control: GatewayControlClient; runtime: GatewayRuntimeClient; activity: GatewayActivityClient }) {
  const location = useLocation(), navigate = useNavigate(), match = location.pathname.match(/^\/projects\/(project_[0-9a-f]{32})$/)
  const createRequested = new URLSearchParams(location.search).get('create') === '1'
  const [projects, setProjects] = useState<GatewayProject[] | null>(null), [query, setQuery] = useState(''), [error, setError] = useState<string | null>(null), [creating, setCreating] = useState(createRequested), [loading, setLoading] = useState(false)
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setProjects((await control.projects.list({ limit: 200 })).results) } catch (cause) { setError(gatewayError(cause).message) } finally { setLoading(false) }
  }, [control])
  useEffect(() => { let active = true; control.projects.list({ limit: 200 }).then(page => active && setProjects(page.results)).catch(cause => active && setError(gatewayError(cause).message)); return () => { active = false } }, [control])
  const selected = match ? projects?.find(item => item.id === match[1]) : undefined
  useEffect(() => {
    if (!match || !projects || selected) return
    let active = true
    control.projects.get(match[1]).then(item => active && setProjects(current => [...(current ?? []), item])).catch(cause => active && setError(gatewayError(cause).message))
    return () => { active = false }
  }, [control, match, projects, selected])
  const update = (project: GatewayProject) => setProjects(current => current?.map(item => item.id === project.id ? project : item) ?? [project])
  const setCreateOpen = (open: boolean) => {
    setCreating(open)
    if (!open && createRequested) navigate('/projects', { replace: true })
  }
  if (match) {
    if (selected) return <ProjectEditor key={selected.id} project={selected} control={control} runtime={runtime} activity={activity} onChanged={update} />
    return <div className="space-y-4 p-6">{error ? <><PageHeader title="Project unavailable" description={error} density="compact" /><Button variant="outline" onClick={() => navigate('/projects')}>Back to projects</Button></> : <p role="status" className="text-sm text-muted-foreground">Loading project…</p>}</div>
  }
  const visible = (projects ?? []).filter(item => `${item.name} ${item.description}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const active = visible.filter(item => item.archivedAt === null), archived = visible.filter(item => item.archivedAt !== null)
  return <GatewayPageFrame><div className="space-y-6">
    <PageHeader actionsOnly title="Projects" description="Keep related chats, tasks and guidance together without changing their permissions." density="compact" actions={<><WorkspaceAction iconOnly aria-label="Refresh projects" title="Refresh projects" disabled={loading} onClick={() => void load()}><RefreshCw /></WorkspaceAction><WorkspaceAction onClick={() => setCreating(true)}><Plus />New project</WorkspaceAction></>} />
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!projects && !error ? <CollectionLoading label="Loading projects…" /> : <CollectionPanel query={query} onQueryChange={setQuery} label="Search projects" placeholder="Search projects…" count={visible.length} unit={visible.length === 1 ? 'project' : 'projects'} emptyTitle={query ? 'No matching projects' : 'No projects yet'} emptyDescription={query ? 'Try a different name or description.' : 'Create a project to keep guidance and related work together.'} emptyAction={<Button onClick={() => setCreating(true)}><Plus />New project</Button>} icon={<FolderKanban />}>
      <div className="space-y-5">{active.length > 0 && <CollectionSection title="Active projects">{active.map(item => <CollectionRow key={item.id} to={`/projects/${item.id}`} title={item.name} description={item.description || 'No description'} leading={<span className="flex size-8 items-center justify-center rounded-lg border bg-background"><FolderKanban className="size-4" /></span>} trailing={<><span>{item.links.length} {item.links.length === 1 ? 'reference' : 'references'}</span><span>Revision {item.revision}</span></>} />)}</CollectionSection>}{!!archived.length && <CollectionSection title="Archived">{archived.map(item => <CollectionRow key={item.id} to={`/projects/${item.id}`} title={item.name} description={item.description || 'No description'} leading={<span className="flex size-8 items-center justify-center rounded-lg border bg-background"><Archive className="size-4" /></span>} trailing={<span>Read-only</span>} />)}</CollectionSection>}</div>
    </CollectionPanel>}
    <CreateProjectDialog client={control.projects} open={creating || createRequested} onOpenChange={setCreateOpen} onCreated={project => { update(project); setCreating(false); navigate(`/projects/${project.id}`) }} />
  </div></GatewayPageFrame>
}
