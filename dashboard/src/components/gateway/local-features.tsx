import { lazy, Suspense, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Phone, Settings2 } from 'lucide-react'
import { DataProvider } from '@/lib/api/provider'
import { createFixtureClient } from '@/lib/api/fixture-adapter'
import { installConkerClient } from '@/lib/api'
import { validateCharacter } from '@/lib/api/character'
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
let library: Record<string, Character> = {}
const initialized = client.load().then(async snapshot => {
  library = { Conker: snapshot.profile }
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null')
    if (saved?.profiles && typeof saved.profiles === 'object') {
      for (const value of Object.values(saved.profiles)) {
        const profile = validateCharacter(value as Character)
        library[profile.name] = profile
      }
      if (library[saved.selected]) await client.saveCharacter(library[saved.selected])
    }
  } catch { /* Invalid or unavailable local storage must not block connected services. */ }
})
function localCharacters() { return Object.values(library) }
installConkerClient({ ...client, voiceInput: browserVoiceInput,
  load: async () => { await initialized; return client.load() },
  saveCharacter: async value => {
    await initialized
    const profile = validateCharacter(value)
    const next = { ...library, [profile.name]: profile }
    // Do not claim a saved character if browser storage is full or unavailable.
    localStorage.setItem(storageKey, JSON.stringify({ profiles: next, selected: profile.name }))
    library = next
    return client.saveCharacter(profile)
  },
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
  const { save, pending } = useConkerStore()
  const dirty = useCharacterWorkspace(state => !!state.draft)
  return <div className="space-y-2">
    <Label htmlFor="local-character">Your characters</Label>
    <Select value={profile.name} disabled={pending || dirty} onValueChange={name => { const next = library[name]; if (next) void save(next) }}>
      <SelectTrigger id="local-character" className="w-full sm:w-72"><SelectValue /></SelectTrigger>
      <SelectContent>{localCharacters().map(item => <SelectItem key={item.name} value={item.name}>{item.name}</SelectItem>)}</SelectContent>
    </Select>
    <p className="text-xs text-muted-foreground">Save with a different name to add a character, or import one. {dirty ? 'Save your draft before switching.' : 'Conker is the default, not a requirement.'}</p>
  </div>
}
