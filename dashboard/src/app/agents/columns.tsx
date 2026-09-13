import type { ColumnDef } from "@tanstack/react-table"
import { AgentIdentityPortrait } from "@/components/design-system"

import { StatusBadge } from "@/components/status-badge"
import { DataTableColumnHeader } from "@/app/tasks/components/data-table-column-header"
import type { Agent } from "@/lib/api/models"

export const columns: ColumnDef<Agent>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Agent" />,
    cell: ({ row }) => {
      const a = row.original
      return (
        <div className="flex items-center gap-3">
          <AgentIdentityPortrait name={a.name} />
          <div className="flex flex-col">
            <span className="font-medium">{a.name}</span>
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
<StatusBadge tone={active ? "live" : "neutral"}>{active ? "Active" : "Idle"}</StatusBadge>
      )
    },
  },
]
