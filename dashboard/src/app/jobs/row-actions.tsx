import { MoreHorizontal, Pause, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { useConkerStore } from "@/lib/api/store"
import type { Job } from "@/lib/api/models"

export function JobActions({ job }: { job: Job }) {
  const { toggle, run } = useConkerStore()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Actions for ${job.name}`}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => toggle(job.id)}>
            {job.status === "Paused" ? <Play /> : <Pause />}
            {job.status === "Paused" ? "Resume" : "Pause"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => run(job.id)}>
            <Play />
            Run now
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
