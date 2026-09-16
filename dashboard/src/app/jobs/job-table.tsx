import type { ColumnDef } from "@tanstack/react-table"
import type { ReactNode } from "react"
import { DataTable } from "@/components/data-table"
import { Badge } from "@/components/ui/badge"
import { DataTableColumnHeader } from "@/app/tasks/components/data-table-column-header"
import { JobActions, type JobControls } from "./row-actions"
import type { Job } from "@/lib/api/models"

function jobColumns(controls: JobControls, agentName: (id: string) => string): ColumnDef<Job>[] {
  return [
    { accessorKey: "name", header: ({ column }) => <DataTableColumnHeader column={column} title="Job" />, cell: ({ row }) => <div className="min-w-48 max-w-64 whitespace-normal">
      <button type="button" className="rounded-sm text-left font-medium break-words hover:underline focus-visible:outline-2 focus-visible:outline-ring" onClick={() => controls.open(row.original)}>{row.original.name}</button>
      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground" title={row.original.purpose}>{row.original.purpose}</p>
      <div className="mt-2 flex items-center gap-2"><Badge variant="outline" className="font-normal">{row.original.status}</Badge><span className="text-xs text-muted-foreground">{agentName(row.original.agentId)}</span></div>
    </div> },
    { accessorKey: "schedule", header: "Schedule", cell: ({ row }) => <div className="min-w-36 space-y-1 text-sm">
      <p className="whitespace-nowrap">{row.original.schedule}</p><p className="text-xs text-muted-foreground">{row.original.timeZone}</p>
      <p className="text-xs text-muted-foreground">{row.original.status === "Paused" ? "Paused" : row.original.nextRun}</p>
    </div> },
    { accessorKey: "lastRun", header: "Last run", cell: ({ row }) => <div className="min-w-32 max-w-48 space-y-1">
      {row.original.history[0] && <p className={row.original.history[0].status === "Failed" ? "text-xs text-destructive" : "text-xs"}>{row.original.history[0].source === "preview" ? "Preview complete" : row.original.history[0].status}</p>}
      <p className="text-xs leading-5 text-muted-foreground">{row.original.lastRun}</p>
    </div> },
    { id: "actions", header: () => <span className="sr-only">Actions</span>, enableHiding: false, cell: ({ row }) => <JobActions job={row.original} controls={controls} /> },
  ]
}

export function JobsTable({ controls, agentName, data, toolbarAction }: { controls: JobControls; agentName: (id: string) => string; data: Job[]; toolbarAction: ReactNode }) {
  return <DataTable columns={jobColumns(controls, agentName)} data={data} toolbarAction={toolbarAction} />
}
