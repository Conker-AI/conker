import { useRef, useState } from "react"
import { ArrowRight, HatGlasses } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogTrigger } from "@/components/ui/dialog"
import { TaskDialogContent, OverlayBody, FormActions } from "@/components/design-system"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ConversationPrivacy } from "@/lib/api/conversation-types"
import { cn } from "@/lib/utils"

export function ConversationIncognito({ privacy, busy, onChange, onInspect }: {
  privacy: ConversationPrivacy
  busy: boolean
  onChange: (patch: Partial<ConversationPrivacy>) => void
  onInspect: () => void
}) {
  const [open, setOpen] = useState(false)
  const inspect = useRef(false)
  const active = privacy.memoryDisabled || privacy.harnessDisabled
  const mode = [privacy.memoryDisabled && "No memory", privacy.harnessDisabled && "No harness"].filter(Boolean).join(" · ") || "Off"

  return <Dialog open={open} onOpenChange={setOpen}>
    <Tooltip><TooltipTrigger asChild><DialogTrigger asChild>
      <Button variant={active ? "secondary" : "ghost"} size="icon" className={cn("relative size-(--control-height-sm) shrink-0", active && "text-primary ring-1 ring-inset ring-primary/60")} aria-label={`Incognito: ${mode}`}>
        <HatGlasses />
        {active && <span aria-hidden="true" className="absolute right-1 top-1 size-1.5 rounded-full bg-primary" />}
      </Button>
    </DialogTrigger></TooltipTrigger><TooltipContent>Incognito · {mode}</TooltipContent></Tooltip>
    <TaskDialogContent title={<span className="flex items-center gap-2"><HatGlasses className="size-5" />Incognito</span>} description="Choose what to exclude from this conversation." onCloseAutoFocus={event => {
      if (inspect.current) { event.preventDefault(); inspect.current = false; onInspect() }
    }}>
      <OverlayBody>
      <div className="divide-y rounded-lg border px-4">
        <div className="flex items-center justify-between gap-4 py-4">
          <div className="space-y-1"><Label htmlFor="incognito-memory">No memory</Label><p id="incognito-memory-description" className="text-xs leading-5 text-muted-foreground">Skip memory reads and writes.</p></div>
          <Switch id="incognito-memory" checked={privacy.memoryDisabled} disabled={busy} aria-describedby="incognito-memory-description" onCheckedChange={memoryDisabled => onChange({ memoryDisabled })} />
        </div>
        <div className="flex items-center justify-between gap-4 py-4">
          <div className="space-y-1"><Label htmlFor="incognito-harness">No harness</Label><p id="incognito-harness-description" className="text-xs leading-5 text-muted-foreground">Skip the Pi harness session.</p></div>
          <Switch id="incognito-harness" checked={privacy.harnessDisabled} disabled={busy} aria-describedby="incognito-harness-description" onCheckedChange={harnessDisabled => onChange({ harnessDisabled })} />
        </div>
      </div>
      <p role="status" className="text-sm font-medium">{active ? mode : "Standard conversation"}</p>
      <p className="text-xs leading-5 text-muted-foreground">Saved for this conversation in the preview. Server privacy controls are not connected.</p>
      </OverlayBody><FormActions inset><Button variant="outline" onClick={() => { inspect.current = true; setOpen(false) }}>View memory & permissions<ArrowRight /></Button></FormActions>
    </TaskDialogContent>
  </Dialog>
}
