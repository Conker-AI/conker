import type { ColumnDef } from "@tanstack/react-table"
import { Link } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { DataTableColumnHeader } from "@/app/tasks/components/data-table-column-header"
import type { Ticket } from "@/lib/api/models"

export const columns: ColumnDef<Ticket>[] = [
  {
    accessorKey: "effect",
    header: "Effect",
    cell: ({ row }) => <Badge variant="outline">{row.original.effect}</Badge>,
  },
  {
    accessorKey: "request",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Request" />
    ),
    cell: ({ row }) => (
      <Link
        onClick={(e) => e.stopPropagation()}
        className="block min-w-52 font-medium hover:underline"
        to={`/inbox/${row.original.id}`}
      >
        {row.original.request}
      </Link>
    ),
  },
  { accessorKey: "agent", header: "Agent" },
  {
    accessorKey: "decideBy",
    header: "Decide by",
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground tabular-nums">
        {row.original.decideBy}
      </span>
    ),
  },
  {
    accessorKey: "spendWindow",
    header: "Spend window",
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {row.original.spendWindow}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>,
  },
]
