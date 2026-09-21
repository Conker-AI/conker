import type { ComponentProps } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export function MessageActionButton({ label, className, ...props }: ComponentProps<typeof Button> & { label: string }) {
  return <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" {...props} aria-label={label} className={cn("size-(--control-height-sm) shrink-0 text-muted-foreground hover:text-foreground aria-pressed:text-primary", className)} /></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>
}

