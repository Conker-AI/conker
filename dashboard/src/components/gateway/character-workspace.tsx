import { useEffect, useState } from 'react'
import { Download, History, Plus, Save, Trash2, Upload } from 'lucide-react'
import { AppearanceEditor } from '@/components/character-studio/appearance-editor'
import { StudioField, StudioSection } from '@/components/character-studio/fields'
import { ModesEditor } from '@/components/character-studio/modes-editor'
import { CharacterPreview } from '@/components/character-studio/preview'
import { VoiceEditor } from '@/components/character-studio/voice-editor'
import { ConfirmationDialog, FormActions, OverlayBody, PageHeader, RouteSection, TaskDialogContent } from '@/components/design-system'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createCharacterStudio } from '@/lib/api/character-defaults'
import { sameCharacterValue, validateCharacter, type CharacterDraft, type CharacterStudio } from '@/lib/api/character'
import { validateImportedMedia } from '@/lib/character-media'
import type { GatewayControlClient } from '@/lib/gateway/control'
import type { GatewayCharacterHistory } from '@/lib/gateway/characters'
import { gatewayError } from '@/lib/gateway/transport'

function initialCharacter(): CharacterDraft {
  return {
    studio: createCharacterStudio(), name: 'Conker', speakingPreset: 'custom', speakingStyle: '', personality: '',
    renderer: 'static', portrait: '/conker.png', face: 'sprout', tone: 'green', mood: '',
    emotions: { neutral: 'default', happy: 'portrait', thinking: 'portrait', concerned: 'default', celebrating: 'portrait' },
  }
}

