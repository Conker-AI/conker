import { useState } from "react"
import { Link } from "react-router-dom"
import { Play } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { StudioSection } from "./fields"
import { CharacterMedia } from "./media"
import { activityNames, sameCharacterValue, type CharacterActivity, type CharacterDraft, type CharacterMode } from "@/lib/api/character"
import { conkerClient } from "@/lib/api"

export function CharacterPreview({ profile }: { profile: CharacterDraft }) {
  const [mode, setMode] = useState<CharacterMode>(profile.studio.modes.default)
  const [activity, setActivity] = useState<CharacterActivity>("idle")
  const [expression, setExpression] = useState("neutral")
  const [result, setResult] = useState<Awaited<ReturnType<typeof conkerClient.previewCharacter>> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [previewed, setPreviewed] = useState<CharacterDraft | null>(null)
  const stale = !sameCharacterValue(previewed, profile) || result?.mode !== mode
  return <aside className="min-w-0 space-y-4 lg:sticky lg:top-6" aria-label="Character preview">
    <StudioSection title="Meet your character" description="Your draft, as you shape it.">
      <div className="flex items-center gap-4"><CharacterMedia profile={profile} activity={activity} expressionId={expression} motion={profile.studio.modes[mode].motion} className="size-24" /><div className="min-w-0 space-y-1"><p className="break-words text-lg font-semibold">{profile.name || "Your character"}</p><p className="break-words text-sm text-muted-foreground">{profile.mood || "Ready when you are"}</p><Badge variant="outline">{mode === "focus" ? "Focus" : "Character"}</Badge></div></div>
      <div className="space-y-2"><Label htmlFor="preview-mode">Preview mode</Label><Select value={mode} onValueChange={value => setMode(value as CharacterMode)}><SelectTrigger id="preview-mode" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="focus">Focus</SelectItem><SelectItem value="character">Character</SelectItem></SelectContent></Select></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label htmlFor="preview-activity">Activity</Label><Select value={activity} onValueChange={value => setActivity(value as CharacterActivity)}><SelectTrigger id="preview-activity" className="w-full capitalize"><SelectValue /></SelectTrigger><SelectContent>{activityNames.map(value => <SelectItem key={value} value={value} className="capitalize">{value}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="preview-expression">Expression</Label><Select value={profile.studio.appearance.expressions.some(item => item.id === expression) ? expression : "neutral"} onValueChange={setExpression}><SelectTrigger id="preview-expression" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="neutral">Neutral</SelectItem>{profile.studio.appearance.expressions.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">Unassigned states use the main portrait. Focus follows its motion setting; reduced motion always uses a still portrait.</p>
      <div className="space-y-3 border-t pt-4"><p className="text-sm font-medium">Try the conversation</p><p className="text-sm leading-6 text-muted-foreground break-words">{profile.studio.examples.prompt || "Add a sample question in Speaking style."}</p>
        <Button type="button" variant="outline" disabled={loading || !profile.name.trim() || !profile.studio.examples[mode].trim()} onClick={async () => {
          setLoading(true); setError("")
          try { setResult(await conkerClient.previewCharacter(profile, mode)); setPreviewed(profile) } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not preview this character.") } finally { setLoading(false) }
        }}><Play />{loading ? "Loading example…" : "Preview example"}</Button>
        {result && <div className="space-y-3 border-t pt-4"><div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">Authored example</Badge>{stale && <span className="text-xs text-muted-foreground">Draft changed · preview again</span>}</div><p className="whitespace-pre-wrap break-words text-sm leading-6">{result.text}</p><p className="text-xs leading-5 text-muted-foreground">Delivery: {result.delivery || "Natural delivery"}</p></div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <p className="text-xs leading-5 text-muted-foreground">Plays back your written example. A model is not connected to this preview.</p>
      </div>
      <div className="space-y-3 border-t pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">Character voice</p><Badge variant="outline">Not connected</Badge></div>
        {profile.studio.voice.reference ? <><p className="text-xs break-words text-muted-foreground">Reference: {profile.studio.voice.reference.name}</p><audio key={profile.studio.voice.reference.src} controls preload="metadata" src={profile.studio.voice.reference.src} aria-label="Play character voice reference" className="w-full min-w-0" onPlay={() => setActivity("speaking")} onPause={() => setActivity("idle")} onEnded={() => setActivity("idle")} /></> : <p className="text-xs leading-5 text-muted-foreground">Describe a voice or add a recording in Voice. Qwen speech generation and read-aloud will use this identity when connected.</p>}
        <Link to="/settings?tab=connections" className="inline-flex text-xs underline underline-offset-4">View connections</Link>
      </div>
    </StudioSection>
  </aside>
}
