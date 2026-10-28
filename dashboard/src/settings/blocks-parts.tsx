import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { OwnerAvatar } from '@/components/gateway/owner-avatar'
import { withAnswerModel, withIdeas } from '@/lib/api/model-roles'
import { saveOwnerProfile, useOwnerProfile } from '@/lib/owner-profile'
import { useModels } from './models'

export function ProfileBlock() {
  const profile = useOwnerProfile()
  const [name, setName] = useState(profile.name), [error, setError] = useState('')
  const choose = (file?: File) => {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 512 * 1024) { setError('Choose a PNG, JPEG, or WebP image under 512 KB.'); return }
    const reader = new FileReader()
    reader.onload = () => { if (typeof reader.result === 'string') { saveOwnerProfile({ ...profile, name, avatar: reader.result }); setError('') } }
    reader.onerror = () => setError('That photo could not be read. Choose another image.')
    reader.readAsDataURL(file)
  }
  return <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center gap-3">
      <OwnerAvatar className="size-14" />
      <Button type="button" variant="outline" size="sm" render={<label className="cursor-pointer has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring" />}><Upload />Choose photo
        <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { choose(event.target.files?.[0]); event.target.value = '' }} /></Button>
      {profile.avatar && <Button type="button" variant="ghost" size="sm" onClick={() => saveOwnerProfile({ ...profile, avatar: '' })}><Trash2 />Remove photo</Button>}
    </div>
    <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={event => { event.preventDefault(); saveOwnerProfile({ ...profile, name }); setError('') }}>
      <div className="min-w-0 flex-1 space-y-1.5"><Label htmlFor="profile-name">Display name</Label><Input id="profile-name" maxLength={60} value={name} onChange={event => setName(event.target.value)} /></div>
      <Button type="submit" variant="outline" disabled={!name.trim() || name.trim() === profile.name}>Save name</Button>
    </form>
    <p className="text-xs text-muted-foreground">Kept in this browser for now · PNG, JPEG, or WebP · 512 KB max</p>
    {error && <p role="alert" className="text-sm text-destructive-foreground">{error}</p>}
  </div>
}

/** A model role chosen with one menu: Auto or Off where they apply, else one of your models. */
export function RoleMenu({ id, value, first, onChange }: { id: string; value: string; first: { value: string; label: string; disabled?: boolean }; onChange: (value: string) => void }) {
  const { enabled, pending, value: saved, error } = useModels()
  if (!saved) return <p role={error ? 'alert' : 'status'} className="text-sm text-muted-foreground">{error || 'Loading models…'}</p>
  const items: { value: string; label: string; disabled?: boolean }[] = [first, ...enabled.map(model => ({ value: model.id, label: model.name }))]
  return <div className="flex flex-col gap-1.5">
    <Select value={value} disabled={pending || !enabled.length} onValueChange={next => { if (next !== null && next !== value) onChange(String(next)) }} items={items}>
      <SelectTrigger id={id} className="w-full sm:w-72"><SelectValue placeholder={enabled.length ? 'Choose a model' : 'No models set up yet'} /></SelectTrigger>
      <SelectContent>{items.map(item => <SelectItem key={item.value} value={item.value} disabled={item.disabled}>{item.label}</SelectItem>)}</SelectContent>
    </Select>
    {pending && <p role="status" className="text-xs text-muted-foreground">Saving…</p>}
    {error && <p role="alert" className="text-xs text-destructive-foreground">{error}</p>}
  </div>
}

export function TalkingModelBlock() {
  const { value, save } = useModels()
  const saved = value?.configuration
  const answering = saved?.roleSettings.answerMode === 'manual' && saved.roleSettings.roles.answer.enabled ? saved.roleSettings.roles.answer.modelId : null
  return <RoleMenu id="answer-model" value={saved?.roleSettings.answerMode === 'router' ? '__auto__' : answering ?? ''}
    first={{ value: '__auto__', label: 'Auto · choose for each request', disabled: !saved?.roleSettings.roles.routing.enabled }}
    onChange={modelId => { if (!saved) return; void save(modelId === '__auto__' ? { ...saved, roleSettings: { ...saved.roleSettings, answerMode: 'router' } } : withAnswerModel(saved, modelId)) }} />
}

/** A helper role (thinking, reviewer): Off, or one model with no fallback. */
export function HelperRoleBlock({ role, offLabel }: { role: 'thinking' | 'reviewer'; offLabel: string }) {
  const { value, save } = useModels()
  const saved = value?.configuration
  const current = saved?.roleSettings.roles[role as 'thinking']
  return <RoleMenu id={`${role}-model`} value={current?.enabled ? current.modelId ?? '__off__' : '__off__'} first={{ value: '__off__', label: offLabel }} onChange={modelId => {
    if (!saved) return
    const assignment = current ?? { enabled: false, eligibleModelIds: [], modelId: null, timeoutMs: 120000, failure: 'stop' as const, fallbackModelId: null }
    const on = modelId !== '__off__'
    void save({ ...saved, roleSettings: { ...saved.roleSettings, roles: { ...saved.roleSettings.roles, [role]: { ...assignment, enabled: on,
      ...(on ? { modelId, eligibleModelIds: [...new Set([...assignment.eligibleModelIds, modelId])], failure: 'stop' as const, fallbackModelId: null } : {}) } } } })
  }} />
}

export function IdeasBlock() {
  const { value, enabled, pending, save, error } = useModels()
  const saved = value?.configuration
  if (!saved) return <p role="status" className="text-sm text-muted-foreground">{error || 'Loading models…'}</p>
  const answering = saved.roleSettings.answerMode === 'manual' && saved.roleSettings.roles.answer.enabled ? saved.roleSettings.roles.answer.modelId : null
  const ideas = saved.roleSettings.roles.proposals
  const on = Boolean(ideas?.enabled && ideas.modelId && enabled.some(model => model.id === ideas.modelId))
  return <div className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
    <Label htmlFor="ideas-switch" className="font-normal">{on ? 'On: one pass a day with your talking model.' : 'Off'}</Label>
    <Switch id="ideas-switch" checked={on} disabled={pending || !enabled.length} onCheckedChange={next => void save(withIdeas(saved, next ? answering ?? enabled[0]?.id ?? null : null))} />
  </div>
}

export function JumpTo({ target, children }: { target: string; children: ReactNode }) {
  return <Button type="button" variant="outline" size="sm" className="w-auto!" onClick={() => document.getElementById(`setting-${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{children}</Button>
}

export function PlaceLink({ to, children }: { to: string; children: ReactNode }) {
  return <Button variant="outline" size="sm" className="w-auto!" render={<Link to={to} />}>{children}<ArrowUpRight /></Button>
}

