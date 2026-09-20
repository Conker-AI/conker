import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ProjectInput } from "@/lib/api/project-types"

export function ProjectFields({ value, onChange, instructions = true }: { value: ProjectInput; onChange: (value: ProjectInput) => void; instructions?: boolean }) {
  return <div className="space-y-4">
    <div className="space-y-2"><Label htmlFor="project-name">Name</Label><Input id="project-name" required maxLength={120} value={value.name} onChange={event => onChange({ ...value, name: event.target.value })} placeholder="e.g. Book draft" /></div>
    <div className="space-y-2"><Label htmlFor="project-description">Description</Label><Textarea id="project-description" maxLength={2000} rows={3} value={value.description} onChange={event => onChange({ ...value, description: event.target.value })} placeholder="What belongs in this project?" /></div>
    {instructions && <div className="space-y-2"><Label htmlFor="project-instructions">Project instructions</Label><Textarea id="project-instructions" maxLength={16000} rows={8} value={value.instructions} onChange={event => onChange({ ...value, instructions: event.target.value })} aria-describedby="project-instructions-help" placeholder="Guidance that applies to work in this project" /><p id="project-instructions-help" className="text-xs leading-5 text-muted-foreground">Owner-authored guidance, kept separate from compressible chat history. Saved for preview; instructions are not injected into chats.</p></div>}
  </div>
}
