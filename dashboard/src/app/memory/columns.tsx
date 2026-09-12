import type { ColumnDef } from "@tanstack/react-table"
import { Link } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { DataTableColumnHeader } from "@/app/tasks/components/data-table-column-header"
import type { Memory } from "@/lib/api/models"

export const columns: ColumnDef<Memory>[] = [
  {
    accessorKey: "text",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Memory" />
    ),
    cell: ({ row }) => (
      <p
        id={row.original.id}
        lang={row.original.language}
        className="min-w-64 max-w-md text-sm leading-relaxed"
      >
        {row.original.text}
      </p>
    ),
  },
  {
    accessorKey: "category",
    header: "Category",
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
  },
  {
    accessorKey: "confidence",
    header: "Confidence",
    cell: ({ row }) => (
      <Badge variant="outline">{row.original.confidence}</Badge>
    ),
  },
  {
    accessorKey: "age",
    header: "Age",
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {row.original.age}
      </span>
    ),
  },
  {
    accessorKey: "provenance",
    header: "Provenance",
    cell: ({ row }) => (
      <Link
        className="block min-w-52 max-w-xs text-xs leading-relaxed text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
        to={row.original.source}
      >
        {row.original.provenance}
      </Link>
    ),
  },
]
