import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { StudioSection, StudioField } from "./fields"
import { readCharacterFile } from "@/lib/character-media"
import type { CharacterStudio } from "@/lib/api/character"

export function VoiceEditor({ value, onChange, onBusy }: { value: CharacterStudio["voice"]; onChange: (value: CharacterStudio["voice"] | ((current: CharacterStudio["voice"]) => CharacterStudio["voice"])) => void; onBusy: (busy: boolean) => void }) {
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const change = (patch: Partial<typeof value>) => onChange({ ...value, ...patch })
  return <div className="space-y-6">
    <StudioSection title="Character voice" description="Define a voice identity once, then use it for read-aloud and conversation.">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-medium">Qwen3-TTS · local engine</p><Badge variant="outline">Not connected</Badge></div>
      <div className="space-y-2"><Label htmlFor="voice-source">Start from</Label><Select value={value.source} onValueChange={source => change({ source: source as typeof value.source })}><SelectTrigger id="voice-source" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="design">Describe a new voice</SelectItem><SelectItem value="reference">A reference recording</SelectItem></SelectContent></Select></div>
      <StudioField label="Voice description" value={value.description} onChange={description => change({ description })} placeholder="Describe the vocal character: texture, pitch, accent, age, rhythm, and distinctive details." hint="Voice identity stays consistent across Focus and Character modes. Delivery is configured in Expression & modes." />
      <div className="space-y-2"><Label htmlFor="voice-language">Speech language</Label><Select value={value.language} onValueChange={language => change({ language: language as typeof value.language })}><SelectTrigger id="voice-language" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{["English", "Chinese", "Japanese", "Korean", "German", "French", "Russian", "Portuguese", "Spanish", "Italian"].map(language => <SelectItem key={language} value={language}>{language}</SelectItem>)}</SelectContent></Select></div>
      {value.source === "design" && <div className="space-y-2"><Button type="button" disabled>Generate voice samples</Button><p className="text-xs leading-5 text-muted-foreground">Available when Qwen3-TTS is connected. Your description can be saved now; no audio is generated in this preview.</p></div>}
    </StudioSection>
    <StudioSection title="Voice reference" description="Add a recording to audition now and use as a cloning reference later.">
      <div className="space-y-2"><Label htmlFor="voice-reference">Upload reference audio</Label><Input id="voice-reference" type="file" accept="audio/wav,audio/x-wav,audio/mpeg,audio/ogg,audio/webm,audio/mp4" disabled={loading} onChange={async event => {
        const file = event.target.files?.[0]; event.target.value = ""; if (!file) return
        setError(""); setLoading(true); onBusy(true)
        try { const src = await readCharacterFile(file, "audio"); onChange(current => ({ ...current, reference: { name: file.name.slice(0, 120), src }, source: "reference" })) } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load this recording.") } finally { setLoading(false); onBusy(false) }
      }} /><p className="text-xs leading-5 text-muted-foreground">WAV, MP3, OGG, WebM or M4A · up to 8 MB. Use a clear recording of a voice you can use.</p></div>
      {loading && <p role="status" className="text-sm text-muted-foreground">Checking recording…</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {value.reference && <div className="flex flex-wrap items-center justify-between gap-3"><p className="min-w-0 break-words text-sm">{value.reference.name}</p><Button type="button" size="sm" variant="outline" onClick={() => change({ reference: null, transcript: "" })}>Remove recording</Button></div>}
      <StudioField label="Reference transcript" value={value.transcript} maxLength={3000} onChange={transcript => change({ transcript })} placeholder="The exact words spoken in the recording." />
      <StudioField label="Pronunciation notes" value={value.pronunciation} onChange={pronunciation => change({ pronunciation })} placeholder="Names, abbreviations, or words with a particular pronunciation." />
      <p className="text-xs leading-5 text-muted-foreground">Reference playback works now. Cloning, generated read-aloud and emotion control require a speech connection. Browser read-aloud elsewhere still uses a device voice.</p>
    </StudioSection>
  </div>
}
