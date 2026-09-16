import type { ColumnDef } from "@tanstack/react-table"
import { Wrench } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { DataTableColumnHeader } from "@/app/tasks/components/data-table-column-header"
import { cn } from "@/lib/utils"
import type { Tool } from "@/lib/api/models"

export const toolColumns = (open: (tool: Tool) => void): ColumnDef<Tool>[] => [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Tool" />
    ),
    cell: ({ row }) => (
      <div className="flex min-w-64 items-center gap-3">
        <Wrench className="size-4 shrink-0 text-muted-foreground" />
        <div>
          <button type="button" onClick={() => open(row.original)} className="rounded-sm font-mono text-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring">{row.original.name}</button>
          <p className="mt-1 text-xs text-muted-foreground">
            {row.original.purpose}
          </p>
        </div>
      </div>
    ),
  },
  {
    accessorKey: "sensitivity",
    header: "Sensitivity",
    cell: ({ row }) => (
      <Badge
        variant="outline"
        className={cn(
          row.original.sensitivity === "Act outward" &&
            "border-warning/30 bg-warning/10 text-warning"
        )}
      >
        {row.original.sensitivity}
      </Badge>
    ),
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
  },
  {
    accessorKey: "scope",
    header: "Scope",
    cell: ({ row }) => (
      <span className="whitespace-nowrap">{row.original.scope}</span>
    ),
  },
  {
    accessorKey: "recentUse",
    header: "Recent use",
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {row.original.recentUse}
      </span>
    ),
  },
]
