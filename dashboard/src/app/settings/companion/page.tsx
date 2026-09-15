import { useState } from "react"
import { BaseLayout } from "@/components/layouts/base-layout"
import { CompanionPortrait } from "@/components/companion-portrait"
import { faces, portraitTones, emotions } from "@/lib/character-options"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { useConker, useConkerStore } from "@/lib/api/store"
import type { Character, Emotion } from "@/lib/api/client"
import { cn } from "@/lib/utils"

const styles = [
  { value: "warm", label: "Warm", description: "Friendly, steady, a little dry humour.", text: "Warm, direct, and concise. A little dry humour when it fits." },
  { value: "direct", label: "Direct", description: "Short answers. Lead with the next step.", text: "Be brief and practical. Lead with the answer, then the next step." },
  { value: "curious", label: "Curious", description: "Explore ideas and ask useful questions.", text: "Think things through with me. Ask thoughtful questions and explore alternatives." },
  { value: "custom", label: "Custom", description: "Describe a voice in your own words.", text: "" },
] as const

export default function CharacterStudioPage() {
  const savedProfile = useConker(data => data.profile)
  const { save, pending } = useConkerStore()
  const [profile, setProfile] = useState(savedProfile)
  const [emotion, setEmotion] = useState<Emotion>("neutral")
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)
  const update = (patch: Partial<Character>) => { setProfile(old => ({ ...old, ...patch })); setSaved(false) }
  const dirty = JSON.stringify(profile) !== JSON.stringify(savedProfile)
  async function importPortrait(file?: File) {
    if (!file) return
    setError("")
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError("Choose a PNG, JPEG, or WebP under 2 MB."); return
    }
    try {
      const portrait = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file)
      })
      const image = new Image(); image.src = portrait; await image.decode()
      update({ portrait })
    } catch { setError("This file could not be displayed. Choose another image.") }
  }
  return <BaseLayout title="Companion settings" description="Edit your companion’s voice, portrait, and expressions.">
    <form onSubmit={async event => { event.preventDefault(); setSaved(await save(profile)) }} className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
      <div className="min-w-0 space-y-6">
        <Card role="region" aria-labelledby="character-heading">
          <CardHeader><CardTitle><h2 id="character-heading">Identity & voice</h2></CardTitle></CardHeader>
          <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="character-name">Name</Label><Input id="character-name" required maxLength={60} value={profile.name} onChange={event => update({ name: event.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="character-mood">Status / mood line</Label><Input id="character-mood" maxLength={100} value={profile.mood} onChange={event => update({ mood: event.target.value })} /></div>
          </div>
          <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Speaking style</legend><div className="grid gap-2 sm:grid-cols-2">{styles.map(style => <label key={style.value} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3", profile.speakingPreset === style.value && "border-primary bg-selection")}>
            <input type="radio" name="speaking-style" value={style.value} checked={profile.speakingPreset === style.value} onChange={() => update({ speakingPreset: style.value, speakingStyle: style.value === "custom" ? profile.speakingStyle : style.text })} className="mt-1 accent-primary" />
            <span><span className="block text-sm font-medium">{style.label}</span><span className="mt-1 block text-sm leading-6 text-muted-foreground">{style.description}</span></span>
          </label>)}</div></fieldset>
          <div className="space-y-2"><Label htmlFor="speaking-notes">Style instructions</Label><Textarea id="speaking-notes" value={profile.speakingStyle} maxLength={1000} onChange={event => update({ speakingStyle: event.target.value, speakingPreset: "custom" })} /><p className="text-xs text-muted-foreground">Start with a preset and adjust it. Editing the text selects Custom.</p></div>
          <div className="space-y-2"><Label htmlFor="personality">Personality</Label><Textarea id="personality" className="min-h-24" value={profile.personality} maxLength={2000} onChange={event => update({ personality: event.target.value })} /></div>
          </CardContent>
        </Card>
        <Card role="region" aria-labelledby="appearance-heading">
          <CardHeader><CardTitle><h2 id="appearance-heading">Appearance</h2></CardTitle></CardHeader>
          <CardContent className="space-y-4">
          <fieldset><legend className="mb-2 text-sm">Face</legend><div className="grid grid-cols-3 gap-2">{faces.map(face => <Button key={face.value} aria-label={face.label} type="button" variant="outline" aria-pressed={!profile.portrait && profile.face === face.value} className={cn("h-auto flex-col gap-2 py-3", !profile.portrait && profile.face === face.value && "border-primary bg-selection")} onClick={() => update({ face: face.value, portrait: "", emotions: Object.fromEntries(Object.entries(profile.emotions).map(([key, value]) => [key, value === "portrait" ? "default" : value])) as Character["emotions"] })}><CompanionPortrait face={face.value} tone={profile.tone} className="size-14" />{face.label}</Button>)}</div></fieldset>
          <fieldset><legend className="mb-2 text-sm">Portrait color</legend><div className="flex flex-wrap gap-2">{portraitTones.map(tone => <Button key={tone.value} aria-label={tone.label} type="button" variant="outline" aria-pressed={profile.tone === tone.value} className={cn(profile.tone === tone.value && "border-primary bg-selection")} onClick={() => update({ tone: tone.value })}><CompanionPortrait tone={tone.value} className="size-6" />{tone.label}</Button>)}</div></fieldset>
          <div className="space-y-2"><Label htmlFor="portrait-upload">Or upload a portrait</Label><Input id="portrait-upload" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { void importPortrait(event.target.files?.[0]); event.target.value = "" }} /><p className="text-xs text-muted-foreground">PNG, JPEG, or WebP · up to 2 MB · stays in this preview until reload.</p>{profile.portrait && <Button type="button" variant="outline" size="sm" onClick={() => update({ portrait: "", emotions: Object.fromEntries(Object.entries(profile.emotions).map(([key, value]) => [key, value === "portrait" ? "default" : value])) as Character["emotions"] })}>Remove uploaded portrait</Button>}</div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
        <Card role="region" aria-labelledby="emotions-heading">
          <CardHeader><CardTitle><h2 id="emotions-heading">2D emotion pack</h2></CardTitle><CardDescription>Assign a face or uploaded portrait to each expression. Default uses your main portrait.</CardDescription></CardHeader>
          <CardContent>
          <div className="divide-y">{emotions.map(expression => <div key={expression} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[auto_minmax(0,1fr)_12rem]">
            <CompanionPortrait profile={profile} emotion={expression} />
            <Label htmlFor={`emotion-${expression}`} className="flex-1 capitalize">{expression}</Label>
            <Select value={profile.emotions[expression]} onValueChange={value => update({ emotions: { ...profile.emotions, [expression]: value as Character["emotions"][Emotion] } })}><SelectTrigger id={`emotion-${expression}`} className="col-span-2 w-full min-w-0 sm:col-span-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="default">Default portrait</SelectItem>{faces.map(face => <SelectItem key={face.value} value={face.value}>{face.label} face</SelectItem>)}<SelectItem value="portrait" disabled={!profile.portrait}>Uploaded portrait</SelectItem></SelectContent></Select>
          </div>)}</div>
          </CardContent>
        </Card>
        <div className="flex flex-wrap items-center gap-3"><Button disabled={!profile.name.trim() || !dirty || pending} type="submit">{pending ? "Saving…" : "Save character"}</Button><Button type="button" variant="outline" disabled={!dirty || pending} onClick={() => { setProfile(savedProfile); setSaved(false); setError("") }}>Discard changes</Button><span role="status" className="text-xs text-muted-foreground">{saved && !dirty ? "Saved in this preview" : dirty ? "Unsaved changes" : "Changes apply to Home and the sidebar"}</span></div>
      </div>
      <aside className="min-w-0 lg:sticky lg:top-6" aria-labelledby="portrait-preview-heading">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between"><CardTitle><h2 id="portrait-preview-heading">Portrait preview</h2></CardTitle><Badge variant="outline">Static</Badge></CardHeader>
          <CardContent className="space-y-4">
        <div className="flex items-center gap-4"><CompanionPortrait profile={profile} emotion={emotion} className="size-24" /><div className="min-w-0"><p className="break-words text-lg font-semibold">{profile.name || "Your companion"}</p><p className="mt-1 break-words text-xs text-muted-foreground">{profile.mood}</p></div></div>
        <div className="space-y-2"><Label htmlFor="preview-emotion">Preview expression</Label><Select value={emotion} onValueChange={value => setEmotion(value as Emotion)}><SelectTrigger id="preview-emotion" className="w-full capitalize"><SelectValue /></SelectTrigger><SelectContent>{emotions.map(value => <SelectItem key={value} value={value} className="capitalize">{value}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2 border-t pt-4"><h3 className="text-base font-medium">Voice instructions</h3><p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{profile.speakingStyle || "No style instructions yet."}</p><p className="text-sm leading-6 text-muted-foreground">Expressions and voice are presentation settings. No model is connected.</p></div>
        <div className="space-y-2 border-t pt-4"><div className="flex items-center justify-between"><h3 className="text-base font-medium">Live 3D</h3><Badge variant="outline">Planned</Badge></div><p className="text-sm leading-6 text-muted-foreground">The static portrait and expression mappings work now. Live animation needs a renderer.</p></div>
          </CardContent>
        </Card>
      </aside>
    </form>
  </BaseLayout>
}
