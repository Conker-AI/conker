import { cloneElement, isValidElement, useContext, useId, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { ChevronDown, Search, SearchX } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { createPortal } from "react-dom"
import { useWorkspaceChrome } from '@/lib/workspace-chrome'
import { WorkspaceRouteActions } from './workspace-chrome'
import { UniversalSearchContext } from '@/lib/workspace-chrome'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'


export function PageHeader({ title, description, actions, status, density = "standard", actionsOnly = false }: { title: string; description?: string; actions?: ReactNode; status?: ReactNode; density?: "standard" | "compact"; actionsOnly?: boolean }) {
  const chrome = useWorkspaceChrome()
  if (actionsOnly && chrome) return chrome.actions ? createPortal(<><h1 className="sr-only">{title}</h1><WorkspaceRouteActions>{actions}</WorkspaceRouteActions></>, chrome.actions) : null
  if (actionsOnly) return <header data-slot="page-header" className="flex min-w-0 justify-end"><h1 className="sr-only">{title}</h1>{actions && <div role="toolbar" aria-label={`${title} actions`} className="flex flex-wrap justify-end gap-2">{actions}</div>}</header>
  return <header data-slot="page-header" className="flex min-w-0 flex-wrap items-start justify-between gap-4">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className={cn("break-words font-semibold", density === "compact" ? "text-xl leading-7" : "text-3xl leading-9")}>{title}</h1>
        {status}
      </div>
      {description && <p className={cn("max-w-prose text-sm text-muted-foreground", density === "compact" ? "mt-1 leading-5" : "mt-2 leading-6")}>{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </header>
}

/** Sections group related work without introducing another surface. */
export function WorkspaceSection({ title, description, action, children, divided = true }: {
  title: ReactNode; description?: ReactNode; action?: ReactNode; children?: ReactNode; divided?: boolean
}) {
  const id = useId()
  return <section aria-labelledby={id} data-slot="workspace-section" className={cn("min-w-0 space-y-4", divided && "border-b pb-6")}>
    <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1"><h2 id={id} className="text-base leading-6 font-semibold">{title}</h2>
        {description && <p className="mt-1 max-w-prose text-sm leading-6 text-muted-foreground">{description}</p>}
      </div>{action}
    </header>
    {children && <div className="min-w-0 space-y-4">{children}</div>}
  </section>
}

/** Overview composition: one leading decision surface, quieter supporting groups. */
export function OverviewSection({ title, description, action, children, priority = false }: {
  title: string; description?: ReactNode; action?: ReactNode; children: ReactNode; priority?: boolean
}) {
  const id = useId()
  return <section aria-labelledby={id} data-slot="overview-section" className={cn("min-w-0 space-y-4", priority && "elevation-surface rounded-lg border bg-card p-4 text-card-foreground")}>
    <div className={cn("flex flex-wrap items-start justify-between gap-3", priority && "max-sm:flex-col")}>
      <div className="min-w-0 flex-1">
        <h2 id={id} className="text-base leading-6 font-semibold">{title}</h2>
        {description && <p className="mt-1 max-w-prose text-sm leading-6 text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>
}

export function PageTabs({ className, ...props }: ComponentProps<typeof Tabs>) {
  return <Tabs className={cn("min-w-0 gap-(--page-section-gap)", className)} {...props} />
}
export function PageTabsList({ className, mobileColumns, ...props }: ComponentProps<typeof TabsList> & { mobileColumns?: 2 }) {
  return <TabsList className={cn("h-auto min-h-(--collection-search-height) max-w-full flex-wrap justify-start border bg-muted p-[3px]", mobileColumns === 2 && "grid grid-cols-2 sm:inline-flex", className)} {...props} />
}
export function PageTabsTrigger({ className, ...props }: ComponentProps<typeof TabsTrigger>) {
  return <TabsTrigger className={cn("h-(--control-height) px-4", className)} {...props} />
}
export function PageTabsContent({ className, ...props }: ComponentProps<typeof TabsContent>) {
  return <TabsContent className={cn("min-w-0", className)} {...props} />
}

type CollectionSearchProps = Omit<ComponentProps<typeof Input>, "className" | "type" | "aria-label"> & { label: string }

export function CollectionSearch({ label, compact = false, trailing, ...props }: CollectionSearchProps & { compact?: boolean; trailing?: ReactNode }) {
  return <div data-slot="collection-search" className="relative w-full min-w-0">
    <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
    <Input {...props} type="search" aria-label={label} autoComplete="off" className={cn("rounded-lg pl-11 shadow-none", compact ? "h-(--control-height-sm)" : "h-(--collection-search-height)", trailing ? "pr-10" : "pr-4")} />
    {trailing && <div className="absolute top-1/2 right-1 -translate-y-1/2">{trailing}</div>}
  </div>
}

/** One page-search entry; route state stays with its source, presentation moves to the appbar. */
export function WorkspaceSearch({ onSubmit, ...props }: Omit<CollectionSearchProps, 'onSubmit'> & { onSubmit?: () => void }) {
  const chrome = useWorkspaceChrome()
  const openAll = useContext(UniversalSearchContext)
  const id = useId()
  const [expanded, setExpanded] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const setOwner = chrome?.setSearchOwner
  useLayoutEffect(() => {
    if (!setOwner) return
    setOwner(id)
    return () => setOwner(current => current === id ? null : current)
  }, [id, setOwner])
  if (!chrome) return <CollectionSearch {...props} />
  if (!chrome.search) return null
  const scope = openAll && <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="size-6" aria-label="Search scope" title="Search scope"><ChevronDown /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
    <DropdownMenuLabel>Search scope</DropdownMenuLabel><DropdownMenuItem disabled>{props.label}</DropdownMenuItem>
    <DropdownMenuItem onSelect={() => { const opener = chrome.compactSearch ? trigger.current : input.current; setExpanded(false); openAll(typeof props.value === 'string' ? props.value.slice(0, 200) : '', opener) }}>Search all Conker</DropdownMenuItem>
  </DropdownMenuContent></DropdownMenu>
  const field = <form className="min-w-0 w-full" role="search" onSubmit={event => { event.preventDefault(); event.stopPropagation(); onSubmit?.(); setExpanded(false) }}>
    <CollectionSearch {...props} ref={input} enterKeyHint="search" compact={!chrome.compactSearch} trailing={scope} />
  </form>
  return createPortal(chrome.compactSearch ? <Popover open={expanded} onOpenChange={setExpanded}><PopoverTrigger asChild><Button ref={trigger} type="button" variant="ghost" size="icon" className="workspace-search-trigger" aria-label={props.label} title={props.label}><Search /></Button></PopoverTrigger><PopoverContent align="center" className="w-[min(26.25rem,calc(100vw-2rem))] p-2">{field}</PopoverContent></Popover> : field, chrome.search)
}

/** Filters and results belong together; the page search is owned by workspace chrome. */
export function CollectionToolbar({ search, filters, actions, count, unit = "records" }: {
  search?: ReactNode; filters?: ReactNode; actions?: ReactNode; count?: number; unit?: string
}) {
  return <div data-slot="collection-toolbar" className="flex min-w-0 flex-wrap items-center gap-2 [&>div:empty]:hidden">
    {search && <div className="w-full min-w-0 sm:w-auto sm:min-w-48 sm:max-w-[26.25rem] sm:flex-1">{search}</div>}
    {filters && <div className="flex min-w-0 flex-wrap items-center gap-2">{filters}</div>}
    {count !== undefined && <p role="status" className="ml-auto text-xs leading-5 text-muted-foreground tabular-nums max-sm:sr-only">{count} {unit}</p>}
    {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
}

export function CollectionLoading({ label }: { label: string }) {
  const chrome = useWorkspaceChrome()
  return <div role="status" aria-label={label} className="min-w-0 space-y-4">
    <span className="sr-only">{label}</span>
    {!chrome && <Skeleton className="h-(--collection-search-height) w-full sm:max-w-[26.25rem]" />}
    <div className="divide-y border-y">{[0, 1, 2].map(row => <div key={row} className="flex min-h-(--collection-row-height) items-center gap-3 px-4 py-3"><div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-1/2" /></div><Skeleton className="h-3 w-16" /></div>)}</div>
  </div>
}

export function CollectionRow({ to, title, description, descriptionTitle, leading, trailing }: {
  to: string; title: string; description: ReactNode; descriptionTitle?: string; leading?: ReactNode; trailing?: ReactNode
}) {
  return <li>
    <Link data-slot="collection-row" to={to}
      className="group flex min-h-(--collection-row-height) min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:px-4">
      {leading && <span className="shrink-0" aria-hidden="true">{leading}</span>}
      <div className="min-w-0 flex-1">
        <h3 className="break-words text-sm leading-5 font-medium" title={title}>{title}</h3>
        <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-xs leading-5 text-muted-foreground" title={descriptionTitle}>{description}</p>
      </div>
      {trailing && <span className="flex shrink-0 flex-col items-end gap-0.5 text-xs leading-5 text-muted-foreground tabular-nums">{trailing}</span>}
    </Link>
  </li>
}

export function CollectionSection({ title, icon, children, contained = false }: { title: string; icon?: ReactNode; children: ReactNode; contained?: boolean }) {
  const id = useId()
  const className = cn("divide-y divide-border", !contained && "collection-surface")
  const content = isValidElement<{ className?: string }>(children) && ['ul', 'dl'].includes(String(children.type))
    ? cloneElement(children, { className: cn(className, children.props.className) })
    : <ul className={className}>{children}</ul>
  return <section aria-labelledby={id} data-slot="collection-section">
    <h2 id={id} className="mb-2 flex items-center gap-2 px-3 text-xs font-medium text-muted-foreground sm:px-4">{icon}{title}</h2>
    {content}
  </section>
}

/** Compact record for responsive tables. One container owns the divided list. */
export function RecordItem({ title, lang, description, leading, meta, actions, onOpen, selected = false }: {
  title: string; lang?: string; description?: ReactNode; leading?: ReactNode; meta?: ReactNode; actions?: ReactNode; onOpen?: () => void; selected?: boolean
}) {
  const summary = <>{leading && <span className="shrink-0" aria-hidden="true">{leading}</span>}<span className="min-w-0 flex-1"><span lang={lang} className="block text-sm font-medium break-words">{title}</span>{description && <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>}</span></>
  return <div data-pattern="record-item" className={cn("min-h-(--collection-row-height) min-w-0 space-y-3 p-4", selected && "bg-accent text-accent-foreground")}>
    {onOpen ? <button type="button" aria-current={selected ? true : undefined} onClick={onOpen} className="flex w-full min-w-0 items-start gap-3 rounded-md text-left outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring">{summary}</button> : <div className="flex min-w-0 items-start gap-3">{summary}</div>}
    {meta && <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">{meta}</div>}
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
}

export function CollectionEmpty({ title, description, icon, onClear, clearLabel = "Clear search", action }: { title: string; description: string; icon?: ReactNode; onClear?: () => void; clearLabel?: string; action?: ReactNode }) {
  return <div data-slot="collection-empty" className="flex flex-col items-center px-4 py-10 text-center sm:py-16">
    <span className="mb-4 text-muted-foreground [&>svg]:size-7" aria-hidden="true">{icon ?? <SearchX />}</span>
    <h2 className="text-base font-medium">{title}</h2>
    <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
    {onClear ? <Button variant="outline" className="mt-5" onClick={onClear}>{clearLabel}</Button> : action && <div className="mt-5">{action}</div>}
  </div>
}

export function CollectionPanel({ query, onQueryChange, label, placeholder, count, unit, emptyTitle, emptyDescription, emptyAction, icon, filters, hint, children }: {
  query: string; onQueryChange: (value: string) => void; label: string; placeholder: string; count: number; unit: string;
  emptyTitle: string; emptyDescription: string; emptyAction?: ReactNode; icon?: ReactNode; filters?: ReactNode; hint?: ReactNode; children: ReactNode
}) {
  return <div className="min-w-0 space-y-(--collection-section-gap)">
    <CollectionToolbar search={<WorkspaceSearch label={label} placeholder={placeholder} value={query} onChange={event => onQueryChange(event.target.value)} />} filters={filters} count={count} unit={unit} />
    {count ? children : <CollectionEmpty title={emptyTitle} description={emptyDescription} icon={icon} action={emptyAction} onClear={query.trim() ? () => onQueryChange("") : undefined} />}
    {hint && <p className="max-w-prose text-xs leading-5 text-muted-foreground">{hint}</p>}
  </div>
}
