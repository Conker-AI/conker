import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Archive, Bot, Plus, RotateCcw, Save } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CollectionLoading, FilterChip, FormActions, ListCard, ListLine, OverlayBody, PageHeader, WorkspaceAction, TaskDialogContent, ConfirmationDialog } from '@/components/design-system'
import { InlineError } from '@/components/resilience/inline-error'
import { ListSkeleton } from '@/components/resilience/skeletons'
import { GatewayPageFrame } from './page-frame'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { gatewayError } from '@/lib/gateway/transport'
import type { AgentConfiguration, AgentProfile, GatewayControlClient } from '@/lib/gateway/control'

const blank: AgentConfiguration = {
  name: '', role: '', instructions: '', modelId: null, toolIds: [], memory: { scope: 'conversation', memoryIds: [] },
}

function references(value: string) {
  return [...new Set(value.split(/[\n,]/).map(item => item.trim()).filter(Boolean))]
}

function changedMessage(error: unknown) {
  const parsed = gatewayError(error)
  return parsed.status === 409 ? 'This profile changed elsewhere. Reload it before saving your edits.' : parsed.message
}

function AgentFields({ value, onChange, disabled, companion = false }: { value: AgentConfiguration; onChange: (value: AgentConfiguration) => void; disabled: boolean; companion?: boolean }) {
  const [toolText, setToolText] = useState(value.toolIds.join(', '))
  const [memoryText, setMemoryText] = useState(value.memory.memoryIds.join(', '))
  const field = (key: 'name' | 'role' | 'instructions', next: string) => onChange({ ...value, [key]: next })
  return <div className="space-y-5">
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="agent-name">Name</Label><Input id="agent-name" required maxLength={80} disabled={disabled} value={value.name} onChange={event => field('name', event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="agent-role">Role</Label><Input id="agent-role" required maxLength={160} disabled={disabled} value={value.role} onChange={event => field('role', event.target.value)} placeholder="Analysis and planning" /></div>
    </div>
    <div className="space-y-2"><Label htmlFor="agent-instructions">Instructions</Label><Textarea id="agent-instructions" required maxLength={8000} disabled={disabled} value={value.instructions} onChange={event => field('instructions', event.target.value)} className="min-h-40 resize-y" placeholder="Describe how this agent should approach its work." /><p className="text-xs text-muted-foreground tabular-nums">{value.instructions.length}/8,000</p></div>
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="agent-model">Model ID</Label><Input id="agent-model" maxLength={200} disabled={disabled} value={value.modelId ?? ''} onChange={event => onChange({ ...value, modelId: event.target.value.trim() || null })} placeholder="Use the default model" /><p className="text-xs leading-5 text-muted-foreground">Leave empty to follow the system default.</p></div>
      <div className="space-y-2"><Label htmlFor="agent-tools">Tool IDs</Label><Input id="agent-tools" disabled={disabled} value={toolText} onChange={event => { setToolText(event.target.value); onChange({ ...value, toolIds: references(event.target.value) }) }} placeholder="calendar.read, web.lookup" /><p className="text-xs leading-5 text-muted-foreground">Picking tools here doesn’t let the agent use them without your approval rules.</p></div>
    </div>
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="agent-memory">Memory access</Label><Select disabled={disabled} value={value.memory.scope} onValueChange={scope => { if (scope === null) return; if (scope !== 'selected') setMemoryText(''); onChange({ ...value, memory: { scope, memoryIds: scope === 'selected' ? value.memory.memoryIds : [] } }) }} items={[{ value: "none", label: "No memory" }, { value: "conversation", label: "Current conversation" }, { value: "selected", label: "Selected records" }, ...(companion ? [{ value: "owner", label: "Across my chats" }] : [])]}><SelectTrigger id="agent-memory"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No memory</SelectItem><SelectItem value="conversation">Current conversation</SelectItem><SelectItem value="selected">Selected records</SelectItem>{companion && <SelectItem value="owner">Across my chats</SelectItem>}</SelectContent></Select>{value.memory.scope === 'owner' && <p className="text-xs leading-5 text-muted-foreground">Companion can use what it has remembered from all your chats. Private messages stay out. Other agents and tool permissions don’t change.</p>}</div>
      {value.memory.scope === 'selected' && <div className="space-y-2"><Label htmlFor="agent-memory-ids">Memory record IDs</Label><Input id="agent-memory-ids" required disabled={disabled} value={memoryText} onChange={event => { setMemoryText(event.target.value); onChange({ ...value, memory: { ...value.memory, memoryIds: references(event.target.value) } }) }} placeholder="mem_project, mem_preferences" /></div>}
    </div>
  </div>
}

function AgentEditor({ client, profile, creating, companion, onSaved, onCancel }: {
  client: GatewayControlClient; profile?: AgentProfile; creating?: boolean; companion?: boolean
  onSaved: (profile: AgentProfile) => void; onCancel: () => void
}) {
  const [value, setValue] = useState<AgentConfiguration>(profile?.configuration ?? blank)
  const [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null)
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setPending(true); setError(null)
    try {
      const saved = creating ? await client.createAgent(value) : await client.saveAgent(profile!.id, value, profile!.revision)
      onSaved(saved)
    } catch (cause) { setError(changedMessage(cause)) } finally { setPending(false) }
  }
  return <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
    <OverlayBody><AgentFields value={value} onChange={setValue} disabled={pending} companion={profile?.kind === 'companion'} /></OverlayBody>
    <FormActions inset description={error ? <span role="alert" className="text-destructive-foreground">{error}</span> : companion ? `Saved profile, version ${profile?.revision ?? 1}.` : 'Saving creates an immutable revision.'}>
      <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>Cancel</Button>
      <Button type="submit" disabled={pending || !value.name.trim() || !value.role.trim() || !value.instructions.trim() || (value.memory.scope === 'selected' && !value.memory.memoryIds.length)}><Save />{pending ? 'Saving…' : 'Save'}</Button>
    </FormActions>
  </form>
}

function LoadingPage({ list }: { list: boolean }) {
  return <GatewayPageFrame>{list ? <div className="mx-auto w-full max-w-3xl"><ListSkeleton rows={4} label="Loading agents…" /></div> : <CollectionLoading label="Loading agents…" />}</GatewayPageFrame>
}

export function GatewayAgentsWorkspace({ client, companion = false }: { client: GatewayControlClient; companion?: boolean }) {
  const location = useLocation(), navigate = useNavigate()
  const [agents, setAgents] = useState<AgentProfile[] | null>(null), [query, setQuery] = useState(''), [error, setError] = useState<string | null>(null)
  const [resetNonce, setResetNonce] = useState(0), [filter, setFilter] = useState<'active' | 'archived'>('active'), [listError, setListError] = useState<unknown>(null)
  const [creating, setCreating] = useState(false), [archive, setArchive] = useState<AgentProfile | null>(null), [archivePending, setArchivePending] = useState(false), [archiveError, setArchiveError] = useState<string | null>(null)
  const load = useCallback(() => { setError(null); setListError(null); return client.agents().then(setAgents).catch(cause => { setListError(cause); setError(gatewayError(cause).message) }) }, [client])
  useEffect(() => {
    let active = true
    client.agents().then(rows => { if (active) setAgents(rows) }).catch(cause => { if (active) { setListError(cause); setError(gatewayError(cause).message) } })
    return () => { active = false }
  }, [client])
  const editMatch = location.pathname.match(/^\/agents\/(agent_[0-9a-f]{32})\/edit$/)
  const selected = companion ? agents?.find(item => item.id === 'companion') : editMatch ? agents?.find(item => item.id === editMatch[1]) : undefined
  const visible = useMemo(() => (agents ?? []).filter(item => {
    const text = `${item.configuration.name} ${item.configuration.role}`.toLocaleLowerCase()
    return text.includes(query.toLocaleLowerCase())
  }), [agents, query])
  const saved = (profile: AgentProfile) => {
    setAgents(current => current?.map(item => item.id === profile.id ? profile : item) ?? [profile])
    setCreating(false)
    navigate(companion ? '/settings/companion' : '/agents')
  }
  const confirmArchive = async () => {
    if (!archive) return
    setArchivePending(true); setArchiveError(null)
    try {
      const updated = await client.setAgentArchived(archive.id, archive.archived_at === null, archive.revision)
      setAgents(current => current?.map(item => item.id === updated.id ? updated : item) ?? [updated]); setArchive(null)
    } catch (cause) { setArchiveError(changedMessage(cause)) } finally { setArchivePending(false) }
  }
  if (!agents && !error) return <LoadingPage list={!companion && !editMatch} />
  if (error) return <GatewayPageFrame><div className="mx-auto w-full max-w-3xl"><InlineError error={listError} title="Agents didn’t load" onRetry={() => load()} /></div></GatewayPageFrame>
  if (companion) return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <PageHeader actionsOnly title="Companion" description="Shape the identity and working instructions used by your primary personal agent." density="compact" actions={<WorkspaceAction render={<Link to="/companion" />}>Open chat</WorkspaceAction>} />
    {selected ? <AgentEditor key={`${selected.revision}:${resetNonce}`} client={client} profile={selected} companion onSaved={saved} onCancel={() => setResetNonce(value => value + 1)} /> : <div className="p-6 text-sm text-muted-foreground">The canonical Companion profile is missing. Check System before continuing.</div>}
  </div>
  if (editMatch) return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div className="shrink-0 border-b px-4 py-4 sm:px-6 sm:py-6"><PageHeader title={selected?.configuration.name ?? 'Agent not found'} description="Change this agent. Earlier versions are kept." density="compact" actions={selected && <Button variant="outline" onClick={() => setArchive(selected)}>{selected.archived_at === null ? <Archive /> : <RotateCcw />}{selected.archived_at === null ? 'Archive' : 'Restore'}</Button>} /></div>
    {selected?.archived_at === null ? <AgentEditor client={client} profile={selected} onSaved={saved} onCancel={() => navigate('/agents')} /> : selected ? <div className="space-y-3 p-6"><p className="text-sm text-muted-foreground">Restore this agent before editing its profile.</p><Button variant="outline" onClick={() => setArchive(selected)}><RotateCcw />Restore agent</Button></div> : <div className="p-6 text-sm text-muted-foreground">This agent does not exist.</div>}
    <ConfirmationDialog open={archive !== null} onOpenChange={open => !open && setArchive(null)} title={archive?.archived_at === null ? `Archive ${archive?.configuration.name}?` : `Restore ${archive?.configuration.name}?`} description={archive?.archived_at === null ? 'Its history is kept, but it leaves your active agents.' : 'The profile returns to the active agent list.'} actionLabel={archive?.archived_at === null ? 'Archive agent' : 'Restore agent'} actionVariant={archive?.archived_at === null ? 'destructive' : 'default'} pending={archivePending} error={archiveError} onConfirm={confirmArchive} />
  </div>
  const archivedCount = (agents ?? []).filter(item => item.archived_at !== null).length
  // Archived agents get their own chip only once there are some.
  const showing = archivedCount ? filter : 'active'
  const shown = visible.filter(item => (item.archived_at !== null) === (showing === 'archived'))
  const chip = (value: typeof filter, text: string, count: number) => <FilterChip key={value} active={showing === value} count={count} onClick={() => setFilter(value)}>{text}</FilterChip>
  return <GatewayPageFrame>
    <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-4">
      <PageHeader actionsOnly title="Agents" description="Agents are focused helpers for recurring work. Each picks its model, tools and memory; your approval rules still apply." density="compact" actions={<WorkspaceAction keepVisible onClick={() => setCreating(true)}><Plus />New agent</WorkspaceAction>} />
      <ListCard query={query} onQueryChange={setQuery} label="Search agents" placeholder="Search agents…" count={shown.length} unit={shown.length === 1 ? 'agent' : 'agents'}
        filters={archivedCount ? <>{chip('active', 'Active', (agents?.length ?? 0) - archivedCount)}{chip('archived', 'Archived', archivedCount)}</> : undefined}
        emptyTitle={query ? 'No matching agents' : showing === 'archived' ? 'No archived agents' : 'No agents yet'} emptyDescription={query ? 'Try a different name or role.' : showing === 'archived' ? 'Archived agents keep their history.' : 'Create an agent for a focused kind of work.'}
        emptyAction={query || showing === 'archived' ? undefined : <Button onClick={() => setCreating(true)}><Plus />New agent</Button>} icon={<Bot />}>
        {shown.map(item => <ListLine key={item.id} to={item.kind === 'companion' ? '/settings/companion' : `/agents/${item.id}/edit`} icon={item.archived_at === null ? <Bot /> : <Archive />} title={item.configuration.name} sub={item.configuration.role}
          meta={item.kind === 'companion' ? 'Primary' : `Revision ${item.revision}`} />)}
      </ListCard>
    </div>
    <Dialog open={creating} onOpenChange={setCreating}><TaskDialogContent title="New agent" description="Set up a helper for one kind of work." size="wide"><AgentEditor client={client} creating onSaved={saved} onCancel={() => setCreating(false)} /></TaskDialogContent></Dialog>
    <ConfirmationDialog open={archive !== null} onOpenChange={open => !open && setArchive(null)} title={archive?.archived_at === null ? `Archive ${archive?.configuration.name}?` : `Restore ${archive?.configuration.name}?`} description={archive?.archived_at === null ? 'Its history is kept, but it leaves your active agents.' : 'The profile returns to the active agent list.'} actionLabel={archive?.archived_at === null ? 'Archive agent' : 'Restore agent'} actionVariant={archive?.archived_at === null ? 'destructive' : 'default'} pending={archivePending} error={archiveError} onConfirm={confirmArchive} />
  </GatewayPageFrame>
}
