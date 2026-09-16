import { usePageSection } from "@/hooks/use-page-navigation"
import { useId, type ComponentProps, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { Search, SearchX } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { CompanionPortrait } from "@/components/companion-portrait"
import { useConker } from "@/lib/api/store"
import { cn } from "@/lib/utils"

export { TaskDialogContent, OverlayBody, FormActions, DetailPanel, ConfirmationDialog } from "./overlays"

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <header data-slot="page-header" className="flex min-w-0 flex-wrap items-start justify-between gap-4">
    <div className="min-w-0">
      <h1 className="break-words text-3xl leading-9 font-semibold tracking-tight">{title}</h1>
      {description && <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </header>
}

/** URL-addressed page content. Navigation is rendered once in SiteHeader. */
export function RouteSection({ value, children, variant = "page" }: { value: string; children: ReactNode; variant?: "page" | "workspace" }) {
  const active = usePageSection()
  return active === value ? <div data-slot="route-section" className={cn("min-w-0", variant === "workspace" && "flex min-h-0 flex-1 flex-col")}>{children}</div> : null
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

export function CollectionSearch({ label, ...props }: Omit<ComponentProps<typeof Input>, "className" | "type" | "aria-label"> & { label: string }) {
  return <div data-slot="collection-search" className="relative w-full min-w-0">
    <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
    <Input {...props} type="search" aria-label={label} autoComplete="off" className="h-(--collection-search-height) rounded-xl pr-4 pl-11 shadow-xs" />
  </div>
}

export function AgentIdentityPortrait({ name }: { name: string }) {
  const profile = useConker(data => data.profile)
  const agent = useConker(data => data.agents.find(item => item.name === name))
  return <CompanionPortrait profile={agent?.kind === "companion" ? profile : undefined} name={name} face="round" tone="graphite" className="size-(--collection-portrait-size) rounded-lg" />
}

export function CollectionRow({ to, title, description, descriptionTitle, leading, trailing }: {
  to: string; title: string; description: ReactNode; descriptionTitle?: string; leading?: ReactNode; trailing?: ReactNode
}) {
  const id = useId()
  return <li>
    <Link data-slot="collection-row" to={to} aria-labelledby={id} aria-describedby={`${id}-preview${trailing ? ` ${id}-meta` : ""}`}
      className="group flex min-h-(--collection-row-height) min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:px-4">
      {leading && <span className="shrink-0" aria-hidden="true">{leading}</span>}
      <div className="min-w-0 flex-1">
        <h3 id={id} className="truncate text-sm leading-5 font-medium" title={title}>{title}</h3>
        <p id={`${id}-preview`} className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs leading-5 text-muted-foreground" title={descriptionTitle}>{description}</p>
      </div>
      {trailing && <span id={`${id}-meta`} className="flex shrink-0 flex-col items-end gap-0.5 text-xs leading-5 text-muted-foreground tabular-nums">{trailing}</span>}
    </Link>
  </li>
}

export function CollectionSection({ title, icon, children, contained = false }: { title: string; icon?: ReactNode; children: ReactNode; contained?: boolean }) {
  const id = useId()
  return <section aria-labelledby={id} data-slot="collection-section">
    <h2 id={id} className="mb-2 flex items-center gap-2 px-3 text-xs font-medium text-muted-foreground sm:px-4">{icon}{title}</h2>
    <ul className={cn("divide-y divide-border", !contained && "rounded-xl border bg-card text-card-foreground shadow-xs")}>{children}</ul>
  </section>
}

/** Compact record for responsive tables. One container owns the divided list. */
export function RecordItem({ title, lang, description, leading, meta, actions, onOpen }: {
  title: string; lang?: string; description?: ReactNode; leading?: ReactNode; meta?: ReactNode; actions?: ReactNode; onOpen?: () => void
}) {
  const summary = <>{leading && <span className="shrink-0" aria-hidden="true">{leading}</span>}<span className="min-w-0 flex-1"><span lang={lang} className="block text-sm font-medium break-words">{title}</span>{description && <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>}</span></>
  return <div data-pattern="record-item" className="min-w-0 space-y-3 p-4">
    {onOpen ? <button type="button" onClick={onOpen} className="flex w-full min-w-0 items-start gap-3 rounded-md text-left outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring">{summary}</button> : <div className="flex min-w-0 items-start gap-3">{summary}</div>}
    {meta && <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">{meta}</div>}
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
}

export function CollectionEmpty({ title, description, icon, onClear, clearLabel = "Clear search", action }: { title: string; description: string; icon?: ReactNode; onClear?: () => void; clearLabel?: string; action?: ReactNode }) {
  return <div data-slot="collection-empty" className="flex flex-col items-center px-4 py-16 text-center">
    <span className="mb-4 text-muted-foreground [&>svg]:size-7" aria-hidden="true">{icon ?? <SearchX />}</span>
    <h2 className="text-base font-medium">{title}</h2>
    <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
    {onClear ? <Button variant="outline" className="mt-5" onClick={onClear}>{clearLabel}</Button> : action && <div className="mt-5">{action}</div>}
  </div>
}

export function CollectionPanel({ query, onQueryChange, label, placeholder, count, unit, emptyTitle, emptyDescription, emptyAction, icon, children }: {
  query: string; onQueryChange: (value: string) => void; label: string; placeholder: string; count: number; unit: string;
  emptyTitle: string; emptyDescription: string; emptyAction?: ReactNode; icon?: ReactNode; children: ReactNode
}) {
  return <div className="min-w-0 space-y-7">
    <CollectionSearch label={label} placeholder={placeholder} value={query} onChange={event => onQueryChange(event.target.value)} />
    <p className="sr-only" role="status">{count} {unit} found.</p>
    {count ? children : <CollectionEmpty title={emptyTitle} description={emptyDescription} icon={icon} action={emptyAction} onClear={query.trim() ? () => onQueryChange("") : undefined} />}
  </div>
}
