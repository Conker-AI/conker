import { Copy, History, Loader2, MoreHorizontal, Pause, Pencil, Play, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import type { Job } from "@/lib/api/models"

export type JobControls = {
  pending: boolean; runningId: string
  open: (job: Job) => void; edit: (job: Job) => void; remove: (job: Job) => void
  duplicate: (job: Job) => void; toggle: (job: Job) => void; run: (job: Job) => void
}

export function JobActions({ job, controls }: { job: Job; controls: JobControls }) {
  const { pending, runningId } = controls
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => controls.run(job)} aria-label={`Run ${job.name} now`} title="Simulate a run">
        {runningId === job.id ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Play />}{runningId === job.id ? "Running…" : "Run now"}
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => controls.toggle(job)} aria-label={`${job.status === "Paused" ? "Resume" : "Pause"} ${job.name}`} title={job.status === "Paused" ? "Resume schedule" : "Pause schedule"}>
        {job.status === "Paused" ? <Play /> : <Pause />}{job.status === "Paused" ? "Resume" : "Pause"}
      </Button>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          disabled={pending}
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={`Actions for ${job.name}`}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => controls.edit(job)}><Pencil />Edit job</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => controls.open(job)}><History />Details & run history</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => controls.duplicate(job)}><Copy />Duplicate</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => controls.remove(job)}><Trash2 />Delete job</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
    </div>
  )
}
