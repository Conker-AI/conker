import type { ColumnDef } from "@tanstack/react-table"
import { Link } from "react-router-dom"
import { SquarePen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AgentIdentityPortrait } from "@/components/design-system"

import { StatusBadge } from "@/components/status-badge"
import { DataTableColumnHeader } from "@/app/tasks/components/data-table-column-header"
import type { Agent } from "@/lib/api/models"

export const agentColumns = (open: (agent: Agent) => void): ColumnDef<Agent>[] => [
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Agent" />,
    cell: ({ row }) => {
      const a = row.original
      return (
        <div className="flex items-center gap-3">
          <AgentIdentityPortrait name={a.name} />
          <div className="flex flex-col">
            <button type="button" onClick={() => open(a)} className="w-fit rounded-sm text-left font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring">{a.name}</button>
            <span className="text-muted-foreground text-xs">{a.role}</span>
          </div>
        </div>
      )
    },
  },
  {
    accessorKey: "model",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Model" />,
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">{row.original.model}</span>
    ),
  },
  {
    accessorKey: "grants",
    header: "Standing grants",
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.grants} {row.original.grants === 1 ? "grant" : "grants"}
      </span>
    ),
  },
  {
    accessorKey: "cost",
    header: "Cost",
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm tabular-nums">
        {row.original.cost}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const active = row.original.status === "active"
      return (
<StatusBadge tone={!row.original.archivedAt && active ? "live" : "neutral"}>{row.original.archivedAt ? "Archived" : active ? "Active" : "Idle"}</StatusBadge>
      )
    },
  },
  { id: "chat", header: "", enableHiding: false, cell: ({ row }) => row.original.archivedAt ? null : <Button asChild variant="outline" size="sm"><Link to={`/chat/new?agent=${encodeURIComponent(row.original.id)}`} aria-label={`New chat with ${row.original.name}`}><SquarePen />New chat</Link></Button> },
]
