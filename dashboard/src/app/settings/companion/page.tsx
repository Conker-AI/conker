import { useEffect, useMemo, useState } from "react"
import { Download, Plus, Trash2, Upload } from "lucide-react"
import { BaseLayout } from "@/components/layouts/base-layout"
import { FormActions, RouteSection, TaskDialogContent, OverlayBody } from "@/components/design-system"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog } from "@/components/ui/dialog"
import { StudioSection, StudioField } from "@/components/character-studio/fields"
import { AppearanceEditor } from "@/components/character-studio/appearance-editor"
import { VoiceEditor } from "@/components/character-studio/voice-editor"
import { ModesEditor } from "@/components/character-studio/modes-editor"
import { CharacterPreview } from "@/components/character-studio/preview"
import { useConker, useConkerStore } from "@/lib/api/store"
import { useCharacterWorkspace } from "@/lib/character-workspace"
import { validateImportedMedia } from "@/lib/character-media"
import { characterDraft, exportCharacter, importCharacter, validateCharacter, sameCharacterValue, type CharacterDraft, type CharacterStudio } from "@/lib/api/character"

export default function CharacterStudioPage() {
  const savedProfile = useConker(data => data.profile)
  const { save, pending } = useConkerStore()
  const savedDraft = useMemo(() => characterDraft(savedProfile), [savedProfile])
  const draft = useCharacterWorkspace(state => state.draft)
  const profile = draft ?? savedDraft
  const setProfile = (next: CharacterDraft | ((current: CharacterDraft) => CharacterDraft)) => useCharacterWorkspace.setState(state => ({ draft: typeof next === "function" ? next(state.draft ?? savedDraft) : next }))
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [importOpen, setImportOpen] = useState(false)
  const [incoming, setIncoming] = useState<{ profile: CharacterDraft; note: string } | null>(null)
  const [importError, setImportError] = useState("")
  const [reading, setReading] = useState(false)
  const uploading = useCharacterWorkspace(state => state.uploading)
  const setUploading = (value: boolean) => useCharacterWorkspace.setState({ uploading: value })
  const dirty = !!draft && !sameCharacterValue(profile, savedDraft)
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])
  const update = (next: CharacterDraft | ((current: CharacterDraft) => CharacterDraft)) => { setProfile(next); setNotice(""); setError("") }
  const change = (patch: Partial<CharacterDraft>) => update({ ...profile, ...patch })
  const studio = (patch: Partial<CharacterStudio>) => change({ studio: { ...profile.studio, ...patch } })
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("")
    try { const valid = validateCharacter(profile); if (await save(valid)) { useCharacterWorkspace.setState({ draft: null }); setNotice("Character saved in this preview.") } }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save your character.") }
  }
  function download() {
    try {
      const blob = new Blob([exportCharacter(profile)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a"); link.href = url; link.download = `${profile.name.replace(/[^a-z0-9_-]/gi, "-") || "character"}.conker.json`; link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice("Exported your current draft, including embedded artwork and voice reference.")
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not export this character.") }
  }
  return <BaseLayout title="Character Studio" description="Shape who your companion is, how it looks, and how it speaks." actions={<><Button variant="outline" disabled={uploading || pending} onClick={() => { setImportOpen(true); setIncoming(null); setImportError("") }}><Upload />Import</Button><Button variant="outline" disabled={uploading || pending} onClick={download}><Download />Export</Button></>}>
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)]">
      <form id="character-form" onSubmit={submit} className="min-w-0 space-y-6">
        <fieldset disabled={pending || uploading} className="min-w-0 space-y-6"><legend className="sr-only">Character configuration</legend>
          <RouteSection value="identity"><div className="space-y-6">
            <StudioSection title="Identity" description="Introduce the character in your own words.">
              <div className="grid gap-4 sm:grid-cols-2"><StudioField label="Name" multiline={false} maxLength={60} value={profile.name} onChange={name => change({ name })} /><StudioField label="Profile line" multiline={false} maxLength={100} value={profile.mood} onChange={mood => change({ mood })} placeholder="A short introduction" /></div>
              <StudioField label="Personality" value={profile.personality} onChange={personality => change({ personality })} placeholder="Describe the temperament, contradictions, habits, and sense of humor that make this character distinctive." />
              <StudioField label="Soul & values" value={profile.studio.soul} onChange={soul => studio({ soul })} placeholder="What matters to this character? What motivates it, and what principles guide it?" />
            </StudioSection>
            <StudioSection title="Background & relationship" description="Give the character context that makes its personality coherent.">
              <StudioField label="Backstory" value={profile.studio.backstory} onChange={backstory => studio({ backstory })} placeholder="Origins, experiences, interests, and the world your character comes from." hint="Character lore is separate from memories of your real conversations." />
              <StudioField label="Relationship with you" value={profile.studio.relationship} onChange={relationship => studio({ relationship })} placeholder="How should it address you, support you, disagree with you, and grow alongside you?" />
            </StudioSection>
            <StudioSection title="More about your character" description="Add interests, habits, motivations, or other details that matter to you.">
              {profile.studio.details.map((detail, index) => <div key={detail.id} className="flex items-end gap-2"><div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2"><StudioField label={`Detail ${index + 1} label`} value={detail.label} multiline={false} maxLength={80} placeholder="Interests" onChange={label => studio({ details: profile.studio.details.map(item => item.id === detail.id ? { ...item, label } : item) })} /><StudioField label={`Detail ${index + 1} value`} value={detail.value} multiline={false} maxLength={500} onChange={value => studio({ details: profile.studio.details.map(item => item.id === detail.id ? { ...item, value } : item) })} /></div><Button type="button" variant="ghost" size="icon" aria-label={`Remove detail ${index + 1}`} onClick={() => studio({ details: profile.studio.details.filter(item => item.id !== detail.id) })}><Trash2 /></Button></div>)}
              <Button type="button" variant="outline" disabled={profile.studio.details.length >= 20} onClick={() => studio({ details: [...profile.studio.details, { id: crypto.randomUUID(), label: "", value: "" }] })}><Plus />Add detail</Button>
            </StudioSection>
          </div></RouteSection>
          <RouteSection value="speaking"><div className="space-y-6">
            <StudioSection title="Speaking style" description="Write the way you want your character to communicate."><StudioField label="Speaking instructions" value={profile.speakingStyle} onChange={speakingStyle => change({ speakingStyle })} placeholder="Describe wording, humor, length, vocabulary, and how it handles uncertainty." hint="This controls the writing. Voice defines the sound." /></StudioSection>
            <StudioSection title="Teach by example" description="Write two versions of the same answer and compare them in the preview.">
              <StudioField label="Sample question" maxLength={1000} value={profile.studio.examples.prompt} onChange={prompt => studio({ examples: { ...profile.studio.examples, prompt } })} />
              <StudioField label="Focus answer" value={profile.studio.examples.focus} onChange={focus => studio({ examples: { ...profile.studio.examples, focus } })} hint="Keep the useful answer and necessary context." />
              <StudioField label="Character answer" value={profile.studio.examples.character} onChange={character => studio({ examples: { ...profile.studio.examples, character } })} hint="The same substance, expressed in your character's own style. These are editable examples, not generated responses." />
            </StudioSection>
          </div></RouteSection>
          <RouteSection value="appearance"><AppearanceEditor profile={profile} update={update} onBusy={setUploading} /></RouteSection>
          <RouteSection value="voice"><VoiceEditor value={profile.studio.voice} onBusy={setUploading} onChange={voice => update(current => ({ ...current, studio: { ...current.studio, voice: typeof voice === "function" ? voice(current.studio.voice) : voice } }))} /></RouteSection>
          <RouteSection value="modes"><ModesEditor value={profile.studio.modes} onChange={modes => studio({ modes })} /></RouteSection>
        </fieldset>
      </form>
      <CharacterPreview profile={profile} />
    </div>
    <div className="sticky bottom-0 z-10 bg-background py-3">
      {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
      <FormActions description={<span role="status">{uploading ? "Checking media…" : notice || (dirty ? "Unsaved changes" : "Saved in memory · export to keep a copy")}</span>}>
        <Button type="button" variant="outline" disabled={!dirty || pending || uploading} onClick={() => { useCharacterWorkspace.setState({ draft: null }); setError(""); setNotice("Changes discarded.") }}>Discard changes</Button>
        <Button type="submit" form="character-form" disabled={!dirty || !profile.name.trim() || pending || uploading}>{pending ? "Saving…" : "Save character"}</Button>
      </FormActions>
    </div>
    <Dialog open={importOpen} onOpenChange={open => { if (!reading) setImportOpen(open) }}><TaskDialogContent title="Import character" description="Bring in a Conker package or the text from a Character Card V2/V3 JSON." onPointerDownOutside={event => event.preventDefault()}>
      <OverlayBody><div className="space-y-2"><Label htmlFor="character-import">Character JSON file</Label><Input id="character-import" type="file" accept="application/json,.json" disabled={reading} onChange={async event => {
        const file = event.target.files?.[0]; event.target.value = ""; if (!file) return
        setIncoming(null); setImportError(""); setReading(true)
        try { if (file.size > 32 * 1024 * 1024) throw new Error("Choose a JSON file under 32 MB."); const next = importCharacter(await file.text(), profile); await validateImportedMedia(next.profile); setIncoming(next) } catch (cause) { setImportError(cause instanceof Error ? cause.message : "Could not read this character package.") } finally { setReading(false) }
      }} /></div>{reading && <p role="status" className="text-sm text-muted-foreground">Reading character…</p>}{incoming && <div className="space-y-2"><p className="text-sm font-medium">{incoming.profile.name}</p><p className="text-sm leading-6 text-muted-foreground">{incoming.note}</p><p className="text-sm">Import replaces your current draft. Your saved character stays unchanged until you save.</p></div>}{importError && <p role="alert" className="text-sm text-destructive">{importError}</p>}</OverlayBody>
      <FormActions inset><Button variant="outline" disabled={reading} onClick={() => setImportOpen(false)}>Cancel</Button><Button disabled={!incoming || reading} onClick={() => { if (incoming) { update(incoming.profile); setNotice(incoming.note); setImportOpen(false) } }}>Import into draft</Button></FormActions>
    </TaskDialogContent></Dialog>
  </BaseLayout>
}