function downloadJson(name: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob), link = document.createElement('a')
  link.href = url; link.download = `${name.replace(/[^a-z0-9_-]/gi, '-') || 'character'}.conker.json`; link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function GatewayCharacterWorkspace({ client }: { client: GatewayControlClient }) {
  const [saved, setSaved] = useState<CharacterDraft | null>(null), [draft, setDraft] = useState<CharacterDraft | null>(null)
  const [revision, setRevision] = useState(0), [history, setHistory] = useState<GatewayCharacterHistory>([])
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [mediaBusy, setMediaBusy] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [importOpen, setImportOpen] = useState(false), [historyOpen, setHistoryOpen] = useState(false)
  const [incoming, setIncoming] = useState<{ profile: CharacterDraft; note: string } | null>(null), [reading, setReading] = useState(false)
  const [restoreRevision, setRestoreRevision] = useState<number | null>(null)
  const profile = draft ?? saved
  const dirty = !!profile && !!saved && (revision === 0 || !sameCharacterValue(profile, saved))
  const load = async () => {
    setLoading(true); setError('')
    try {
      const [current, versions] = await Promise.all([client.characters.get(), client.characters.history()])
      const value = current.profile ?? initialCharacter()
      setSaved(value); setDraft(null); setRevision(current.revision); setHistory(versions)
    } catch (cause) { setError(gatewayError(cause).message) } finally { setLoading(false) }
  }
  useEffect(() => {
    let active = true
    Promise.all([client.characters.get(), client.characters.history()]).then(([current, versions]) => {
      if (!active) return
      const value = current.profile ?? initialCharacter()
      setSaved(value); setRevision(current.revision); setHistory(versions); setLoading(false)
    }).catch(cause => { if (active) { setError(gatewayError(cause).message); setLoading(false) } })
    return () => { active = false }
  }, [client])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  const update = (next: CharacterDraft | ((current: CharacterDraft) => CharacterDraft)) => {
    if (!profile) return
    setDraft(current => typeof next === 'function' ? next(current ?? profile) : next); setNotice(''); setError('')
  }
  const change = (patch: Partial<CharacterDraft>) => profile && update({ ...profile, ...patch })
  const studio = (patch: Partial<CharacterStudio>) => profile && change({ studio: { ...profile.studio, ...patch } })
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (!profile) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await client.characters.save(validateCharacter(profile), revision)
      if (!result.profile) throw new Error('The saved profile was missing.')
      setSaved(result.profile); setDraft(null); setRevision(result.revision)
      setHistory(await client.characters.history()); setNotice(`Saved immutable revision ${result.revision}.`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the Companion.') } finally { setBusy(false) }
  }
  const restore = async () => {
    if (restoreRevision === null) return
    setBusy(true); setError('')
    try {
      const result = await client.characters.restore(restoreRevision, revision)
      if (!result.profile) throw new Error('The restored profile was missing.')
      setSaved(result.profile); setDraft(null); setRevision(result.revision); setHistory(await client.characters.history())
      setNotice(`Restored revision ${restoreRevision} as new revision ${result.revision}.`); setRestoreRevision(null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not restore that revision.') } finally { setBusy(false) }
  }
  const exportCurrent = async () => {
    setBusy(true); setError('')
    try { const bundle = await client.characters.export(); downloadJson(bundle.character.name, bundle); setNotice(`Exported revision ${revision}.`) }
    catch (cause) { setError(gatewayError(cause).message) } finally { setBusy(false) }
  }
  if (loading) return <div className="p-6 text-sm text-muted-foreground" role="status">Opening Character Studio…</div>
  if (!profile) return <div className="space-y-4 p-6" role="alert"><PageHeader title="Character Studio is unavailable" description={error || 'The Companion profile could not be opened.'} density="compact" /><Button variant="outline" onClick={() => void load()}>Try again</Button></div>
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <PageHeader actionsOnly title="Character Studio" description="Shape who your Companion is, how it looks, and how it speaks." density="compact" actions={<><Button variant="outline" disabled={busy || mediaBusy} onClick={() => { setImportOpen(true); setIncoming(null); setError('') }}><Upload />Import</Button><Button variant="outline" disabled={busy || mediaBusy || revision === 0} onClick={() => void exportCurrent()}><Download />Export</Button><Button variant="outline" disabled={busy || !history.length} onClick={() => setHistoryOpen(true)}><History />History</Button></>} />
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)]">
        <form id="gateway-character-form" onSubmit={save} className="min-w-0 space-y-6">
          <fieldset disabled={busy || mediaBusy} className="min-w-0 space-y-6"><legend className="sr-only">Character configuration</legend>
            <RouteSection value="identity"><div className="space-y-6">
              <StudioSection title="Identity" description="Introduce the character in your own words."><div className="grid gap-4 sm:grid-cols-2"><StudioField label="Name" multiline={false} maxLength={60} value={profile.name} onChange={name => change({ name })} /><StudioField label="Profile line" multiline={false} maxLength={100} value={profile.mood} onChange={mood => change({ mood })} placeholder="A short introduction" /></div><StudioField label="Personality" value={profile.personality} onChange={personality => change({ personality })} placeholder="Temperament, habits, contradictions, and sense of humor." /><StudioField label="Soul & values" value={profile.studio.soul} onChange={soul => studio({ soul })} placeholder="What matters to this character?" /></StudioSection>
              <StudioSection title="Background & relationship" description="Give the character context that makes its personality coherent."><StudioField label="Backstory" value={profile.studio.backstory} onChange={backstory => studio({ backstory })} hint="Character lore stays separate from memories of real conversations." /><StudioField label="Relationship with you" value={profile.studio.relationship} onChange={relationship => studio({ relationship })} /></StudioSection>
              <StudioSection title="More about your character" description="Add interests, habits, motivations, or other useful details.">{profile.studio.details.map((detail, index) => <div key={detail.id} className="flex items-end gap-2"><div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2"><StudioField label={`Detail ${index + 1} label`} value={detail.label} multiline={false} maxLength={80} onChange={label => studio({ details: profile.studio.details.map(item => item.id === detail.id ? { ...item, label } : item) })} /><StudioField label={`Detail ${index + 1} value`} value={detail.value} multiline={false} maxLength={500} onChange={value => studio({ details: profile.studio.details.map(item => item.id === detail.id ? { ...item, value } : item) })} /></div><Button type="button" variant="ghost" size="icon" aria-label={`Remove detail ${index + 1}`} onClick={() => studio({ details: profile.studio.details.filter(item => item.id !== detail.id) })}><Trash2 /></Button></div>)}<Button type="button" variant="outline" disabled={profile.studio.details.length >= 20} onClick={() => studio({ details: [...profile.studio.details, { id: crypto.randomUUID(), label: '', value: '' }] })}><Plus />Add detail</Button></StudioSection>
            </div></RouteSection>
            <RouteSection value="speaking"><div className="space-y-6"><StudioSection title="Speaking style" description="Write the way you want your character to communicate."><StudioField label="Speaking instructions" value={profile.speakingStyle} onChange={speakingStyle => change({ speakingStyle })} hint="This controls writing. Voice defines sound." /></StudioSection><StudioSection title="Teach by example" description="Compare two authored versions of the same answer."><StudioField label="Sample question" maxLength={1000} value={profile.studio.examples.prompt} onChange={prompt => studio({ examples: { ...profile.studio.examples, prompt } })} /><StudioField label="Focus answer" value={profile.studio.examples.focus} onChange={focus => studio({ examples: { ...profile.studio.examples, focus } })} /><StudioField label="Character answer" value={profile.studio.examples.character} onChange={character => studio({ examples: { ...profile.studio.examples, character } })} hint="These are editable examples, not generated responses." /></StudioSection></div></RouteSection>
            <RouteSection value="appearance"><AppearanceEditor profile={profile} update={update} onBusy={setMediaBusy} /></RouteSection>
            <RouteSection value="voice"><VoiceEditor value={profile.studio.voice} onBusy={setMediaBusy} onChange={voice => update(current => ({ ...current, studio: { ...current.studio, voice: typeof voice === 'function' ? voice(current.studio.voice) : voice } }))} /></RouteSection>
            <RouteSection value="modes"><ModesEditor value={profile.studio.modes} onChange={modes => studio({ modes })} /></RouteSection>
          </fieldset>
        </form>
        <CharacterPreview profile={profile} />
      </div>
    </div>
    <div className="shrink-0 border-t bg-background px-4 py-3 sm:px-6">
      {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
      <FormActions description={<span role="status">{mediaBusy ? 'Checking media…' : notice || (dirty ? 'Unsaved changes' : revision ? `Durable revision ${revision}` : 'Ready to create the first durable revision')}</span>}><Button type="button" variant="outline" disabled={!dirty || busy || mediaBusy} onClick={() => { setDraft(null); setError(''); setNotice('Changes discarded.') }}>Discard</Button><Button type="submit" form="gateway-character-form" disabled={!dirty || !profile.name.trim() || busy || mediaBusy}><Save />{busy ? 'Saving…' : 'Save character'}</Button></FormActions>
    </div>
    <Dialog open={importOpen} onOpenChange={open => { if (!reading) setImportOpen(open) }}><TaskDialogContent title="Import character" description="Bring in a Conker package or Character Card V2/V3 JSON." onPointerDownOutside={event => event.preventDefault()}><OverlayBody><div className="space-y-2"><Label htmlFor="gateway-character-import">Character JSON file</Label><Input id="gateway-character-import" type="file" accept="application/json,.json" disabled={reading} onChange={async event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; setIncoming(null); setError(''); setReading(true); try { if (file.size > 32 * 1024 * 1024) throw new Error('Choose a JSON file under 32 MiB.'); const result = await client.characters.importDraft(await file.text()); await validateImportedMedia(result.profile); setIncoming(result) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not read this package.') } finally { setReading(false) } }} /></div>{reading && <p role="status" className="text-sm text-muted-foreground">Validating character…</p>}{incoming && <div className="space-y-2"><p className="font-medium">{incoming.profile.name}</p><p className="text-sm text-muted-foreground">{incoming.note}</p><p className="text-sm">Import changes only this draft. Saving still uses the current revision check.</p></div>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</OverlayBody><FormActions inset><Button variant="outline" disabled={reading} onClick={() => setImportOpen(false)}>Cancel</Button><Button disabled={!incoming || reading} onClick={() => { if (incoming) { update(incoming.profile); setNotice(incoming.note); setImportOpen(false) } }}>Use draft</Button></FormActions></TaskDialogContent></Dialog>
    <Dialog open={historyOpen} onOpenChange={setHistoryOpen}><TaskDialogContent title="Character history" description="Every save and restore creates a new immutable revision."><OverlayBody><div className="divide-y rounded-md border">{[...history].reverse().map(item => <div key={item.revision} className="flex items-center justify-between gap-4 px-3 py-3"><div><p className="text-sm font-medium">Revision {item.revision}{item.revision === revision ? ' · Current' : ''}</p><p className="text-xs text-muted-foreground">{new Date(item.created_at * 1000).toLocaleString()}{item.restored_from ? ` · restored from ${item.restored_from}` : ''}</p></div><Button size="sm" variant="outline" disabled={busy || item.revision === revision} onClick={() => { setRestoreRevision(item.revision); setHistoryOpen(false) }}>Restore</Button></div>)}</div></OverlayBody><FormActions inset><Button variant="outline" onClick={() => setHistoryOpen(false)}>Close</Button></FormActions></TaskDialogContent></Dialog>
    <ConfirmationDialog open={restoreRevision !== null} onOpenChange={open => !open && setRestoreRevision(null)} title={`Restore revision ${restoreRevision ?? ''}?`} description="This keeps all history and appends the selected profile as a new revision." actionLabel="Restore revision" pending={busy} error={error || undefined} onConfirm={() => void restore()} />
  </div>
}
