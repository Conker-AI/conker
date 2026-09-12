import type { ColumnDef } from "@tanstack/react-table"
import { Link } from "react-router-dom"
import { Pin } from "lucide-react"
import { DataTableColumnHeader } from "@/app/tasks/components/data-table-column-header"
import type { Session } from "@/lib/api/models"

export const columns: ColumnDef<Session>[] = [
  {
    accessorKey: "title",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Conversation" />
    ),
    cell: ({ row }) => (
      <div className="min-w-56">
        <Link
          onClick={(event) => event.stopPropagation()}
          className="font-medium hover:underline"
          to={`/chat/${row.original.id}`}
        >
          {row.original.title}
        </Link>
        <p className="mt-1 text-xs text-muted-foreground">
          {row.original.agent} · {row.original.subtitle}
        </p>
      </div>
    ),
  },
  { accessorKey: "agent", header: "Agent" },
  {
    id: "updated",
    accessorKey: "minutesAgo",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Updated" />
    ),
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-sm text-muted-foreground">
        {row.original.updated}
      </span>
    ),
  },
  {
    accessorKey: "pinned",
    header: () => <span className="sr-only">Pinned</span>,
    cell: ({ row }) =>
      row.original.pinned ? (
        <span className="text-muted-foreground">
          <Pin className="size-3.5" aria-hidden="true" />
          <span className="sr-only">Pinned</span>
        </span>
      ) : null,
  },
]
