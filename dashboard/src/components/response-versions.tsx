import { ChevronLeft, ChevronRight, GitFork } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ConversationMessage } from "@/lib/api/conversation-types"

type Props = {
  versions: ConversationMessage[]
  selectedId: string
  activeId: string
  hasLaterTurns: boolean
  disabled?: boolean
  onSelect: (id: string) => void
  onFork: (id: string) => void
}

export function ResponseVersions({ versions, selectedId, activeId, hasLaterTurns, disabled, onSelect, onFork }: Props) {
  if (versions.length < 2) return null
  const index = Math.max(0, versions.findIndex(item => item.id === selectedId))
  const selected = versions[index]
  const alternative = selected.id !== activeId
  return <div aria-label="Response versions" className="mt-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
    <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" className="size-(--control-height-sm)" aria-label="Previous response version" disabled={index === 0} onClick={() => onSelect(versions[index - 1].id)}><ChevronLeft /></Button></TooltipTrigger><TooltipContent>Previous version</TooltipContent></Tooltip>
    <span aria-live="polite" aria-atomic="true" className="min-w-10 text-center tabular-nums">{index + 1} / {versions.length}</span>
    <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" className="size-(--control-height-sm)" aria-label="Next response version" disabled={index === versions.length - 1} onClick={() => onSelect(versions[index + 1].id)}><ChevronRight /></Button></TooltipTrigger><TooltipContent>Next version</TooltipContent></Tooltip>
    {selected.status === "stopped" && <span>Stopped</span>}{selected.status === "failed" && <span>Failed</span>}
    {alternative && <><span>{hasLaterTurns ? "Viewing an alternative · Later turns unchanged" : "Viewing an earlier version"}</span><Button type="button" variant="ghost" size="sm" disabled={disabled || selected.redacted} onClick={() => onFork(selected.id)}><GitFork />Continue in a fork</Button></>}
  </div>
}
