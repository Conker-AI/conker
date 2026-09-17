import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { StudioSection, StudioField } from "./fields"
import type { CharacterMode, CharacterStudio } from "@/lib/api/character"

export function ModesEditor({ value, onChange }: { value: CharacterStudio["modes"]; onChange: (value: CharacterStudio["modes"]) => void }) {
  return <div className="space-y-6">
    <StudioSection title="Expression & modes" description="One character, two ways to communicate. The useful answer stays at the center.">
      <div className="space-y-2"><Label htmlFor="default-character-mode">Default for new companion conversations</Label><Select value={value.default} onValueChange={mode => onChange({ ...value, default: mode as CharacterMode })}><SelectTrigger id="default-character-mode" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="focus">Focus</SelectItem><SelectItem value="character">Character</SelectItem></SelectContent></Select></div>
      <p className="text-sm leading-6 text-muted-foreground">Switch modes from the conversation menu. It changes future delivery; tools, memory and permissions keep their own settings.</p>
    </StudioSection>
    {(["focus", "character"] as const).map(mode => {
      const current = value[mode]
      const change = (patch: Partial<typeof current>) => onChange({ ...value, [mode]: { ...current, ...patch } })
      return <StudioSection key={mode} title={mode === "focus" ? "Focus" : "Character"} description={mode === "focus" ? "Direct text, useful context, and the same voice with restrained delivery." : "Your personality, backstory and speaking style, expressed through words, voice and appearance."}>
        <StudioField label={`${mode === "focus" ? "Focus" : "Character"} text instructions`} value={current.text} onChange={text => change({ text })} />
        <StudioField label={`${mode === "focus" ? "Focus" : "Character"} voice delivery`} value={current.voice} onChange={voice => change({ voice })} />
        <div className="grid items-end gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor={`${mode}-expressiveness`}>Expression intensity (%)</Label><Input id={`${mode}-expressiveness`} type="number" min={0} max={100} value={current.expressiveness} onChange={event => change({ expressiveness: Math.min(100, Math.max(0, Number(event.target.value))) })} /></div><div className="flex min-h-10 items-center justify-between gap-4"><Label htmlFor={`${mode}-motion`}>Animate artwork</Label><Switch id={`${mode}-motion`} checked={current.motion} onCheckedChange={motion => change({ motion })} /></div></div>
        <p className="text-xs leading-5 text-muted-foreground">Intensity is saved as delivery guidance for the future engine. Uploaded motion can be previewed now; reduced-motion preferences take priority.</p>
      </StudioSection>
    })}
  </div>
}
