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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
  /** Same filtered/sorted rows rendered as a compact list below desktop width. */
  renderItem?: (item: TData) => React.ReactNode
  itemLabel?: string
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
  renderItem,
  itemLabel = "records",
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
        <span role="status" className="mr-auto text-xs text-muted-foreground">{table.getFilteredRowModel().rows.length} {itemLabel}</span>
        <div className="flex flex-wrap items-center gap-2">
          {toolbarAction}
          {renderItem && <div className="xl:hidden"><Select value={sorting.length ? `${sorting[0].id}:${sorting[0].desc ? "desc" : "asc"}` : "default"} onValueChange={value => {
            if (value === "default") setSorting([])
            else { const [id, direction] = value.split(":"); setSorting([{ id, desc: direction === "desc" }]) }
          }}><SelectTrigger size="sm" aria-label="Sort records"><SelectValue /></SelectTrigger><SelectContent>
            <SelectItem value="default">Default order</SelectItem>
            {table.getAllColumns().filter(column => column.getCanSort()).flatMap(column => [
              <SelectItem key={`${column.id}:asc`} value={`${column.id}:asc`}>{column.id.replace(/([A-Z])/g, " $1")} · ascending</SelectItem>,
              <SelectItem key={`${column.id}:desc`} value={`${column.id}:desc`}>{column.id.replace(/([A-Z])/g, " $1")} · descending</SelectItem>,
            ])}
          </SelectContent></Select></div>}
          <div className={renderItem ? "hidden xl:block" : undefined}><DataTableViewOptions table={table} /></div>
        </div>
      </div>

      {/* Structured data shares collection density and retains table semantics. */}
      {renderItem && <div className="min-w-0 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs xl:hidden">
        {table.getRowModel().rows.length ? <ul className="divide-y">{table.getRowModel().rows.map(row => <li key={row.id}>{renderItem(row.original)}</li>)}</ul>
          : <CollectionEmpty title="No results found" description="Try a different search or clear your filters." clearLabel="Clear filters" onClear={isFiltered ? () => table.resetColumnFilters() : undefined} />}
      </div>}
      <div className={cn("min-w-0 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs", renderItem && "hidden xl:block")}>
        <Table>
          <TableHeader className="bg-muted">
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
                  onClick={onRowClick ? event => {
                    if ((event.target as HTMLElement).closest("a,button,input,[role=button]")) return
                    onRowClick(row.original)
                  } : undefined}
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
                    <TableCell key={cell.id} className="px-4 py-2.5 whitespace-normal">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="p-0">
                  <CollectionEmpty title="No results found" description="Try a different search or clear your filters." clearLabel="Clear filters" onClear={isFiltered ? () => table.resetColumnFilters() : undefined} />
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
