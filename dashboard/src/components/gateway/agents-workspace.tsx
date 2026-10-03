import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Archive, Bot, Plus, RotateCcw, Save } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CollectionPanel, CollectionRow, CollectionSection, FormActions, OverlayBody, PageHeader, TaskDialogContent, ConfirmationDialog } from '@/components/design-system'
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

function AgentFields({ value, onChange, disabled }: { value: AgentConfiguration; onChange: (value: AgentConfiguration) => void; disabled: boolean }) {
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
      <div className="space-y-2"><Label htmlFor="agent-tools">Tool IDs</Label><Input id="agent-tools" disabled={disabled} value={toolText} onChange={event => { setToolText(event.target.value); onChange({ ...value, toolIds: references(event.target.value) }) }} placeholder="calendar.read, web.lookup" /><p className="text-xs leading-5 text-muted-foreground">Selections do not grant execution authority.</p></div>
    </div>
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="agent-memory">Memory access</Label><Select disabled={disabled} value={value.memory.scope} onValueChange={(scope: AgentConfiguration['memory']['scope']) => { if (scope !== 'selected') setMemoryText(''); onChange({ ...value, memory: { scope, memoryIds: scope === 'selected' ? value.memory.memoryIds : [] } }) }}><SelectTrigger id="agent-memory"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No memory</SelectItem><SelectItem value="conversation">Current conversation</SelectItem><SelectItem value="selected">Selected records</SelectItem></SelectContent></Select></div>
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
    <OverlayBody><AgentFields value={value} onChange={setValue} disabled={pending} /></OverlayBody>
    <FormActions inset description={error ? <span role="alert" className="text-destructive">{error}</span> : companion ? `Durable profile, revision ${profile?.revision ?? 1}.` : 'Saving creates an immutable revision.'}>
      <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>Cancel</Button>
      <Button type="submit" disabled={pending || !value.name.trim() || !value.role.trim() || !value.instructions.trim() || (value.memory.scope === 'selected' && !value.memory.memoryIds.length)}><Save />{pending ? 'Saving…' : 'Save'}</Button>
    </FormActions>
  </form>
}

function LoadingPage() {
  return <div className="p-6 text-sm text-muted-foreground" role="status">Loading agents…</div>
}

