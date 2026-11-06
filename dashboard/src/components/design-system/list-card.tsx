import type { MouseEvent, ReactNode } from "react"
import { Link } from "react-router-dom"
import { ArrowDownUp, Check, ListChecks, MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { CollectionEmpty, CollectionSearch } from "./primitives"
import type { ListSelection } from "./list-selection"

export type ListSort<T extends string = string> = { value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void }

/**
 * A list in a card with its own search on top (owner, prototype v4: Chats and Cron jobs). One
 * pattern for every long list: search, sort, filter chips, select mode with bulk actions, one
 * line per item, then a footer for paging or notes.
 */
export function ListCard({ query, onQueryChange, label, placeholder, count, unit, emptyTitle, emptyDescription, emptyAction, emptyContent, icon, filters, sort, selection, bulkActions, footer, children }: {
  query?: string; onQueryChange?: (value: string) => void; label?: string; placeholder?: string; count: number; unit: string
  emptyTitle: string; emptyDescription: string; emptyAction?: ReactNode; emptyContent?: ReactNode; icon?: ReactNode
  /** Filter chips shown under the search. */
  filters?: ReactNode
  /** The order of the rows; a menu beside the search. */
  sort?: ListSort<any> // eslint-disable-line @typescript-eslint/no-explicit-any
  /** Select mode: a Select button, then a bar with select-all, the count and `bulkActions`. */
  selection?: ListSelection; bulkActions?: ReactNode
  footer?: ReactNode; children: ReactNode
}) {
  const selecting = selection?.active
  return <Card data-slot="list-card" className="min-w-0 gap-0 overflow-hidden p-0">
    {selecting ? <div role="toolbar" aria-label="Selected items" className="flex min-h-12 flex-wrap items-center gap-2 border-b bg-muted p-2 pl-4">
      <Checkbox aria-label={selection.all ? "Clear selection" : "Select all loaded"} checked={selection.all} indeterminate={selection.some} disabled={!selection.total} onCheckedChange={() => selection.setAll(!selection.all)} />
      <span role="status" className="mr-auto pl-1 text-sm tabular-nums">{selection.count ? `${selection.count} selected` : "Select items"}</span>
      <div className="flex flex-wrap items-center gap-1">{bulkActions}</div>
      <Button type="button" size="sm" variant="ghost" onClick={selection.stop}>Done</Button>
    </div> : <div className="flex items-center gap-2 border-b p-2">
      {onQueryChange && label && placeholder && <CollectionSearch compact label={label} placeholder={placeholder} value={query ?? ""} onChange={event => onQueryChange(event.target.value)} />}
      <span className={cn("shrink-0 text-xs tabular-nums text-muted-foreground", onQueryChange ? "hidden pr-1 sm:inline" : "mr-auto px-2")}>{count} {unit}</span>
      {sort && <SortMenu sort={sort} />}
      {selection && <Button type="button" size="sm" variant="ghost" className="shrink-0" aria-label="Select items" title="Select items" onClick={selection.start}><ListChecks aria-hidden="true" /><span className="hidden sm:inline">Select</span></Button>}
    </div>}
    {filters && <div role="group" aria-label="Show" className="flex flex-wrap gap-1 border-b px-2 py-1.5">{filters}</div>}
    <div className="min-w-0">
      {count ? <ul className="flex flex-col divide-y">{children}</ul>
        : emptyContent !== undefined ? <div className="p-4">{emptyContent}</div>
          : <CollectionEmpty title={emptyTitle} description={emptyDescription} icon={icon} action={emptyAction} onClear={query?.trim() && onQueryChange ? () => onQueryChange("") : undefined} />}
    </div>
    {footer && <div className="flex flex-wrap items-center gap-3 border-t px-4 py-2.5">{footer}</div>}
  </Card>
}

function SortMenu({ sort }: { sort: ListSort }) {
  const current = sort.options.find(option => option.value === sort.value)
  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button type="button" size="sm" variant="ghost" className="shrink-0" aria-label={`Sort: ${current?.label ?? ""}`} title="Sort" />}>
      <ArrowDownUp aria-hidden="true" /><span className="hidden sm:inline">{current?.label}</span>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuRadioGroup value={sort.value} onValueChange={value => sort.onChange(String(value))}>
        {sort.options.map(option => <DropdownMenuRadioItem key={option.value} value={option.value}>{option.label}</DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
}

/** A row's own menu ("…"): actions on this one item, beside the row link, never inside it. */
export function ListLineMenu({ label, children }: { label: string; children: ReactNode }) {
  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button type="button" size="icon" variant="ghost" className="size-8 shrink-0 text-muted-foreground" aria-label={label} title="More actions" />}><MoreHorizontal aria-hidden="true" /></DropdownMenuTrigger>
    <DropdownMenuContent align="end">{children}</DropdownMenuContent>
  </DropdownMenu>
}

/**
 * One line in a ListCard: icon, a title that says what it is, a muted sub-line and a time. With a
 * `selection` in select mode the whole line toggles (Shift picks a range); otherwise it opens `to`.
 * On a mouse, the icon turns into a checkbox on hover, so selecting needs no mode switch.
 */
export function ListLine({ id, to, icon, title, sub, meta, badge, actions, selection, onClick, expanded, details }: {
  to: string; icon?: ReactNode; title: string; sub?: ReactNode; meta?: ReactNode; onClick?: () => void
  /** A short state word beside the title, e.g. "Archived". */
  badge?: ReactNode
  /** The row's own menu, usually a ListLineMenu. Hidden in select mode. */
  actions?: ReactNode
  id?: string; selection?: ListSelection
  /** Set when the line opens its details in place (Skills, MCP); `details` renders under it. */
  expanded?: boolean; details?: ReactNode
}) {
  const body = <>
    <span className="min-w-0 flex-1">
      <span className="flex min-w-0 items-center gap-2"><span className="truncate text-sm font-medium">{title}</span>{badge && <span className="shrink-0 rounded-full border px-1.5 text-xs text-muted-foreground">{badge}</span>}</span>
      {sub && <span className="block truncate text-sm text-muted-foreground">{sub}</span>}
    </span>
    {meta && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{meta}</span>}
  </>
  if (selection && id !== undefined && selection.active) {
    const checked = selection.has(id)
    const toggle = (event: MouseEvent) => { if (event.shiftKey) event.preventDefault(); selection.toggle(id, event.shiftKey) }
    return <li><button type="button" role="checkbox" aria-checked={checked} aria-label={title} onClick={toggle}
      className={cn("flex w-full min-w-0 select-none items-center gap-3 px-4 py-3 text-left outline-none hover:bg-accent focus-visible:bg-accent", checked && "bg-accent")}>
      <Tick checked={checked} />{body}
    </button></li>
  }
  const line = <div className="group/line relative flex min-w-0 items-center">
    {selection && id !== undefined && <button type="button" role="checkbox" aria-checked={false} aria-label={`Select ${title}`} onClick={event => selection.toggle(id, event.shiftKey)}
      className="absolute top-1/2 left-3 z-10 hidden size-6 -translate-y-1/2 items-center justify-center rounded-sm opacity-0 outline-none group-hover/line:opacity-100 focus-visible:opacity-100 pointer-fine:flex"><Tick checked={false} /></button>}
    <Link to={to} onClick={onClick} aria-expanded={expanded} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 outline-none hover:bg-accent focus-visible:bg-accent">
      {icon && <span aria-hidden="true" className={cn("shrink-0 text-muted-foreground [&_svg]:size-4", selection && id !== undefined && "pointer-fine:group-hover/line:invisible")}>{icon}</span>}
      {body}
    </Link>
    {actions && <span className="shrink-0 pr-2">{actions}</span>}
  </div>
  return <li>{line}{details}</li>
}

function Tick({ checked }: { checked: boolean }) {
  return <span aria-hidden="true" className={cn("flex size-4 shrink-0 items-center justify-center rounded-[.25rem] border border-input bg-background", checked && "border-primary bg-primary text-primary-foreground")}>{checked && <Check className="size-3" strokeWidth={3} />}</span>
}

/** A filter chip with its count: one choice of several, pressed when active. */
export function FilterChip({ active, count, onClick, children }: { active: boolean; count?: number; onClick: () => void; children: ReactNode }) {
  return <Button type="button" size="sm" variant={active ? "secondary" : "ghost"} aria-pressed={active} className="rounded-full" onClick={onClick}>
    {children}{count !== undefined && <span className="tabular-nums text-muted-foreground">{count}</span>}
  </Button>
}
