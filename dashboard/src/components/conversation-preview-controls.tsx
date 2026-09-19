import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { activityScenarios } from "@/lib/api/activity-fixtures"

/** The caller must gate this development fixture surface; never show it in ordinary chat. */
export function ConversationPreviewControls({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
    <Label htmlFor="conversation-preview-scenario" className="text-xs">Development preview</Label>
    <Select value={value || "ordinary"} onValueChange={next => onChange(next === "ordinary" ? "" : next)} disabled={disabled}>
      <SelectTrigger id="conversation-preview-scenario" className="w-full sm:w-64"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="ordinary">Ordinary sample reply</SelectItem>
        <SelectItem value="rich-answer">Rich answer blocks</SelectItem>
        <SelectItem value="slow-response">Long response for queue and scroll checks</SelectItem>
        <SelectItem value="service-disconnected">Disconnected service</SelectItem>
        {activityScenarios.map(item => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}
      </SelectContent>
    </Select>
    <span>Next reply only · no services run</span>
  </div>
}