export function GatewayAgentsWorkspace({ client, companion = false }: { client: GatewayControlClient; companion?: boolean }) {
  const location = useLocation(), navigate = useNavigate()
  const [agents, setAgents] = useState<AgentProfile[] | null>(null), [query, setQuery] = useState(''), [error, setError] = useState<string | null>(null)
  const [resetNonce, setResetNonce] = useState(0)
  const [creating, setCreating] = useState(false), [archive, setArchive] = useState<AgentProfile | null>(null), [archivePending, setArchivePending] = useState(false), [archiveError, setArchiveError] = useState<string | null>(null)
  const load = useCallback(() => { setError(null); client.agents().then(setAgents).catch(cause => setError(gatewayError(cause).message)) }, [client])
  useEffect(() => {
    let active = true
    client.agents().then(rows => { if (active) setAgents(rows) }).catch(cause => { if (active) setError(gatewayError(cause).message) })
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
  if (!agents && !error) return <LoadingPage />
  if (error) return <div className="space-y-4 p-6" role="alert"><PageHeader title="Agents are unavailable" description={error} density="compact" /><Button variant="outline" onClick={load}>Try again</Button></div>
  if (companion) return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div className="shrink-0 border-b px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8"><PageHeader actionsOnly title="Companion" description="Shape the identity and working instructions used by your primary personal agent." density="compact" actions={<Button variant="outline" asChild><Link to="/companion">Open chat</Link></Button>} /></div>
    {selected ? <AgentEditor key={`${selected.revision}:${resetNonce}`} client={client} profile={selected} companion onSaved={saved} onCancel={() => setResetNonce(value => value + 1)} /> : <div className="p-6 text-sm text-muted-foreground">The canonical Companion profile is missing. Check System before continuing.</div>}
  </div>
  if (editMatch) return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div className="shrink-0 border-b px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8"><PageHeader title={selected?.configuration.name ?? 'Agent not found'} description="Edit the durable profile. Existing revisions remain available to the server." density="compact" actions={selected && <Button variant="outline" onClick={() => setArchive(selected)}>{selected.archived_at === null ? <Archive /> : <RotateCcw />}{selected.archived_at === null ? 'Archive' : 'Restore'}</Button>} /></div>
    {selected?.archived_at === null ? <AgentEditor client={client} profile={selected} onSaved={saved} onCancel={() => navigate('/agents')} /> : selected ? <div className="space-y-3 p-6"><p className="text-sm text-muted-foreground">Restore this agent before editing its profile.</p><Button variant="outline" onClick={() => setArchive(selected)}><RotateCcw />Restore agent</Button></div> : <div className="p-6 text-sm text-muted-foreground">This agent does not exist.</div>}
    <ConfirmationDialog open={archive !== null} onOpenChange={open => !open && setArchive(null)} title={archive?.archived_at === null ? `Archive ${archive?.configuration.name}?` : `Restore ${archive?.configuration.name}?`} description={archive?.archived_at === null ? 'Its immutable history is kept, but the profile moves out of active use.' : 'The profile returns to the active agent list.'} actionLabel={archive?.archived_at === null ? 'Archive agent' : 'Restore agent'} actionVariant={archive?.archived_at === null ? 'destructive' : 'default'} pending={archivePending} error={archiveError} onConfirm={confirmArchive} />
  </div>
  const active = visible.filter(item => item.archived_at === null), archived = visible.filter(item => item.archived_at !== null)
  return <GatewayPageFrame>
    <div className="space-y-6">
      <PageHeader actionsOnly title="Agents" description="Create focused roles for recurring work. Profiles choose models, tools and memory; they never grant authority." density="compact" actions={<Button onClick={() => setCreating(true)}><Plus />New agent</Button>} />
      <CollectionPanel query={query} onQueryChange={setQuery} label="Search agents" placeholder="Search agents…" count={visible.length} unit={visible.length === 1 ? 'agent' : 'agents'} emptyTitle="No matching agents" emptyDescription={query ? 'Try a different name or role.' : 'Create an agent for a focused kind of work.'} emptyAction={<Button onClick={() => setCreating(true)}><Plus />New agent</Button>} icon={<Bot />}>
        <div className="space-y-5">
          <CollectionSection title="Active agents">
            {active.map(item => <CollectionRow key={item.id} to={item.kind === 'companion' ? '/settings/companion' : `/agents/${item.id}/edit`} title={item.configuration.name} description={<span className="truncate">{item.configuration.role}</span>} leading={<span className="flex size-8 items-center justify-center rounded-lg border bg-background"><Bot className="size-4" /></span>} trailing={<><span>Revision {item.revision}</span>{item.kind === 'companion' && <span>Primary</span>}</>} />)}
          </CollectionSection>
          {!!archived.length && <CollectionSection title="Archived">{archived.map(item => <CollectionRow key={item.id} to={`/agents/${item.id}/edit`} title={item.configuration.name} description={<span className="truncate">{item.configuration.role}</span>} leading={<span className="flex size-8 items-center justify-center rounded-lg border bg-background"><Bot className="size-4" /></span>} trailing={<span>Revision {item.revision}</span>} />)}</CollectionSection>}
        </div>
      </CollectionPanel>
    </div>
    <Dialog open={creating} onOpenChange={setCreating}><TaskDialogContent title="New agent" description="Create a durable profile for one focused role." size="wide"><AgentEditor client={client} creating onSaved={saved} onCancel={() => setCreating(false)} /></TaskDialogContent></Dialog>
    <ConfirmationDialog open={archive !== null} onOpenChange={open => !open && setArchive(null)} title={archive?.archived_at === null ? `Archive ${archive?.configuration.name}?` : `Restore ${archive?.configuration.name}?`} description={archive?.archived_at === null ? 'Its immutable history is kept, but the profile moves out of active use.' : 'The profile returns to the active agent list.'} actionLabel={archive?.archived_at === null ? 'Archive agent' : 'Restore agent'} actionVariant={archive?.archived_at === null ? 'destructive' : 'default'} pending={archivePending} error={archiveError} onConfirm={confirmArchive} />
  </GatewayPageFrame>
}
