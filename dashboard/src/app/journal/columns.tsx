import type { ColumnDef } from "@tanstack/react-table"
import { Link } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import type { JournalEntry } from "./data"

export const columns: ColumnDef<JournalEntry>[] = [
  {
    accessorKey: "time",
    header: "Time",
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
        {row.original.time}
      </span>
    ),
  },
  {
    accessorKey: "actor",
    header: "Actor",
    cell: ({ row }) => <Badge variant="outline">{row.original.actor}</Badge>,
  },
  {
    accessorKey: "event",
    header: "Event",
    cell: ({ row }) => (
      <Link
        className="whitespace-nowrap font-medium hover:underline"
        to={row.original.source}
      >
        {row.original.event}
      </Link>
    ),
  },
  {
    accessorKey: "detail",
    header: "Detail",
    cell: ({ row }) => (
      <p className="min-w-72 max-w-xl text-sm leading-relaxed text-muted-foreground">
        {row.original.detail}
      </p>
    ),
  },
]
