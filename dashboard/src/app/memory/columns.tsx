import type { ColumnDef } from "@tanstack/react-table"
import { Link } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { DataTableColumnHeader } from "@/app/tasks/components/data-table-column-header"
import type { Memory } from "@/lib/api/models"
import { memoryTitle } from "@/lib/memory-explorer"

export const memoryColumns = (open: (memory: Memory) => void): ColumnDef<Memory>[] => [
  {
    accessorKey: "text",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Memory" />
    ),
    cell: ({ row }) => (
      <button type="button" onClick={() => open(row.original)}
        id={row.original.id}
        lang={row.original.language}
        className="min-w-64 max-w-md rounded-sm text-left text-sm leading-relaxed hover:underline focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span className="block font-medium">{memoryTitle(row.original)}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{row.original.text}</span>
      </button>
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
      row.original.origin === "manual" ? <button type="button" onClick={() => open(row.original)} className="text-left text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">{row.original.provenance}</button> :
      <Link
        className="block min-w-52 max-w-xs text-xs leading-relaxed text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
        to={row.original.source}
      >
        {row.original.provenance}
      </Link>
    ),
  },
]
