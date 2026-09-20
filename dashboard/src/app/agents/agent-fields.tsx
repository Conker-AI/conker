import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getAvailableModels } from "@/lib/api/model-catalogue"
import { useConker } from "@/lib/api/store"
import type { AgentInput } from "@/lib/api/models"

export function AgentFields({ value, onChange }: { value: AgentInput; onChange: (value: AgentInput) => void }) {
  const configuration = useConker(data => data.modelsConfiguration)
  const models = getAvailableModels(configuration)
  return <div className="space-y-5">
    <div className="space-y-2"><Label htmlFor="agent-name">Name</Label><Input id="agent-name" value={value.name} onChange={event => onChange({ ...value, name: event.target.value })} required maxLength={80} /></div>
    <div className="space-y-2"><Label htmlFor="agent-role">Role</Label><Input id="agent-role" value={value.role} onChange={event => onChange({ ...value, role: event.target.value })} placeholder="A second pair of hands" required maxLength={160} /></div>
    <div className="space-y-2"><Label htmlFor="agent-instructions">Instructions</Label><Textarea id="agent-instructions" value={value.instructions} onChange={event => onChange({ ...value, instructions: event.target.value })} required maxLength={8000} rows={4} /></div>
    <div className="space-y-2"><Label htmlFor="agent-model">Model route</Label><Select value={value.modelId || "default"} onValueChange={modelId => onChange({ ...value, modelId: modelId === "default" ? null : modelId })}><SelectTrigger id="agent-model"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="default">Follow Settings default</SelectItem>{value.modelId && !models.some(model => model.id === value.modelId) && <SelectItem value={value.modelId} disabled>Unavailable route · choose another</SelectItem>}{models.map(model => <SelectItem key={model.id} value={model.id}>{model.name} · {model.providerId}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">Used for new conversations. Existing conversations keep their model selection.</p></div>
  </div>
}
