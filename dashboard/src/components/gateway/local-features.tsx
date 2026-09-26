import { lazy, Suspense, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Copy, Plus, Phone, Settings2 } from 'lucide-react'
import { DataProvider } from '@/lib/api/provider'
import { createFixtureClient } from '@/lib/api/fixture-adapter'
import { installConkerClient } from '@/lib/api'
import { characterDraft, sameCharacterValue } from '@/lib/api/character'
import { createCharacterStudio } from '@/lib/api/character-defaults'
import { readCharacterLibrary, updateCharacterLibrary, type CharacterLibrary as Library } from '@/lib/character-library'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { TaskDialogContent, OverlayBody, FormActions } from '@/components/design-system'
import type { Character } from '@/lib/api/client'
import { browserVoiceInput } from '@/lib/voice/browser-voice-input'
import { useConker, useConkerStore } from '@/lib/api/store'
import { useCallWorkspace } from '@/lib/call-workspace'
import { Button } from '@/components/ui/button'
import { EmbeddedWorkspace } from '@/contexts/embedded-workspace'
import CharacterStudio from '@/app/settings/companion/page'
import { useCharacterWorkspace } from '@/lib/character-workspace'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AppRouter } from '@/components/router/app-router'

// Local previews never replace the separately supplied gateway service clients.
const client = createFixtureClient()
const storageKey = 'conker-local-character-library-v1'
let library: Library
const initialized = client.load().then(async snapshot => {
  let raw: string | null = null
  try { raw = localStorage.getItem(storageKey) } catch { /* The editor still opens without storage access. */ }
  library = readCharacterLibrary(raw, snapshot.profile)
  await client.saveCharacter(library.entries.find(entry => entry.id === library.selected)!.profile)
})
async function applyLibrary(next: Library) {
  const profile = next.entries.find(entry => entry.id === next.selected)!.profile
  localStorage.setItem(storageKey, JSON.stringify(next))
  library = next
  return client.saveCharacter(profile)
}
installConkerClient({ ...client, voiceInput: browserVoiceInput,
  load: async () => { await initialized; return client.load() },
  saveCharacter: async value => { await initialized; return applyLibrary(updateCharacterLibrary(library, value)) },
})
const CallHost = lazy(() => import('@/components/call/call-host'))
export function LocalFeaturesProvider({ children }: { children: ReactNode }) {
  return <DataProvider>{children}<Suspense fallback={null}><CallHost /></Suspense></DataProvider>
}
export function RetainedWorkspace() {
  const { pathname } = useLocation()
  return <><p role="status" className="border-b bg-muted px-4 py-2 text-xs text-muted-foreground">Local preview · changes here do not run server actions. {pathname === "/settings/companion" ? "Character profiles stay in this browser." : "Preview changes reset on reload."}</p><EmbeddedWorkspace.Provider value={true}><>{pathname === "/settings/companion" ? <CharacterStudio library={<CharacterLibrary />} /> : <AppRouter />}</></EmbeddedWorkspace.Provider></>
}
export function CompanionControls() {
  const profile = useConker(data => data.profile)
  const session = useConker(data => data.companionSessionId)
  const { start, starting, error } = useCallWorkspace()
  return <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
    <Button variant="ghost" size="sm" asChild><Link to="/settings/companion"><Settings2 />{profile.name} · Character</Link></Button>
    <Button variant="outline" size="sm" disabled={starting} onClick={() => void start(session)}><Phone />{starting ? 'Opening…' : 'Call preview'}</Button>
    <span className="text-xs text-muted-foreground">Character and calls are local previews; server replies use model settings.</span>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>
}

function CharacterLibrary() {
  const profile = useConker(data => data.profile)
  const { mutate, pending } = useConkerStore()
  const draft = useCharacterWorkspace(state => state.draft)
  const uploading = useCharacterWorkspace(state => state.uploading)
  const dirty = !!draft && !sameCharacterValue(draft, characterDraft(profile))
  const [creating, setCreating] = useState<'new' | 'copy' | null>(null)
  const [name, setName] = useState('')
  const navigate = useNavigate()
  const busy = pending || uploading || dirty
  async function create() {
    if (!name.trim() || busy) return
    const value: Character = creating === 'copy' ? { ...structuredClone(profile), name: name.trim() } : {
      ...structuredClone(profile), name: name.trim(), mood: '', personality: '', speakingStyle: '',
      portrait: '', renderer: 'static', studio: { ...createCharacterStudio(), examples: { prompt: '', focus: '', character: '' } },
    }
    const id = crypto.randomUUID()
    if (await mutate(() => applyLibrary({ selected: id, entries: [...library.entries, { id, profile: value }] }))) {
      useCharacterWorkspace.setState({ draft: null }); setCreating(null); navigate(creating === 'new' ? '/settings/companion?setup=1' : '/settings/companion')
    }
  }
  return <div className="space-y-2 border-b pb-4">
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-0 flex-1 space-y-2 sm:max-w-80"><Label htmlFor="local-character">Editing character</Label>
        <Select value={library.selected} disabled={busy} onValueChange={id => { void mutate(() => applyLibrary({ ...library, selected: id })).then(saved => { if (saved) useCharacterWorkspace.setState({ draft: null }) }) }}>
          <SelectTrigger id="local-character" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>{library.entries.map(item => <SelectItem key={item.id} value={item.id}>{item.profile.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <Button variant="outline" disabled={busy} onClick={() => { setName(''); setCreating('new') }}><Plus />New</Button>
      <Button variant="ghost" disabled={busy} onClick={() => { setName(`${profile.name} copy`.slice(0, 60)); setCreating('copy') }}><Copy />Duplicate</Button>
    </div>
    {dirty && <p className="text-xs text-muted-foreground">Save or discard your changes before switching or creating a character.</p>}
    <Dialog open={!!creating} onOpenChange={open => { if (!open && !pending) setCreating(null) }}>
      <TaskDialogContent title={creating === 'copy' ? 'Duplicate character' : 'New character'} description={creating === 'copy' ? 'Keep the original and edit a separate copy.' : 'Start with a name. Personality, artwork and voice are yours to define.'}>
        <form onSubmit={event => { event.preventDefault(); void create() }}>
          <OverlayBody><Label htmlFor="new-character-name">Name</Label><Input id="new-character-name" autoFocus maxLength={60} value={name} onChange={event => setName(event.target.value)} />{useConkerStore.getState().error && <p role="alert" className="text-sm text-destructive">{useConkerStore.getState().error}</p>}</OverlayBody>
          <FormActions inset><Button type="button" variant="outline" disabled={pending} onClick={() => setCreating(null)}>Cancel</Button><Button type="submit" disabled={busy || !name.trim()}>{pending ? 'Creating…' : 'Create character'}</Button></FormActions>
        </form>
      </TaskDialogContent>
    </Dialog>
  </div>
}
