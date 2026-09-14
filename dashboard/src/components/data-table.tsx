"use client"

import * as React from "react"
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { X } from "lucide-react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CollectionSearch, CollectionEmpty } from "@/components/design-system"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { DataTableViewOptions } from "@/app/tasks/components/data-table-view-options"
import { DataTableFacetedFilter } from "@/app/tasks/components/data-table-faceted-filter"
import { DataTablePagination } from "@/app/tasks/components/data-table-pagination"

export interface DataTableFilter {
  column: string
  title: string
  options: { label: string; value: string; icon?: React.ComponentType<{ className?: string }> }[]
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  /** column id used by the search box */
  searchColumn?: string
  searchPlaceholder?: string
  filters?: DataTableFilter[]
  /** action rendered on the right of the toolbar (e.g. a "New" button) */
  toolbarAction?: React.ReactNode
  /** onRowClick makes rows behave like links into a detail view */
  onRowClick?: (row: TData) => void
  /** hide the pager when a list is short and always fits */
  paginate?: boolean
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchColumn,
  searchPlaceholder = "Search…",
  filters = [],
  toolbarAction,
  onRowClick,
  paginate = true,
}: DataTableProps<TData, TValue>) {
  const [rowSelection, setRowSelection] = React.useState({})
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [sorting, setSorting] = React.useState<SortingState>([])

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnVisibility, rowSelection, columnFilters },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: paginate ? getPaginationRowModel() : undefined,
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  const isFiltered = table.getState().columnFilters.length > 0

  return (
    <div className="min-w-0 space-y-7">
      {searchColumn && <CollectionSearch
        label={searchPlaceholder.replace(/[…]+$/, "")}
        placeholder={searchPlaceholder}
        value={(table.getColumn(searchColumn)?.getFilterValue() as string) ?? ""}
        onChange={event => table.getColumn(searchColumn)?.setFilterValue(event.target.value)}
      />}
      <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {filters.map(
          (f) =>
            table.getColumn(f.column) && (
              <DataTableFacetedFilter
                key={f.column}
                column={table.getColumn(f.column)}
                title={f.title}
                options={f.options}
              />
            )
        )}
        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => table.resetColumnFilters()}
            size="sm"
          >
            Reset
            <X className="ml-2 size-4" />
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {toolbarAction}
          <DataTableViewOptions table={table} />
        </div>
      </div>

      {/* Structured data shares collection density and retains table semantics. */}
      <div className="min-w-0 overflow-hidden rounded-lg border bg-card text-card-foreground shadow-xs">
        <Table>
          <TableHeader className="bg-surface-inset">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} colSpan={header.colSpan} className="h-(--control-height) px-4">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={onRowClick ? (event) => {
                    if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault()
                      onRowClick(row.original)
                    }
                  } : undefined}
                  className={cn("h-(--collection-row-height)", onRowClick && "cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring")}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="px-4 py-2.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="p-0">
                  <CollectionEmpty title="No results found" description="Try a different search or clear your filters." onClear={isFiltered ? () => table.resetColumnFilters() : undefined} />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {paginate && data.length > 10 && <DataTablePagination table={table} />}
      </div>
    </div>
  )
}
