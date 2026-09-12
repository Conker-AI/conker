import type { ColumnDef } from "@tanstack/react-table"
import { MoreHorizontal, Pause, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { DataTableColumnHeader } from "@/app/tasks/components/data-table-column-header"
import { useJobs } from "./store"
import type { Job } from "./data"

function JobActions({ job }: { job: Job }) {
  const { toggle, run } = useJobs()
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${job.name}`}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup><DropdownMenuItem onSelect={() => toggle(job.id)}>{job.status === "Paused" ? <Play /> : <Pause />}{job.status === "Paused" ? "Resume" : "Pause"}</DropdownMenuItem><DropdownMenuItem onSelect={() => run(job.id)}><Play />Run now</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
}
export const columns: ColumnDef<Job>[] = [
  { accessorKey: "name", header: ({ column }) => <DataTableColumnHeader column={column} title="Job" />, cell: ({ row }) => <div className="min-w-56"><p className="font-medium">{row.original.name}</p><p className="mt-1 text-xs text-muted-foreground">{row.original.purpose}</p></div> },
  { accessorKey: "schedule", header: "Schedule", cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{row.original.schedule}</span> },
  { accessorKey: "lastRun", header: "Last run", cell: ({ row }) => <span className="block min-w-40 text-xs text-muted-foreground">{row.original.lastRun}</span> },
  { accessorKey: "nextRun", header: "Next run", cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{row.original.status === "Paused" ? "— Paused" : row.original.nextRun}</span> },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge> },
  { id: "actions", enableHiding: false, cell: ({ row }) => <JobActions job={row.original} /> },
]

