import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { CollectionEmpty, CollectionSearch } from "./primitives"

/**
 * A list in a card with its own search on top (owner, prototype v4: Chats and Cron jobs). One
 * pattern for every long list: search, one line per item, then a footer for paging or notes.
 */
export function ListCard({ query, onQueryChange, label, placeholder, count, unit, emptyTitle, emptyDescription, emptyAction, emptyContent, icon, filters, footer, children }: {
  query?: string; onQueryChange?: (value: string) => void; label?: string; placeholder?: string; count: number; unit: string
  emptyTitle: string; emptyDescription: string; emptyAction?: ReactNode; emptyContent?: ReactNode; icon?: ReactNode
  /** Filter chips shown under the search. */
  filters?: ReactNode; footer?: ReactNode; children: ReactNode
}) {
  return <Card data-slot="list-card" className="min-w-0 gap-0 overflow-hidden p-0">
    {onQueryChange && label && placeholder && (
      <div className="flex items-center gap-3 border-b p-2">
        <CollectionSearch compact label={label} placeholder={placeholder} value={query || ""} onChange={event => onQueryChange(event.target.value)} />
        <span className="hidden shrink-0 pr-2 text-xs tabular-nums text-muted-foreground sm:inline">{count} {unit}</span>
      </div>
    )}
    {!onQueryChange && (
      <div className="flex items-center gap-3 border-b p-2">
        <span className="hidden shrink-0 pr-2 text-xs tabular-nums text-muted-foreground sm:inline">{count} {unit}</span>
      </div>
    )}
    {filters && <div role="group" aria-label="Show" className="flex flex-wrap gap-1 border-b px-2 py-1.5">{filters}</div>}
    <div className="min-w-0">
      {count ? <ul className="flex flex-col divide-y">{children}</ul>
        : emptyContent !== undefined ? <div className="p-4">{emptyContent}</div>
          : <CollectionEmpty title={emptyTitle} description={emptyDescription} icon={icon} action={emptyAction} onClear={query?.trim() && onQueryChange ? () => onQueryChange("") : undefined} />}
    </div>
    {footer && <div className="flex flex-wrap items-center gap-3 border-t px-4 py-2.5">{footer}</div>}
  </Card>
}

/** One line in a ListCard: icon, a title that says what it is, a muted sub-line and a time. */
export function ListLine({ to, icon, title, sub, meta, onClick }: { to: string; icon?: ReactNode; title: string; sub?: ReactNode; meta?: ReactNode; onClick?: () => void }) {
  return <li><Link to={to} onClick={onClick} className="flex min-w-0 items-center gap-3 px-4 py-3 outline-none hover:bg-accent focus-visible:bg-accent">
    {icon && <span aria-hidden="true" className="shrink-0 text-muted-foreground [&_svg]:size-4">{icon}</span>}
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium">{title}</span>
      {sub && <span className="block truncate text-sm text-muted-foreground">{sub}</span>}
    </span>
    {meta && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{meta}</span>}
  </Link></li>
}

/** A filter chip with its count: one choice of several, pressed when active. */
export function FilterChip({ active, count, onClick, children }: { active: boolean; count: number; onClick: () => void; children: ReactNode }) {
  return <Button type="button" size="sm" variant={active ? "secondary" : "ghost"} aria-pressed={active} className="rounded-full" onClick={onClick}>
    {children}<span className="tabular-nums text-muted-foreground">{count}</span>
  </Button>
}
