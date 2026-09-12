import type { ColumnDef } from "@tanstack/react-table"
import { StatusBadge } from "@/components/status-badge"
import type { Service } from "@/lib/api/models"
export const columns: ColumnDef<Service>[] = [
  {
    accessorKey: "name",
    header: "Service",
    cell: ({ row }) => (
      <div className="min-w-44">
        <p className="font-medium">{row.original.name}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {row.original.purpose}
        </p>
      </div>
    ),
  },
  {
    accessorKey: "version",
    header: "Version",
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {row.original.version}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <StatusBadge tone={row.original.status === "Live" ? "live" : "warning"}>
        {row.original.status}
      </StatusBadge>
    ),
  },
  {
    accessorKey: "evidence",
    header: "Evidence",
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {row.original.evidence}
      </span>
    ),
  },
]
