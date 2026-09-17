import { useId, useRef, useState } from "react"
import { ArrowRight, HatGlasses } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogTrigger } from "@/components/ui/dialog"
import { TaskDialogContent, OverlayBody, FormActions } from "@/components/design-system"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ConversationPrivacy } from "@/lib/api/conversation-types"
import { cn } from "@/lib/utils"

export function ConversationIncognito({ privacy, busy, onChange, onInspect, scope = "conversation" }: {
  privacy: ConversationPrivacy
  busy: boolean
  onChange: (patch: Partial<ConversationPrivacy>) => void
  onInspect: () => void
  scope?: "conversation" | "call"
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
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
    <TaskDialogContent title={<span className="flex items-center gap-2"><HatGlasses className="size-5" />Incognito</span>} description={`Choose what to exclude from this ${scope}.`} onCloseAutoFocus={event => {
      if (inspect.current) { event.preventDefault(); inspect.current = false; onInspect() }
    }}>
      <OverlayBody>
      <div className="divide-y rounded-lg border px-4">
        <div className="flex items-center justify-between gap-4 py-4">
          <div className="space-y-1"><Label htmlFor={`${id}-memory`}>No memory</Label><p id={`${id}-memory-description`} className="text-xs leading-5 text-muted-foreground">Skip memory reads and writes.</p></div>
          <Switch id={`${id}-memory`} checked={privacy.memoryDisabled} disabled={busy} aria-describedby={`${id}-memory-description`} onCheckedChange={memoryDisabled => onChange({ memoryDisabled })} />
        </div>
        <div className="flex items-center justify-between gap-4 py-4">
          <div className="space-y-1"><Label htmlFor={`${id}-harness`}>No harness</Label><p id={`${id}-harness-description`} className="text-xs leading-5 text-muted-foreground">Skip the Pi harness session.</p></div>
          <Switch id={`${id}-harness`} checked={privacy.harnessDisabled} disabled={busy} aria-describedby={`${id}-harness-description`} onCheckedChange={harnessDisabled => onChange({ harnessDisabled })} />
        </div>
      </div>
      <p role="status" className="text-sm font-medium">{active ? mode : "Standard conversation"}</p>
      <p className="text-xs leading-5 text-muted-foreground">Saved for this {scope} in the preview. Server privacy controls are not connected.</p>
      </OverlayBody><FormActions inset><Button variant="outline" onClick={() => { inspect.current = true; setOpen(false) }}>View memory & permissions<ArrowRight /></Button></FormActions>
    </TaskDialogContent>
  </Dialog>
}
