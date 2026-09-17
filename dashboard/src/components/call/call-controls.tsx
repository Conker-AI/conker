import type { ComponentType } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export function CallControl({ label, icon: Icon, active, disabled, onClick, destructive = false }: {
  label: string; icon: ComponentType<{ className?: string }>; active?: boolean
  disabled?: boolean; onClick: () => void; destructive?: boolean
}) {
  return <Tooltip><TooltipTrigger asChild>
    <Button type="button" size="icon" variant={destructive ? "destructive" : active ? "secondary" : "outline"}
      aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick} className="shrink-0"><Icon className="size-4" /></Button>
  </TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>
}
