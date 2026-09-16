import type { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import type { JournalEntry } from "@/lib/api/models"

export const journalColumns = (open: (entry: JournalEntry) => void): ColumnDef<JournalEntry>[] => [
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
      <button type="button" onClick={() => open(row.original)}
        className="rounded-sm text-left font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring"
      >
        {row.original.event}
      </button>
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
