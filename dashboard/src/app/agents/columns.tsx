import type { ColumnDef } from "@tanstack/react-table"
import { Bot } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { DataTableColumnHeader } from "@/app/tasks/components/data-table-column-header"
import type { Agent } from "./data"

export const columns: ColumnDef<Agent>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Agent" />,
    cell: ({ row }) => {
      const a = row.original
      const companion = a.kind === "companion"
      return (
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex size-9 items-center justify-center rounded-md border",
              companion
                ? "bg-primary/15 text-primary border-primary/25"
                : "bg-muted text-muted-foreground border-transparent"
            )}
          >
            <Bot className="size-4" />
          </div>
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
        <Badge variant="outline" className="gap-1.5 font-normal">
          <span
            className={cn(
              "size-1.5 rounded-full",
              active ? "bg-primary" : "bg-muted-foreground"
            )}
          />
          {active ? "Active" : "Idle"}
        </Badge>
      )
    },
  },
]
